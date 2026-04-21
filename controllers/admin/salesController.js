const Order = require('../../models/orderSchema');
const pdfkit = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');

// helper function to get date range based on filter
function getDateRange(filterType, customStart, customEnd) {

    let start, end;

    switch (filterType) {

        case 'daily':
            start = moment().startOf('day');
            end = moment().endOf('day');
            break;

        case 'weekly':
            // last 7 days including today
            start = moment().subtract(6, 'days').startOf('day');
            end = moment().endOf('day');
            break;

        case 'monthly':
            // last 30 days including today
            start = moment().subtract(29, 'days').startOf('day');
            end = moment().endOf('day');
            break;

        case 'yearly':
            // last 365 days including today
            start = moment().subtract(364, 'days').startOf('day');
            end = moment().endOf('day');
            break;

        case 'custom':
            start = isValidDateString(customStart)
                ? moment(customStart).startOf('day')
                : moment().subtract(30, 'days').startOf('day');
            end = isValidDateString(customEnd)
                ? moment(customEnd).endOf('day')
                : moment().endOf('day');
            break;
    }

    return { start: start.toDate(), end: end.toDate() };
}

function isValidDateString(dateString) {
    return Boolean(dateString) && moment(dateString, 'YYYY-MM-DD', true).isValid();
}

// get sales report page
exports.getSalesReport = async (req, res) => {
    try {
        const {filterType = 'monthly', start: customStart, end: customEnd, page: pageQuery} = req.query;
        const page = Math.max(Number(pageQuery) || 1, 1);
        const limit = 10;
        let errorMessage = null;

        if (filterType === 'custom') {
            if (!customStart || !customEnd) {
                errorMessage = 'Please select both start and end dates for a custom range.';
            } else if (!isValidDateString(customStart) || !isValidDateString(customEnd)) {
                errorMessage = 'Please enter valid dates in YYYY-MM-DD format.';
            } else if (moment(customStart).isAfter(moment(customEnd))) {
                errorMessage = 'Start date cannot be later than end date.';
            }
        }

        if (errorMessage) {
            return res.render('admin/sales-report', {
                orders: [],
                totalSalesCount: 0,
                totalOrderAmount: '0.00',
                totalDiscount: '0.00',
                start: customStart || moment().subtract(29, 'days').format('YYYY-MM-DD'),
                end: customEnd || moment().format('YYYY-MM-DD'),
                filterType,
                currentPage: 1,
                totalPages: 1,
                errorMessage
            });
        }

        const {start, end} = getDateRange(filterType, customStart, customEnd);

        // return all orders in the date range
        const query = {
          status:{$nin:["Cancelled","Returned"]},
            createdOn : {$gte: start, $lte: end}
        };

        const totalsResult = await Order.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalSalesCount: { $sum: 1 },
              totalOrderAmount: { $sum: { $ifNull: ['$finalAmount', 0] } },
              totalDiscount: { $sum: { $add: [ { $ifNull: ['$discount', 0] }, { $ifNull: ['$couponDiscount', 0] } ] } }
            }
          }
        ]);

        const totals = totalsResult[0] || { totalSalesCount: 0, totalOrderAmount: 0, totalDiscount: 0 };
        const totalPages = Math.max(Math.ceil(totals.totalSalesCount / limit), 1);
        const currentPage = Math.min(page, totalPages);

        const orders = await Order.find(query)
          .populate('user', 'name email')
          .sort({createdOn: -1})
          .skip((currentPage - 1) * limit)
          .limit(limit)
          .lean();


      

        

       res.render('admin/sales-report', {
      orders,
      totalSalesCount: totals.totalSalesCount,
      totalOrderAmount: totals.totalOrderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      totalDiscount: totals.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      start: moment(start).format('YYYY-MM-DD'),
      end: moment(end).format('YYYY-MM-DD'),
      filterType,
      currentPage,
      totalPages
    });

    }catch (err){
        console.error('Sales report error:', err);
    res.status(500).render('admin/error', { message: 'Failed to load sales report' });

    }
}


