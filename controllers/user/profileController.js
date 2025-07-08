const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");

// Helper to generate OTP
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
    }
});

// 1. Show forgot password form
exports.loadForgotPassword = (req, res) => {
    res.render('user/forgot-password', { message: null });
};

// 2. Handle email submission, generate OTP, send email, store in session
exports.sendForgotPasswordOtp = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        return res.render('user/forgot-password', { message: 'No account with that email found.' });
    }
    const otp = generateOtp();
    req.session.resetEmail = email;
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000; // 2 minutes

    await transporter.sendMail({
        to: email,
        from: process.env.NODEMAILER_EMAIL,
        subject: 'Your OTP for Password Reset',
        html: `<p>Your OTP is <b>${otp}</b>. It is valid for 2 minutes.</p>`
    });

    res.redirect('/forgot-password-otp');
};

// 3. Show OTP entry page
exports.loadForgotPasswordOtp = (req, res) => {
    if (!req.session.resetEmail) return res.redirect('/forgot-password');
    res.render('user/forgot-password-otp', { message: null, timer: 120 });
};

// 4. Verify OTP
exports.verifyForgotPasswordOtp = (req, res) => {
    const { otp } = req.body;
    if (!req.session.resetEmail) return res.redirect('/forgot-password');
    if (!req.session.otp || !req.session.otpExpires) {
        return res.render('user/forgot-password-otp', { message: 'Session expired. Please try again.', timer: 0 });
    }
    if (req.session.otp !== otp) {
        return res.render('user/forgot-password-otp', { message: 'Invalid OTP', timer: Math.max(0, Math.floor((req.session.otpExpires - Date.now())/1000)) });
    }
    if (req.session.otpExpires < Date.now()) {
        return res.render('user/forgot-password-otp', { message: 'OTP expired. Please resend.', timer: 0 });
    }
    req.session.otp = null;
    req.session.otpExpires = null;
    req.session.otpVerified = true;
    res.redirect('/reset-password');
};

// 5. Resend OTP
exports.resendForgotPasswordOtp = async (req, res) => {
    if (!req.session.resetEmail) return res.redirect('/forgot-password');
    const otp = generateOtp();
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000;
    await transporter.sendMail({
        to: req.session.resetEmail,
        from: process.env.NODEMAILER_EMAIL,
        subject: 'Your OTP for Password Reset',
        html: `<p>Your new OTP is <b>${otp}</b>. It is valid for 2 minutes.</p>`
    });
    res.render('user/forgot-password-otp', { message: 'OTP resent!', timer: 120 });
};

// 6. Show reset password form
exports.loadResetPassword = (req, res) => {
    if (!req.session.otpVerified) return res.redirect('/forgot-password');
    res.render('user/reset-password', { message: null });
};

// 7. Handle reset password submission
exports.handleResetPassword = async (req, res) => {
    if (!req.session.otpVerified) return res.redirect('/forgot-password');
    const { password, confirmpassword } = req.body;
    if (password !== confirmpassword) {
        return res.render('user/reset-password', { message: 'Passwords do not match.' });
    }
    const user = await User.findOne({ email: req.session.resetEmail });
    user.password = await require('bcrypt').hash(password, 10);
    await user.save();
    req.session.otpVerified = false;
    req.session.resetEmail = null;
    res.redirect('/login');
};