const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');

const MAX_QUANTITY_PER_ITEM = 10;

// View Cart
exports.viewCart = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart) {
            return res.render('user/cart', { cart: { items: [] }, total: 0 });
        }

        // Filter out unavailable products
        cart.items = cart.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.quantity > 0;
        });

        const total = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        res.render('user/cart', { cart, total });
    } catch (error) {
        console.error('View cart error:', error);
        res.status(500).render('error', { message: 'Error loading cart' });
    }
};


exports.addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;

        // ---- Guard: must be authenticated ----
        const user = req.session && req.session.user;
        if (!user || !user._id) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const userId = user._id;

        // Validate productId
        if (!productId) return res.status(400).json({ success: false, message: 'productId required' });

        // Validate product
        const product = await Product.findById(productId);
        if (!product || product.isBlocked || product.quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Product is unavailable' });
        }

        // Use findOneAndUpdate with upsert to avoid duplicate insert race conditions.
        // Ensure both 'userId' and legacy 'user' are set on insert (handles existing DB index on 'user').
        let cart = await Cart.findOneAndUpdate(
            { userId },
            { $setOnInsert: { userId, user: userId, items: [] } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).populate('items.productId');

        // Safety: if upsert didn't return a doc, fetch/create
        if (!cart) {
            cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart) cart = new Cart({ userId, user: userId, items: [] });
        }

        // Find existing item
        const existingItem = cart.items.find(item => item.productId.toString() === productId.toString());

        if (existingItem) {
            const newQuantity = existingItem.quantity + parseInt(quantity, 10);
            if (newQuantity > MAX_QUANTITY_PER_ITEM) {
                return res.status(400).json({ success: false, message: `Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product` });
            }
            if (newQuantity > product.quantity) {
                return res.status(400).json({ success: false, message: 'Not enough stock available' });
            }
            existingItem.quantity = newQuantity;
            existingItem.totalPrice = product.salesPrice * newQuantity;
        } else {
            // Push new item
            cart.items.push({
                productId,
                quantity: parseInt(quantity, 10),
                price: product.salesPrice,
                totalPrice: product.salesPrice * parseInt(quantity, 10)
            });
        }

        // Remove from wishlist if exists (ignore errors)
        try {
            await Wishlist.updateOne({ userId }, { $pull: { products: productId } });
        } catch (e) { /* ignore */ }

        await cart.save();
        return res.json({ success: true, message: 'Added to cart successfully' });
    } catch (error) {
        console.error('Add to cart error:', error);

        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Cart concurrency error, please try again' });
        }

        return res.status(500).json({ success: false, message: 'Error adding to cart' });
    }
};
// ...existing code...





// Update quantity
exports.updateQuantity = async (req, res) => {
    try {
        const { productId, action } = req.body;
        const userId = req.session.user._id;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        let newQuantity = cartItem.quantity;
        if (action === 'increase') {
            if (newQuantity >= MAX_QUANTITY_PER_ITEM || newQuantity >= product.quantity) {
                return res.status(400).json({ success: false, message: 'Cannot increase quantity' });
            }
            newQuantity++;
        } else if (action === 'decrease') {
            if (newQuantity <= 1) {
                return res.status(400).json({ success: false, message: 'Minimum quantity is 1' });
            }
            newQuantity--;
        }

        cartItem.quantity = newQuantity;
        cartItem.totalPrice = product.salesPrice * newQuantity;
        await cart.save();

        res.json({ success: true, quantity: newQuantity, totalPrice: cartItem.totalPrice });
    } catch (error) {
        console.error('Update quantity error:', error);
        res.status(500).json({ success: false, message: 'Error updating quantity' });
    }
};

// Remove from cart
exports.removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.session.user._id;

        const result = await Cart.updateOne(
            { userId },
            { $pull: { items: { productId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        res.json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ success: false, message: 'Error removing item' });
    }
};