// Download PDF
exports.downloadPdf = async (req, res) => {
  try {
    const { filterType = 'custom', start: customStart, end: customEnd } = req.query;
    const { start, end } = getDateRange(filterType, customStart, customEnd);

    const query = {
      // status: 'Delivered',
      createdOn: { $gte: start, $lte: end }
    };

    const orders = await Order.find(query).populate('user', 'name email').lean();

    const doc = new pdfkit({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment(start).format('DD-MM-YYYY')}-to-${moment(end).format('DD-MM-YYYY')}.pdf`);

    doc.pipe(res);

    // Title
    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.fontSize(12).text(`Period: ${moment(start).format('DD-MM-YYYY')} to ${moment(end).format('DD-MM-YYYY')}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    const totalSales = orders.length;
    const totalAmount = orders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
    const totalDiscount = orders.reduce((sum, o) => sum + (o.discount || 0) + (o.couponDiscount || 0), 0);

    doc.fontSize(14).text('Summary:', { underline: true });
    doc.fontSize(12).text(`Total Orders: ${totalSales}`);
    doc.text(`Total Sales Amount: ₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    doc.text(`Total Discount (incl. coupons): ₹${totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    doc.moveDown(2);

    // Table header
    let tableTop = doc.y;
    doc.fontSize(10).text('Order ID', 50, tableTop);
    doc.text('Date', 140, tableTop);
    doc.text('Customer', 230, tableTop);
    doc.text('Amount', 330, tableTop);
    doc.text('Payment', 410, tableTop);
    doc.text('Discount', 500, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Function to draw table header
    const drawTableHeader = () => {
      tableTop = doc.y;
      doc.fontSize(10).text('Order ID', 50, tableTop);
      doc.text('Date', 140, tableTop);
      doc.text('Customer', 230, tableTop);
      doc.text('Amount', 330, tableTop);
      doc.text('Payment', 410, tableTop);
      doc.text('Discount', 500, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      return tableTop + 25;
    };

    // Table rows
    let y = tableTop + 25;
    const pageHeight = doc.page.height;
    const bottomMargin = 50;

    orders.forEach(order => {
      // Check if we need a new page
      if (y + 20 > pageHeight - bottomMargin) {
        doc.addPage();
        y = drawTableHeader();
      }

      doc.text(order.orderId, 50, y);
      doc.text(moment(order.createdOn).format('DD-MM-YYYY'), 140, y);
      doc.text(order.user?.name || 'Guest', 230, y);
      doc.text(`₹${(order.finalAmount || 0).toLocaleString('en-IN')}`, 330, y);
      doc.text(order.paymentMethod || 'N/A', 410, y);
      doc.text(`₹${((order.discount || 0) + (order.couponDiscount || 0)).toLocaleString('en-IN')}`, 500, y);
      y += 20;
    });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).send('Failed to generate PDF');
  }
};

// Download Excel
exports.downloadExcel = async (req, res) => {
  try {
    const { filterType = 'custom', start: customStart, end: customEnd } = req.query;
    const { start, end } = getDateRange(filterType, customStart, customEnd);

    const query = {
      // status: 'Delivered',
      createdOn: { $gte: start, $lte: end }
    };

    const orders = await Order.find(query).populate('user', 'name email').lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales Report');

    // Summary
    sheet.addRow(['Sales Report', `From: ${moment(start).format('DD-MM-YYYY')} To: ${moment(end).format('DD-MM-YYYY')}`]);
    sheet.addRow([]);
    sheet.addRow(['Total Orders', orders.length]);
    sheet.addRow(['Total Amount', `₹${orders.reduce((s, o) => s + (o.finalAmount || 0), 0).toLocaleString('en-IN')}`]);
    sheet.addRow(['Total Discount (incl. coupons)', `₹${orders.reduce((s, o) => s + (o.discount || 0) + (o.couponDiscount || 0), 0).toLocaleString('en-IN')}`]);
    sheet.addRow([]);

    // Headers
    sheet.addRow(['Order ID', 'Date', 'Customer', 'Final Amount', 'Payment Method', 'Discount', 'Coupon Discount', 'Status']);

    // Data rows
    orders.forEach(o => {
      sheet.addRow([
        o.orderId,
        moment(o.createdOn).format('DD-MM-YYYY'),
        o.user?.name || 'Guest',
        `₹${(o.finalAmount || 0).toLocaleString('en-IN')}`,
        o.paymentMethod || 'N/A',
        `₹${(o.discount || 0).toLocaleString('en-IN')}`,
        `₹${(o.couponDiscount || 0).toLocaleString('en-IN')}`,
        o.status
      ]);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sales-report-${moment(start).format('DD-MM-YYYY')}-to-${moment(end).format('DD-MM-YYYY')}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel generation error:', err);
    res.status(500).send('Failed to generate Excel');
  }
};