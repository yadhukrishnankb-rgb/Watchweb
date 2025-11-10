
// const User = require("../../models/userSchema");
// require('dotenv').config();

// const loadLogin = async(req, res) => {
//     try {
//         if(req.session.admin) {
//             return res.redirect("/admin/dashboard");
//         }
//         res.render("admin-login", { message: null });
//     } catch(error) {
//         console.log("Login error:", error);
//         res.render("admin-login", { message: "Server error" });
//     }
// };

// const login = async(req, res) => {
//     try {
//         const { email, password } = req.body;

//         if(email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
//             req.session.admin = {
//                 email: email,
//                 isAdmin: true
//             };
//             return res.redirect("/admin/dashboard");
//         }

//         res.render("admin-login", { message: "Invalid credentials" });
//     } catch(error) {
//         console.log("Login error:", error);
//         res.render("admin-login", { message: "Server error" });
//     }
// };

// const loadDashboard = async(req, res) => {
//     try {
//         if(!req.session.admin) {
//             return res.redirect("/admin/login");
//         }
//         res.render("dashboard", {
//             admin: req.session.admin,
//             page: 'dashboard'
//         });
//     } catch(error) {
//         console.log("Dashboard error:", error);
//         res.redirect("/admin/login");
//     }
// };


// const logout = (req, res) => {
//     // If no session, just redirect
//     if (!req.session) return res.redirect('/admin/login');

//     req.session.destroy((err) => {
//         if (err) {
//             console.error('Session destroy error:', err);
//             // Clear cookie as fallback and redirect
//             res.clearCookie('sid');
//             return res.redirect('/admin/login');
//         }
//         // clear the session cookie and redirect to login
//         res.clearCookie('sid');
//         return res.redirect('/admin/login');
//     });
// };








// module.exports = {
//     loadLogin,
//     login,
//     loadDashboard,
//     logout
    
// };

//------------------------------------

// controllers/admin/adminController.js
require('dotenv').config();
const User   = require('../../models/userSchema');
const Product = require('../../models/productSchema');   // <-- NEW
const Order   = require('../../models/orderSchema');     // <-- NEW

/* -------------------------------------------------
   ADMIN LOGIN / LOGOUT
------------------------------------------------- */
const loadLogin = async (req, res) => {
  try {
    if (req.session.admin) return res.redirect('/admin/dashboard');
    res.render('admin-login', { message: null });
  } catch (error) {
    console.error('Login page error:', error);
    res.render('admin-login', { message: 'Server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      req.session.admin = { email, isAdmin: true };
      return res.redirect('/admin/dashboard');
    }

    res.render('admin-login', { message: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.render('admin-login', { message: 'Server error' });
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


//------------------------


//--------------------
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
      totalCustomers
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('admin/error', { message: 'Failed to load dashboard' });
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  logout
};
