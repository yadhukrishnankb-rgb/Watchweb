
const User = require("../../models/userSchema");
require('dotenv').config();

const loadLogin = async(req, res) => {
    try {
        if(req.session.admin) {
            return res.redirect("/admin/dashboard");
        }
        res.render("admin-login", { message: null });
    } catch(error) {
        console.log("Login error:", error);
        res.render("admin-login", { message: "Server error" });
    }
};

const login = async(req, res) => {
    try {
        const { email, password } = req.body;

        if(email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            req.session.admin = {
                email: email,
                isAdmin: true
            };
            return res.redirect("/admin/dashboard");
        }

        res.render("admin-login", { message: "Invalid credentials" });
    } catch(error) {
        console.log("Login error:", error);
        res.render("admin-login", { message: "Server error" });
    }
};

const loadDashboard = async(req, res) => {
    try {
        if(!req.session.admin) {
            return res.redirect("/admin/login");
        }
        res.render("dashboard", {
            admin: req.session.admin,
            page: 'dashboard'
        });
    } catch(error) {
        console.log("Dashboard error:", error);
        res.redirect("/admin/login");
    }
};



// const logout = async(req, res) => {
//     try {
//         req.session.destroy();
//         res.redirect('/admin/login');
//     } catch(error) {
//         console.log("Logout error:", error);
//         res.redirect('/admin/dashboard');
//     }
// };



// ...existing code...
const logout = (req, res) => {
    // If no session, just redirect
    if (!req.session) return res.redirect('/admin/login');

    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
            // Clear cookie as fallback and redirect
            res.clearCookie('sid');
            return res.redirect('/admin/login');
        }
        // clear the session cookie and redirect to login
        res.clearCookie('sid');
        return res.redirect('/admin/login');
    });
};








module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout
    
};


