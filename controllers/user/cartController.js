
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');

const MAX_QUANTITY_PER_ITEM = 10;

// --- pricing helper -------------------------------------------------------
// returns the price the customer should pay after applying any product-level
// offer.  The offer value is a percentage and is applied to the current
// salesPrice. Rounds to two decimals.
function getEffectivePrice(product) {
    if (!product) return 0;
    const base = typeof product.salesPrice === 'number' ? product.salesPrice : (product.price || 0);
    if (product.productOffer && product.productOffer > 0) {
        return Math.round(base * (1 - product.productOffer / 100) * 100) / 100;
    }
    return base;
}


// View Cart
exports.viewCart = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.render('user/cart', { cart: { items: [] }, total: 0, user: req.session.user });
        }
    
        // DO NOT filter out out-of-stock or blocked items anymore
        // We want to show them as disabled instead of removing

        const total = cart.items.reduce((sum, item) => {
            // Only add to total if product is in stock and not blocked
            if (item.productId && !item.productId.isBlocked && item.productId.quantity >= item.quantity) {
                return sum + item.totalPrice;
            }
            return sum;
        }, 0);

     

        res.render('user/cart', { cart, total, user: req.session.user });
    } catch (error) {
        console.error('View cart error:', error);
        res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.CART_LOAD_ERROR, user: req.session.user });
    }
};


exports.addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;

        
        // ---- Guard: must be authenticated ----
        const user = req.session && req.session.user;
        if (!user || !user._id) {
            return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.AUTH_REQUIRED });
        }
        const userId = user._id;

        // Validate productId
        if (!productId) return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PRODUCT_ID_REQUIRED });

        // Validate product
        const product = await Product.findById(productId);
        if (!product || product.isBlocked || product.quantity <= 0) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: "We apologize, but this product is currently unavailable." });
        }

         //  Check latest stock
    if (product.quantity < quantity) {
      return res.json({
        success: false,
        message: `Only ${product.quantity} items available`
      });
    }

        
     let qty = parseInt(quantity, 10);
         if(qty>MAX_QUANTITY_PER_ITEM) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CART_MAXIMUX_ITEMS
                    
            })
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

        // Normalize incoming productId to string for safe comparisons
        const incomingPid = productId ? productId.toString() : '';

        // Find existing item (handle populated productId objects and nulls)
        const existingItem = cart.items.find(item => {
            if (!item || !item.productId) return false;
            const itemPid = (item.productId._id ? item.productId._id : item.productId).toString();
            return itemPid === incomingPid;
        });                   

        if (existingItem) {
            // Prevent duplicate cart entries: inform caller that item already exists
            return res.status(statusCodes.OK).json({ success: false, alreadyInCart: true, message: messages.PRODUCT_ALREADY_IN_CART });
        } else {
            // Push new item; use discount if applicable
            const effectivePrice = getEffectivePrice(product);
            const qtyInt = parseInt(quantity, 10);
            cart.items.push({
                productId,
                quantity: qtyInt,
                price: effectivePrice,
                totalPrice: effectivePrice * qtyInt
            });
        }

        // Remove from wishlist if exists (ignore errors)
        try {
            // wishlist stores objects in `products` with shape { productId, addedOn }
            await Wishlist.updateOne({ userId }, { $pull: { products: { productId } } });
        } catch (e) { /* ignore */ }

        await cart.save();
        // return updated counts so client can update header badges without reload
        const freshCart = await Cart.findOne({ userId }).select('items').lean();
        const freshWishlist = await Wishlist.findOne({ userId }).select('products').lean();
        const cartCount = (freshCart && Array.isArray(freshCart.items)) ? freshCart.items.length : 0;
        const wishlistCount = (freshWishlist && Array.isArray(freshWishlist.products)) ? freshWishlist.products.length : 0;
        return res.json({ success: true, message: messages.ADDED_TO_CART_SUCCESS, cartCount, wishlistCount });
    } catch (error) {
        console.error('Add to cart error:', error);

        if (error && error.code === 11000) {
            return res.status(statusCodes.CONFLICT).json({ success: false, message: messages.CART_CONCURRENCY_ERROR });
        }

        return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.ADD_TO_CART_ERROR });
    }
};






// Update quantity
exports.updateQuantity = async (req, res) => {
    try {
        const { productId, action } = req.body;
        const userId = req.session.user._id;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.CART_NOT_FOUND });
        }

        // Locate cart item safely (handle populated product objects)
        const cartItem = cart.items.find(item => {
            if (!item || !item.productId) return false;
            const itemPid = (item.productId._id ? item.productId._id : item.productId).toString();
            return itemPid === (productId ? productId.toString() : '');
        });
        if (!cartItem) {
            return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.PRODUCT_NOT_IN_CART });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.PRODUCT_NOT_FOUND });
        }

        let newQuantity = cartItem.quantity;
        if (action === 'increase') {
            if (newQuantity >= MAX_QUANTITY_PER_ITEM || newQuantity >= product.quantity) {
                return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.CANNOT_INCREASE_QUANTITY });
            }
            newQuantity++;
        } else if (action === 'decrease') {
            if (newQuantity <= 1) {
                return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.MIN_QUANTITY_ERROR });
            }
            newQuantity--;
        }

        cartItem.quantity = newQuantity;
        const effectivePrice = getEffectivePrice(product);
        cartItem.price = effectivePrice;
        cartItem.totalPrice = effectivePrice * newQuantity;
        await cart.save();

        res.json({ success: true, quantity: newQuantity, totalPrice: cartItem.totalPrice });
    } catch (error) {
        console.error('Update quantity error:', error);
        res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.UPDATE_QUANTITY_ERROR });
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
            return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ITEM_NOT_IN_CART });
        }

        

        res.json({ success: true, message: messages.ITEM_REMOVED_FROM_CART });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.REMOVE_ITEM_ERROR });
    }
};