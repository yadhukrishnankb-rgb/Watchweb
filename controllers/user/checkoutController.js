// controllers/user/checkoutController.js
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');

const Order = require('../../models/orderSchema'); // added

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
            defaultAddress
        });

    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).render('error', { message: 'Failed to load checkout' });
    }
};

//--------------
// const placeOrder = async (req, res) => {
//     try {
//         const userId = req.session.user._id;
//         const { addressId, paymentMethod } = req.body;

//         const user = await User.findById(userId).lean();
//         if (!user) return res.json({ success: false, message: 'User not found' });

//         const cart = await Cart.findOne({ userId }).populate('items.productId');
//         if (!cart || !cart.items.length) return res.json({ success: false, message: 'Cart is empty' });

//         const validItems = cart.items.filter(item => {
//             const p = item.productId;
//             return p && !p.isBlocked && p.quantity >= item.quantity;
//         });

//         if (validItems.length === 0) {
//             return res.json({ success: false, message: 'No valid items in cart' });
//         }

//         let address = user.addresses.find(a => a._id.toString() === addressId);
//         if (!address) {
//             address = user.addresses.find(a => a.isDefault) || user.addresses[0];
//         }
//         if (!address) return res.json({ success: false, message: 'No delivery address' });

//         const subtotal = validItems.reduce((s, it) => {
//             const price = Number(it.price ?? it.productId?.price ?? 0);
//             const totalPrice = Number(it.totalPrice ?? price * it.quantity);
//             return s + totalPrice;
//         }, 0);

//         const tax = subtotal * 0.18;
//         const shipping = subtotal >= 1000 ? 0 : 79;
//         const total = subtotal + tax + shipping;

//         if (paymentMethod === 'cod' && total > 2000) {
//             return res.json({ success: false, message: 'COD not available above ₹2000' });
//         }

//         const orderItems = validItems.map(it => ({
//             product: it.productId._id,
//             name: it.productId.productName,
//             quantity: it.quantity,
//             price: Number(it.price ?? it.productId.price),
//             totalPrice: Number(it.totalPrice ?? (it.price * it.quantity)),
//             productSnapshot: {
//                 image: it.productId.productImage?.[0] || '/images/default-product.jpg'
//             }
//         }));

//         const order = await Order.create({
//             user: userId,
//             orderedItems: orderItems,
//             totalPrice: total,
//             discount: 0,
//             finalAmount: total,
//             address: {
//                 fullName: address.fullName,
//                 phone: address.phone,
//                 street: address.street,
//                 city: address.city,
//                 state: address.state,
//                 pincode: address.pincode
//             },
//             paymentMethod: (paymentMethod || 'COD').toUpperCase(),
//             paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
//             shipping,
//             subtotal,
//             tax,
//             status: 'pending',  // Valid enum value
//             createdOn: new Date()
//         });

//         await Cart.deleteOne({ userId });

//         res.json({ success: true, orderId: order._id });
//     } catch (err) {
//         console.error('Place Order Error:', err);
//         res.json({ success: false, message: 'Failed to place order' });
//     }
// };


//-----------------
// ...existing code...
const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, paymentMethod } = req.body;

        const user = await User.findById(userId).lean();
        if (!user) return res.json({ success: false, message: 'User not found' });

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) return res.json({ success: false, message: 'Cart is empty' });

        const validItems = cart.items.filter(item => {
            const p = item.productId;
            return p && !p.isBlocked && p.quantity >= item.quantity;
        });

        if (validItems.length === 0) {
            return res.json({ success: false, message: 'No valid items in cart' });
        }

        let address = user.addresses.find(a => a._id.toString() === addressId);
        if (!address) {
            address = user.addresses.find(a => a.isDefault) || user.addresses[0];
        }
        if (!address) return res.json({ success: false, message: 'No delivery address' });

        const subtotal = validItems.reduce((s, it) => {
            const price = Number(it.price ?? it.productId?.price ?? 0);
            const totalPrice = Number(it.totalPrice ?? price * it.quantity);
            return s + totalPrice;
        }, 0);

        const tax = subtotal * 0.18;
        const shipping = subtotal >= 1000 ? 0 : 79;
        const total = subtotal + tax + shipping;

        if (paymentMethod === 'cod' && total > 2000) {
            return res.json({ success: false, message: 'COD not available above ₹2000' });
        }

        const orderItems = validItems.map(it => ({
            product: it.productId._id,
            name: it.productId.productName,
            quantity: it.quantity,
            price: Number(it.price ?? it.productId.price),
            totalPrice: Number(it.totalPrice ?? (it.price * it.quantity)),
            productSnapshot: {
                image: it.productId.productImage?.[0] || '/images/default-product.jpg'
            }
        }));

        const order = await Order.create({
            user: userId,
            orderedItems: orderItems,
            totalPrice: total,
            discount: 0,
            finalAmount: total,
            address: {
                fullName: address.fullName,
                phone: address.phone,
                street: address.street,
                city: address.city,
                state: address.state,
                pincode: address.pincode
            },
            paymentMethod: (paymentMethod || 'COD').toUpperCase(),
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
            shipping,
            subtotal,
            tax,
            status: 'pending',  // Valid enum value
            createdOn: new Date()
        });

        await Cart.deleteOne({ userId });

        // res.json({ success: true, orderId: order._id });
                res.redirect(`/order-success/${order._id}`);

    } catch (err) {
        console.error('Place Order Error:', err);
        res.json({ success: false, message: 'Failed to place order' });
    }
};
// ...existing code...

//---------
// ...existing code...
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

module.exports = { 
    loadCheckout,
     placeOrder,
      orderSuccess };












