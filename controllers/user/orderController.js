
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const { addToWallet } = require('./walletController');

const listOrders = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        
        let query = { user: userId };
        if (search) {
            query.orderId = { $regex: search, $options: 'i' };
        }

        const orders = await Order.find(query)
            .populate('orderedItems.product', 'productName price')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

            
                         
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('user/order-list', {
            orders,
            currentPage: page,
            totalPages,
            search,
            user: req.session.user
        });
    } catch (err) {
      console.error(err);
      res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.ORDERS_LOAD_ERROR });
    }
};




const orderDetails = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;
  
    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate('orderedItems.product', 'productName price productImage')
      .exec();


    if (!order) return res.status(statusCodes.NOT_FOUND).redirect('/orders');

    const plainOrder = order.toObject();

    // --- NEW: robust address normalization/fallbacks ---
    const raw = plainOrder.address || plainOrder.shippingAddress || {};
    const sessionUser = req.session.user || {};
    
    const fullName =
      raw.fullName ||
      raw.name ||
      raw.recipientName ||
      ((raw.firstName || raw.lastName) ? `${(raw.firstName||'').trim()} ${(raw.lastName||'').trim()}`.trim() : '') ||
      `${(sessionUser.firstName||'').trim()} ${(sessionUser.lastName||'').trim()}`.trim() ||
      sessionUser.name ||
      'Customer';

    const phone = raw.phone || raw.mobile || raw.phoneNumber || sessionUser.phone || '';

    const street =
      raw.street ||
      raw.addressLine1 ||
      raw.addressLine ||
      raw.line1 ||
      raw.house ||
      raw.address ||
      '';

    const landmark = raw.landmark || raw.addressLine2 || '';
    const locality = raw.locality || raw.area || raw.village || '';
    const city = raw.city || raw.town || raw.district || 'Not Available';
    const state = raw.state || raw.stateName || 'Not Available';
    const pincode = raw.pincode || raw.postalCode || raw.zip || raw.pin || 'PIN Missing';
    const country = raw.country || 'India';

    const normalizedAddress = {
      fullName,
      phone,
      street,
      landmark,
      locality,
      city,
      state,
      pincode,
      country
    };

    plainOrder.address = normalizedAddress;
    // keep shippingAddress consistent for invoice/export code
    plainOrder.shippingAddress = plainOrder.shippingAddress || normalizedAddress;
    // --- END normalization ---

    // Compute refunded and finalPaid server-side (prefer persisted values)
    (plainOrder.orderedItems || []).forEach(it => {
      if (it.refundAmount != null) it.refundAmount = Number(it.refundAmount);
    });

    // Reconstruct original subtotal from ordered items (use stored item totals when available)
    const originalSubtotalFromItems = (plainOrder.orderedItems || []).reduce((acc, it) => {
      const itemTotal = Number(it.totalPrice ?? (it.price * it.quantity) ?? 0);
      return acc + itemTotal;
    }, 0);

    // Preserve original order-level amounts for display (do not rely on mutable order.subtotal)
    const originalTax = Number(plainOrder.tax || 0);
    const originalShipping = Number(plainOrder.shipping || 0);
    const originalAmount = Math.round(((originalSubtotalFromItems + originalTax + originalShipping) + Number.EPSILON) * 100) / 100;
    // attach for view usage
    plainOrder.originalAmount = originalAmount;
    plainOrder.originalSubtotal = Math.round((originalSubtotalFromItems + Number.EPSILON) * 100) / 100;
    plainOrder.originalTax = originalTax;
    plainOrder.originalShipping = originalShipping;

    // Use reconstructed original values for refund allocation (protect against mutated order.subtotal)
    const subtotal = originalSubtotalFromItems; // original items subtotal
    const totalTax = originalTax;
    const totalDiscount = Number(plainOrder.discount || 0);

    const refundedComputed = (() => {
      if (plainOrder.refunded != null && !isNaN(Number(plainOrder.refunded)) && Number(plainOrder.refunded) > 0) return Number(plainOrder.refunded);
      return (plainOrder.orderedItems || []).reduce((acc, it) => {
        const st = ((it.status||'').toString().toLowerCase());
        if (['cancelled','returned'].includes(st)) {
          if (it.refundAmount != null && !isNaN(Number(it.refundAmount))) return acc + Number(it.refundAmount);
          const itemSubtotal = Number(it.totalPrice ?? (it.price * it.quantity) ?? 0);
          const taxShare = subtotal > 0 ? (itemSubtotal / subtotal) * totalTax : 0;
          const discountShare = subtotal > 0 ? (itemSubtotal / subtotal) * totalDiscount : 0;
          return acc + (itemSubtotal + taxShare - discountShare);
        }
        return acc;
      }, 0);
    })();

    const roundedRefunded = Math.round((refundedComputed + Number.EPSILON) * 100) / 100;
    const cappedRefunded = Math.min(roundedRefunded, Number(plainOrder.finalAmount || 0));
    const finalPaid = Math.max(0, Math.round(((plainOrder.finalAmount || 0) - cappedRefunded + Number.EPSILON) * 100) / 100);

    res.render('user/order-detail', {
      order: plainOrder,
      user: req.session.user,
      cappedRefunded,
      finalPaid
    });
  } catch (err) {
    console.error('Order details error:', err);
    res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.ORDER_DETAILS_LOAD_ERROR });
  }
};


