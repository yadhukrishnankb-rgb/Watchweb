


const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const Order = require("../../models/orderSchema");
const bcrypt = require("bcrypt");
const cloudinary = require('../../config/cloudinary');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');



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
  return res.render('user/forgot-password', { message: messages.NO_ACCOUNT_FOUND });
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
  return res.render('user/forgot-password-otp', { message: messages.FORGOT_PASSWORD_SESSION_EXPIRED, timer: 0 });
}
if (req.session.otp !== otp) {
  return res.render('user/forgot-password-otp', { message: messages.INVALID_OTP, timer: Math.max(0, Math.floor((req.session.otpExpires - Date.now())/1000)) });
}
if (req.session.otpExpires < Date.now()) {
  return res.render('user/forgot-password-otp', { message: messages.OTP_EXPIRED, timer: 0 });
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
res.render('user/forgot-password-otp', { message: messages.OTP_RESENT, timer: 120 });
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
  return res.render('user/reset-password', { message: messages.PASSWORD_MISMATCH });
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
res.render('user/profile', { 
  user, 
  orders,
  success: req.flash('success')[0] || null,
  error: req.flash('error')[0] || null
});
};





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
  const userId = req.session.user?._id || req.user?._id;
  if (!userId) return res.redirect('/login');

  const { name, phone, email, line1, landmark, city, state, zip, country } = req.body;
  const errors = [];

  // === VALIDATION RULES ===
  if (!name || name.trim().length < 2) {
    errors.push("Name must be at least 2 characters");
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    errors.push("Enter a valid email address");
  }
  if (!phone || !/^\d{10}$/.test(phone.trim())) {
    errors.push("Phone must be exactly 10 digits");
  }

  // Optional Address Validation (only if any field is filled)
  const hasAddress = line1 || landmark || city || state || zip || country;
  if (hasAddress) {
    if (!line1 || line1.trim().length < 5) errors.push("Address Line 1 must be at least 5 characters");
    if (landmark && landmark.trim().length < 3) errors.push("Landmark must be at least 3 characters if provided");
    if (!city || city.trim().length < 2) errors.push("City must be at least 2 characters");
    if (!state || state.trim().length < 2) errors.push("State must be at least 2 characters");
    if (!country || country.trim().length < 2) errors.push("Country must be at least 2 characters");
    if (!zip || !/^\d{5,6}$/.test(zip.trim())) errors.push("ZIP Code must be 5 or 6 digits");
  }

  if (errors.length > 0) {
    const user = await User.findById(userId).lean();
    return res.render('user/edit-profile', {
      user,
      message: errors.join(' | ')
    });
  }

  try {
    const user = await User.findById(userId);

    // Check if email is being changed
    if (email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.render('user/edit-profile', {
          user: user.toObject(),
          message: messages.EMAIL_ALREADY_REGISTERED
        });
      }

      // Store in session for OTP verification
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      req.session.emailChange = {
        email: email.trim(),
        otp,
        name: name.trim(),
        phone: phone.trim(),
        address: hasAddress ? {
          line1: line1?.trim(),
          landmark: landmark?.trim() || '',
          city: city?.trim(),
          state: state?.trim(),
          zip: zip?.trim(),
          country: country?.trim()
        } : null
      };

      await transporter.sendMail({
        to: email,
        from: process.env.NODEMAILER_EMAIL,
        subject: 'Verify Your New Email',
        html: `<p>Your OTP is <b style="font-size:18px">${otp}</b></p><p>Valid for 2 minutes.</p>`
      });

      return res.redirect('/profile/verify-email');
    }

    // If no email change → update directly
    user.name = name.trim();
    user.phone = phone.trim();

    if (hasAddress) {
      user.addresses = user.addresses || [];
      const addrObj = {
        line1: line1.trim(),
        landmark: (landmark || '').trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        country: country.trim()
      };

      if (user.addresses.length > 0) {
        // Update existing first address only
        user.addresses[0] = addrObj;
      } else {
        // Add new address only if none exists
        user.addresses.push(addrObj);
      }
    }

    await user.save();
    req.flash('success', messages.PROFILE_UPDATE_SUCCESS);
    res.redirect('/profile');

  } catch (err) {
    console.error(err);
    const user = await User.findById(userId).lean();
    res.render('user/edit-profile', {
      user,
      message: messages.SERVER_ERROR
    });
  }
};

