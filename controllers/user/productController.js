// const Product = require('../../models/productSchema');
// const Category = require('../../models/categorySchema');

// exports.listProducts = async (req, res) => {
//     try {
//         const page = parseInt(req.query.page) || 1;
//         const limit = 12; // Products per page
//         const skip = (page - 1) * limit;

//         // Get filter parameters
//         const { search, sort, category, minPrice, maxPrice, brand } = req.query;

//         // Base query - only show unblocked products
//         let query = { isBlocked: false };

//         // Search functionality
//         if (search) {
//             query.$or = [
//                 { productName: { $regex: search, $options: 'i' } },
//                 { brand: { $regex: search, $options: 'i' } }
//             ];
//         }

//         // Category filter
//         if (category) {
//             query.category = category;
//         }

//         // Price range filter
//         if (minPrice || maxPrice) {
//             query.salesPrice = {};
//             if (minPrice) query.salesPrice.$gte = parseFloat(minPrice);
//             if (maxPrice) query.salesPrice.$lte = parseFloat(maxPrice);
//         }

//         // Brand filter
//         if (brand) {
//             query.brand = brand;
//         }

//         // Sort options
//         let sortOption = {};
//         switch (sort) {
//             case 'price-asc':
//                 sortOption = { salesPrice: 1 };
//                 break;
//             case 'price-desc':
//                 sortOption = { salesPrice: -1 };
//                 break;
//             case 'name-asc':
//                 sortOption = { productName: 1 };
//                 break;
//             case 'name-desc':
//                 sortOption = { productName: -1 };
//                 break;
//             case 'newest':
//                 sortOption = { createdAt: -1 };
//                 break;
//             default:
//                 sortOption = { createdAt: -1 };
//         }

//         // Execute queries
//         const products = await Product.find(query)
//             .populate('category')
//             .sort(sortOption)
//             .skip(skip)
//             .limit(limit)
//             .lean();

//         const totalProducts = await Product.countDocuments(query);
//         const categories = await Category.find({ isListed: true }).lean();
        
//         // Get price range for filter
//         const priceRange = await Product.aggregate([
//             { $match: { isBlocked: false } },
//             {
//                 $group: {
//                     _id: null,
//                     minPrice: { $min: '$salesPrice' },
//                     maxPrice: { $max: '$salesPrice' }
//                 }
//             }
//         ]);

//         // Get unique brands
//         const brands = await Product.distinct('brand', { isBlocked: false });

//         res.render('user/products', {
//             products,
//             categories,
//             brands,
//             priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
//             currentPage: page,
//             totalPages: Math.ceil(totalProducts / limit),
//             query: req.query // Pass query params back to view
//         });

//     } catch (error) {
//         console.error('Error in product listing:', error);
//         res.status(500).render('error', { message: 'Error loading products' });
//     }
// };