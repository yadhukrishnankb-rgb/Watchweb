const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    unique: true,
    trim: true,
    minlength: 4,
    maxlength: 20
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  minAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  maxDiscount: {
    type: Number,
    default: null
  },
  expiryDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageLimit: {
    type: Number,
    default: null
  },
  usedCount: {
    type: Number,
    default: 0
  },
  userUsageLimit: {
    type: Number,
    default: 1
  },
  usedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    usedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Coupon', couponSchema);