const cancelOrder = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.AUTH_REQUIRED });
    }
    const userId = req.session.user._id;
    const orderId = req.params.id;
    const { reason } = req.body;


    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ORDER_NOT_FOUND });

    const current = (order.status || '').toLowerCase();
    // Only allow full-order cancellation when order is in 'Pending' state
    if (current !== 'pending') {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.CANCEL_ONLY_PENDING });
    }

    // Immediately cancel order (no admin approval)
    let totalRemoved = 0;
    for (const it of order.orderedItems) {
      const istatus = (it.status || '').toLowerCase();
      if (!['cancelled', 'returned', 'delivered'].includes(istatus)) {
        // restore stock
        if (it.product) {
          await Product.updateOne({ _id: it.product }, { $inc: { quantity: it.quantity } });
        }
        // mark item cancelled
        it.status = 'Cancelled';
        it.cancelReason = reason || 'No reason provided';
        it.approvedAt = new Date();
        it.requestedAt = new Date();

        totalRemoved += it.totalPrice || (it.price * it.quantity) || 0;
      }
    }
  

    order.status = 'Cancelled';
    order.cancelReason = reason || 'No reason provided';
    order.approvedAt = new Date();

    // DO NOT modify order.subtotal or order.finalAmount - keep them as original
    // The view will handle display logic based on item cancellation status


    //refund to wallet only if it was a paid (online) order
    if (totalRemoved > 0 && order.paymentMethod && order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid') {
       await addToWallet(userId, totalRemoved, 'credit', 'Full Order Cancel Refund', order._id);

       order.refunded = (order.refunded || 0) + totalRemoved;
    }

    await order.save();

    return res.json({ success: true, message: messages.ORDER_CANCELLED_SUCCESS, orderId, newStatus: order.status });
  } catch (err) {
    console.error('Cancel order error →', err);
    
    res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.CANCELLATION_FAILED });
  }
};

const returnOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const orderId = req.params.id;
        const { reason } = req.body;

        if (!reason) return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.RETURN_REASON_REQUIRED });

        const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ORDER_NOT_FOUND });
    }

    const orderStatusLC = ((order.status || '').toString().trim().toLowerCase());
    if (orderStatusLC !== 'delivered') {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.RETURN_NOT_ALLOWED });
    }

        // Create order-level return request (do NOT update stock here)
        order.status = 'Return Request';
        order.returnReason = reason;
        order.requestedAt = new Date();
        await order.save();

        res.json({ success: true, message: messages.RETURN_REQUEST_SUBMITTED });
    } catch (err) {
        console.error(err);
        res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.RETURN_REQUEST_FAILED });
    }
};


