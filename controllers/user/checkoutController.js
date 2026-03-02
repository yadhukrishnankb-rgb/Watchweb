
// controllers/user/checkoutController.js
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema'); 
const Coupon = require('../../models/couponSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const razorpay = require('../../config/razorpay')
const crypto = require('crypto');
const { addToWallet } = require('./walletController');

// --- pricing helper (mirrors cartController) --------------------------------
function getEffectivePrice(product) {
    if (!product) return 0;
    const base = typeof product.salesPrice === 'number' ? product.salesPrice : (product.price || 0);
    if (product.productOffer && product.productOffer > 0) {
        return Math.round(base * (1 - product.productOffer / 100) * 100) / 100;
    }
    return base;
}

// --- Safe address helpers 
function _safeAddresses(user) {
  if (!user) return [];
  if (Array.isArray(user.addresses)) return user.addresses.filter(Boolean);
  return [];
}

function safeDefaultAddress(user) {
  const addrs = _safeAddresses(user);
  return addrs.find(a => a && a.isDefault) || addrs[0] || null;
}

function getAddressById(user, addressId) {
  if (!addressId) return null;
  const addrs = _safeAddresses(user);
  // If Mongoose array with .id exists, try that first
  try {
    if (user && user.addresses && typeof user.addresses.id === 'function') {
      const found = user.addresses.id(addressId);
      if (found) return found;
    }
  } catch (e) {
    // ignore
  }
  return addrs.find(a => a && a._id && a._id.toString() === addressId) || null;
}



const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId).lean();
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: { path: 'category' }
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        // Track adjustments for notification
        const adjustedItems = [];
        const itemsToRemove = [];

        // Check and auto-adjust quantities
        cart.items = cart.items.filter((item, idx) => {
            const p = item.productId;
            
            // Remove blocked or invalid items
            if (!p || p.isBlocked || p.category.isBlocked) {
                itemsToRemove.push({
                    name: p?.productName || 'Unknown Product',
                    reason: 'blocked'
                });
                return false;
            }

            // Auto-adjust if quantity decreased
            if (p.quantity < item.quantity) {
                if (p.quantity === 0) {
                    // Product out of stock - remove it
                    itemsToRemove.push({
                        name: p.productName,
                        reason: 'outOfStock'
                    });
                    return false;
                } else {
                    // Product quantity reduced - auto-adjust
                    const oldQty = item.quantity;
                    item.quantity = p.quantity;
                    const eff = getEffectivePrice(p);
                    item.price = eff;
                    item.totalPrice = eff * p.quantity;
                    
                    adjustedItems.push({
                        name: p.productName,
                        oldQty: oldQty,
                        newQty: p.quantity
                    });
                    return true;
                }
            }

            return true;
        });

        // Save cart if adjustments were made
        if (adjustedItems.length > 0) {
            // Update the actual cart in database
            const updatedItems = cart.items.map(item => {
                const eff = getEffectivePrice(item.productId);
                return {
                    productId: item.productId._id,
                    quantity: item.quantity,
                    price: eff,
                    totalPrice: item.quantity * eff
                };
            });
            await Cart.findByIdAndUpdate(cart._id, { items: updatedItems });
        }

        if (cart.items.length === 0) {
            if (itemsToRemove.length > 0) {
                req.flash('warning', 'All items in your cart are no longer available');
            }
            await Cart.deleteOne({ userId });
            return res.redirect('/cart');
        }

        const subtotal = cart.items.reduce((sum, i) => sum + i.totalPrice, 0);
        const taxRate = 0.18;
        const tax = subtotal * taxRate;

        // coupon from session
        let discount = 0;
        let appliedCoupon = req.session.appliedCoupon;
        if (appliedCoupon && typeof appliedCoupon.discountAmount === 'number') {
            // if current subtotal is below required minimum, drop coupon
            if (subtotal < (appliedCoupon.minAmount || 0)) {
                delete req.session.appliedCoupon;
                appliedCoupon = null;
            } else {
                discount = appliedCoupon.discountAmount;
                if (discount > subtotal) discount = subtotal;
            }
        }

        const shipping = subtotal >= 1000 ? 0 : 79;
        const total = subtotal + tax + shipping - discount;

        const defaultAddress = safeDefaultAddress(user);

        // fetch available coupons matching subtotal / validity
        const now = new Date();
        let availableCoupons = await Coupon.find({
            isActive: true,
            expiryDate: { $gt: now },
            minAmount: { $lte: subtotal }
        }).lean();
        // filter based on usage limits
        availableCoupons = availableCoupons.filter(c => {
            if (c.usageLimit && c.usedCount >= c.usageLimit) return false;
            const usedByCount = c.usedBy?.filter(u => u.user.toString() === userId.toString()).length || 0;
            if (usedByCount >= (c.userUsageLimit || 1)) return false;
            return true;
        });

        // Pass adjustment data to view
        res.render('user/checkout', {
            user,
            cart,
            subtotal,
            tax,
            discount,
            shipping,
            total,
            defaultAddress,
            appliedCoupon,
            availableCoupons,
            isDirect: false,
            adjustedItems,
            itemsRemoved: itemsToRemove,
            hasAdjustments: adjustedItems.length > 0,
            hasRemovals: itemsToRemove.length > 0
        });

    } catch (err) {
      console.error('Checkout error:', err);
      // Avoid rendering a non-existent generic error view — redirect to cart
      try { res.status(statusCodes.INTERNAL_ERROR).redirect('/cart'); } catch (e) { res.redirect('/cart'); }
    }
};


