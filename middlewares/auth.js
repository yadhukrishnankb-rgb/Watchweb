
const User = require("../models/userSchema")


const userAuth = async (req,res,next) => {
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                 next()
            }else{
                res.redirect("/login")
            }
        })
        .catch(error=>{
            console.log("Error in user Auth middleware")
            res.status(500).send("Internal server error")
        
        })
    }else{
        res.redirect("/login")
    }
}





const adminAuth = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }
        const admin = await User.findOne({ isAdmin: true });
        if (!admin) {
            req.session.destroy();
            return res.redirect("/admin/login");
        }
        next();
    } catch (error) {
        console.log("Admin Auth middleware error:", error);
        res.redirect("/admin/login");
    }
};



exports.checkBlockedStatus = async (req, res, next) => {
    try {
        if (req.session.user) {
            const user = await User.findById(req.session.user._id);
            if (user && user.isBlocked) {
                // Clear session if user is blocked
                req.session.destroy();
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
    adminAuth
};

