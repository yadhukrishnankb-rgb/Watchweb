

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  brand: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  regularPrice: {
    type: Number,
    required: true,
    min: 0
  },
  salesPrice: {
    type: Number,
    required: true,
    min: 0
  },
  productOffer: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  color: {
    type: String,
    required: true,
    trim: true
  },
  productImage: {
    type: [String],
    required: true,
    validate: [array => array.length >= 3, 'At least 3 images are required']
  },
  status: {
    type: String,
    enum: ['Available', 'Out of Stock'],
    default: 'Available'
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Product', productSchema);



// models/productSchema.js
// const mongoose = require('mongoose');

// const productSchema = new mongoose.Schema({
//   productName: { type: String, required: true, trim: true },
//   description: { type: String, required: true },
//   brand: { type: String, required: true },
//   category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
//   regularPrice: { type: Number, required: true },
//   salesPrice: { type: Number, required: true },
//   productOffer: { type: Number, default: 0 },
//   // --- STOCK FIELDS ---
//   quantity: { type: Number, required: true, min: 0, default: 0 },
//   lowStockThreshold: { type: Number, default: 5 }, // alert when ≤5
//   // --------------------
//   color: { type: String, required: true },
//   productImage: { type: [String], required: true },
//   status: { type: String, enum: ['Available', 'Out of Stock'], default: 'Available' },
//   isBlocked: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now }
// });

// // Virtual: auto-set status
// productSchema.virtual('inStock').get(function () {
//   return this.quantity > 0;
// });
// productSchema.virtual('isLowStock').get(function () {
//   return this.quantity <= this.lowStockThreshold && this.quantity > 0;
// });

// productSchema.set('toJSON', { virtuals: true });
// productSchema.set('toObject', { virtuals: true });

// module.exports = mongoose.model('Product', productSchema);


