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
  // Referral System Fields
  referralCode: {
    type: String,
    unique: true,
    sparse: true,           // allows null if needed
    uppercase: true,
    trim: true,
    minlength: 6,
    maxlength: 10
  },

  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  referralRewardClaimed: {
    type: Boolean,
    default: false
  },

  referralCount: {
    type: Number,
    default: 0
  },

  referralEarnings: {
    type: Number,
    default: 0
  }



}, { timestamps: true });

// Pre-save hook for password hashing (uncomment if needed)
// userSchema.pre('save', async function (next) {
//   if (this.isModified('password') && this.password) {
//     this.password = await bcrypt.hash(this.password, 10);
//   }
//   next();
// });

// Auto-generate unique referral code when user is created
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.referralCode) {
    let code;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      // Format: first 3 letters of name + 5 random uppercase + 1 digit
      const namePart = (this.name || 'USER').substring(0, 3).toUpperCase();
      const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
      code = `${namePart}${randomPart}${Math.floor(Math.random() * 10)}`;

      attempts++;
      if (attempts > maxAttempts) {
        return next(new Error('Failed to generate unique referral code'));
      }
    } while (await this.constructor.findOne({ referralCode: code }));

    this.referralCode = code;
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;