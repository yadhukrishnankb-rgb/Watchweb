
require('dotenv').config();
const User   = require('../../models/userSchema');
const Product = require('../../models/productSchema');   
const Order   = require('../../models/orderSchema');    
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const buildChartBuckets = (range) => {
  const now = new Date();
  const buckets = [];

  if (range === 'yearly') {
    const years = 5;
    for (let i = years - 1; i >= 0; i -= 1) {
      const year = now.getFullYear() - i;
      buckets.push({ key: `${year}`, label: `${year}` });
    }
  } else {
    const months = 6;
    for (let i = months - 1; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      buckets.push({ key: `${date.getFullYear()}-${month}`, label: `${monthNames[date.getMonth()]} ${date.getFullYear()}` });
    }
  }

  return buckets;
};

const getChartStartDate = (range) => {
  const now = new Date();
  if (range === 'yearly') {
    return new Date(now.getFullYear() - 4, 0, 1);
  }
  return new Date(now.getFullYear(), now.getMonth() - 5, 1);
};

const loadLogin = async (req, res) => {
  try {
    
    if (req.session.admin) return res.redirect('/admin/dashboard');
    res.render('admin-login', { message: null });
  } catch (error) {
    console.error('Login page error:', error);
    res.render('admin-login', { message: messages.SERVER_ERROR });
  }
};



const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      req.session.admin = { email, isAdmin: true };
      return res.redirect('/admin/dashboard');
    }

    res.render('admin-login', { message: messages.INVALID_CREDENTIALS });
  } catch (error) {
    console.error('Login error:', error);
    res.render('admin-login', { message: messages.SERVER_ERROR });
  }
};

const logout = (req, res) => {
  if (!req.session) return res.redirect('/admin/login');
   
   req.session.admin = null;
   
   res.redirect('/admin/login');
   
};







const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) return res.redirect('/admin/login');

    const range = ['monthly', 'yearly'].includes(req.query.range) ? req.query.range : 'monthly';
    const chartBuckets = buildChartBuckets(range);
    const chartStartDate = getChartStartDate(range);
    const chartDateFormat = range === 'yearly' ? '%Y' : '%Y-%m';

    //  Total products
    const totalProducts = await Product.countDocuments();

    //  Low‑stock products 
    const lowStockProducts = await Product.find({
      quantity: { $lte: 5, $gt: 0 }
    })
      .select('productName quantity')
      .limit(5)
      .lean();

    //  Total orders
    const totalOrders = await Order.countDocuments();

    //  Total revenue 
    const revenueAgg = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Total customers 
    const totalCustomers = await User.countDocuments({ isAdmin: { $ne: true } });

    // Sales chart data
    const chartAgg = await Order.aggregate([
      { $match: { status: 'Delivered', createdAt: { $gte: chartStartDate } } },
      {
        $group: {
          _id: { $dateToString: { format: chartDateFormat, date: '$createdAt' } },
          totalAmount: { $sum: '$finalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const chartMap = chartAgg.reduce((acc, item) => {
      acc[item._id] = item.totalAmount;
      return acc;
    }, {});

    const chartLabels = chartBuckets.map((bucket) => bucket.label);
    const chartData = chartBuckets.map((bucket) => chartMap[bucket.key] || 0);
    const chartMax = Math.max(...chartData, 1);
    const rangeRevenue = chartData.reduce((sum, amount) => sum + amount, 0);
    const rangeOrders = await Order.countDocuments({ status: 'Delivered', createdAt: { $gte: chartStartDate } });
    const averageOrderValue = rangeOrders ? rangeRevenue / rangeOrders : 0;

    // Best-selling products
    const topProducts = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $group: {
          _id: '$orderedItems.product',
          name: { $first: '$orderedItems.name' },
          quantity: { $sum: '$orderedItems.quantity' },
          revenue: { $sum: '$orderedItems.totalPrice' }
        }
      },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 10 }
    ]);

    
    //  bestselling categories
    const topCategories = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$category._id',
          name: { $first: '$category.name' },
          quantity: { $sum: '$orderedItems.quantity' }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: 10 }
    ]).then((items) => items.map((item) => ({
      name: item.name || 'Unknown category',
      quantity: item.quantity
    })));

    // Best-selling brands
    const topBrands = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.brand',
          quantity: { $sum: '$orderedItems.quantity' }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: 10 }
    ]).then((items) => items.map((item) => ({
      name: item._id || 'Unknown brand',
      quantity: item.quantity
    })));

    res.render('admin/dashboard', {
      admin: req.session.admin,
      page: 'dashboard',
      totalProducts,
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      totalOrders,
      totalRevenue,
      totalCustomers,
      chartLabels,
      chartData,
      chartMax,
      rangeRevenue,
      rangeOrders,
      averageOrderValue,
      selectedRange: range,
      topProducts,
      topCategories,
      topBrands
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.DASHBOARD_LOAD_ERROR });
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  logout
};


