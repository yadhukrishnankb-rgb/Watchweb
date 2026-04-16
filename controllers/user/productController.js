
const mongoose = require('mongoose')
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Review = require('../../models/reviewSchema');
const Discount = require('../../models/discountSchema');
const Wishlist = require('../../models/wishlistSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
 const { getOfferDetails } = require('../../helpers/priceUtils');


exports.listProducts = async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        // Build query
        let query = { isBlocked: false };
        let sortQuery = {};

        // Search
        if (req.query.search) {
            query.$or = [
                { productName: { $regex: req.query.search, $options: 'i' } },
                { brand: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        

        // Category Filter
        if (req.query.category) {
            query.category = req.query.category;
        }

        // Price Range Filter
        if (req.query.minPrice || req.query.maxPrice) {
            query.salesPrice = {};
            if (req.query.minPrice) query.salesPrice.$gte = parseFloat(req.query.minPrice);
            if (req.query.maxPrice) query.salesPrice.$lte = parseFloat(req.query.maxPrice);
        }

        // Brand filter and blocked-brand exclusion
        const blockedBrands = await Brand.find({ isBlocked: true }).distinct('name');
        if (req.query.brand) {
            const selectedBrand = req.query.brand;
            if (blockedBrands.some(b => b.toLowerCase() === selectedBrand.toLowerCase())) {
                query.brand = '__BRAND_BLOCKED__';
            } else {
                query.brand = selectedBrand;
            }
        } else if (blockedBrands.length > 0) {
            query.brand = { $nin: blockedBrands };
        }

        // Sorting
        switch (req.query.sort) {
            case 'price-asc':
                sortQuery = { salesPrice: 1 };
                break;
            case 'price-desc':
                sortQuery = { salesPrice: -1 };
                break;
            case 'name-asc':
                sortQuery = { productName: 1 };
                break;
            case 'name-desc':
                sortQuery = { productName: -1 };
                break;
            case 'newest':
                sortQuery = { createdAt: -1 };
                break;
            case 'popularity':
                sortQuery = { salesCount: -1 };
                break;
            case 'rating':
                sortQuery = { averageRating: -1 };
                break;
            default:
                sortQuery = { createdAt: -1 };
        }

        // Execute query with pagination
        const now = new Date();
        let products = await Product.find(query)
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .sort(sortQuery)
            .skip(skip)
            .limit(limit)
            .lean();

        // compute offer fields - apply MAXIMUM discount from product or category
        products = products.map(p => {
            const offerDetails = getOfferDetails(p);
            return { ...p, ...offerDetails };
        });

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Get all categories and brands for filters
        const categories = await Category.find({ isListed: true }).lean();
        const visibleBrands = await Product.distinct('brand', { isBlocked: false, brand: { $nin: blockedBrands } });

        // Get price range for filter
        const priceRange = await Product.aggregate([
            { $match: { isBlocked: false, brand: { $nin: blockedBrands } } },
            {
                $group: {
                    _id: null,
                    minPrice: { $min: '$salesPrice' },
                    maxPrice: { $max: '$salesPrice' }
                }
            }
        ]);

        res.render('user/shop', {
            products,
            categories,
            brands: visibleBrands,
            currentPage: page,
            totalPages,
            query: req.query,
            priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
            user: req.session.user
        });
        
    } catch (error) {
        console.error('Product listing error:', error);
        res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.PRODUCTS_LOAD_ERROR });
    }
};


