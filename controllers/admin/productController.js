const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');



exports.getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        // Remove isBlocked: false from the query to show all products
        const query = {
            ...(searchQuery && {
                $or: [
                    { productName: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ]
            })
        };

        const [products, totalProducts] = await Promise.all([
            Product.find(query)
                .populate('category', 'name')
                .sort({ createdAt: -1,_id:-1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Product.countDocuments(query)
        ]);

        // Add status indicator to products
        const processedProducts = products.map(product => ({
            ...product,
            category: product.category || { name: 'Uncategorized' },
            statusClass: product.isBlocked ? 'text-red-600' : 'text-green-600',
            statusText: product.isBlocked ? 'Blocked' : 'Active'
        }));

        const categories = await Category.find({ isListed: true }).lean();

        res.render('admin/products', {
            products: processedProducts,
            categories,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / limit),
            searchQuery
        });
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.PRODUCTS_LOAD_ERROR });
    }
};




// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }

    const product = await Product.findById(id).populate('category');
        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }

    res.json({
      success: true,
      product
    });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.PRODUCT_FETCH_ERROR
        });
    }
};


exports.addProduct = async (req, res) => {
    try {
        const {
            productName,
            description,
            brand,
            category,
            regularPrice,
            salesPrice,
            productOffer,
            quantity,
            color,
            status
        } = req.body;

        // Validate required fields
        if (!productName || !description || !brand || !category || !regularPrice || !salesPrice || !color) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.PRODUCT_REQUIRED_FIELDS
            });
        }

        // Check images
        if (!req.files || req.files.length < 3) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.PRODUCT_IMAGES_REQUIRED
            });
        }

        // Get Cloudinary URLs from uploaded files
        const productImages = req.files.map(file => file.path);

        const product = new Product({
            productName,
            description,
            brand,
            category,
            regularPrice: parseFloat(regularPrice),
            salesPrice: parseFloat(salesPrice),
            productOffer: parseInt(productOffer) || 0,
            quantity: parseInt(quantity) || 0,
            color,
            productImage: productImages,
            status: status || 'Available'
        });

        await product.save();

        res.status(statusCodes.CREATED).json({
            success: true,
            message: messages.PRODUCT_ADD_SUCCESS
        });
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: err.message || messages.PRODUCT_ADD_ERROR
        });
    }
};


exports.editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }
            
        const oldProduct = await Product.findById(id);
        if (!oldProduct) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }
            // Normalize removedImages from the form (may be string, array or JSON string)
            let removed = [];
            if (req.body.removedImages) {
                if (Array.isArray(req.body.removedImages)) removed = req.body.removedImages;
                else if (typeof req.body.removedImages === 'string') {
                    try {
                        removed = JSON.parse(req.body.removedImages);
                    } catch (e) {
                        removed = [req.body.removedImages];
                    }
                }
            }

            // Build update data from allowed fields
            const updateData = {};
            const allowed = ['productName','description','brand','category','regularPrice','salesPrice','productOffer','quantity','color','status'];
            for (const key of allowed) {
                if (req.body[key] !== undefined) {
                    if (['regularPrice','salesPrice'].includes(key)) updateData[key] = parseFloat(req.body[key]) || 0;
                    else if (['productOffer','quantity'].includes(key)) updateData[key] = parseInt(req.body[key]) || 0;
                    else updateData[key] = req.body[key];
                }
            }

            const existingImages = Array.isArray(oldProduct.productImage) ? oldProduct.productImage.slice() : [];

            // Compute remaining images after removal
            const removedSet = new Set(removed);
            const remainingImages = existingImages.filter(img => !removedSet.has(img));

            // Delete removed images from Cloudinary (only those explicitly removed)
            for (const img of existingImages) {
                if (removedSet.has(img)) {
                    try {
                        const publicId = img.split('/').pop().split('.')[0];
                        await cloudinary.uploader.destroy(publicId);
                    } catch (e) {
                        console.warn('Failed to delete image from cloudinary:', img, e.message || e);
                    }
                }
            }
        
            // Handle newly uploaded images (these are appended to remaining images)
            const newImagePaths = req.files?.length > 0 ? req.files.map(f => f.path) : [];
            const finalImages = [...remainingImages, ...newImagePaths];

            // If there are any productImage changes, validate minimum count
            if (finalImages.length < 3) {
                return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PRODUCT_MIN_IMAGES });
            }

            updateData.productImage = finalImages;

            const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

            res.status(statusCodes.OK).json({ success: true, message: messages.PRODUCT_UPDATE_SUCCESS });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: err.message || messages.PRODUCT_UPDATE_ERROR
        });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }

        // Delete images from Cloudinary
        for (let imageUrl of product.productImage) {
            const publicId = imageUrl.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(publicId);
        }
    
        await Product.findByIdAndDelete(id);
    
        res.status(statusCodes.OK).json({
            success: true,
            message: messages.PRODUCT_DELETE_SUCCESS
        });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.PRODUCT_DELETE_ERROR
        });
    }
};





exports.blockProduct = async (req, res) => {
  try {
    const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.INVALID_PRODUCT_ID });
    }
        const product = await Product.findByIdAndUpdate(id, { isBlocked: true, status: 'Blocked' }, { new: true });
        if (!product) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.PRODUCT_NOT_FOUND });

    // respond with JSON (API)
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(statusCodes.OK).json({ success: true, message: messages.PRODUCT_BLOCK_SUCCESS, product });
    }
    // fallback: redirect back when called from a normal form
    return res.redirect(req.get('referer') || '/admin/products');
  } catch (err) {
    console.error('Error blocking product:', err);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.PRODUCT_BLOCK_ERROR });
    }
        return res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.PRODUCT_BLOCK_ERROR });
  }
};



exports.unblockProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }

        const product = await Product.findByIdAndUpdate(
            id,
            { 
                isBlocked: false,
                status: 'Available'
            },
            { new: true }
        );

        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }

        res.status(statusCodes.OK).json({
            success: true,
            message: messages.PRODUCT_UNBLOCK_SUCCESS
        });
    } catch (err) {
        console.error('Error unblocking product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.PRODUCT_UNBLOCK_ERROR
        });
    }
};

