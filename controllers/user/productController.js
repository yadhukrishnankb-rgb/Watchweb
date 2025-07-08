const mongoose = require('mongoose')
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Review = require('../../models/reviewSchema');
const Discount = require('../../models/discountSchema');


exports.listProducts = async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
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

        // Brand Filter
        if (req.query.brand) {
            query.brand = req.query.brand;
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
        const products = await Product.find(query)
            .populate('category')
            .sort(sortQuery)
            .skip(skip)
            .limit(limit)
            .lean();

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Get all categories and brands for filters
        const categories = await Category.find({ isListed: true }).lean();
        const brands = await Product.distinct('brand', { isBlocked: false });

        // Get price range for filter
        const priceRange = await Product.aggregate([
            { $match: { isBlocked: false } },
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
            brands,
            currentPage: page,
            totalPages,
            query: req.query,
            priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
            user: req.session.user
        });

    } catch (error) {
        console.error('Product listing error:', error);
        res.status(500).render('error', { message: 'Error loading products' });
    }
};




//=======================================================================

// exports.getProductDetails = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Get product with populated category
//         const product = await Product.findById(id)
//             .populate('category')
//             .lean();

//         // Check if product exists and is available
//         if (!product || product.isBlocked) {
//             return res.redirect('/shop');
//         }

//         // Get related products from same category
//         const relatedProducts = await Product.find({
//             category: product.category._id,
//             _id: { $ne: product._id },
//             isBlocked: false
//         })
//         .limit(4)
//         .lean();

//         // Get product reviews
//         const reviews = await Review.find({ product: id })
//             .populate('user', 'name')
//             .sort({ createdAt: -1 })
//             .lean();

//         // Calculate average rating
//         const averageRating = reviews.length > 0 
//             ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length 
//             : 0;

//         // Check stock status
//         const stockStatus = getStockStatus(product);

//         // Get applicable discounts/coupons
//         const discounts = await Discount.find({
//             validFrom: { $lte: new Date() },
//             validUntil: { $gte: new Date() },
//             applicableProducts: id
//         }).lean();

//         res.render('user/productDetails', {
//             product,
//             relatedProducts,
//             reviews,
//             averageRating,
//             stockStatus,
//             discounts,
//             breadcrumbs: [
//                 { name: 'Home', url: '/' },
//                 { name: 'Shop', url: '/shop' },
//                 { name: product.category.name, url: `/shop?category=${product.category._id}` },
//                 { name: product.productName, url: null }
//             ],
//             user: req.session.user
//         });

//     } catch (error) {
//         console.error('Product details error:', error);
//         res.redirect('/shop');
//     }
// };

// // Helper function for stock status
// function getStockStatus(product) {
//     if (product.isBlocked) return 'UNAVAILABLE';
//     if (product.status === 'Out of Stock') return 'OUT_OF_STOCK';
//     if (product.quantity <= 0) return 'SOLD_OUT';
//     if (product.quantity <= 5) return 'LOW_STOCK';
//     return 'IN_STOCK';
// }



exports.getProductDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/shop');
        }

        // Get product with populated category
        const product = await Product.findById(id)
            .populate('category')
            .lean();

        // Check if product exists and is available
        if (!product || product.isBlocked) {
            return res.redirect('/shop');
        }

        // Get related products from same category
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: product._id },
            isBlocked: false
        })
        .limit(4)
        .lean();

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
            // Add additional data for better error handling
            isAvailable: ['IN_STOCK', 'LOW_STOCK'].includes(stockStatus),
            stockMessage: getStockMessage(stockStatus, product.quantity)
        });

    } catch (error) {
        console.error('Product details error:', error);
        return res.redirect('/shop');
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
