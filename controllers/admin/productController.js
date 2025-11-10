const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
// const fs = require('fs').promises;
// const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary');



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
        res.status(500).render('admin/error', { message: 'Error loading products' });
    }
};

//--------------------------------------------------------------------------------------------------------------


//-----------------------------------------------------------------------------------------------------------


// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findById(id).populate('category');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching product details'
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
            return res.status(400).json({
                success: false,
                message: 'Please fill all required fields'
            });
        }

        // Check images
        if (!req.files || req.files.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Please upload at least 3 images'
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

        res.status(201).json({
            success: true,
            message: 'Product added successfully'
        });
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Error adding product'
        });
    }
};

exports.editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const oldProduct = await Product.findById(id);
        if (!oldProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const updateData = { ...req.body };

        // Handle images
        if (req.files?.length > 0) {
            // Delete old images from Cloudinary
            for (let imageUrl of oldProduct.productImage) {
                const publicId = imageUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(publicId);
            }
            
            // Add new Cloudinary URLs
            updateData.productImage = req.files.map(file => file.path);
        }

        // Validate total images
        if (updateData.productImage && updateData.productImage.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Product must have at least 3 images'
            });
        }

        const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

        res.json({
            success: true,
            message: 'Product updated successfully'
        });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Error updating product'
        });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Delete images from Cloudinary
        for (let imageUrl of product.productImage) {
            const publicId = imageUrl.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(publicId);
        }

        await Product.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({
            success: false,
            message: 'Error deleting product'
        });
    }
};

// ... keep other existing functions ...

///------------------------------------


exports.blockProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }
    const product = await Product.findByIdAndUpdate(id, { isBlocked: true, status: 'Blocked' }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // respond with JSON (API)
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message: 'Product blocked successfully', product });
    }
    // fallback: redirect back when called from a normal form
    return res.redirect(req.get('referer') || '/admin/products');
  } catch (err) {
    console.error('Error blocking product:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, message: 'Error blocking product' });
    }
    return res.status(500).render('admin/error', { message: 'Error blocking product' });
  }
};
// ...apply same pattern for unblockProduct and deleteProduct...

//--------------------------------------------------------------------

exports.unblockProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
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
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product unblocked successfully'
        });
    } catch (err) {
        console.error('Error unblocking product:', err);
        res.status(500).json({
            success: false,
            message: 'Error unblocking product'
        });
    }
};

