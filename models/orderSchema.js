



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
      enum: ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancellation Request', 'Cancelled', 'Return Request', 'Returned'],
      default: 'Pending'
    },
    cancelReason: { type: String },
    returnReason: { type: String },
    requestedAt: { type: Date },
    approvedAt: { type: Date }
    ,
    refundAmount: { type: Number, default: 0 }
  }],
  totalPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  address: {
  fullName: { type: String, required: true },
  phone: { type: String },
  altPhone: { type: String, default: '' },
  address: { type: String },        // House, Flat, Street
  landmark: { type: String, default: '' },
  locality: { type: String, default: '' },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  country: { type: String, default: 'India' }
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
    enum: ['Pending', 'Processing', 'Shipped','Out for Delivery', 'Delivered', 'Cancelled', 'Cancellation Request', 'Return Request', 'Returned'],
    default: 'Pending'
  },
  shipping: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  refunded: { type: Number, default: 0 },
  createdOn: { type: Date, default: Date.now, required: true },
  pendingCancelTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  couponApplied: { type: Boolean, default: false },
  cancelReason: { type: String },
  returnReason: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);