const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, paymentMethod, productId, quantity } = req.body;

    // Allow 'wallet' now
    if (!['cod', 'razorpay', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method. Use 'cod', 'razorpay', or 'wallet'"
      });
    }

    let itemsToOrder = [];
    let subtotal = 0;
    let isDirect = !!productId;

    // coupon from session
    let discount = 0;
    let appliedCoupon = req.session.appliedCoupon;
    // we will recalc discount later once subtotal known

    if (isDirect) {
      // Direct buy logic (unchanged)
      if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: "Product ID and quantity required" });
      }

      const product = await Product.findById(productId);
      if (!product) return res.status(404).json({ success: false, message: "Product not found" });

      const qty = parseInt(quantity);
      if (qty < 1 || product.quantity < qty) {
        return res.status(400).json({ success: false, message: messages.OUT_OF_STOCK });
      }

      const price = getEffectivePrice(product);
      const totalPrice = price * qty;

      itemsToOrder = [{
        product: product._id,
        name: product.productName,
        quantity: qty,
        price,
        totalPrice,
        productSnapshot: { image: product.productImage?.[0] || '' },
        status: 'Pending'
      }];

      subtotal = totalPrice;
    } else {
      // Normal cart logic (unchanged)
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: messages.CART_EMPTY });
      }

      itemsToOrder = cart.items
        .filter(i => i.productId && i.productId.quantity >= i.quantity)
        .map(i => ({
          product: i.productId._id,
          name: i.productId.productName,
          quantity: i.quantity,
          price: i.price,
          totalPrice: i.totalPrice,
          productSnapshot: { image: i.productId.productImage?.[0] || '' },
          status: 'Pending'
        }));

      if (itemsToOrder.length === 0) {
        return res.status(400).json({ success: false, message: messages.OUT_OF_STOCK });
      }

      subtotal = itemsToOrder.reduce((s, i) => s + i.totalPrice, 0);
    }

    // preserve the original subtotal before coupon for later display/refund logic
    const preCouponSubtotal = subtotal;

    // re-evaluate coupon now that we know subtotal
    if (appliedCoupon && typeof appliedCoupon.discountAmount === 'number') {
      if (subtotal < (appliedCoupon.minAmount || 0)) {
        // invalid coupon – drop it
        delete req.session.appliedCoupon;
        appliedCoupon = null;
        discount = 0;
      } else {
        discount = appliedCoupon.discountAmount;
        if (discount > subtotal) discount = subtotal;

        // distribute discount across items proportionally so item.totalPrice reflects coupon
        if (discount > 0 && subtotal > 0) {
          const ratio = discount / subtotal;
          let adjusted = 0;
          itemsToOrder = itemsToOrder.map((it, idx) => {
            const orig = Number(it.totalPrice || 0);
            const reduction = Math.round(orig * ratio * 100) / 100;
            // ensure we don't overshoot on last item due to rounding
            const newPrice = Math.round((orig - reduction) * 100) / 100;
            adjusted += newPrice;
            return { ...it, totalPrice: newPrice };
          });
          // recompute subtotal to reflect adjusted values (may differ due to rounding)
          subtotal = itemsToOrder.reduce((s, i) => s + i.totalPrice, 0);
        }
      }
    }

    // calculate tax/shipping/total based on original (pre-discount) subtotal
    const originalSubtotal = preCouponSubtotal;
    const tax = originalSubtotal * 0.18;
    const shipping = originalSubtotal >= 1000 ? 0 : 79;
    const total = originalSubtotal + tax + shipping - discount;

    // for rendering we may want both values
    const displaySubtotal = originalSubtotal; // shown on summary
    const postDiscountSubtotal = subtotal;    // not used directly but kept in case

    // COD limit
    if (paymentMethod === 'cod' && total > 100000) {
      return res.status(400).json({
        success: false,
        message: 'Cash on Delivery not available for orders above ₹100000'
      });
    }

    const amountInPaise = Math.round(total * 100);

    // Address logic (unchanged)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: messages.USER_NOT_FOUND });

    let selectedAddress = getAddressById(user, addressId) || safeDefaultAddress(user);
    if (!selectedAddress) {
      return res.status(400).json({ success: false, message: messages.PLEASE_ADD_DELIVERY_ADDRESS });
    }

    const orderAddress = {
      fullName: (selectedAddress.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer').trim(),
      phone: selectedAddress.phone || user.phone || '',
      altPhone: selectedAddress.altPhone || '',
      street: selectedAddress.street || selectedAddress.line1 || selectedAddress.address || 'Not provided',
      landmark: selectedAddress.landmark || '',
      locality: selectedAddress.locality || '',
      city: selectedAddress.city || 'Not Available',
      state: selectedAddress.state || 'Not Available',
      pincode: selectedAddress.pincode || 'PIN Missing',
      country: selectedAddress.country || 'India'
    };

    if (!orderAddress.fullName.trim() || !orderAddress.city.trim() || !orderAddress.state.trim() || !orderAddress.pincode.trim()) {
      return res.status(400).json({ success: false, message: 'Address missing required fields' });
    }

    // prepare orderData with coupon if applied
    let orderData = {
      orderId: `ORD${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`,
      user: userId,
      orderedItems: itemsToOrder,
      subtotal: originalSubtotal,          // store pre-discount amount
      discountedSubtotal: subtotal,        // keep post-discount value if needed
      tax,
      shipping,
      discount: discount || 0,            // generic discount field
      couponDiscount: discount || 0,
      totalPrice: total,
      finalAmount: total,
      // store original subtotal for display/refund calculations (duplicate of subtotal for clarity)
      originalSubtotal: preCouponSubtotal,
      address: orderAddress,
      paymentMethod: paymentMethod.toUpperCase(),
      paymentStatus: 'Pending',
      status: 'Pending',
      pendingCancelTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdOn: new Date(),
      couponApplied: !!appliedCoupon,
      couponCode: appliedCoupon ? appliedCoupon.code : undefined
    };

    // ── WALLET PAYMENT ──
    if (paymentMethod === 'wallet') {
      if (user.wallet.balance < total) {
        return res.status(400).json({ 
          success: false, 
          message: 'Insufficient wallet balance. Please choose another payment method.' 
        });
      }

      orderData.paymentMethod = 'WALLET';
      orderData.paymentStatus = 'Paid';

      const order = await Order.create(orderData);

      const stockDeducted = await atomicDeductStock(
        order.orderedItems.map(it => ({ product: it.product, quantity: it.quantity }))
      );

      if (!stockDeducted) {
        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({ success: false, message: messages.STOCK_CHANGED_TRY_AGAIN });
      }

      // Debit wallet
      await addToWallet(userId, total, 'debit', 'Order Payment', order._id);

      // coupon usage tracking
      if (appliedCoupon) {
        await Coupon.findByIdAndUpdate(appliedCoupon.couponId, {
          $inc: { usedCount: 1 },
          $push: { usedBy: { user: userId } }
        });
        delete req.session.appliedCoupon;
      }

      if (!isDirect) await Cart.deleteOne({ user: userId });

      return res.json({
        success: true,
        redirectUrl: `/order-success/${order._id}`
      });
    }

    // ── COD FLOW ──
    if (paymentMethod === 'cod') {
      const order = await Order.create(orderData);

      const stockDeducted = await atomicDeductStock(
        order.orderedItems.map(it => ({ product: it.product, quantity: it.quantity }))
      );

      if (!stockDeducted) {
        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({ success: false, message: messages.STOCK_CHANGED_TRY_AGAIN });
      }

      // coupon tracking
      if (appliedCoupon) {
        await Coupon.findByIdAndUpdate(appliedCoupon.couponId, {
          $inc: { usedCount: 1 },
          $push: { usedBy: { user: userId } }
        });
        delete req.session.appliedCoupon;
      }

      if (!isDirect) await Cart.deleteOne({ user: userId });

      return res.json({
        success: true,
        redirectUrl: `/order-success/${order._id}`
      });
    }

    // ── RAZORPAY FLOW ──
    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: { userId: userId.toString(), isDirect: isDirect ? 'yes' : 'no' }
    });

    orderData.razorpayOrderId = rzpOrder.id;

    const order = await Order.create(orderData);

    return res.json({
      success: true,
      razorpay: {
        key: process.env.RAZORPAY_KEY_ID,
        order_id: rzpOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        name: "EverTime",
        description: `Payment for Order #${order.orderId}`,
        prefill: {
          name: user.name || 'Customer',
          email: user.email || '',
          contact: orderAddress.phone || ''
        }
      },
      orderMongoId: order._id.toString()
    });

  } catch (err) {
    console.error('Place Order Error:', err);
    return res.status(500).json({
      success: false,
      message: messages.ORDER_FAILED || 'Order placement failed'
    });
  }
};


