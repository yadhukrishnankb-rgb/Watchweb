
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

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchPattern(searchTerm) {
    const text = escapeRegex(searchTerm.trim());
    if (!text) return text;
    return text.split('').map(char => char === ' ' ? '[\\W_]*' : char).join('[\\W_]*');
}

exports.listProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        let query = { isBlocked: false };
        let sortQuery = {};

        if (req.query.search) {
            const searchPattern = buildSearchPattern(req.query.search);
            query.$or = [
                { productName: { $regex: searchPattern, $options: 'i' } },
                { brand: { $regex: searchPattern, $options: 'i' } },
                { description: { $regex: searchPattern, $options: 'i' } }
            ];
        }

        if (req.query.category) {
            query.category = req.query.category;
        }

        if (req.query.minPrice || req.query.maxPrice) {
            query.salesPrice = {};
            if (req.query.minPrice) query.salesPrice.$gte = parseFloat(req.query.minPrice);
            if (req.query.maxPrice) query.salesPrice.$lte = parseFloat(req.query.maxPrice);
        }

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

        let sortByEffectivePrice = false;
        switch (req.query.sort) {
            case 'price-asc':
                sortByEffectivePrice = true;
                break;
            case 'price-desc':
                sortByEffectivePrice = true;
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

        let products;
        let totalProducts;

        if (sortByEffectivePrice) {
            products = await Product.find(query)
                .populate({
                    path: 'category',
                    populate: { path: 'offer' }
                })
                .populate({ path: 'offer' })
                .lean();

            products = products.map(p => {
                const offerDetails = getOfferDetails(p);
                return { ...p, ...offerDetails };
            });

            products.sort((a, b) => {
                const diff = a.effectivePrice - b.effectivePrice;
                return req.query.sort === 'price-asc' ? diff : -diff;
            });

            totalProducts = products.length;
            products = products.slice(skip, skip + limit);
        } else {
            products = await Product.find(query)
                .populate({
                    path: 'category',
                    populate: { path: 'offer' }
                })
                .populate({ path: 'offer' })
                .sort(sortQuery)
                .skip(skip)
                .limit(limit)
                .lean();

            products = products.map(p => {
                const offerDetails = getOfferDetails(p);
                return { ...p, ...offerDetails };
            });

            totalProducts = await Product.countDocuments(query);
        }

        const productIds = products.map(p => p._id);
        const ratingsData = await Review.aggregate([
            { $match: { product: { $in: productIds } } },
            {
                $group: {
                    _id: '$product',
                    averageRating: { $avg: '$rating' },
                    numReviews: { $sum: 1 }
                }
            }
        ]);

        const ratingsMap = new Map();
        ratingsData.forEach(rating => {
            ratingsMap.set(rating._id.toString(), {
                averageRating: Math.round(rating.averageRating * 10) / 10, 
                numReviews: rating.numReviews
            });
        });

        products = products.map(product => ({
            ...product,
            averageRating: ratingsMap.get(product._id.toString())?.averageRating || 0,
            numReviews: ratingsMap.get(product._id.toString())?.numReviews || 0
        }));

        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find({ isListed: true }).lean();
        const visibleBrands = await Product.distinct('brand', { isBlocked: false, brand: { $nin: blockedBrands } });

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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/shop');
        }

        const now = new Date();
        let product = await Product.findById(id)
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .lean();

        let offerDetails = getOfferDetails(product);
        product = {
            ...product,
            ...offerDetails
        };
        
        if (!product) {
            return res.redirect('/shop');
        }

        const blockedBrands = await Brand.find({ isBlocked: true }).distinct('name');
        const normalizedProductBrand = product.brand ? product.brand.toLowerCase() : '';
        if (blockedBrands.some(b => b.toLowerCase() === normalizedProductBrand) || product.isBlocked) {
            return res.redirect('/shop');
        }

       

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

        const reviews = await Review.find({ product: id })
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .lean();

            
        const averageRating = reviews.length > 0 
            ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length 
            : 0;

        const stockStatus = getStockStatus(product);

        const discounts = await Discount.find({
            validFrom: { $lte: new Date() },
            validUntil: { $gte: new Date() },
            applicableProducts: id,
            isActive: true
        }).lean() || [];

            let isInWishlist = false;
            try {
                if (req.session && req.session.user && req.session.user._id) {
                    const wl = await Wishlist.findOne({ userId: req.session.user._id }).select('products').lean();
                    if (wl && Array.isArray(wl.products)) {
                        isInWishlist = wl.products.some(p => (p.productId && p.productId.toString()) === id.toString());
                    }
                }
            } catch (e) { }

        
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
            discounts, 
            breadcrumbs,
            user: req.session.user,
            reviewMessage: req.query.review || null,
            isInWishlist,
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


function getStockStatus(product) {
    if (product.isBlocked) return 'UNAVAILABLE';
    if (product.status === 'Out of Stock' || product.quantity <= 0) return 'OUT_OF_STOCK';
    if (product.quantity <= 5) return 'LOW_STOCK';
    return 'IN_STOCK';
}

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
        
        if (!searchQuery) {
            return res.redirect('/');
        }

        const searchRegex = new RegExp(searchQuery, 'i');
        const query = {
            isBlocked: false,
            $or: [
                { productName: searchRegex },
                { brand: searchRegex },
                { description: searchRegex }
            ]
        };

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

        products = products.map(p => {
            const offerDetails = getOfferDetails(p);
            return { ...p, ...offerDetails };
        });

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

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