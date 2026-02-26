// controllers/admin/orderController.js
const Order = require('../../models/orderSchema');  
const Product = require('../../models/productSchema')
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema'); 
const mongoose = require('mongoose');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const { addToWallet } = require('../user/walletController');

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
        .populate('user', 'name email')
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);
  
    const statusOptions = [
      { value: '', label: 'All' },
      { value: 'Pending', label: 'Pending' },
      { value: 'Processing', label: 'Processing' },
      { value: 'Shipped', label: 'Shipped' },
      { value: 'Out for Delivery', label: 'Out for Delivery' },
      { value: 'Delivered', label: 'Delivered' },
      { value: 'Cancelled', label: 'Cancelled' },
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
    res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.ORDERS_LOAD_ERROR });
  }
};

// GET /admin/orders/:id
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('orderedItems.product', 'productName productImage')
      .populate('user', 'name email phone')
      .lean();
    
    if (!order) return res.status(statusCodes.NOT_FOUND).render('admin/error', { message: messages.ORDER_NOT_FOUND });

    res.render('admin/orderDetails', { order });
  } catch (err) {
    console.error(err);
    res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.ORDER_DETAILS_LOAD_ERROR });
  }
};






// PATCH /admin/orders/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    if (!status) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.STATUS_REQUIRED });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ORDER_NOT_FOUND });
    }

    const currentStatus = order.status.trim(); // e.g., "Pending"
    const newStatus = status.trim();

    // Normalize requested status to a schema-allowed enum value (case-insensitive)
    const statusEnum = Order.schema.path('status').enumValues || [];
    const normalizeStatus = (s) => {
      if (!s) return s;
      const found = statusEnum.find(ev => ev.toString().toLowerCase() === s.toString().toLowerCase());
      return found || s;
    };
    const newStatusNormalized = normalizeStatus(newStatus);

    // === STRICT TRANSITION RULES (EXACTLY AS YOU SPECIFIED) ===
    const validTransitions = {
      'Pending': ['Processing', 'Cancelled'],
      'Processing': ['Shipped', 'Cancelled'],
      'Shipped': ['Out for Delivery'],
      'Out for Delivery': ['Delivered'],
      'Delivered': ['Return Request'],
      'Cancelled': [],
      'Returned': [],
      'Cancellation Request': ['Cancelled'],
      'Return Request': ['Returned']
      // 'Return Request' → only admin can approve to 'Returned'
    };

    // Normalize for comparison (case-insensitive + trim)
    const currentKey = Object.keys(validTransitions).find(
      key => key.toLowerCase() === currentStatus.toLowerCase()
    );

    if (!currentKey) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: `${messages.INVALID_CURRENT_STATUS}: "${currentStatus}"`
      });
    }

    const allowedNext = validTransitions[currentKey];

    const isAllowed = allowedNext.some(
      s => s.toLowerCase() === newStatusNormalized.toLowerCase()
    );

    if (!isAllowed) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: `${messages.INVALID_TRANSITION}: "${currentStatus}" → "${newStatus}" is not allowed.`
      });
    }

    // Special Rule: Only allow 'Return Request' → 'Returned' via admin approval
    if (newStatusNormalized === 'Returned' && currentStatus !== 'Return Request') {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: messages.RETURN_ONLY_AFTER_REQUEST
      });
    }

    // All checks passed → update order status
    order.status = newStatusNormalized;

    // === SYNC ITEM STATUSES ===
    // Update all items that don't have a cancellation/return request
    // Items with pending cancel/return requests keep their status
    order.orderedItems.forEach(item => {
      // Skip items that have explicit cancel/return requests - they handle their own status
      if (item.status === 'Cancellation Request' || item.status === 'Return Request') {
        return; // Don't override pending requests
      }

      // Skip already cancelled or returned items
      if (item.status === 'Cancelled' || item.status === 'Returned') {
        return; // Keep their final status
      }

      // Sync normal items with order status
      item.status = newStatusNormalized;
    });

    await order.save();

    return res.status(statusCodes.OK).json({
      success: true,
      message: messages.STATUS_UPDATE_SUCCESS,
      status: order.status
    });

  } catch (err) {
    console.error('Status update error:', err);
    res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.SERVER_ERROR });
  }
};


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
    res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.REQUESTS_LOAD_ERROR });
  }
};

