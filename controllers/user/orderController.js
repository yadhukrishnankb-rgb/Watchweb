// controllers/user/orderController.js (New File - Full Order Management)
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
            .lean();

        if (!order) return res.status(404).redirect('/orders');

        res.render('user/order-detail', { order, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Failed to load order details' });
    }
};
//--------------
// ...existing code...
const cancelOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const orderId = req.params.id;
        const { reason } = req.body;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.json({ success: false, message: 'Order not found' });

        if (order.status !== 'pending') {
            return res.json({ success: false, message: 'Only pending orders can request cancellation' });
        }

        // Set order-level cancellation request (do NOT restore stock here)
        order.status = 'Cancellation Request';
        order.cancelReason = reason?.trim() || 'No reason provided';
        order.requestedAt = new Date();
        await order.save();

        res.json({ success: true, message: 'Cancellation request submitted. Awaiting admin approval.' });
    } catch (err) {
        console.error('Cancel order error →', err);
        res.json({ success: false, message: 'Cancellation request failed' });
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

        // ────────────────────── HEADER WITH GRADIENT EFFECT ──────────────────────
        doc.rect(0, 0, 600, 100).fill('#0a5f5f');
        
        // Company Name
        doc.font('Helvetica-Bold').fontSize(32).fillColor('#ffffff').text('EVER TIME', 60, 30);
        doc.fontSize(10).fillColor('#d4f1f1').text('Premium Timepieces', 60, 65);
        
        // Invoice Title
        doc.font('Helvetica-Bold').fontSize(24).fillColor('#ffffff').text('INVOICE', 420, 35);
        
        // Optional Logo (on white background for contrast)
        const logoPath = 'public/images/logo.png';
        if (fs.existsSync(logoPath)) {
            doc.rect(480, 25, 60, 60).fill('#ffffff');
            doc.image(logoPath, 485, 30, { width: 50 });
        }

        // ────────────────────── INFO SECTION WITH CARDS ──────────────────────
        const infoY = 130;
        
        // Left Card - Order Details
        doc.rect(50, infoY, 240, 110).lineWidth(1).strokeColor('#e0e0e0').stroke();
        doc.rect(50, infoY, 240, 30).fill('#f8f9fa');
        
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#0a5f5f').text('ORDER DETAILS', 60, infoY + 8);
        
        doc.font('Helvetica').fontSize(10).fillColor('#666');
        doc.text('Order ID:', 60, infoY + 45);
        doc.font('Helvetica-Bold').fillColor('#333').text(`#${order.orderId}`, 140, infoY + 45);

        doc.font('Helvetica').fillColor('#666').text('Order Date:', 60, infoY + 62);
        doc.font('Helvetica-Bold').fillColor('#333').text(`${new Date(order.createdOn).toLocaleDateString('en-IN')}`, 140, infoY + 62);

        doc.font('Helvetica').fillColor('#666').text('Payment:', 60, infoY + 79);
        doc.font('Helvetica-Bold').fillColor('#333').text(`${order.paymentMethod || 'N/A'}`, 140, infoY + 79);

        doc.font('Helvetica').fillColor('#666').text('Status:', 60, infoY + 96);
        doc.font('Helvetica-Bold')
           .fillColor(order.status === 'Delivered' ? '#27ae60' : 
                     order.status === 'cancelled' ? '#e74c3c' : '#f39c12')
           .text(`${order.status}`, 140, infoY + 96);

        // Right Card - Billing Information
        doc.rect(310, infoY, 240, 110).lineWidth(1).strokeColor('#e0e0e0').stroke();
        doc.rect(310, infoY, 240, 30).fill('#f8f9fa');
        
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#0a5f5f').text('BILL TO', 320, infoY + 8);
        
        const shipping = order.shippingAddress || {};
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(`${shipping.name || req.session.user.name}`, 320, infoY + 45);
        doc.font('Helvetica').fontSize(9).fillColor('#666').text(`${shipping.email || req.session.user.email}`, 320, infoY + 62);
        doc.text(`📞 ${shipping.phone || 'N/A'}`, 320, infoY + 78);
        if (shipping.address) {
            doc.text(`${shipping.address.substring(0, 35)}...`, 320, infoY + 94);
        }

        // ────────────────────── TABLE WITH MODERN DESIGN ──────────────────────
        const tableTop = infoY + 140;
        const col1 = 50;   // ITEM #
        const col2 = 75;   // DESCRIPTION
        const col3 = 300;  // QTY
        const col4 = 365;  // PRICE
        const col5 = 445;  // TOTAL

        // Table Header with gradient
        doc.rect(col1, tableTop, 510, 35).fill('#0a5f5f');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
        doc.text('#', col1 + 8, tableTop + 12);
        doc.text('DESCRIPTION', col2 + 8, tableTop + 12);
        doc.text('QTY', col3 + 8, tableTop + 12, { width: 55, align: 'center' });
        doc.text('PRICE', col4 + 8, tableTop + 12, { width: 75, align: 'right' });
        doc.text('TOTAL', col5 + 8, tableTop + 12, { width: 90, align: 'right' });

        // ────────────────────── TABLE ROWS WITH ALTERNATING COLORS ──────────────────────
        doc.font('Helvetica').fontSize(10).fillColor('#333');
        let y = tableTop + 35;

        order.orderedItems.forEach((item, i) => {
            // Alternating row colors
            if (i % 2 === 0) {
                doc.rect(col1, y, 510, 28).fill('#f8f9fa');
            }
            
            const name = item.name || (item.product?.productName) || 'Unknown Product';
            const price = item.price ?? item.product?.price ?? 0;
            const total = price * item.quantity;

            doc.fillColor('#333');
            doc.text(`${i + 1}`, col1 + 8, y + 8);
            doc.font('Helvetica').text(name, col2 + 8, y + 8, { width: 200, ellipsis: true });
            doc.text(`${item.quantity}`, col3 + 8, y + 8, { width: 55, align: 'center' });
            doc.text(`₹${price.toFixed(2)}`, col4 + 8, y + 8, { width: 75, align: 'right' });
            doc.font('Helvetica-Bold').text(`₹${total.toFixed(2)}`, col5 + 8, y + 8, { width: 90, align: 'right' });

            y += 28;
        });

        // Table border
        doc.rect(col1, tableTop, 510, y - tableTop).lineWidth(1.5).strokeColor('#0a5f5f').stroke();

        // ────────────────────── SUMMARY SECTION ──────────────────────
        const summaryY = y + 25;
        const labelX = 360;
        const valueX = 455;

        // Summary box background
        doc.rect(labelX - 10, summaryY - 10, 200, 100).lineWidth(1).strokeColor('#e0e0e0').fill('#fafafa').stroke();

        doc.font('Helvetica').fontSize(10).fillColor('#666');
        doc.text('Subtotal:', labelX, summaryY);
        doc.font('Helvetica-Bold').fillColor('#333').text(`₹${(order.subtotal || 0).toFixed(2)}`, valueX, summaryY, { width: 85, align: 'right' });

        doc.font('Helvetica').fillColor('#666').text('Tax (GST):', labelX, summaryY + 22);
        doc.font('Helvetica-Bold').fillColor('#333').text(`₹${(order.tax || 0).toFixed(2)}`, valueX, summaryY + 22, { width: 85, align: 'right' });

        doc.font('Helvetica').fillColor('#666').text('Shipping:', labelX, summaryY + 44);
        doc.font('Helvetica-Bold').fillColor('#333').text(`₹${(order.shipping || 0).toFixed(2)}`, valueX, summaryY + 44, { width: 85, align: 'right' });

        // ────────────────────── GRAND TOTAL ──────────────────────
        const totalBoxY = summaryY + 70;
        doc.rect(labelX - 10, totalBoxY - 5, 200, 35).fill('#0a5f5f');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14);
        doc.text('GRAND TOTAL', labelX, totalBoxY + 5);
        doc.fontSize(16).text(`₹${(order.finalAmount || 0).toFixed(2)}`, valueX, totalBoxY + 5, { width: 85, align: 'right' });

        // ────────────────────── FOOTER ──────────────────────
        const footerY = 750;
        doc.rect(0, footerY, 600, 50).fill('#f8f9fa');
        
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0a5f5f');
        doc.text('Thank you for your business!', 50, footerY + 10, { align: 'center' });
        
        doc.font('Helvetica').fontSize(9).fillColor('#666');
        doc.text('For support: support@evertime.in | +91 98765 43210', 50, footerY + 28, { align: 'center' });

        // ────────────────────── PAGE NUMBER ──────────────────────
        const pageCount = doc.pageCount;
        doc.font('Helvetica').fontSize(10).fillColor('#666');
        doc.text(`Page ${doc.page} of ${pageCount}`, 500, 780, { align: 'right' });

        doc.end();
    } catch (err) {
        console.error('Invoice generation error:', err);
        res.status(500).send('Failed to generate invoice');
    }
};


const requestCancelItem = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      console.warn('requestCancelItem: no session user');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userId = req.session.user._id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    console.log('requestCancelItem', { userId, orderId, itemId, reason });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.orderedItems.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (item.status === 'Cancellation Request' || item.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Cancellation already requested or completed' });
    }

    item.status = 'Cancellation Request';
    item.cancelReason = reason || 'No reason provided';
    item.requestedAt = new Date();

    await order.save();

const updatedItem = order.orderedItems.id(itemId);
    return res.json({ success: true, message: 'Cancellation request submitted. Awaiting admin approval.', itemId, itemStatus: updatedItem.status });

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