const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderMongoId   // your own order _id
    } = req.body;

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      //  Invalid signature → payment failed / tampered
      await Order.findByIdAndUpdate(orderMongoId, {
        paymentStatus: 'Failed',
        status: 'Pending' // or 'Payment Failed' if you add that enum
      });
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    //  Valid payment
    const order = await Order.findById(orderMongoId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date();
    order.status = 'Pending'; // or 'Placed' — your choice

    await order.save();

    // coupon tracking after successful payment
    if (order.couponApplied && order.couponCode) {
      const sessionCoupon = req.session.appliedCoupon;
      if (sessionCoupon && sessionCoupon.couponId) {
        await Coupon.findByIdAndUpdate(sessionCoupon.couponId, {
          $inc: { usedCount: 1 },
          $push: { usedBy: { user: order.user } }
        });
      }
      delete req.session.appliedCoupon;
    }

    // Now reduce stock
    const items = order.orderedItems.map(item => ({
      product: item.product,
      quantity: item.quantity
    }));
    const stockDeducted = await atomicDeductStock(items);
    if (!stockDeducted) {
      console.error("Stock deduction failed after payment!");
      // You may want to initiate refund here in production
    }

    await Cart.deleteOne({ user: order.user });

    res.json({
      success: true,
      redirectUrl: `/order-success/${order._id}`
    });

  } catch (err) {
    console.error("Payment verify error:", err);
    res.status(500).json({ success: false, message: "Server error during verification" });
  }
};



