const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({

  // 🔹 Type of offer
  offerType: {
    type: String,
    enum: ['product', 'category'],
    required: true
  },

  // 🔹 If product offer
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },

  // 🔹 If category offer
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },

  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

module.exports = mongoose.model('Offer', offerSchema);