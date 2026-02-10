
const User = require("../models/userSchema")



// User auth: ensure session.user exists and user not blocked
const userAuth = async (req,res,next) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect("/login");
        }
        const user = await User.findById(req.session.user._id).lean();
        if (!user || user.isBlocked) {
            // clear only user session, not entire session
            req.session.user = null;
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



const adminAuth = async (req, res, next) => {
  try {
    if (!req.session || !req.session.admin || !req.session.admin.isAdmin) {
      // If AJAX / fetch -> return JSON 401, else redirect
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      return res.redirect('/admin/login');
    }
  
    // For admin, we don't need to check DB since admin is hardcoded, just ensure isAdmin flag
    // refresh session expiry (match app.js)
    const maxAge = 14 * 24 * 60 * 60 * 1000;
    req.session.cookie.maxAge = maxAge;
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






const checkBlockedStatus = async (req, res, next) => {
    try {
        if (req.session.user && req.session.user._id) {
            const user = await User.findById(req.session.user._id);
            if (user && user.isBlocked) {
                req.session.user = null;
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