//-----------

const orderSuccess = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId).lean();
        if (!order) return res.redirect('/');
        res.render('user/order-success', { order });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};


const directCheckout = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, quantity = 1 } = req.body;

    // Now Product is defined
    const product = await Product.findById(productId)
      .populate('category')
      .lean();

    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/shop');
    }

    const stock = Number(product.quantity) || 0;
    const qty = parseInt(quantity) || 1;

    if (product.isBlocked === true) {
      req.flash('error', 'Product is blocked');
      return res.redirect(`/product/${productId}`);
    }

    if (stock < qty) {
      req.flash('error', `Only ${stock} left in stock`);
      return res.redirect(`/product/${productId}`);
    }

    const fakeCart = {
      items: [{
        productId: product,
        quantity: parseInt(quantity),
        price: product.salesPrice,
        totalPrice: product.salesPrice * quantity
      }]
    };

    const subtotal = fakeCart.items.reduce((s, i) => s + i.totalPrice, 0);
    const tax = subtotal * 0.18;
    const shipping = subtotal >= 1000 ? 0 : 79;

    // coupon from session
    let discount = 0;
    let appliedCoupon = req.session.appliedCoupon;
    if (appliedCoupon && typeof appliedCoupon.discountAmount === 'number') {
      if (subtotal < (appliedCoupon.minAmount || 0)) {
        delete req.session.appliedCoupon;
        appliedCoupon = null;
      } else {
        discount = appliedCoupon.discountAmount;
        if (discount > subtotal) discount = subtotal;
      }
    }

    // for direct purchase subtotal is pre-discount; tax calculated on it
    const total = subtotal + tax + shipping - discount;

    const user = await User.findById(userId).lean();
    const defaultAddress = safeDefaultAddress(user);

    // available coupons for direct purchase
    const now = new Date();
    let availableCoupons = await Coupon.find({
        isActive: true,
        expiryDate: { $gt: now },
        minAmount: { $lte: subtotal }
    }).lean();
    availableCoupons = availableCoupons.filter(c => {
        if (c.usageLimit && c.usedCount >= c.usageLimit) return false;
        const usedByCount = c.usedBy?.filter(u => u.user.toString() === userId.toString()).length || 0;
        if (usedByCount >= (c.userUsageLimit || 1)) return false;
        return true;
    });

    res.render('user/checkout', {
      user,
      cart: fakeCart,
      subtotal,
      tax,
      discount,
      shipping,
      total,
      defaultAddress,
      appliedCoupon,
      availableCoupons,
      isDirect: true,
      directProductId: productId,
      hasAdjustments: false,
      hasRemovals: false,
      adjustedItems: [],
      itemsRemoved: []
    });

  } catch (err) {
    console.error('Direct checkout error:', err);
    req.flash('error', messages.CHECKOUT_LOAD_ERROR);
    res.redirect('/shop');
  }
};



