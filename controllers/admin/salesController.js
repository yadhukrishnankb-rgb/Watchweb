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
            start = customStart ? moment(customStart) : moment().subtract(30,'days');
            end = customEnd ? moment(customEnd) : moment();
            break;
    }

    return { start: start.toDate(), end: end.toDate() };

}    

// get sales report page

exports.getSalesReport = async (req, res) => {
    try {
        const {filterType = 'monthly', start: customStart, end: customEnd} = req.query;

        const {start, end} = getDateRange(filterType, customStart, customEnd);

        // return all orders in the date range
        const query = {
          status:{$nin:["Cancelled","Returned"]},
            createdOn : {$gte: start, $lte: end}
        };

        const orders = await Order.find(query).
        populate('user', 'name email').
        sort({createdOn: -1}).
        lean();

        console.log('Sales report query:', query);
        console.log('Found orders:', orders.length);

        //calcultate aggreagates
        const totalSalesCount = orders.length;
        const totalOrderAmount = orders.reduce((sum, order) => sum + (order.finalAmount || 0),0);
        const totalDiscount = orders.reduce((sum, order) => {
            return sum + (order.discount || 0) + (order.couponDiscount || 0);
        },0 );

       res.render('admin/sales-report', {
      orders,
      totalSalesCount,
      totalOrderAmount: totalOrderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      totalDiscount: totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      start: moment(start).format('YYYY-MM-DD'),
      end: moment(end).format('YYYY-MM-DD'),
      filterType
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
    doc.text('Date', 170, tableTop);
    doc.text('Customer', 270, tableTop);
    doc.text('Amount', 370, tableTop);
    doc.text('Discount', 470, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Function to draw table header
    const drawTableHeader = () => {
      tableTop = doc.y;
      doc.fontSize(10).text('Order ID', 50, tableTop);
      doc.text('Date', 170, tableTop);
      doc.text('Customer', 270, tableTop);
      doc.text('Amount', 370, tableTop);
      doc.text('Discount', 470, tableTop);
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
      doc.text(moment(order.createdOn).format('DD-MM-YYYY'), 170, y);
      doc.text(order.user?.name || 'Guest', 270, y);
      doc.text(`₹${(order.finalAmount || 0).toLocaleString('en-IN')}`, 370, y);
      doc.text(`₹${((order.discount || 0) + (order.couponDiscount || 0)).toLocaleString('en-IN')}`, 470, y);
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
    sheet.addRow(['Order ID', 'Date', 'Customer', 'Final Amount', 'Discount', 'Coupon Discount', 'Status']);

    // Data rows
    orders.forEach(o => {
      sheet.addRow([
        o.orderId,
        moment(o.createdOn).format('DD-MM-YYYY'),
        o.user?.name || 'Guest',
        `₹${(o.finalAmount || 0).toLocaleString('en-IN')}`,
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