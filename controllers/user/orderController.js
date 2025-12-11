const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');

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
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
};




const orderDetails = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate('orderedItems.product', 'productName price productImage')
      .exec();

    if (!order) return res.status(404).redirect('/orders');

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

    res.render('user/order-detail', {
      order: plainOrder,
      user: req.session.user
    });
  } catch (err) {
    console.error('Order details error:', err);
    res.status(500).render('error', { message: 'Failed to load order details' });
  }
};


const cancelOrder = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userId = req.session.user._id;
    const orderId = req.params.id;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.json({ success: false, message: 'Order not found' });

    const current = (order.status || '').toLowerCase();
    if (['shipped', 'delivered', 'returned', 'cancelled'].includes(current)) {
      return res.json({ success: false, message: 'Cannot cancel this order at this stage' });
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

    order.status = 'cancelled';
    order.cancelReason = reason || 'No reason provided';
    order.approvedAt = new Date();

    order.subtotal = Math.max(0, (order.subtotal || 0) - totalRemoved);
    order.finalAmount = Math.max(0, (order.finalAmount || 0) - totalRemoved);

    await order.save();

    return res.json({ success: true, message: 'Order cancelled successfully', orderId, newStatus: order.status });
  } catch (err) {
    console.error('Cancel order error →', err);
    
    res.json({ success: false, message: 'Cancellation failed' });
  }
};

const returnOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const orderId = req.params.id;
        const { reason } = req.body;

        if (!reason) return res.json({ success: false, message: 'Return reason is required' });

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order || order.status !== 'Delivered') {
            return res.json({ success: false, message: 'Cannot request return for this order' });
        }

        // Create order-level return request (do NOT update stock here)
        order.status = 'Return Request';
        order.returnReason = reason;
        order.requestedAt = new Date();
        await order.save();

        res.json({ success: true, message: 'Return request submitted. Awaiting admin approval.' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Return request failed' });
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
        doc.text(`${shipping.address || 'N/A'}`, 350, infoY + 56, { width: 200 });
        doc.text(`Phone: ${shipping.phone || 'N/A'}`, 350, infoY + 88);
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
        res.status(500).send('Failed to generate invoice');
    }
};





const requestCancelItem = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userId = req.session.user._id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.orderedItems.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const status = (item.status || '').toLowerCase();
    if (status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Item already cancelled' });
    }
    if (['delivered', 'returned', 'shipped'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel item after it is shipped/delivered' });
    }

    // Immediately cancel item (no admin approval)
    item.status = 'Cancelled';
    item.cancelReason = reason || 'No reason provided';
    item.approvedAt = new Date();
    item.requestedAt = new Date();

    // Restore stock for the product
    if (item.product) {
      await Product.updateOne({ _id: item.product }, { $inc: { quantity: item.quantity } });
    }

    // Adjust order totals
    const priceToRemove = item.totalPrice || (item.price * item.quantity) || 0;
    order.subtotal = Math.max(0, (order.subtotal || 0) - priceToRemove);
    order.finalAmount = Math.max(0, (order.finalAmount || 0) - priceToRemove);

    // If all items cancelled -> mark full order cancelled
    const allCancelled = order.orderedItems.every(it => (it.status || '').toLowerCase() === 'cancelled');
    if (allCancelled) order.status = 'cancelled';

    await order.save();

    const updatedItem = order.orderedItems.id(itemId);
    return res.json({ success: true, message: 'Item cancelled successfully', itemId, itemStatus: updatedItem.status });
  } catch (err) {
    console.error('requestCancelItem error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const requestReturnItem = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      console.warn('requestReturnItem: no session user');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userId = req.session.user._id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    console.log('requestReturnItem', { userId, orderId, itemId, reason });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.orderedItems.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (item.status && item.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered items can be returned' });
    }
    if (item.status === 'Return Request' || item.status === 'Returned') {
      return res.status(400).json({ success: false, message: 'Return already requested' });
    }

    item.status = 'Return Request';
    item.returnReason = reason || 'No reason provided';
    item.requestedAt = new Date();

    await order.save();

    return res.json({ success: true, message: 'Return request submitted. Awaiting admin approval.', itemId });
  } catch (err) {
    console.error('requestReturnItem error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};



module.exports = {
    listOrders,
    orderDetails,
    cancelOrder,
    returnOrder,
    searchOrders,
    downloadInvoice,
      requestCancelItem,
    requestReturnItem
};