const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const Order = require("../../models/orderSchema");
const bcrypt = require("bcrypt");


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

     console.log("OTP sent to email:", email);
        console.log("Generated OTP:", otp);

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






// Show profile page
exports.profilePage = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');
    const user = await User.findById(userId).lean();
    user.addresses = user.addresses || [];
    const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).lean();
    res.render('user/profile', { user, orders });
};

// Edit profile page
exports.editProfilePage = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');
    const user = await User.findById(userId).lean();
    user.addresses = user.addresses || []; // Ensure addresses is always an array
    res.render('user/edit-profile', { user, message: null });
};


exports.updateProfile = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');
    const { name, phone, email, line1, city, state, zip, country } = req.body;
    const user = await User.findById(userId);

    // Only trigger OTP if email is changed
    if (email !== user.email) {
        // Check for duplicate email
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            user.addresses = user.addresses || [];
            return res.render('user/edit-profile', { user: user.toObject(), message: 'Email already in use.' });
        }
        // Generate OTP and store all data in session
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.emailChange = {
            email,
            otp,
            name,
            phone,
            address: { line1, city, state, zip, country }
        };
        // Send OTP
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });
        await transporter.sendMail({
            to: email,
            from: process.env.NODEMAILER_EMAIL,
            subject: 'Email Change Verification',
            html: `<p>Your OTP is <b>${otp}</b></p>`
        });
        return res.redirect('/profile/verify-email');
    }

    // If email not changed, update directly
    user.name = name;
    user.phone = phone;
    user.addresses = [{ line1, city, state, zip, country }];
    await user.save();
    res.redirect('/profile');
};
//------------
// Show verify email page
exports.verifyEmailPage = (req, res) => {
    res.render('user/verify-email', { message: null });
};


exports.verifyEmailOtp = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');
    const { otp } = req.body;

    // Debug: log session and OTP
    console.log("Session emailChange:", req.session.emailChange);
    console.log("Submitted OTP:", otp);

    if (req.session.emailChange && req.session.emailChange.otp === otp) {
        const user = await User.findById(userId);
        user.email = req.session.emailChange.email;
        user.name = req.session.emailChange.name;
        user.phone = req.session.emailChange.phone;
        user.addresses = [req.session.emailChange.address];
        await user.save();
        req.session.emailChange = null;
        return res.redirect('/profile');
    } else {
        return res.render('user/verify-email', { message: 'Invalid OTP' });
    }
};
//--------------

// Show change password page
exports.changePasswordPage = (req, res) => {
    res.render('user/change-password', { message: null });
};

// Handle password change
exports.changePassword = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findById(userId);
    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {
        return res.render('user/change-password', { message: 'Old password incorrect' });
    }
    if (newPassword !== confirmPassword) {
        return res.render('user/change-password', { message: 'Passwords do not match' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.redirect('/profile');
};

//-----------------------------

// Add or Update Address
exports.manageAddress = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');

    const { line1, city, state, zip, country } = req.body;
    const user = await User.findById(userId);

    user.addresses = user.addresses || [];

    if (req.params.index !== undefined) {
        // Edit existing
        const index = parseInt(req.params.index);
        if (index >= 0 && index < user.addresses.length) {
            user.addresses[index] = { line1, city, state, zip, country };
        }
    } else {
        // Add new
        user.addresses.push({ line1, city, state, zip, country });
    }

    await user.save();
    res.redirect('/profile');
};

// Delete Address
exports.deleteAddress = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');

    const index = parseInt(req.params.index);
    const user = await User.findById(userId);

    if (user.addresses && index >= 0 && index < user.addresses.length) {
        user.addresses.splice(index, 1);
        await user.save();
    }

    res.redirect('/profile');
};

// Cancel order
exports.cancelOrder = async (req, res) => {
    const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
    if (!userId) return res.redirect('/login');
    const orderId = req.params.id;
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (order && order.status === 'Placed') {
        order.status = 'Cancelled';
        await order.save();
    }
    res.redirect('/profile');
};


//--------------------------------------------

// Add or Edit Address
// exports.manageAddress = async (req, res) => {
//     try {
//         const userId = req.session.user._id;
//         const { fullName, phone, street, city, state, pincode, isDefault } = req.body;
//         const index = req.params.index;

//         const user = await User.findById(userId);
//         if (!user.addresses) user.addresses = [];

//         const newAddr = {
//             _id: new mongoose.Types.ObjectId(),
//             fullName, phone, street, city, state, pincode,
//             isDefault: !!isDefault
//         };

//         if (index !== undefined && index !== '-1') {
//             user.addresses[parseInt(index)] = newAddr;
//         } else {
//             user.addresses.push(newAddr);
//         }

//         // Only one default
//         if (newAddr.isDefault) {
//             user.addresses.forEach(a => {
//                 if (a._id.toString() !== newAddr._id.toString()) a.isDefault = false;
//             });
//         }

//         await user.save();
//         res.json({ success: true });
//     } catch (err) {
//         res.status(500).json({ success: false, message: 'Failed to save address' });
//     }
// };

// // Delete Address
// exports.deleteAddress = async (req, res) => {
//     try {
//         const userId = req.session.user._id;
//         const index = parseInt(req.params.index);
//         const user = await User.findById(userId);

//         if (!user.addresses || user.addresses.length <= index) {
//             return res.status(404).json({ success: false, message: 'Address not found' });
//         }

//         user.addresses.splice(index, 1);
//         await user.save();
//         res.json({ success: true });
//     } catch (err) {
//         res.status(500).json({ success: false, message: 'Failed to delete address' });
//     }
// };