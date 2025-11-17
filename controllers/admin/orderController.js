// controllers/admin/orderController.js
const Order = require('../../models/orderSchema');  
const Product = require('../../models/productSchema')
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema'); 
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


// ...existing code...
exports.getRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const requestType = req.query.type || ''; // 'cancel' or 'return'

    // Find orders that either have item-level requests OR the whole order is a request
    const combinedQuery = {
      $or: [
        { 'orderedItems.status': 'Cancellation Request' },
        { 'orderedItems.status': 'Return Request' },
        { status: 'Cancellation Request' },
        { status: 'Return Request' }
      ]
    };

    let orders = await Order.find(combinedQuery)
      .populate('user', 'name email')
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // If filtering by type, keep only matching items/orders
    orders = orders.map(order => {
      const filteredItems = order.orderedItems.filter(item => {
        if (requestType === 'cancel') return item.status === 'Cancellation Request';
        if (requestType === 'return') return item.status === 'Return Request';
        return item.status === 'Cancellation Request' || item.status === 'Return Request';
      });

      // keep order-level requests (no matching items) by leaving filteredItems empty but mark order
      return { ...order, orderedItems: filteredItems };
    })
    .filter(order => {
      if (requestType === 'cancel') {
        return order.orderedItems.length > 0 || order.status === 'Cancellation Request';
      }
      if (requestType === 'return') {
        return order.orderedItems.length > 0 || order.status === 'Return Request';
      }
      return order.orderedItems.length > 0 || order.status === 'Cancellation Request' || order.status === 'Return Request';
    });

    const total = await Order.countDocuments(combinedQuery);

    res.render('admin/request-list', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      requestType,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('admin/error', { message: 'Error loading requests' });
  }
};
// ...existing code...
/// ...existing code...
exports.approveRequest = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // If itemId === 'ORDER' or item not found => handle order-level request
    let item = null;
    if (itemId && itemId !== 'ORDER') {
      item = order.orderedItems.id(itemId);
      if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (!item) {
      // Order-level request
      const isCancel = order.status === 'Cancellation Request';
      const isReturn = order.status === 'Return Request';

      if (action === 'approve') {
        // restore stock for all items
        for (const it of order.orderedItems) {
          if (it.product) {
            await Product.updateOne({ _id: it.product }, { $inc: { quantity: it.quantity } });
          }
        }
        order.status = isCancel ? 'cancelled' : (isReturn ? 'Returned' : order.status);
        order.approvedAt = new Date();

        // adjust totals: set to 0 or subtract all items
        const totalToRemove = order.orderedItems.reduce((sum, it) => sum + ((it.totalPrice) || (it.price * it.quantity) || 0), 0);
        order.subtotal = Math.max(0, (order.subtotal || 0) - totalToRemove);
        order.finalAmount = Math.max(0, (order.finalAmount || 0) - totalToRemove);

        await order.save();
        return res.json({ success: true, message: 'Order request approved', newStatus: order.status });
      } else {
        // reject -> revert to previous status (simple approach: 'Placed' or 'Delivered' fallback)
        order.status = (order.paymentStatus === 'Paid') ? 'Delivered' : 'Placed';
        order.requestedAt = null;
        await order.save();
        return res.json({ success: true, message: 'Order request rejected', newStatus: order.status });
      }
    }

    // existing item-level handling (unchanged)
    const itemType = item.status; // 'Cancellation Request' or 'Return Request'

    if (action === 'approve') {
      if (item.product) {
        await Product.updateOne({ _id: item.product }, { $inc: { quantity: item.quantity } });
      }
      if (itemType === 'Cancellation Request') item.status = 'Cancelled';
      else if (itemType === 'Return Request') item.status = 'Returned';
      item.approvedAt = new Date();

      const priceToRemove = item.totalPrice || (item.price * item.quantity) || 0;
      order.subtotal = Math.max(0, (order.subtotal || 0) - priceToRemove);
      order.finalAmount = Math.max(0, (order.finalAmount || 0) - priceToRemove);
    } else if (action === 'reject') {
      if (itemType === 'Cancellation Request') {
        item.status = 'Placed';
        item.cancelReason = null;
      } else if (itemType === 'Return Request') {
        item.status = 'Delivered';
        item.returnReason = null;
      }
      item.requestedAt = null;
    }

    await order.save();

    return res.json({ success: true, message: `Request ${action}ed successfully`, itemId, newStatus: item ? item.status : order.status });
  } catch (err) {
    console.error('approveRequest error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};