const searchOrders = async (req, res) => {
    // Integrated into listOrders via query param
    listOrders(req, res);
};

const downloadInvoice = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const orderId = req.params.id;

        const order = await Order.findOne({ _id: orderId, user: userId })
            .populate('orderedItems.product', 'productName price productImage')
            .lean();

        if (!order) return res.status(404).redirect('/orders');

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="EverTime_Invoice_${order.orderId}.pdf"`);

        doc.pipe(res);

        // ────────────────────── HEADER WITH BLUE BACKGROUND ──────────────────────
        doc.rect(0, 0, 600, 140).fill('#0066ff');
        
        // Invoice Title - Centered
        doc.font('Helvetica-Bold').fontSize(48).fillColor('#ffffff').text('INVOICE', 50, 40, { align: 'center', width: 500 });
        
        // Order Details on Right Side
        doc.font('Helvetica').fontSize(11).fillColor('#ffffff');
        doc.text(`Order ID: ${order.orderId}`, 350, 45, { align: 'right', width: 200 });
        doc.text(`Invoice Date: ${new Date(order.createdOn).toLocaleDateString('en-IN')}`, 350, 65, { align: 'right', width: 200 });
        doc.text(`Payment: ${order.paymentMethod || 'N/A'}`, 350, 85, { align: 'right', width: 200 });

        // ────────────────────── COMPANY INFO & BILL TO SECTION ──────────────────────
        const infoY = 170;
        
        // Left Side - Company Info (GoalZone equivalent is EVER TIME)
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000').text('EVER TIME', 50, infoY);
        doc.font('Helvetica').fontSize(10).fillColor('#333333');
        doc.text('Premium Timepieces', 50, infoY + 28);
        doc.text('123 Watch Street, Malappuram', 50, infoY + 44);
        doc.text('Kerala, India - 679536', 50, infoY + 60);
        doc.text('GSTIN: 32AAALCG7E567N1ZR', 50, infoY + 76);

        // Right Side - Bill To
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text('Bill To:', 350, infoY);
        
        const shipping = order.shippingAddress || {};
        doc.font('Helvetica').fontSize(10).fillColor('#333333');
        doc.text(`${shipping.name || req.session.user.name}`, 350, infoY + 24);
        doc.text(`${shipping.email || req.session.user.email}`, 350, infoY + 40);
        // doc.text(`${shipping.address || 'N/A'}`, 350, infoY + 56, { width: 200 });
        // doc.text(`Phone: ${shipping.phone || 'N/A'}`, 350, infoY + 88);
        doc.text(`Email:`, 350, infoY + 104);
        doc.text(`${shipping.email || req.session.user.email}`, 350, infoY + 120);

        // ────────────────────── TABLE WITH SIMPLE DESIGN ──────────────────────
        const tableTop = infoY + 160;
        const col1 = 50;   // Item Description
        const col2 = 340;  // Price
        const col3 = 430;  // Qty
        const col4 = 490;  // Total

        // Table Header
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
        doc.text('Item Description', col1, tableTop);
        doc.text('Price', col2, tableTop);
        doc.text('Qty', col3, tableTop);
        doc.text('Total', col4, tableTop);

        // Header underline
        doc.moveTo(50, tableTop + 18).lineTo(560, tableTop + 18).strokeColor('#cccccc').lineWidth(1).stroke();

        // ────────────────────── TABLE ROWS ──────────────────────  
        doc.font('Helvetica').fontSize(10).fillColor('#333333');
        let y = tableTop + 30;

        order.orderedItems.forEach((item, i) => {
            const name = item.name || (item.product?.productName) || 'Unknown Product';
            const price = item.price ?? item.product?.price ?? 0;
            const total = price * item.quantity;

            doc.text(`${i + 1}. ${name}`, col1, y, { width: 280 });
            doc.text(`₹${price.toFixed(2)}`, col2, y);
            doc.text(`${item.quantity}`, col3, y);
            doc.text(`₹${total.toFixed(2)}`, col4, y);

            y += 30;
        });

        // Bottom border line
        doc.moveTo(50, y + 10).lineTo(560, y + 10).strokeColor('#cccccc').lineWidth(1).stroke();

        // ────────────────────── SUMMARY SECTION WITH LIGHT GRAY BOX ──────────────────────
        const summaryY = y + 40;
        const summaryBoxX = 380;
        const summaryBoxWidth = 180;
        const summaryBoxHeight = 140;

        // Light gray background box
        doc.rect(summaryBoxX, summaryY, summaryBoxWidth, summaryBoxHeight).fill('#f5f5f5');

        // Summary text
        doc.font('Helvetica').fontSize(10).fillColor('#333333');
        const labelX = summaryBoxX + 15;
        const valueX = summaryBoxX + summaryBoxWidth - 15;

        doc.text('Subtotal:', labelX, summaryY + 15);
        doc.text(`₹${(order.subtotal || 0).toFixed(2)}`, valueX - 80, summaryY + 15, { width: 80, align: 'right' });

        doc.text('Discount:', labelX, summaryY + 38);
        doc.text(`₹${(order.discount || 0).toFixed(2)}`, valueX - 80, summaryY + 38, { width: 80, align: 'right' });

        doc.text('GST (18%):', labelX, summaryY + 61);
        doc.text(`₹${(order.tax || 0).toFixed(2)}`, valueX - 80, summaryY + 61, { width: 80, align: 'right' });

        // Grand Total in GREEN
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#00cc66');
        doc.text('Grand Total:', labelX, summaryY + 95);
        doc.fontSize(14).text(`₹${(order.finalAmount || 0).toFixed(2)}`, valueX - 80, summaryY + 95, { width: 80, align: 'right' });

        // ────────────────────── FOOTER ──────────────────────
        const footerY = 750;
        
        doc.font('Helvetica').fontSize(9).fillColor('#666666');
        doc.text('Thank you for your business! For support: support@evertime.in | +91 98765 43210', 50, footerY, { align: 'center', width: 500 });

        doc.end();
    } catch (err) {
      console.error('Invoice generation error:', err);
      res.status(statusCodes.INTERNAL_ERROR).send(messages.INVOICE_GENERATION_FAILED);
    }
};





const cancelOrderItem  = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.AUTH_REQUIRED });
    }

    const userId = req.session.user._id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ORDER_NOT_FOUND });
    }

    const item = order.orderedItems.id(itemId);
    if (!item) {
      return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ITEM_NOT_FOUND });
    }

    // Ensure parent order is still pending before allowing item cancel
    if ((order.status || '').toLowerCase() !== 'pending') {
      return res.status(statusCodes.BAD_REQUEST).json({ 
        success: false, 
        message: messages.ORDER_CANNOT_CANCEL_STAGE 
      });
    }

    const itemStatus = (item.status || '').toLowerCase();
    if (itemStatus === 'cancelled') {
      return res.status(statusCodes.BAD_REQUEST).json({ 
        success: false, 
        message: messages.ITEM_ALREADY_CANCELLED 
      });
    }

    if (['delivered', 'returned', 'shipped'].includes(itemStatus)) {
      return res.status(statusCodes.BAD_REQUEST).json({ 
        success: false, 
        message: messages.CANNOT_CANCEL_AFTER_SHIPPED 
      });
    }

    // Immediately cancel the item (no admin approval needed for cancellation)
    item.status = 'Cancelled';
    item.cancelReason = reason || 'No reason provided';
    item.approvedAt = new Date();
    item.requestedAt = new Date();

    // Restore stock for this item
    if (item.product) {
      await Product.updateOne({ _id: item.product }, { $inc: { quantity: item.quantity } });
    }

    // Calculate refund for this single item
    const itemSubtotal = Number(item.totalPrice || (item.price * item.quantity) || 0);
    const taxShare = (order.subtotal > 0) 
      ? (itemSubtotal / order.subtotal) * Number(order.tax || 0) 
      : 0;
    const refundAmount = Math.round((itemSubtotal + taxShare) * 100) / 100;  // round to 2 decimals

    // Refund to wallet ONLY if it was a paid online order (NOT COD)
    if (refundAmount > 0 && order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid') {
      await addToWallet(userId, refundAmount, 'credit', 'Item Cancel Refund', order._id);
      
      // Optional: Record refund on the item for display/invoice
      item.refundAmount = refundAmount;
    }

    // If all items are cancelled → mark full order as cancelled
    const allCancelled = order.orderedItems.every(it => (it.status || '').toLowerCase() === 'cancelled');
    if (allCancelled) {
      order.status = 'Cancelled';
      order.cancelReason = reason || 'All items cancelled';
      order.approvedAt = new Date();
    }

    await order.save();

    const updatedItem = order.orderedItems.id(itemId);
    
    return res.json({ 
      success: true, 
      message: messages.ITEM_CANCELLED_SUCCESS, 
      itemId, 
      itemStatus: updatedItem.status,
      refundAmount: refundAmount > 0 ? refundAmount : 0
    });

  } catch (err) {
    console.error('cancelOrderItem error:', err);
    return res.status(statusCodes.INTERNAL_ERROR).json({ 
      success: false, 
      message: messages.SERVER_ERROR 
    });
  }
};

const requestReturnItem = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      console.warn('requestReturnItem: no session user');
      return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.AUTH_REQUIRED });
    }
    const userId = req.session.user._id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    console.log('requestReturnItem', { userId, orderId, itemId, reason });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ORDER_NOT_FOUND });

    const item = order.orderedItems.id(itemId);
    if (!item) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.ITEM_NOT_FOUND });

    const itemStatusLC = ((item.status || '').toString().trim().toLowerCase());
    const orderStatusLC = ((order.status || '').toString().trim().toLowerCase());

    // Prefer item-level status when meaningful; otherwise fall back to parent order status
    let effectiveStatus = itemStatusLC;
    if (!effectiveStatus || effectiveStatus === 'pending') {
      effectiveStatus = orderStatusLC;
    }

    // if (effectiveStatus === 'return request' || effectiveStatus === 'returned') {
    //   return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.RETURN_ALREADY_REQUESTED });
    // }

    // if (effectiveStatus !== 'delivered') {
    //   return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.ONLY_DELIVERED_CAN_RETURN });
    // }

    // Mark item-level return request (admin approval required)
    item.status = 'Return Request';
    item.returnReason = reason;
    item.requestedAt = new Date();

    // Check if all items have return requests
    const allHaveReturnRequests = order.orderedItems.every(it => 
      it.status === 'Return Request' || it.status === 'Returned'
    );
    
    // Update order status to Return Request if all items are in return process
    if (allHaveReturnRequests) {
      order.status = 'Return Request';
    }

    await order.save();

    return res.json({ success: true, message: messages.RETURN_REQUEST_SUBMITTED, itemId });
  } catch (err) {
    console.error('requestReturnItem error:', err);
    return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.SERVER_ERROR });
  }
};

// const getDeliveredOrdersByPrice = async (req,res) =>{
//   try{

//   const orders = await Order.find({
//     status:"Delivered",
//     totalPrice:{$gt:10000,$lte:30000}
//   })
//   res.render("orders")
// }catch(error){

//   console.log(error)
//   res.status(500).send("server error")

// }

// }



module.exports = {
    listOrders,
    orderDetails,
    cancelOrder,
    returnOrder,
    searchOrders,
    downloadInvoice,
      cancelOrderItem,
    requestReturnItem
    // getDeliveredOrdersByPrice

};