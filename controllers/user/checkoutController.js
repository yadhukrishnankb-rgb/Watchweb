// controllers/user/checkoutController.js
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');

const Order = require('../../models/orderSchema'); 

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

        // Filter invalid items
        cart.items = cart.items.filter(item => {
            const p = item.productId;
            return p && !p.isBlocked && !p.category.isBlocked && p.quantity >= item.quantity;
        });

        if (cart.items.length === 0) {
            await Cart.deleteOne({ userId });
            return res.redirect('/cart');
        }

        const subtotal = cart.items.reduce((sum, i) => sum + i.totalPrice, 0);
        const taxRate = 0.18;
        const tax = subtotal * taxRate;
        const discount = 0; // Add coupon logic later
        const shipping = subtotal >= 1000 ? 0 : 79;
        const total = subtotal + tax + shipping - discount;

        const defaultAddress = user.addresses?.find(a => a.isDefault) || user.addresses?.[0] || null;

        res.render('user/checkout', {
            user,
            cart,
            subtotal,
            tax,
            discount,
            shipping,
            total,
            defaultAddress,
            isDirect: false
        });

    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).render('error', { message: 'Failed to load checkout' });
    }
};




// // // ========== CART PLACE ORDER (FIXED) ==========
// const placeOrder = async (req, res) => {
//   try {
//     const userId = req.session.user._id;
//     const { addressId, paymentMethod } = req.body;

//     const cart = await Cart.findOne({ userId }).populate('items.productId');
//     if (!cart || cart.items.length === 0) {
//       return res.json({ success: false, message: 'Cart is empty' });
//     }

//     const itemsToOrder = cart.items
//       .filter(i => i.productId && i.productId.quantity >= i.quantity)
//       .map(i => ({
//         product: i.productId._id,
//         quantity: i.quantity,
//         price: i.price,
//         totalPrice: i.totalPrice
//       }));

//     if (itemsToOrder.length === 0) {
//       return res.json({ success: false, message: 'Out of stock' });
//     }

//     const subtotal = itemsToOrder.reduce((s, i) => s + i.totalPrice, 0);
//     const tax = subtotal * 0.18;
//     const shipping = subtotal >= 1000 ? 0 : 79;
//     const total = subtotal + tax + shipping;

//     const stockOk = await atomicDeductStock(itemsToOrder);
//     if (!stockOk) {
//       return res.json({ success: false, message: 'Stock changed. Try again.' });
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.json({ success: false, message: 'User not found' });
//     }

//     // SAFELY GET ADDRESS
//     let address;
//     if (addressId) {
//       address = user.addresses.find(a => a._id.toString() === addressId);
//     }
//     if (!address && user.addresses.length > 0) {
//       address = user.addresses.find(a => a.isDefault) || user.addresses[0];
//     }
//     if (!address) {
//       return res.json({ success: false, message: 'No delivery address found. Please add one.' });
//     }

//     const order = await Order.create({
//       user: userId,
//       orderedItems: itemsToOrder.map(i => ({
//         product: i.product,
//         name: cart.items.find(c => c.productId._id.toString() === i.product.toString()).productId.productName,
//         quantity: i.quantity,
//         price: i.price,
//         totalPrice: i.totalPrice,
//         productSnapshot: { image: cart.items.find(c => c.productId._id.toString() === i.product.toString()).productId.productImage[0] }
//       })),
//       totalPrice: total,
//       finalAmount: total,
//       subtotal,
//       tax,
//       shipping,
//       discount: 0,
//       paymentMethod: paymentMethod === 'cod' ? 'COD' : 'RAZORPAY',
//       paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
//       status: 'pending',
//        address: {
//         fullName: (address.fullName || address.name || `${(user.firstName||'').trim()} ${(user.lastName||'').trim()}`).trim() || 'Customer',
//         phone: address.phone || address.mobile || user.phone || '',
//         altPhone: address.altPhone || address.mobile2 || '',
//         street: address.street || address.house || address.address || '',
//         landmark: address.landmark || address.addressLine2 || '',
//         locality: address.locality || address.area || '',
//         city: address.city || '',
//         state: address.state || '',
//         pincode: address.pincode || address.postalCode || address.zip || '',
//         country: address.country || 'India'
//       },
//       createdOn: new Date()
//     });

//     await Cart.deleteOne({ userId });
//     res.redirect(`/order-success/${order._id}`);
//   } catch (err) {
//     console.error('Place Order Error:', err);
//     res.json({ success: false, message: 'Failed to place order' });
//   }
// };