const atomicDeductStock = async (items) => {
  for (const item of items) {
    const result = await Product.updateOne(
      { _id: item.product, quantity: { $gte: item.quantity } },
      { $inc: { quantity: -item.quantity } }
    );
    if (result.modifiedCount === 0) {
      // Rollback previous deductions
      for (const prev of items.slice(0, items.indexOf(item))) {
        await Product.updateOne(
          { _id: prev.product },
          { $inc: { quantity: prev.quantity } }
        );
      }
      return false;
    }
  }
  return true;

  
};



const addAddressFromCheckout = async (req, res) => {
  try {
    const userId = req.session.user?._id || null;
    if (!userId) return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: 'Not authenticated'});

    const { fullName, phone, line1, landmark, city, state, zip, country, type, isDefault } = req.body;
    const errors = [];
    if (!line1 || line1.trim().length < 5) errors.push('Address Line 1 must be at least 5 characters');
    if (!city || city.trim().length < 2) errors.push('City must be at least 2 characters');
    if (!state || state.trim().length < 2) errors.push('State must be at least 2 characters');
    if (!country || country.trim().length < 2) errors.push('Country must be at least 2 characters');
    if (!zip || !/^\d{5,6}$/.test((zip || '').trim()))errors.push('Zip Code must be 5 or 6 digits');
    

    if (errors.length > 0) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: errors.join(' |  ')})

    }

    const user = await User.findById(userId)

    if(!user) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: 'User not found'});
    }

    user.addresses = user.addresses || [];
  
    // If setting default, clear others
    if (isDefault === 'on' || isDefault === true || isDefault === 'true'  ){
      user.addresses.forEach(a=> { if (a) a.isDefault = false;});
    }

    const addrObj = {
      fullName: (fullName || '').trim(),
      phone: (phone || '').trim(),
      street: (line1 || '').trim(),
      landmark: (landmark || '').trim(),
      city: (city || '').trim(),
      state: (state || '').trim(),
      zip: (zip || '').trim(),
      country: (country || '').trim() || 'India',
      type: (type || 'home').trim(),
      isDefault: (isDefault === 'on' || isDefault === true || isDefault === 'true')
    };

    user.addresses.push(addrObj);
    await user.save();

    const newAddr = user.addresses[user.addresses.length -1];
    return res.json({ success: true, address: newAddr});





  }catch (err) {

    console.error('Add address from checkout error:', err);
    return res.status (statusCodes.INTERNAL_ERROR).json({ success: false, message: 'Failed to add address'})

  }
}