exports.getProductDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/shop');
        }

        // Get product with populated category
        const now = new Date();
        let product = await Product.findById(id)
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .lean();

        // compute offer including category fallback - apply MAXIMUM discount
        let offerDetails = getOfferDetails(product);
        product = {
            ...product,
            ...offerDetails
        };
        
        // Check if product exists and is available
        if (!product) {
            return res.redirect('/shop');
        }

        const blockedBrands = await Brand.find({ isBlocked: true }).distinct('name');
        const normalizedProductBrand = product.brand ? product.brand.toLowerCase() : '';
        if (blockedBrands.some(b => b.toLowerCase() === normalizedProductBrand) || product.isBlocked) {
            return res.redirect('/shop');
        }

       

        // Get related products from same category
        let relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: product._id },
            isBlocked: false,
            brand: { $nin: blockedBrands }
        })
        .populate({ path: 'offer' })
        .populate({
            path: 'category',
            populate: { path: 'offer' }
        })
        .limit(4)
        .lean();
        relatedProducts = relatedProducts.map(p => {
            const offerDetails = getOfferDetails(p);
            return { ...p, ...offerDetails };
        });

        // Get product reviews
        const reviews = await Review.find({ product: id })
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .lean();

            
        // Calculate average rating
        const averageRating = reviews.length > 0 
            ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length 
            : 0;

        // Check stock status
        const stockStatus = getStockStatus(product);

        // Get applicable discounts/coupons
        const discounts = await Discount.find({
            validFrom: { $lte: new Date() },
            validUntil: { $gte: new Date() },
            applicableProducts: id,
            isActive: true
        }).lean() || [];

            // Check if current user has this product in wishlist (for rendering wishlist button state)
            let isInWishlist = false;
            try {
                if (req.session && req.session.user && req.session.user._id) {
                    const wl = await Wishlist.findOne({ userId: req.session.user._id }).select('products').lean();
                    if (wl && Array.isArray(wl.products)) {
                        isInWishlist = wl.products.some(p => (p.productId && p.productId.toString()) === id.toString());
                    }
                }
            } catch (e) { /* ignore wishlist errors */ }

        // Generate breadcrumbs
        const breadcrumbs = [
            { name: 'Home', url: '/' },
            { name: 'Shop', url: '/shop' },
            { name: product.category.name, url: `/shop?category=${product.category._id}` },
            { name: product.productName, url: null }
        ];


        res.render('user/productDetails', {
            product,
            relatedProducts,
            reviews,
            averageRating,
            stockStatus,
            discounts, // Pass discounts to the view
            breadcrumbs,
            user: req.session.user,
            reviewMessage: req.query.review || null,
            isInWishlist,
            // Add additional data for better error handling
            isAvailable: ['IN_STOCK', 'LOW_STOCK'].includes(stockStatus),
            stockMessage: getStockMessage(stockStatus, product.quantity)
        });

    } catch (error) {
        console.error('Product details error:', error);
        return res.redirect('/shop');
    }
};


exports.addReview = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');

        const { id } = req.params;
        const { rating, comment } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/shop');
        }

        if (!rating || !comment || !comment.trim() || !['1','2','3','4','5'].includes(String(rating))) {
            return res.redirect(`/product/${id}?review=error`);
        }

        const product = await Product.findById(id).lean();
        if (!product) {
            return res.redirect('/shop');
        }

        const existingReview = await Review.findOne({ product: id, user: req.session.user._id });
        if (existingReview) {
            existingReview.rating = Number(rating);
            existingReview.comment = comment.trim();
            await existingReview.save();
            return res.redirect(`/product/${id}?review=updated`);
        }

        await Review.create({
            product: id,
            user: req.session.user._id,
            rating: Number(rating),
            comment: comment.trim()
        });

        res.redirect(`/product/${id}?review=success`);
    } catch (error) {
        console.error('Add review error:', error);
        res.redirect(`/product/${req.params.id}?review=error`);
    }
};


// Helper function for stock status
function getStockStatus(product) {
    if (product.isBlocked) return 'UNAVAILABLE';
    if (product.status === 'Out of Stock') return 'OUT_OF_STOCK';
    if (product.quantity <= 0) return 'SOLD_OUT';
    if (product.quantity <= 5) return 'LOW_STOCK';
    return 'IN_STOCK';
}

// Helper function for stock messages
function getStockMessage(status, quantity) {
    switch(status) {
        case 'IN_STOCK':
            return `In Stock (${quantity} available)`;
        case 'LOW_STOCK':
            return `Only ${quantity} left in stock!`;
        case 'SOLD_OUT':
            return 'Sold Out';
        case 'OUT_OF_STOCK':
            return 'Out of Stock';
        case 'UNAVAILABLE':
            return 'Currently Unavailable';
        default:
            return 'Status Unknown';
    }
}


exports.searchProducts = async (req, res) => {
    try {
        const searchQuery = req.query.q?.trim();
        
        // If no search query, redirect to home
        if (!searchQuery) {
            return res.redirect('/');
        }

        // Build search query
        const searchRegex = new RegExp(searchQuery, 'i');
        const query = {
            isBlocked: false,
            $or: [
                { productName: searchRegex },
                { brand: searchRegex },
                { description: searchRegex }
            ]
        };

        // Execute search with pagination
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;

        const now = new Date();
        let products = await Product.find(query)
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // compute offer fields as done in listProducts - apply MAXIMUM discount
        products = products.map(p => {
            const offerDetails = getOfferDetails(p);
            return { ...p, ...offerDetails };
        });

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Get categories for sidebar
        const categories = await Category.find({ isListed: true }).lean();

        res.render('user/search-results', {
            products,
            searchQuery,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            user: req.session.user
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(statusCodes.INTERNAL_ERROR).render('error', { 
            message: messages.PRODUCT_SEARCH_ERROR,
            user: req.session.user
        });
    }
};