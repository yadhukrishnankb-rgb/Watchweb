// controllers/user/checkoutController.js
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const razorpay = require('../../config/razorpay');
const crypto = require('crypto');
const { addToWallet } = require('./walletController');

const now = new Date();

const COD_FIXED_SHIPPING = 79;
const FREE_SHIPPING_THRESHOLD = 1000;

const { getEffectivePrice } = require('../../helpers/priceUtils');


function _safeAddresses(user) {
  if (!user || !Array.isArray(user.addresses)) return [];
  return user.addresses.filter(Boolean);
}

function safeDefaultAddress(user) {
  const addrs = _safeAddresses(user);
  return addrs.find(a => a && a.isDefault) || addrs[0] || null;
}

function getAddressById(user, addressId) {
  if (!addressId) return null;
  const addrs = _safeAddresses(user);
  try {
    if (user?.addresses?.id) {
      const found = user.addresses.id(addressId);
      if (found) return found;
    }
  } catch {}
  return addrs.find(a => a?._id?.toString() === addressId) || null;
}


const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).lean();
    const cart = await Cart.findOne({ user: userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', populate: { path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now }, isActive: true } } },
          { path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now }, isActive: true } }
        ]
      })
      .lean();

    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    const adjustedItems = [];
    const itemsToRemove = [];

    cart.items = cart.items.filter(item => {
      const p = item.productId;
      if (!p || p.isBlocked || p.category?.isBlocked) {
        itemsToRemove.push({
          name: p?.productName || 'Unknown Product',
          reason: 'blocked'
        });
        return false;
      }

      if (p.quantity < item.quantity) {
        if (p.quantity === 0) {
          itemsToRemove.push({
            name: p.productName,
            reason: 'outOfStock'
          });
          return false;
        } else {
          const oldQty = item.quantity;
          item.quantity = p.quantity;
          const eff = getEffectivePrice(p);
          item.price = eff;
          item.totalPrice = eff * p.quantity;

          adjustedItems.push({
            name: p.productName,
            oldQty,
            newQty: p.quantity
          });
          return true;
        }
      }
      return true;
    });

    const updatedItems = cart.items.map(item => ({
      productId: item.productId._id,
      quantity: item.quantity,
      price: getEffectivePrice(item.productId, item.productId.category),
      totalPrice: item.quantity * getEffectivePrice(item.productId, item.productId.category)
    }));
    if (JSON.stringify(updatedItems) !== JSON.stringify(cart.items.map(i => ({
      productId: i.productId._id,
      quantity: i.quantity,
      price: i.price,
      totalPrice: i.totalPrice
    })))) {
      await Cart.findByIdAndUpdate(cart._id, { items: updatedItems });
    }

    if (cart.items.length === 0) {
      await Cart.deleteOne({ user: userId });
      return res.redirect('/cart');
    }

    const subtotal = cart.items.reduce((sum, i) => sum + i.totalPrice, 0);
    const tax = subtotal * 0.18;
    const shipping = subtotal >= 1000 ? 0 : 79;

    let discount = 0;
    let appliedCoupon = req.session.appliedCoupon;
    if (appliedCoupon?.discountAmount) {
      if (subtotal < (appliedCoupon.minAmount || 0)) {
        delete req.session.appliedCoupon;
        appliedCoupon = null;
      } else {
        discount = appliedCoupon.discountAmount;
        if (discount > subtotal) discount = subtotal;
      }
    }

    const total = subtotal + tax + shipping - discount;

    const defaultAddress = safeDefaultAddress(user);

    const coupons = await Coupon.find({
  isActive: true,
  expiryDate: { $gt: now },
  minAmount: { $lte: subtotal }
}).lean();

const availableCoupons = coupons.filter(c => {
  if (c.usageLimit && c.usedCount >= c.usageLimit) return false;

  const usedByCount =
    c.usedBy?.filter(u => u.user.toString() === userId.toString()).length || 0;

  return usedByCount < (c.userUsageLimit || 1);
});

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
    console.error('Checkout load error:', err);
    res.redirect('/cart');
  }
};


