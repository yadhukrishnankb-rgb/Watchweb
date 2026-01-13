
// controllers/admin/adminController.js
require('dotenv').config();
const User   = require('../../models/userSchema');
const Product = require('../../models/productSchema');   
const Order   = require('../../models/orderSchema');    
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');


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

  req.session.destroy(err => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('sid');
    res.redirect('/admin/login');
  });
};




/* -------------------------------------------------
   DASHBOARD – ALL STATS
------------------------------------------------- */
const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) return res.redirect('/admin/login');

    // 1. Total products
    const totalProducts = await Product.countDocuments();


    // 2. Low‑stock products (≤5 and >0)
    const lowStockProducts = await Product.find({
      quantity: { $lte: 5, $gt: 0 }
    })
      .select('productName quantity')
      .limit(5)
      .lean();

    // 3. Total orders
    const totalOrders = await Order.countDocuments();



    // 4. Total revenue (only Delivered orders)
    const revenueAgg = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;
  

    // 5. Total customers (non‑admin users)
    const totalCustomers = await User.countDocuments({ isAdmin: { $ne: true } });

    // Render dashboard with **all** needed variables
    res.render('admin/dashboard', {
      admin: req.session.admin,
      page: 'dashboard',

      // ---- NEW ----
      totalProducts,
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      totalOrders,
      totalRevenue,
      totalCustomers,
      
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


