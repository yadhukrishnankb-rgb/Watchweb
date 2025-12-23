// controllers/admin/inventoryController.js
const Product = require('../../models/productSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');

exports.getInventory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const stockFilter = req.query.stock || ''; // 'low', 'out', 'all'

    let query = {};
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }
    if (stockFilter === 'low') {
      query.quantity = { $lte: 5, $gt: 0 };
    } else if (stockFilter === 'out') {
      query.quantity = 0;
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .select('productName quantity lowStockThreshold status productImage')
        .sort({ quantity: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query)
    ]);

    res.render('admin/inventory', {
      products,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      search,
      stockFilter,
      hasSearch: !!search || !!stockFilter
    });
  } catch (err) {
    console.error(err);
    res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.INVENTORY_LOAD_ERROR });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const qty = parseInt(quantity);

    if (isNaN(qty) || qty < 0) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.INVENTORY_INVALID_QUANTITY });
    }

    const product = await Product.findByIdAndUpdate(
      id,
      {
        quantity: qty,
        status: qty > 0 ? 'Available' : 'Out of Stock'
      },
      { new: true }
    ).select('quantity status');

    if (!product) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.PRODUCT_NOT_FOUND });
    }

    res.status(statusCodes.OK).json({ success: true, message: messages.INVENTORY_UPDATE_SUCCESS, quantity: product.quantity, status: product.status });
  } catch (err) {
    console.error('inventory update error:', err);
    res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.INVENTORY_UPDATE_FAILED });
  }
};