const applyCoupon = async (req, res) => {
  try {
    const { code, productId, quantity } = req.body;
    const userId = req.session.user._id;

    if (!code || typeof code !== 'string' || code.trim() === ''){
      return res.status(400).json({ success: false, message: 'Please enter a coupon code'});
    }

    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      isActive: true,
    });

    if(!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive coupon code'})
    }
   
    //check expiry
    if (new Date() > new Date(coupon.expiryDate)) {
      return res.status(400).json({ success: false, message: 'Coupon code has expired'})
    }

    //Get current cart subtotal (or direct-buy)
    let subtotal = 0;

    if (productId) {
      // direct purchase
      const product = await Product.findById(productId);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      const qty = parseInt(quantity) || 1;
      if (qty < 1 || product.quantity < qty) {
        return res.status(400).json({ success: false, message: messages.OUT_OF_STOCK });
      }
      const price = getEffectivePrice(product);
      subtotal = price * qty;
    } else {
      const cart = await Cart.findOne({ user: userId}).populate('items.productId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Your cart is empty' });
      }
      subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }

      //min amount check
      if (subtotal < coupon.minAmount) {
        return res.status(400).json({ success: false, message: `Minimum order amount of ₹${coupon.minAmount} required to use this coupon `})
      }

      //Global usage limit chceck
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({success: false, message: 'Coupon usage limit reached'})
      }

      //per-user limit
      const userUsed = coupon.usedBy?.filter(u => u.user.toString() === userId.toString()).length || 0;
    if (userUsed >= coupon.userUsageLimit) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon' });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'fixed') {
      discount = coupon.discountValue;
    } else { // percentage
      discount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    }

    // Store in session
    req.session.appliedCoupon = {
      code: coupon.code,
      couponId: coupon._id.toString(),
      discountAmount: discount,
      minAmount: coupon.minAmount || 0
    };

    res.json({
      success: true,
      discount: discount.toFixed(2),
      message: `Coupon applied! ₹${discount.toFixed(2)} off`
    });


  }catch(err){
    console.error('Apply coupon error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  

  }
}

// Remove Coupon
const removeCoupon = (req, res) => {
  if (req.session.appliedCoupon) {
    delete req.session.appliedCoupon;
    return res.json({ success: true, message: 'Coupon removed' });
  }
  res.json({ success: false, message: 'No coupon applied' });
};


module.exports = { 
    loadCheckout,
     placeOrder,
     verifyPayment,
      orderSuccess,
        directCheckout,
          atomicDeductStock,
          addAddressFromCheckout,
          applyCoupon,
          removeCoupon
     };




















