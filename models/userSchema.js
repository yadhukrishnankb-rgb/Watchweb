
const mongoose = require("mongoose");
const { Schema } = mongoose;
const bcrypt = require('bcrypt');

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    // default: null,
  },
profileImage: {
  type: String,
  default: null,
},
addresses: [
  {
    fullName: { type: String },
    phone: { type: String },
    altPhone: { type: String, default: '' },
    street: { type: String },
    landmark: { type: String, default: '' },
    locality: { type: String, default: '' },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String },
    type: { type: String, default: 'home' },
    isDefault: { type: Boolean, default: false }
  }
],
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  isGoogleUser: {
  type: Boolean,
  default: false
},
  password: {
    type: String,
    required: false,
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  resetPasswordOtp: {
    type: String, // Store 6-digit OTP
  },
  resetPasswordOtpExpires: {
    type: Date, // OTP expiry time
  },
  
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  cart: [
    {
      type: Schema.Types.ObjectId,
      ref: "cart",
    },
  ],
  wallet: [
    {
      type: Schema.Types.ObjectId,
      ref: "Wishlist",
    },
  ],
  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Orders",
    },
  ],
  createdOn: {
    type: Date,
    default: Date.now,
  },
  referalCode: {
    type: String,
  },
  redeemed: {
    type: Boolean,
  },
  redeemedUsers: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  searchHistory: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
      brand: {
        type: String,
      },
      searchOn: {
        type: Date,
        default: Date.now,
      },
    },
  ],



});

// userSchema.pre('save', async function (next) {
//   if (this.isModified('password')) {
//     this.password = await bcrypt.hash(this.password, 10);
//   }
//   next();
// });









const User = mongoose.model("User", userSchema);
module.exports = User;