// helpers/pendingOrderCleanup.js
const Order = require('../models/orderSchema');
const Product = require('../models/productSchema');

/**
 * Auto-cancel pending orders that have exceeded pendingCancelTime
 * Called periodically to clean up expired pending orders
 */
const autoCancelExpiredPendingOrders = async () => {
  try {
    const now = new Date();
    
    // Find all Pending orders where pendingCancelTime has passed
    const expiredOrders = await Order.find({
      status: 'Pending',
      pendingCancelTime: { $lt: now }
    });

    console.log(`[Cleanup] Found ${expiredOrders.length} expired pending orders to cancel`);

    for (const order of expiredOrders) {
      try {
        // Restore stock for all items
        for (const item of order.orderedItems) {
          if (item.product) {
            await Product.updateOne(
              { _id: item.product },
              { $inc: { quantity: item.quantity } }
            );
          }
          // Mark item as cancelled
          item.status = 'Cancelled';
          item.cancelReason = 'Auto-cancelled: Order pending for 24 hours without confirmation';
          item.requestedAt = new Date();
          item.approvedAt = new Date();
        }

        // Cancel the entire order
        order.status = 'Cancelled';
        order.cancelReason = 'Auto-cancelled: Order pending for 24 hours without confirmation';
        order.approvedAt = new Date();

        await order.save();
        console.log(`[Cleanup] Auto-cancelled order ${order.orderId}`);
      } catch (err) {
        console.error(`[Cleanup] Error cancelling order ${order._id}:`, err);
      }
    }

    return { cancelled: expiredOrders.length };
  } catch (err) {
    console.error('[Cleanup] Error in autoCancelExpiredPendingOrders:', err);
    return { cancelled: 0, error: err.message };
  }
};

module.exports = {
  autoCancelExpiredPendingOrders
};
