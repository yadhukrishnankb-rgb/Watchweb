// controllers/admin/orderController.js
const Order = require('../../models/orderSchema');  // ← Fixed path
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema'); // if you have it
const mongoose = require('mongoose');

// GET /admin/orders
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';

    let query = {};
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'user.name': { $regex: search, $options: 'i' } }
      ];
    }
    if (statusFilter) query.status = statusFilter;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('address', 'name email phone')
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    const statusOptions = [
      { value: '', label: 'All' },
      { value: 'pending', label: 'Pending' },
      { value: 'Processing', label: 'Processing' },
      { value: 'Shipped', label: 'Shipped' },
      { value: 'Delivered', label: 'Delivered' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'Return Request', label: 'Return Request' },
      { value: 'Returned', label: 'Returned' }
    ];

    res.render('admin/orders', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      search, statusFilter,
      statusOptions,
      hasSearch: !!search || !!statusFilter,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('admin/error', { message: 'Error loading orders' });
  }
};

// GET /admin/orders/:id
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('orderedItems.product', 'productName productImage')
      .populate('address', 'name email phone street city state pincode')
      .lean();

    if (!order) return res.status(404).render('admin/error', { message: 'Order not found' });

    res.render('admin/orderDetails', { order });
  } catch (err) {
    console.error(err);
    res.status(500).render('admin/error', { message: 'Error loading order' });
  }
};

// PATCH /admin/orders/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'Processing', 'Shipped', 'Delivered', 'cancelled', 'Return Request', 'Returned'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, message: 'Status updated', status: order.status });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};