// // === DIRECT PLACE ORDER (BUY NOW) - FIXED ===
// const directPlaceOrder = async (req, res) => {
//   try {
//     const userId = req.session.user._id;
//     const { productId, quantity = 1, addressId, paymentMethod } = req.body;

//     const product = await Product.findById(productId);
//     if (!product || product.quantity < quantity) {
//       return res.json({ success: false, message: 'Out of stock' });
//     }

//     const qty = parseInt(quantity);
//     const subtotal = product.salesPrice * qty;
//     const tax = subtotal * 0.18;
//     const shipping = subtotal >= 1000 ? 0 : 79;
//     const total = subtotal + tax + shipping;

//     const itemsToOrder = [{
//       product: productId,
//       quantity: qty,
//       price: product.salesPrice,
//       totalPrice: subtotal
//     }];

//     const stockOk = await atomicDeductStock(itemsToOrder);
//     if (!stockOk) {
//       return res.json({ success: false, message: 'Stock changed. Try again.' });
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.json({ success: false, message: 'User not found' });
//     }

//     // SAFELY GET ADDRESS
//     let address;
//     if (addressId) {
//       address = user.addresses.find(a => a._id.toString() === addressId);
//     }
//     if (!address && user.addresses.length > 0) {
//       address = user.addresses.find(a => a.isDefault) || user.addresses[0];
//     }
//     if (!address) {
//       return res.json({ success: false, message: 'No delivery address found. Please add one.' });
//     }

//     const order = await Order.create({
//             orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`, // <-- ADD THIS

//       user: userId,
//       orderedItems: [{
//         product: productId,
//         name: product.productName,
//         quantity: qty,
//         price: product.salesPrice,
//         totalPrice: subtotal,
//         productSnapshot: { image: product.productImage[0] }
//       }],
//       totalPrice: total,
//       finalAmount: total,
//       subtotal,
//       tax,
//       shipping,
//       discount: 0,
//       paymentMethod: paymentMethod === 'cod' ? 'COD' : 'RAZORPAY',
//       paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
//       status: 'pending',
//      address: {
//         fullName: (address.fullName || address.name || `${(user.firstName||'').trim()} ${(user.lastName||'').trim()}`).trim() || 'Customer',
//         phone: address.phone || address.mobile || user.phone || '',
//         altPhone: address.altPhone || address.mobile2 || '',
//         street: address.street || address.house || address.address || '',
//         landmark: address.landmark || address.addressLine2 || '',
//         locality: address.locality || address.area || '',
//         city: address.city || '',
//         state: address.state || '',
//         pincode: address.pincode || address.postalCode || address.zip || '',
//         country: address.country || 'India'
//      },
//       createdOn: new Date()
//     });

//     res.redirect(`/order-success/${order._id}`);
//   } catch (err) {
//     console.error('Direct place order error:', err);
//     res.json({ success: false, message: 'Failed to place order' });
//   }
// };