//-----------------

exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('uploadProfilePicture called, file present:', !!req.file, 'session user:', req.session.user?._id);
    const userId = req.session.user?._id || req.user?._id;
    if (!userId) return res.status(statusCodes.UNAUTHORIZED).json({ success: false, message: messages.NOT_AUTHENTICATED });

    if (!req.file) {
      return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.NO_FILE_UPLOADED });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.USER_NOT_FOUND });

    // optional: delete previous Cloudinary image if stored and has predictable public_id
    // store new URL
    user.profileImage = req.file.path; // multer-storage-cloudinary sets `path` to the uploaded URL
    await user.save();

    return res.json({ success: true, message: messages.PROFILE_IMAGE_UPDATED, profileImage: user.profileImage });
  } catch (err) {
    console.error('uploadProfilePicture error:', err);
    return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: err.message || messages.SERVER_ERROR });
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
  return res.render('user/verify-email', { message: messages.INVALID_OTP });
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

  const { line1, landmark, city, state, zip, country } = req.body;
  const errors = [];

  // === VALIDATION RULES ===
  if (!line1 || line1.trim().length < 5) {
    errors.push('Address Line 1 must be at least 5 characters');
  }
  if (landmark && landmark.trim().length < 3) {
    errors.push('Landmark must be at least 3 characters if provided');
  }
  if (!city || city.trim().length < 2) {
    errors.push('City must be at least 2 characters');
  }
  if (!state || state.trim().length < 2) {
    errors.push('State must be at least 2 characters');
  }
  if (!country || country.trim().length < 2) {
    errors.push('Country must be at least 2 characters');
  }
  if (!zip || !/^\d{5,6}$/.test(zip.trim())) {
    errors.push('ZIP Code must be 5 or 6 digits');
  }

  if (errors.length > 0) {
    req.flash('error', errors.join(' | '));
    return res.redirect('/profile/address');
  }

  try {
    const user = await User.findById(userId);
    user.addresses = user.addresses || [];

    if (req.params.index !== undefined) {
      const index = parseInt(req.params.index);
      if (index >= 0 && index < user.addresses.length) {
        user.addresses[index] = {
          line1: line1.trim(),
          landmark: (landmark || '').trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          country: country.trim()
        };
        req.flash('success', 'Address updated successfully!');
      }
    } else {
      user.addresses.push({
        line1: line1.trim(),
        landmark: (landmark || '').trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        country: country.trim()
      });
      req.flash('success', 'Address added successfully!');
    }

    await user.save();
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to save address. Please try again.');
  }

  res.redirect('/profile/address');
};




exports.deleteAddress = async (req, res) => {
  const userId = req.session.user?._id || req.user?._id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const index = parseInt(req.params.index);
    const user = await User.findById(userId);

    if (!user || !user.addresses || index < 0 || index >= user.addresses.length) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    user.addresses.splice(index, 1);
    await user.save();

    // RETURN JSON FOR AJAX + ALSO SUPPORT NORMAL REDIRECT
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ success: true, message: 'Address deleted successfully' });
    } else {
      req.flash('success', 'Address deleted successfully');
      return res.redirect('/profile/address');  // ← FIXED: Go back to address page!
    }
  } catch (err) {
    console.error('Delete address error:', err);
    if (req.xhr) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    req.flash('error', 'Failed to delete address');
    res.redirect('/profile/address');
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
const userId = req.session.user ? req.session.user._id : (req.user ? req.user._id : null);
if (!userId) return res.redirect('/login');
const orderId = req.params.id;
const order = await Order.findOne({ _id: orderId, user: userId });
if (order && order.status === 'Pending') {
order.status = 'Cancelled';
await order.save();
}
res.redirect('/profile');
};

