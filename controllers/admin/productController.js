const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');




exports.getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        const query = {
            isBlocked: false,
            ...(searchQuery && {
                $or: [
                    { productName: { $regex: searchQuery, $options: 'i' } },
                    { discription: { $regex: searchQuery, $options: 'i' } }
                ]
            })
        };

        // Add proper population and error handling
        const [products, totalProducts] = await Promise.all([
            Product.find(query)
                .populate('category', 'name')  // Only populate the name field
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),  // Convert to plain objects
            Product.countDocuments(query)
        ]);

        // Add category name fallback
        const processedProducts = products.map(product => ({
            ...product,
            category: product.category || { name: 'Uncategorized' }
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

// Add new product
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

    // Validate numeric fields
    if (isNaN(regularPrice) || isNaN(salesPrice) || isNaN(quantity) || (productOffer && isNaN(productOffer))) {
      return res.status(400).json({
        success: false,
        message: 'Price, quantity, and offer must be valid numbers'
      });
    }

    // Validate category
    if (!mongoose.isValidObjectId(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Category does not exist'
      });
    }

    // Check images
    if (!req.processedImages || req.processedImages.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least 3 images'
      });
    }

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
      productImage: req.processedImages,
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





// Edit product
exports.editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

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

    // Validate numeric fields
    if (isNaN(regularPrice) || isNaN(salesPrice) || isNaN(quantity) || (productOffer && isNaN(productOffer))) {
      return res.status(400).json({
        success: false,
        message: 'Price, quantity, and offer must be valid numbers'
      });
    }

    // Validate category
    if (!mongoose.isValidObjectId(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Category does not exist'
      });
    }

    const updateData = {
      productName,
      description,
      brand,
      category,
      regularPrice: parseFloat(regularPrice),
      salesPrice: parseFloat(salesPrice),
      productOffer: parseInt(productOffer) || 0,
      quantity: parseInt(quantity) || 0,
      color,
      status: status || 'Available'
    };

    const oldProduct = await Product.findById(id);
    if (!oldProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle images
    if (req.processedImages?.length > 0) {
      // Delete old images
      for (let imagePath of oldProduct.productImage) {
        await fs.unlink(path.join(process.cwd(), 'public', imagePath)).catch(err => console.error('Error deleting old image:', err));
      }
      updateData.productImage = req.processedImages;
    } else {
      updateData.productImage = oldProduct.productImage;
    }

    // Validate total images
    if (updateData.productImage.length < 3) {
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

// Delete product (soft delete)
exports.deleteProduct = async (req, res) => {
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
      { isBlocked: true },
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