//-----------
// ...existing code...

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, paymentMethod } = req.body;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: 'Cart is empty' });
    }

    const itemsToOrder = cart.items
      .filter(i => i.productId && i.productId.quantity >= i.quantity)
      .map(i => ({
        product: i.productId._id,
        quantity: i.quantity,
        price: i.price,
        totalPrice: i.totalPrice
      }));

    if (itemsToOrder.length === 0) {
      return res.json({ success: false, message: 'Out of stock' });
    }

    const subtotal = itemsToOrder.reduce((s, i) => s + i.totalPrice, 0);
    const tax = subtotal * 0.18;
    const shipping = subtotal >= 1000 ? 0 : 79;
    const total = subtotal + tax + shipping;

    const stockOk = await atomicDeductStock(itemsToOrder);
    if (!stockOk) {
      return res.json({ success: false, message: 'Stock changed. Try again.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    // Get address
    let selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress && user.addresses.length > 0) {
      selectedAddress = user.addresses.find(a => a.isDefault) || user.addresses[0];
    }
    if (!selectedAddress) {
      return res.json({ success: false, message: 'Please add a delivery address' });
    }

    // BUILD ADDRESS OBJECT WITH PROPER FALLBACKS
    const orderAddress = {
      fullName: (selectedAddress.fullName || selectedAddress.name || 
                  `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim() || 
                  user.name || 'Customer').replace(/undefined/g, '').trim() || 'Customer',
      phone: selectedAddress.phone || selectedAddress.mobile || user.phone || '',
      altPhone: selectedAddress.altPhone || selectedAddress.mobile2 || '',
      street: selectedAddress.street || selectedAddress.house || selectedAddress.address || selectedAddress.addressLine1 || 'Not provided',
      landmark: selectedAddress.landmark || selectedAddress.addressLine2 || '',
      locality: selectedAddress.locality || selectedAddress.area || '',
      city: selectedAddress.city || selectedAddress.town || 'Not Available',
      state: selectedAddress.state || selectedAddress.stateName || 'Not Available',
      pincode: selectedAddress.pincode || selectedAddress.postalCode || selectedAddress.zip || selectedAddress.pin || 'PIN Missing',
      country: selectedAddress.country || 'India'
    };

    const order = await Order.create({
      orderId: `ORD${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`,
      user: userId,
      orderedItems: itemsToOrder.map(i => ({
        product: i.product,
        name: cart.items.find(c => c.productId._id.toString() === i.product.toString()).productId.productName,
        quantity: i.quantity,
        price: i.price,
        totalPrice: i.totalPrice,
        productSnapshot: { image: cart.items.find(c => c.productId._id.toString() === i.product.toString()).productId.productImage[0] },
        status: 'Placed'
      })),
      totalPrice: total,
      finalAmount: total,
      subtotal,
      tax,
      shipping,
      discount: 0,
      paymentMethod: paymentMethod === 'cod' ? 'COD' : 'RAZORPAY',
      paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
      status: 'pending',
      address: orderAddress,
      createdOn: new Date()
    });

    await Cart.deleteOne({ userId });
    res.json({ success: true, redirectUrl: `/order-success/${order._id}` });

  } catch (err) {
    console.error('Place Order Error:', err);
    res.json({ success: false, message: 'Order failed. Try again.' });
  }
};

const directPlaceOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, quantity = 1, addressId, paymentMethod } = req.body;

    const product = await Product.findById(productId);
    if (!product || product.quantity < quantity) {
      return res.json({ success: false, message: 'Out of stock' });
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
      return res.json({ success: false, message: 'Stock changed. Try again.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    // Get address
    let selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress && user.addresses.length > 0) {
      selectedAddress = user.addresses.find(a => a.isDefault) || user.addresses[0];
    }
    if (!selectedAddress) {
      return res.json({ success: false, message: 'Please add a delivery address' });
    }

    // BUILD ADDRESS OBJECT WITH PROPER FALLBACKS
    const orderAddress = {
      fullName: (selectedAddress.fullName || selectedAddress.name || 
                  `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim() || 
                  user.name || 'Customer').replace(/undefined/g, '').trim() || 'Customer',
      phone: selectedAddress.phone || selectedAddress.mobile || user.phone || '',
      altPhone: selectedAddress.altPhone || selectedAddress.mobile2 || '',
      street: selectedAddress.street || selectedAddress.house || selectedAddress.address || selectedAddress.addressLine1 || 'Not provided',
      landmark: selectedAddress.landmark || selectedAddress.addressLine2 || '',
      locality: selectedAddress.locality || selectedAddress.area || '',
      city: selectedAddress.city || selectedAddress.town || 'Not Available',
      state: selectedAddress.state || selectedAddress.stateName || 'Not Available',
      pincode: selectedAddress.pincode || selectedAddress.postalCode || selectedAddress.zip || selectedAddress.pin || 'PIN Missing',
      country: selectedAddress.country || 'India'
    };

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
        status: 'Placed'
      }],
      totalPrice: total,
      finalAmount: total,
      subtotal,
      tax,
      shipping,
      discount: 0,
      paymentMethod: paymentMethod === 'cod' ? 'COD' : 'RAZORPAY',
      paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
      status: 'pending',
      address: orderAddress,
      createdOn: new Date()
    });

    res.json({ success: true, redirectUrl: `/order-success/${order._id}` });
  } catch (err) {
    console.error('Direct place order error:', err);
    res.json({ success: false, message: 'Failed to place order' });
  }
};

// ...existing code...

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
    const defaultAddress = user.addresses?.find(a => a.isDefault) || user.addresses?.[0] || null;

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
      directProductId: productId
    });

  } catch (err) {
    console.error('Direct checkout error:', err);
    req.flash('error', 'Failed to load checkout');
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


module.exports = { 
    loadCheckout,
     placeOrder,
      orderSuccess,
        directCheckout,
          directPlaceOrder,
          atomicDeductStock
     };












