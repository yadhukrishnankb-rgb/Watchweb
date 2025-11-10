
const User = require("../models/userSchema")



// User auth: ensure session.user exists and user not blocked
const userAuth = async (req,res,next) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect("/login");
        }
        const user = await User.findById(req.session.user._id).lean();
        if (!user || user.isBlocked) {
            // clear session and redirect
            req.session.destroy?.(() => {});
            return res.redirect("/login");
        }
        // attach fresh user to req.user if needed
        req.user = user;
        return next();
    } catch (error) {
        console.error("Error in userAuth middleware:", error);
        return res.redirect("/login");
    }
}




// Admin auth: ensure session.admin exists and user is admin
// const adminAuth = async (req, res, next) => {
//     try {
//         if (!req.session.admin || !req.session.admin._id) {
//             return res.redirect("/admin/login");
//         }
//         const admin = await User.findById(req.session.admin._id).lean();
//         if (!admin || !admin.isAdmin) {
//             req.session.destroy?.(() => {});
//             return res.redirect("/admin/login");
//         }
//         req.admin = admin;
//         return next();
//     } catch (error) {
//         console.error("Admin Auth middleware error:", error);
//         return res.redirect("/admin/login");
//     }
// };

//----------------------------------------------------------------
// ...existing code...
const adminAuth = async (req, res, next) => {
  try {
    if (!req.session || !req.session.admin || !req.session.admin._id) {
      // If AJAX / fetch -> return JSON 401, else redirect
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      return res.redirect('/admin/login');
    }

    const admin = await User.findById(req.session.admin._id).lean();
    if (!admin || !admin.isAdmin || admin.isBlocked) {
      req.session.destroy?.(() => {});
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      return res.redirect('/admin/login');
    }

    // refresh session expiry (match app.js)
    const maxAge = 14 * 24 * 60 * 60 * 1000;
    req.session.cookie.maxAge = maxAge;
    req.session.admin = { _id: admin._id, email: admin.email };
    req.admin = admin;
    next();
  } catch (err) {
    console.error('Admin Auth error:', err);
    req.session.destroy?.(() => {});
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    return res.redirect('/admin/login');
  }
};


//----------------------------------------------------



const checkBlockedStatus = async (req, res, next) => {
    try {
        if (req.session.user && req.session.user._id) {
            const user = await User.findById(req.session.user._id);
            if (user && user.isBlocked) {
                req.session.destroy?.(() => {});
                return res.status(403).json({
                    success: false,
                    message: 'Your account has been blocked'
                });
            }
        }
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        next(error);
    }
};



module.exports = {
    userAuth,
    adminAuth,
    checkBlockedStatus
};

