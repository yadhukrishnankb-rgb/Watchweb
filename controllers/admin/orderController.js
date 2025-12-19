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



// // PATCH /admin/orders/:id/status
// exports.updateOrderStatus = async (req, res) => {
//   try {
//     const { status } = req.body;
//     const orderId = req.params.id;

//     const order = await Order.findById(orderId);
//     if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

//     const current = order.status.toLowerCase();
//     const next = status.toLowerCase();

//     // Define valid transitions
//     const validTransitions = {
//       pending: ['processing', 'cancelled'],
//       processing: ['shipped', 'cancelled'],
//       shipped: ['delivered'],
//       delivered: ['return request', 'returned'],
//       'cancellation request': ['cancelled', 'pending'],     // after user requests
//       'return request': ['returned', 'delivered'],         // after user requests
//       cancelled: [],                                        // terminal
//       returned: [],                                         // terminal
//     };

//     const allowed = validTransitions[current] || [];
    
//     if (!allowed.includes(next)) {
//       return res.status(400).json({
//         success: false,
//         message: `Cannot change status from "${order.status}" to "${status}"`
//       });
//     }

//     // Special case: only allow 'Return Request' → 'Returned' if user requested it
//     if (next === 'returned' && current !== 'return request' && current !== 'delivered') {
//       return res.status(400).json({
//         success: false,
//         message: 'Can only mark as Returned after Return Request or Delivered'
//       });
//     }

//     // Update status
//     order.status = status;
//     await order.save();

//     res.json({ success: true, message: 'Status updated successfully', status: order.status });

//   } catch (err) {
//     console.error('Status update error:', err);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };


// PATCH /admin/orders/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const currentStatus = order.status.trim(); // e.g., "Pending"
    const newStatus = status.trim();

    // === STRICT TRANSITION RULES (EXACTLY AS YOU SPECIFIED) ===
    const validTransitions = {
      'Pending': ['Processing', 'Cancelled'],
      'Processing': ['Shipped', 'Cancelled'],
      'Shipped': ['Out for Delivery'],
      'Out for Delivery': ['Delivered'],
      'Delivered': ['Return Request'],
      'Cancelled': [],
      'Returned': []
      // 'Return Request' → only admin can approve to 'Returned'
    };

    // Normalize for comparison (case-insensitive + trim)
    const currentKey = Object.keys(validTransitions).find(
      key => key.toLowerCase() === currentStatus.toLowerCase()
    );

    if (!currentKey) {
      return res.status(400).json({
        success: false,
        message: `Invalid current status: "${currentStatus}"`
      });
    }

    const allowedNext = validTransitions[currentKey];

    const isAllowed = allowedNext.some(
      s => s.toLowerCase() === newStatus.toLowerCase()
    );

    if (!isAllowed) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition: "${currentStatus}" → "${newStatus}" is not allowed.`
      });
    }

    // Special Rule: Only allow 'Return Request' → 'Returned' via admin approval
    if (newStatus === 'Returned' && currentStatus !== 'Return Request') {
      return res.status(400).json({
        success: false,
        message: 'Can only mark as Returned after a Return Request is made.'
      });
    }

    // All checks passed → update status
    order.status = newStatus;
    await order.save();

    return res.json({
      success: true,
      message: 'Status updated successfully',
      status: order.status
    });

  } catch (err) {
    console.error('Status update error:', err);
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

    // Find orders that have RETURN requests only. Cancellations are handled immediately
    const combinedQuery = {
      $or: [
        { 'orderedItems.status': { $regex: 'return request', $options: 'i' } },
        { status: { $regex: 'return request', $options: 'i' } }
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
        if (requestType === 'return') return /return request/i.test(item.status || '');
        return /return request/i.test(item.status || '');
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


exports.approveRequest = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let item = null;
    if (itemId && itemId !== 'ORDER') {
      item = order.orderedItems.id(itemId);
      if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (!item) {
      // === FULL ORDER LEVEL REQUEST ===
      const isCancel = order.status === 'Cancellation Request';
      const isReturn = order.status === 'Return Request';

      if (action === 'approve') {
        // Restore stock only
        for (const it of order.orderedItems) {
          if (it.product) {
            await Product.updateOne({ _id: it.product }, { $inc: { quantity: it.quantity } });
          }
        }
        order.status = isCancel ? 'cancelled' : (isReturn ? 'Returned' : order.status);
        order.approvedAt = new Date();

        // DO NOT TOUCH finalAmount or subtotal → keep original amount
        await order.save();
        return res.json({ success: true, message: 'Full order request approved', newStatus: order.status });
      } else {
        // Reject → revert status
        order.status = order.paymentStatus === 'Paid' ? 'Delivered' : 'Placed';
        order.requestedAt = null;
        await order.save();
        return res.json({ success: true, message: 'Request rejected', newStatus: order.status });
      }
    }

    // === ITEM-LEVEL REQUEST ===
    const itemType = item.status;

    if (action === 'approve') {
      // Restore stock
      if (item.product) {
        await Product.updateOne({ _id: item.product }, { $inc: { quantity: item.quantity } });
      }

      if (itemType === 'Cancellation Request') item.status = 'Cancelled';
      else if (itemType === 'Return Request') item.status = 'Returned';

      item.approvedAt = new Date();

      // DO NOT reduce finalAmount or subtotal → keep original
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

    return res.json({
      success: true,
      message: `Item request ${action}ed`,
      itemId,
      newStatus: item.status
    });

  } catch (err) {
    console.error('approveRequest error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};