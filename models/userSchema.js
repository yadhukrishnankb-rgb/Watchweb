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
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  resetPasswordOtp: { type: String },
  resetPasswordOtpExpires: { type: Date },
  
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
      ref: "Cart",  // corrected from "cart" to "Cart" (assuming model name is Cart)
    },
  ],
  // OLD WRONG WALLET FIELD — REMOVED
  // wallet: [ { type: Schema.Types.ObjectId, ref: "Wishlist" } ],

  // NEW CORRECT WALLET FIELD — ADDED HERE
  wallet: {
    balance: {
      type: Number,
      default: 0,
      min: 0  // prevents negative balance
    },
    transactions: [{
      amount: { type: Number, required: true },
      type: { type: String, enum: ['credit', 'debit'], required: true },
      reason: { type: String, required: true },
      orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: false },
      date: { type: Date, default: Date.now }
    }]
  },

  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Order",  // corrected from "Orders" to "Order" (standard naming)
    },
  ],
  createdOn: {
    type: Date,
    default: Date.now,
  },
  referalCode: { type: String },
  redeemed: { type: Boolean },
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
      brand: { type: String },
      searchOn: {
        type: Date,
        default: Date.now,
      },
    },
  ],

}, { timestamps: true });

// Pre-save hook for password hashing (uncomment if needed)
// userSchema.pre('save', async function (next) {
//   if (this.isModified('password') && this.password) {
//     this.password = await bcrypt.hash(this.password, 10);
//   }
//   next();
// });

const User = mongoose.model("User", userSchema);
module.exports = User;