
const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');

// Show user's wishlist
exports.viewWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    let wishlist = await Wishlist.findOne({ userId }).populate('products.productId');
    if (!wishlist) wishlist = { products: [] };
    res.render('user/wishlist', { wishlist });
  } catch (err) {
    console.error('View wishlist error:', err);
    res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.WISHLIST_LOAD_ERROR });
  }
};

// Add product to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user || !user._id) return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.AUTH_REQUIRED });
    const userId = user._id;
    const { productId } = req.body;
    if (!productId) return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PRODUCT_ID_REQUIRED });

    const product = await Product.findById(productId);
    if (!product || product.isBlocked) return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PRODUCT_UNAVAILABLE });

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    const exists = wishlist.products.some(p => (p.productId && p.productId.toString()) === productId.toString());
    if (exists) return res.json({ success: false, alreadyInWishlist: true, message: messages.WISHLIST_ALREADY });

    wishlist.products.push({ productId });
    await wishlist.save();
    // return updated wishlist count for header update
    const freshWishlist = await Wishlist.findOne({ userId }).select('products').lean();
    const wishlistCount = (freshWishlist && Array.isArray(freshWishlist.products)) ? freshWishlist.products.length : 0;
    res.json({ success: true, message: messages.WISHLIST_ADDED, wishlistCount });
  } catch (err) {
    console.error('Add to wishlist error:', err);
    res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.WISHLIST_ADD_ERROR });
  }
};

// Remove product from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user || !user._id) return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.AUTH_REQUIRED });
    const userId = user._id;
    const { productId } = req.body;
    if (!productId) return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PRODUCT_ID_REQUIRED });

    const result = await Wishlist.updateOne({ userId }, { $pull: { products: { productId } } });
    if (result.modifiedCount === 0) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ITEM_NOT_IN_WISHLIST });
    // return updated wishlist count for header
    const freshWishlist = await Wishlist.findOne({ userId }).select('products').lean();
    const wishlistCount = (freshWishlist && Array.isArray(freshWishlist.products)) ? freshWishlist.products.length : 0;
    res.json({ success: true, message: messages.WISHLIST_REMOVED, wishlistCount });
  } catch (err) {
    console.error('Remove from wishlist error:', err);
    res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.WISHLIST_REMOVE_ERROR });
  }
};