// PATCH /admin/orders/:id/approve-request (or whatever your route is)
exports.approveRequest = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    const order = await Order.findById(orderId);
    if (!order) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ORDER_NOT_FOUND });

    let item = null;
    if (itemId && itemId !== 'ORDER') {
      item = order.orderedItems.id(itemId);
      if (!item) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ITEM_NOT_FOUND });
    }

    if (!item) {
      // === FULL ORDER LEVEL REQUEST ===
      const isCancel = order.status === 'Cancellation Request';
      const isReturn = order.status === 'Return Request';

      if (action === 'approve') {
        // Restore stock for all items
        for (const it of order.orderedItems) {
          if (it.product) {
            await Product.updateOne({ _id: it.product }, { $inc: { quantity: it.quantity } });
          }
        }

        // Compute and persist refunds per item and aggregate order.refunded
        const subtotal = Number(order.subtotal || 0);
        const totalTax = Number(order.tax || 0);
        const totalDiscount = Number(order.discount || 0);
        let totalRefund = 0;

        for (const it of order.orderedItems) {
          const itemSubtotal = Number(it.totalPrice ?? (it.price * it.quantity) ?? 0);
          const taxShare = subtotal > 0 ? (itemSubtotal / subtotal) * totalTax : 0;
          const discountShare = subtotal > 0 ? (itemSubtotal / subtotal) * totalDiscount : 0;
          const refundForItem = Math.round((itemSubtotal + taxShare - discountShare + Number.EPSILON) * 100) / 100;
          it.refundAmount = refundForItem;
          totalRefund += refundForItem;
        }

        order.refunded = Math.round(((Number(order.refunded || 0) + totalRefund) + Number.EPSILON) * 100) / 100;

        // === WALLET REFUND ONLY FOR RETURNS (not cancellations) ===
        if (isReturn && totalRefund > 0) {
          await addToWallet(order.user, totalRefund, 'credit', 'Full Order Return Refund', order._id);
        }

        order.status = isCancel ? 'Cancelled' : (isReturn ? 'Returned' : order.status);
        order.approvedAt = new Date();

        await order.save();
        return res.status(statusCodes.OK).json({ 
          success: true, 
          message: messages.FULL_ORDER_REQUEST_APPROVED, 
          newStatus: order.status 
        });
      } else {
        // Reject → revert status
        order.status = order.paymentStatus === 'Paid' ? 'Delivered' : 'Pending';
        order.requestedAt = null;
        await order.save();
        return res.status(statusCodes.OK).json({ 
          success: true, 
          message: messages.REQUEST_REJECTED, 
          newStatus: order.status 
        });
      }
    }

    // === ITEM-LEVEL REQUEST ===
    const itemType = item.status;

    if (action === 'approve') {
      // Restore stock
      if (item.product) {
        await Product.updateOne({ _id: item.product }, { $inc: { quantity: item.quantity } });
      }

      if (itemType === 'Cancellation Request') {
        item.status = 'Cancelled';
      } else if (itemType === 'Return Request') {
        item.status = 'Returned';
      }

      item.approvedAt = new Date();

      // Calculate and persist refund for this item
      const subtotal = Number(order.subtotal || 0);
      const totalTax = Number(order.tax || 0);
      const totalDiscount = Number(order.discount || 0);
      const itemSubtotal = Number(item.totalPrice ?? (item.price * item.quantity) ?? 0);
      const taxShare = subtotal > 0 ? (itemSubtotal / subtotal) * totalTax : 0;
      const discountShare = subtotal > 0 ? (itemSubtotal / subtotal) * totalDiscount : 0;
      const refundForItem = Math.round((itemSubtotal + taxShare - discountShare + Number.EPSILON) * 100) / 100;

      item.refundAmount = refundForItem;
      order.refunded = Math.round(((Number(order.refunded || 0) + refundForItem) + Number.EPSILON) * 100) / 100;

      // === WALLET REFUND ONLY FOR RETURNS (not cancellations) ===
      if (itemType === 'Return Request' && refundForItem > 0) {
        await addToWallet(order.user, refundForItem, 'credit', 'Item Return Refund', order._id);
      }
    } else if (action === 'reject') {
      if (itemType === 'Cancellation Request') {
        item.status = 'Pending';
        item.cancelReason = null;
      } else if (itemType === 'Return Request') {
        item.status = 'Delivered';
        item.returnReason = null;
      }
      item.requestedAt = null;
    }

    // Check if all items are now returned/cancelled
    const allReturned = order.orderedItems.every(it => it.status === 'Returned');
    const allCancelled = order.orderedItems.every(it => it.status === 'Cancelled');
    
    if (allReturned) {
      order.status = 'Returned';
    } else if (allCancelled) {
      order.status = 'Cancelled';
    }

    await order.save();

    const itemMessage = action === 'approve' ? messages.ITEM_REQUEST_APPROVED : messages.ITEM_REQUEST_REJECTED;
    return res.status(statusCodes.OK).json({
      success: true,
      message: itemMessage,
      itemId,
      newStatus: item ? item.status : order.status
    });

  } catch (err) {
    console.error('approveRequest error:', err);
    return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.SERVER_ERROR });
  }
};