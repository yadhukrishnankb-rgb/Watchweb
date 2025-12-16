const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');

// Show user's wishlist
exports.viewWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    let wishlist = await Wishlist.findOne({ userId }).populate('products.productId');
    if (!wishlist) wishlist = { products: [] };
    res.render('user/wishlist', { wishlist });
  } catch (err) {
    console.error('View wishlist error:', err);
    res.status(500).render('error', { message: 'Unable to load wishlist' });
  }
};

// Add product to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user || !user._id) return res.status(401).json({ success: false, message: 'Authentication required' });
    const userId = user._id;
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId required' });

    const product = await Product.findById(productId);
    if (!product || product.isBlocked) return res.status(400).json({ success: false, message: 'Product unavailable' });

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    const exists = wishlist.products.some(p => (p.productId && p.productId.toString()) === productId.toString());
    if (exists) return res.json({ success: false, alreadyInWishlist: true, message: 'Already in wishlist' });

    wishlist.products.push({ productId });
    await wishlist.save();
    res.json({ success: true, message: 'Added to wishlist' });
  } catch (err) {
    console.error('Add to wishlist error:', err);
    res.status(500).json({ success: false, message: 'Error adding to wishlist' });
  }
};

// Remove product from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user || !user._id) return res.status(401).json({ success: false, message: 'Authentication required' });
    const userId = user._id;
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId required' });

    const result = await Wishlist.updateOne({ userId }, { $pull: { products: { productId } } });
    if (result.modifiedCount === 0) return res.status(404).json({ success: false, message: 'Item not found in wishlist' });
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    console.error('Remove from wishlist error:', err);
    res.status(500).json({ success: false, message: 'Error removing from wishlist' });
  }
};