const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, paymentMethod, productId, quantity } = req.body;

    if (!['cod', 'razorpay', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    let itemsToOrder = [];
    let subtotal = 0;
    let isDirect = !!productId;

    let discount = 0;
    let appliedCoupon = req.session.appliedCoupon;

    if (isDirect) {
      if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: "Product ID and quantity required" });
      }

      const now = new Date();
      const product = await Product.findById(productId)
        .populate({ path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now } } })
        .populate({
          path: 'category',
          populate: { path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now }, isActive: true } }
        });
      if (!product) return res.status(404).json({ success: false, message: "Product not found" });

      const qty = parseInt(quantity);
      if (qty < 1 || product.quantity < qty) {
        return res.status(400).json({ success: false, message: messages.OUT_OF_STOCK });
      }

      const price = getEffectivePrice(product, product.category);
      const totalPrice = price * qty;

      itemsToOrder = [{
        product: product._id,
        name: product.productName,
        quantity: qty,
        originalPrice: Number(product.price || 0), 
        price,
        totalPrice,
        productSnapshot: { image: product.productImage?.[0] || '' },
        status: 'Pending'
      }];

      subtotal = totalPrice;
    } else {
      const now = new Date();
      const cart = await Cart.findOne({ user: userId }).populate({
        path: 'items.productId',
        populate: [
          { path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now } } },
          {
            path: 'category',
            populate: { path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now }, isActive: true } }
          }
        ]
      });
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: messages.CART_EMPTY });
      }

      itemsToOrder = cart.items
        .filter(i => i.productId && i.productId.quantity >= i.quantity)
        .map(i => {
          const eff = getEffectivePrice(i.productId, i.productId.category);
          return {
            product: i.productId._id,
            name: i.productId.productName,
            quantity: i.quantity,
            originalPrice: Number(i.productId.price || 0),
            price: eff,
            totalPrice: i.quantity * eff,
            productSnapshot: { image: i.productId.productImage?.[0] || '' },
            status: 'Pending'
          };
        });

      if (itemsToOrder.length === 0) {
        return res.status(400).json({ success: false, message: messages.OUT_OF_STOCK });
      }

      subtotal = itemsToOrder.reduce((s, i) => s + i.totalPrice, 0);
    }

    const preOfferSubtotal = itemsToOrder.reduce((s, i) => {
      const base = Number(i.originalPrice ?? i.price ?? 0);
      return s + base * (i.quantity || 0);
    }, 0);
    const offerDiscount = Math.round(Math.max(0, preOfferSubtotal - subtotal) * 100) / 100;

    const originalSubtotal = subtotal;

    let couponDiscount = 0;
    if (appliedCoupon?.discountAmount) {
      if (subtotal < (appliedCoupon.minAmount || 0)) {
        delete req.session.appliedCoupon;
        appliedCoupon = null;
        discount = 0;
        couponDiscount = 0;
      } else {
        couponDiscount = appliedCoupon.discountAmount;
        if (couponDiscount > subtotal) couponDiscount = subtotal;
        discount = couponDiscount; 
      }
    }

    const tax = originalSubtotal * 0.18;
    const shipping = paymentMethod === 'cod'
      ? COD_FIXED_SHIPPING
      : (originalSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : COD_FIXED_SHIPPING);
    const total = originalSubtotal + tax + shipping - (couponDiscount); 

    if (paymentMethod === 'cod' && subtotal > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Cash on Delivery not available for orders above ₹1000'
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: messages.USER_NOT_FOUND });

    const selectedAddress = getAddressById(user, addressId) || safeDefaultAddress(user);
    if (!selectedAddress) {
      return res.status(400).json({ success: false, message: messages.PLEASE_ADD_DELIVERY_ADDRESS });
    }

    const orderAddress = {
      fullName: (selectedAddress.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer').trim(),
      phone: selectedAddress.phone || user.phone || '',
      altPhone: selectedAddress.altPhone || '',
      address: selectedAddress.street || selectedAddress.line1 || selectedAddress.address || 'Not provided',
      street: selectedAddress.street || selectedAddress.line1 || selectedAddress.address || 'Not provided',
      line1: selectedAddress.line1 || selectedAddress.street || selectedAddress.address || 'Not provided',
      landmark: selectedAddress.landmark || '',
      locality: selectedAddress.locality || '',
      city: selectedAddress.city || 'Not Available',
      state: selectedAddress.state || 'Not Available',
      pincode: selectedAddress.pincode || selectedAddress.zip || 'PIN Missing',
      zip: selectedAddress.zip || selectedAddress.pincode || '',
      country: selectedAddress.country || 'India'
    };

    const orderData = {
      orderId: `ORD${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`,
      user: userId,
      orderedItems: itemsToOrder,
      subtotal: originalSubtotal,
      tax,
      shipping,
      offerDiscount,
      couponDiscount,
      discount: couponDiscount + offerDiscount, 
      totalPrice: total,
      finalAmount: total,
      originalSubtotal,
      address: orderAddress,
      paymentMethod: paymentMethod.toUpperCase(),
      paymentStatus: 'Pending',
      status: 'Pending',
      pendingCancelTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdOn: new Date(),
      couponApplied: !!appliedCoupon,
      couponCode: appliedCoupon?.code
    };

    
    if (paymentMethod === 'wallet') {
      if (user.wallet?.balance < total) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance'
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

      await addToWallet(userId, total, 'debit', 'Order Payment', order._id);

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

    
    if (paymentMethod === 'cod') {
      const order = await Order.create(orderData);

      const stockDeducted = await atomicDeductStock(
        order.orderedItems.map(it => ({ product: it.product, quantity: it.quantity }))
      );

      if (!stockDeducted) {
        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({ success: false, message: messages.STOCK_CHANGED_TRY_AGAIN });
      }

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

    
    const amountInPaise = Math.round(total * 100);

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
      orderMongoId
    } = req.body;

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      await Order.findByIdAndUpdate(orderMongoId, {
        paymentStatus: 'Failed',
        status: 'Payment Failed'
      });
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    const order = await Order.findById(orderMongoId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date();
    order.status = 'Processing';

    await order.save();

    
    if (order.couponApplied && order.couponCode) {
      const sessionCoupon = req.session.appliedCoupon;
      if (sessionCoupon?.couponId) {
        await Coupon.findByIdAndUpdate(sessionCoupon.couponId, {
          $inc: { usedCount: 1 },
          $push: { usedBy: { user: order.user } }
        });
      }
      delete req.session.appliedCoupon;
    }

   
    const stockDeducted = await atomicDeductStock(
      order.orderedItems.map(it => ({ product: it.product, quantity: it.quantity }))
    );

    if (!stockDeducted) {
      console.error("Stock deduction failed after payment verification!");
      
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


const orderSuccess = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('orderedItems.product')
      .lean();

    if (!order || order.user.toString() !== req.session.user._id.toString()) {
      return res.redirect('/');
    }

    res.render('user/order-success', { order });
  } catch (err) {
    console.error('Order success error:', err);
    res.redirect('/');
  }
};


const directCheckout = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, quantity = 1 } = req.body;

    const product = await Product.findById(productId)
      .populate('category')
      .populate({ path: 'offer', match: { startDate: { $lte: now }, endDate: { $gte: now }, isActive: true } })
      .lean();

    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/shop');
    }

    const qty = parseInt(quantity);
    if (qty < 1 || product.quantity < qty) {
      req.flash('error', `Only ${product.quantity} left in stock`);
      return res.redirect(`/product/${productId}`);
    }

    const price = getEffectivePrice(product, product.category);
    const fakeCart = {
      items: [{
        productId: product,
        quantity: qty,
        price,
        totalPrice: price * qty
      }]
    };

    const subtotal = price * qty;
    const tax = subtotal * 0.18;
    const shipping = subtotal >= 1000 ? 0 : 79;

    let discount = 0;
    let appliedCoupon = req.session.appliedCoupon;
    if (appliedCoupon?.discountAmount) {
      if (subtotal < (appliedCoupon.minAmount || 0)) {
        delete req.session.appliedCoupon;
        appliedCoupon = null;
      } else {
        discount = appliedCoupon.discountAmount;
        if (discount > subtotal) discount = subtotal;
      }
    }

    const total = subtotal + tax + shipping - discount;

    const user = await User.findById(userId).lean();
    const defaultAddress = safeDefaultAddress(user);

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gt: now },
      minAmount: { $lte: subtotal }
    }).lean();

    const availableCoupons = coupons.filter(c => {
      if (c.usageLimit && c.usedCount >= c.usageLimit) return false;
      const usedByCount = c.usedBy?.filter(u => u.user.toString() === userId.toString()).length || 0;
      return usedByCount < (c.userUsageLimit || 1);
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
    const userId = req.session.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { fullName, phone, line1, address, landmark, city, state, zip, country, type, isDefault } = req.body;
    const streetLine = (line1 || address || '').trim();

    const errors = [];
    if (!streetLine || streetLine.length < 5) errors.push('Address Line 1 must be at least 5 characters');
    if (!city || city.trim().length < 2) errors.push('City must be at least 2 characters');
    if (!state || state.trim().length < 2) errors.push('State must be at least 2 characters');
    if (!zip || !/^\d{5,6}$/.test(zip.trim())) errors.push('Zip Code must be 5 or 6 digits');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(' | ') });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.addresses = user.addresses || [];

    if (isDefault === 'on' || isDefault === true || isDefault === 'true') {
      user.addresses.forEach(a => { if (a) a.isDefault = false; });
    }

    const addrObj = {
      fullName: (fullName || '').trim(),
      phone: (phone || '').trim(),
      street: streetLine,
      line1: streetLine,
      landmark: (landmark || '').trim(),
      locality: '',
      city: (city || '').trim(),
      state: (state || '').trim(),
      zip: (zip || '').trim(),
      pincode: (zip || '').trim(),
      country: (country || 'India').trim(),
      type: (type || 'home').trim(),
      isDefault: (isDefault === 'on' || isDefault === true || isDefault === 'true')
    };

    user.addresses.push(addrObj);
    await user.save();

    const newAddr = user.addresses[user.addresses.length - 1];
    return res.json({ success: true, address: newAddr });

  } catch (err) {
    console.error('Add address from checkout error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add address' });
  }
};


