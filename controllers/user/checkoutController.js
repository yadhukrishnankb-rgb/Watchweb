
// controllers/user/checkoutController.js
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema'); 
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const razorpay = require('../../config/razorpay')
const crypto = require('crypto');

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
                    item.totalPrice = p.salesPrice * p.quantity;
                    
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
            const updatedItems = cart.items.map(item => ({
                productId: item.productId._id,
                quantity: item.quantity,
                price: item.productId.salesPrice,
                totalPrice: item.totalPrice
            }));
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
        const discount = 0; // Add coupon logic later
        const shipping = subtotal >= 1000 ? 0 : 79;
        const total = subtotal + tax + shipping - discount;

        const defaultAddress = safeDefaultAddress(user);

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
        const { addressId, paymentMethod } = req.body;

        if (!['cod', 'razorpay'].includes(paymentMethod)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: "Invalid payment method. Use 'cod' or 'razorpay'"
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CART_EMPTY
            });
        }

        // Prepare items (your original filtering logic)
        const itemsToOrder = cart.items
            .filter(i => i.productId && i.productId.quantity >= i.quantity)
            .map(i => ({
                product: i.productId._id,
                quantity: i.quantity,
                price: i.price,
                totalPrice: i.totalPrice
            }));

        if (itemsToOrder.length === 0) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.OUT_OF_STOCK
            });
        }

        const subtotal = itemsToOrder.reduce((s, i) => s + i.totalPrice, 0);
        const tax = subtotal * 0.18;
        const shipping = subtotal >= 1000 ? 0 : 79;
        const total = subtotal + tax + shipping;

        // Check COD limit
        if (paymentMethod === 'cod' && total > 100000) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: 'Cash on Delivery is not available for orders above ₹100000' });
        }

        // Final amount in paise (Razorpay needs integers)
        const amountInPaise = Math.round(total * 100);

        // ── Address logic (your original code) ──
        const user = await User.findById(userId);
        if (!user) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.USER_NOT_FOUND
            });
        }

        let selectedAddress = getAddressById(user, addressId);
        if (!selectedAddress) {
            selectedAddress = safeDefaultAddress(user);
        }
        if (!selectedAddress) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.PLEASE_ADD_DELIVERY_ADDRESS
            });
        }

        const orderAddress = {
            fullName: (selectedAddress.fullName || selectedAddress.name ||
                `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim() ||
                user.name || 'Customer').replace(/undefined/g, '').trim() || 'Customer',
            phone: selectedAddress.phone || selectedAddress.mobile || user.phone || '',
            altPhone: selectedAddress.altPhone || selectedAddress.mobile2 || '',
            street: selectedAddress.street || selectedAddress.line1 || selectedAddress.house ||
                selectedAddress.address || selectedAddress.addressLine1 || 'Not provided',
            landmark: selectedAddress.landmark || selectedAddress.addressLine2 || '',
            locality: selectedAddress.locality || selectedAddress.area || '',
            city: selectedAddress.city || selectedAddress.town || 'Not Available',
            state: selectedAddress.state || selectedAddress.stateName || 'Not Available',
            pincode: selectedAddress.pincode || selectedAddress.postalCode ||
                selectedAddress.zip || selectedAddress.pin || 'PIN Missing',
            country: selectedAddress.country || 'India'
        };

        if (!orderAddress.fullName.trim() || !orderAddress.city.trim() ||
            !orderAddress.state.trim() || !orderAddress.pincode.trim()) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: 'Please ensure your delivery address has all required fields (name, city, state, pincode).'
            });
        }

        // ── Prepare orderedItems with names & images ──
        const orderedItems = itemsToOrder.map(item => {
            const cartItem = cart.items.find(ci => ci.productId._id.toString() === item.product.toString());
            return {
                product: item.product,
                name: cartItem?.productId?.productName || 'Product',
                quantity: item.quantity,
                price: item.price,
                totalPrice: item.totalPrice,
                productSnapshot: {
                    image: cartItem?.productId?.productImage?.[0] || ''
                },
                status: 'Pending'
            };
        });

        // Common base for order
        let orderData = {
            orderId: `ORD${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`,
            user: userId,
            orderedItems,
            subtotal,
            tax,
            shipping,
            discount: 0,
            totalPrice: total,
            finalAmount: total,
            address: orderAddress,
            paymentMethod: paymentMethod === 'cod' ? 'COD' : 'RAZORPAY',
            paymentStatus: 'Pending',
            status: 'Pending',
            pendingCancelTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdOn: new Date()
        };

        // ──────────────────────────────
        //        COD FLOW
        // ──────────────────────────────
        if (paymentMethod === 'cod') {
            const order = await Order.create(orderData);

            // For COD → deduct stock immediately
            const stockDeducted = await atomicDeductStock(
                orderedItems.map(it => ({ product: it.product, quantity: it.quantity }))
            );

            if (!stockDeducted) {
                // rollback
                await Order.findByIdAndDelete(order._id);
                return res.status(statusCodes.BAD_REQUEST).json({
                    success: false,
                    message: messages.STOCK_CHANGED_TRY_AGAIN
                });
            }

            await Cart.deleteOne({ userId });

            return res.json({
                success: true,
                redirectUrl: `/order-success/${order._id}`
            });
        }

        // ──────────────────────────────
        //      RAZORPAY FLOW
        // ──────────────────────────────
        const rzpOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`,
            notes: {
                userId: userId.toString()
            }
        });

        orderData.razorpayOrderId = rzpOrder.id;
        // paymentStatus stays 'Pending'

        const order = await Order.create(orderData);

        // IMPORTANT: do NOT clear cart or deduct stock here!

        return res.json({
            success: true,
            razorpay: {
                key: process.env.RAZORPAY_KEY_ID,
                order_id: rzpOrder.id,
                amount: amountInPaise,
                currency: 'INR',
                name: "Your Store Name",           // change to your brand
                description: `Payment for Order #${order.orderId}`,
                prefill: {
                    name: user.name || 'Customer',
                    email: user.email || '',
                    contact: orderAddress.phone || ''
                }
            },
            orderMongoId: order._id.toString(),
            redirectIfCOD: false
        });

    } catch (err) {
        console.error('Place Order Error:', err);
        return res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.ORDER_FAILED
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
      // ❌ Invalid signature → payment failed / tampered
      await Order.findByIdAndUpdate(orderMongoId, {
        paymentStatus: 'Failed',
        status: 'Pending' // or 'Payment Failed' if you add that enum
      });
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // ✅ Valid payment
    const order = await Order.findById(orderMongoId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date();
    order.status = 'Processing'; // or 'Placed' — your choice

    await order.save();

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


const directPlaceOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, quantity = 1, addressId, paymentMethod } = req.body;


    const product = await Product.findById(productId);
    if (!product || product.quantity < quantity) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.OUT_OF_STOCK });
    }

    const qty = parseInt(quantity);
    const subtotal = product.salesPrice * qty;
    const tax = subtotal * 0.18;
    const shipping = subtotal >= 1000 ? 0 : 79;
    const total = subtotal + tax + shipping;

    const itemsToOrder = [{
      product: productId,
      quantity: qty,
      price: product.salesPrice,
      totalPrice: subtotal
    }];

    const stockOk = await atomicDeductStock(itemsToOrder);
    if (!stockOk) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.STOCK_CHANGED_TRY_AGAIN });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.USER_NOT_FOUND });
    }

    // Get address safely
    let selectedAddress = getAddressById(user, addressId);
    if (!selectedAddress) {
      selectedAddress = safeDefaultAddress(user);
    }
    if (!selectedAddress) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PLEASE_ADD_DELIVERY_ADDRESS });
    }

    // BUILD ADDRESS OBJECT WITH PROPER FALLBACKS
    const orderAddress = {
      fullName: (selectedAddress.fullName || selectedAddress.name || 
                  `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim() || 
                  user.name || 'Customer').replace(/undefined/g, '').trim() || 'Customer',
      phone: selectedAddress.phone || selectedAddress.mobile || user.phone || '',
      altPhone: selectedAddress.altPhone || selectedAddress.mobile2 || '',
      street: selectedAddress.street || selectedAddress.line1 || selectedAddress.house || selectedAddress.address || selectedAddress.addressLine1 || 'Not provided',
      landmark: selectedAddress.landmark || selectedAddress.addressLine2 || '',
      locality: selectedAddress.locality || selectedAddress.area || '',
      city: selectedAddress.city || selectedAddress.town || 'Not Available',
      state: selectedAddress.state || selectedAddress.stateName || 'Not Available',
      pincode: selectedAddress.pincode || selectedAddress.postalCode || selectedAddress.zip || selectedAddress.pin || 'PIN Missing',
      country: selectedAddress.country || 'India'
    };

    // Validate required address fields
    if (!orderAddress.fullName.trim() || !orderAddress.city.trim() || !orderAddress.state.trim() || !orderAddress.pincode.trim()) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: 'Please ensure your delivery address has all required fields (name, city, state, pincode).' });
    }

    const order = await Order.create({
      orderId: `ORD${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`,
      user: userId,
      orderedItems: [{
        product: productId,
        name: product.productName,
        quantity: qty,
        price: product.salesPrice,
        totalPrice: subtotal,
        productSnapshot: { image: product.productImage[0] },
        status: 'Pending'
      }],
      totalPrice: total,
      finalAmount: total,
      subtotal,
      tax,
      shipping,
      discount: 0,
      paymentMethod: paymentMethod === 'cod' ? 'COD' : 'RAZORPAY',
      paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
      status: 'Pending',
      address: orderAddress,
      pendingCancelTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdOn: new Date()
    });

    res.json({ success: true, redirectUrl: `/order-success/${order._id}` });
  } catch (err) {
    console.error('Direct place order error:', err);
    res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.ORDER_PLACE_FAILED });
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
    const total = subtotal + tax + shipping;

    const user = await User.findById(userId).lean();
    const defaultAddress = safeDefaultAddress(user);

    res.render('user/checkout', {
      user,
      cart: fakeCart,
      subtotal,
      tax,
      discount: 0,
      shipping,
      total,
      defaultAddress,
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


module.exports = { 
    loadCheckout,
     placeOrder,
     verifyPayment,
      orderSuccess,
        directCheckout,
          directPlaceOrder,
          atomicDeductStock,
          addAddressFromCheckout
     };




















