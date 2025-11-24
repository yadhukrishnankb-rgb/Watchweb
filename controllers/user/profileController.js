
const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const Order = require("../../models/orderSchema");
const bcrypt = require("bcrypt");

const cloudinary = require('../../config/cloudinary');



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






// // Show profile page
exports.profilePage = async (req, res) => {
const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
if (!userId) return res.redirect('/login');
const user = await User.findById(userId).lean();
user.addresses = user.addresses || [];
const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).lean();
res.render('user/profile', { user, orders });
};


// exports.addressPage = async (req, res) => {
//     const user = await User.findById(req.session.user?._id || req.user?._id).lean();
//     user.addresses = user.addresses || [];
//     res.render('user/profile-address', { user });
// };


exports.addressPage = async (req, res) => {
  const userId = req.session.user?._id || req.user?._id;
  if (!userId) return res.redirect('/login');

  const user = await User.findById(userId).lean();
  user.addresses = user.addresses || [];

  res.render('user/profile-address', {
    user,
    success: req.flash('success')[0] || null,
    error: req.flash('error')[0] || null
  });
};





//---------------------------------
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



//-----------------

exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('uploadProfilePicture called, file present:', !!req.file, 'session user:', req.session.user?._id);
    const userId = req.session.user?._id || req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // optional: delete previous Cloudinary image if stored and has predictable public_id
    // store new URL
    user.profileImage = req.file.path; // multer-storage-cloudinary sets `path` to the uploaded URL
    await user.save();

    return res.json({ success: true, message: 'Profile image updated', profileImage: user.profileImage });
  } catch (err) {
    console.error('uploadProfilePicture error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
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
  // `req.flash('error')` will be used for server errors
  const errorMsg = req.flash('error')[0];
  res.render('user/change-password', {
    message: errorMsg,   // old way (kept for backward compatibility)
    success: req.flash('success')[0] || null
  });
};

// Handle password change
exports.changePassword = async (req, res) => {
  const userId = req.session.user?._id || req.user?._id;
  if (!userId) return res.redirect('/login');

  const { oldPassword, newPassword, confirmPassword } = req.body;
  const user = await User.findById(userId);

  // ---- validation ----
  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    req.flash('error', 'Old password incorrect');
    return res.redirect('/profile/change-password');
  }
  if (newPassword !== confirmPassword) {
    req.flash('error', 'Passwords do not match');
    return res.redirect('/profile/change-password');
  }

  // ---- optional extra rules (8 chars, upper, lower, number) ----
  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!pwdRegex.test(newPassword)) {
    req.flash('error', 'Password must be 8+ chars, contain upper, lower case and a number');
    return res.redirect('/profile/change-password');
  }

  // ---- success ----
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  req.flash('success', 'Password changed successfully!');
  res.redirect('/profile/change-password');   // back to same page → flash + Swal
};





exports.manageAddress = async (req, res) => {
  const userId = req.session.user?._id || req.user?._id;
  if (!userId) return res.redirect('/login');

  const { line1, city, state, zip, country } = req.body;
  const user = await User.findById(userId);
  user.addresses = user.addresses || [];

  try {
    if (req.params.index !== undefined) {
      const index = parseInt(req.params.index);
      if (index >= 0 && index < user.addresses.length) {
        user.addresses[index] = { line1, city, state, zip, country };
         req.flash('success', 'Address udpated successfully!');
      }
    } else {
      user.addresses.push({ line1, city, state, zip, country });
      req.flash('success', 'Address added successfully!');
    }
    await user.save();
  } catch (err) {
    req.flash('error', 'Failed to save address. Please try again.');
  }

  res.redirect('/profile/address');
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

