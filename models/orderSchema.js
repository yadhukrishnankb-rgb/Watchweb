


// models/orderSchema.js (Updated - Add orderId if missing, add reason fields)
// const mongoose = require("mongoose");
// const { v4: uuidv4 } = require('uuid');

// const orderSchema = new mongoose.Schema({
//   orderId: {
//     type: String,
//     default: () => uuidv4().slice(0, 8).toUpperCase(), // Short unique ID like ABC123XY
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
//     enum: ['pending', 'Placed','Processing', 'Shipped', 'Delivered', 'cancelled','Cancellation Request', 'Return Request', 'Returned'],
//     default: 'pending'
//   },
//   shipping: { type: Number, default: 0 },
//   subtotal: { type: Number, required: true },
//   tax: { type: Number, required: true },
//   createdOn: { type: Date, default: Date.now, required: true },
//   couponApplied: { type: Boolean, default: false },
//   // New fields for cancel/return
//   cancelReason: { type: String },
//   returnReason: { type: String, required: function() { return this.status === 'Return Request'; } }
// });

// module.exports = mongoose.model("Order", orderSchema);



const mongoose = require("mongoose");
const { v4: uuidv4 } = require('uuid');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    default: () => uuidv4().slice(0, 8).toUpperCase(),
    unique: true,
    sparse: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  orderedItems: [{
    // _id: mongoose.Schema.Types.ObjectId,  // <-- IMPORTANT: allows item._id reference
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
    },
    // ADD THESE FIELDS FOR ITEM-LEVEL CANCEL/RETURN
    status: {
      type: String,
      enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancellation Request', 'Cancelled', 'Return Request', 'Returned'],
      default: 'Placed'
    },
    cancelReason: { type: String },
    returnReason: { type: String },
    requestedAt: { type: Date },
    approvedAt: { type: Date }
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
    enum: ['pending', 'Placed', 'Processing', 'Shipped', 'Delivered', 'cancelled', 'Cancellation Request', 'Return Request', 'Returned'],
    default: 'pending'
  },
  shipping: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  createdOn: { type: Date, default: Date.now, required: true },
  couponApplied: { type: Boolean, default: false },
  cancelReason: { type: String },
  returnReason: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);