const applyCoupon = async (req, res) => {
  try {
    const { code, productId, quantity } = req.body;
    const userId = req.session.user._id;

    if (!code || typeof code !== 'string' || code.trim() === '') {
      return res.status(400).json({ success: false, message: 'Please enter a coupon code' });
    }

    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive coupon code' });
    }

    if (now > new Date(coupon.expiryDate)) {
      return res.status(400).json({ success: false, message: 'Coupon code has expired' });
    }

    let subtotal = 0;

    if (productId) {
      
      const product = await Product.findById(productId);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

      const qty = parseInt(quantity) || 1;
      if (qty < 1 || product.quantity < qty) {
        return res.status(400).json({ success: false, message: messages.OUT_OF_STOCK });
      }

      const price = getEffectivePrice(product, product.category);
      subtotal = price * qty;
    } else {
      const cart = await Cart.findOne({ user: userId }).populate('items.productId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Your cart is empty' });
      }
      subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }

    if (subtotal < coupon.minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ₹${coupon.minAmount} required`
      });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    const userUsed = coupon.usedBy?.filter(u => u.user.toString() === userId.toString()).length || 0;
    if (userUsed >= coupon.userUsageLimit) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon' });
    }

    let discount = 0;
    if (coupon.discountType === 'fixed') {
      discount = coupon.discountValue;
    } else {
      discount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    }

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

  } catch (err) {
    console.error('Apply coupon error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};


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