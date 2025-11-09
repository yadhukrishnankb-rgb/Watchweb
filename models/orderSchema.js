// // models/orderSchema.js
// const mongoose = require("mongoose");
// const { v4: uuidv4 } = require('uuid');

// const orderSchema = new mongoose.Schema({
//   orderId: {
//     type: String,
//     default: () => uuidv4(),
//     unique: true
//   },
//   user: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   orderedItems: [{
//     product: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Product",
//       required: true
//     },
//     name: { type: String },
//     quantity: { type: Number, required: true },
//     price: { type: Number, required: true },
//     totalPrice: { type: Number, required: true },
//     productSnapshot: {
//       image: { type: String }
//     }
//   }],
//   totalPrice: { type: Number, required: true },
//   discount: { type: Number, default: 0 },
//   finalAmount: { type: Number, required: true },
//   address: {
//     fullName: String,
//     phone: String,
//     street: String,
//     city: String,
//     state: String,
//     pincode: String
//   },
//   paymentMethod: {
//     type: String,
//     enum: ['COD', 'RAZORPAY', 'WALLET'],
//     required: true
//   },
//   paymentStatus: {
//     type: String,
//     enum: ['Pending', 'Paid', 'Failed'],
//     default: 'Pending'
//   },
//   invoiceDate: { type: Date },
//   status: {
//     type: String,
//     required: true,
//     enum: ['pending', 'Processing', 'Shipped', 'Delivered', 'cancelled', 'Return Request', 'Returned'],
//     default: 'pending'
//   },
//   shipping: { type: Number, default: 0 },
//   subtotal: { type: Number, required: true },
//   tax: { type: Number, required: true },
//   createdOn: { type: Date, default: Date.now, required: true },
//   couponApplied: { type: Boolean, default: false }
// });

// module.exports = mongoose.model("Order", orderSchema);




// models/orderSchema.js (Updated - Add orderId if missing, add reason fields)
const mongoose = require("mongoose");
const { v4: uuidv4 } = require('uuid');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    default: () => uuidv4().slice(0, 8).toUpperCase(), // Short unique ID like ABC123XY
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  orderedItems: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    name: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    productSnapshot: {
      image: { type: String }
    }
  }],
  totalPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  address: {
    fullName: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  paymentMethod: {
    type: String,
    enum: ['COD', 'RAZORPAY', 'WALLET'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed'],
    default: 'Pending'
  },
  invoiceDate: { type: Date },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'Processing', 'Shipped', 'Delivered', 'cancelled', 'Return Request', 'Returned'],
    default: 'pending'
  },
  shipping: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  createdOn: { type: Date, default: Date.now, required: true },
  couponApplied: { type: Boolean, default: false },
  // New fields for cancel/return
  cancelReason: { type: String },
  returnReason: { type: String, required: function() { return this.status === 'Return Request'; } }
});

module.exports = mongoose.model("Order", orderSchema);