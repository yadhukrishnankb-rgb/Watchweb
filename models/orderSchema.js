



// const mongoose = require("mongoose");
// const { v4: uuidv4 } = require('uuid');

// const orderSchema = new mongoose.Schema({
//   orderId: {
//     type: String,
//     default: () => uuidv4().slice(0, 8).toUpperCase(),
//     unique: true,
//     sparse: true
//   },
//   user: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   orderedItems: [{
//     // _id: mongoose.Schema.Types.ObjectId,  // <-- IMPORTANT: allows item._id reference
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
//     },
//     // ADD THESE FIELDS FOR ITEM-LEVEL CANCEL/RETURN
//     status: {
//       type: String,
//       enum: ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancellation Request', 'Cancelled', 'Return Request', 'Returned'],
//       default: 'Pending'
//     },
//     cancelReason: { type: String },
//     returnReason: { type: String },
//     requestedAt: { type: Date },
//     approvedAt: { type: Date }
//     ,
//     refundAmount: { type: Number, default: 0 }
//   }],
//   totalPrice: { type: Number, required: true },
//   discount: { type: Number, default: 0 },
//   finalAmount: { type: Number, required: true },
//   address: {
//   fullName: { type: String, required: true },
//   phone: { type: String },
//   altPhone: { type: String, default: '' },
//   address: { type: String },        // House, Flat, Street
//   landmark: { type: String, default: '' },
//   locality: { type: String, default: '' },
//   city: { type: String, required: true },
//   state: { type: String, required: true },
//   pincode: { type: String, required: true },
//   country: { type: String, default: 'India' }
// },
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
//     enum: ['Pending', 'Processing', 'Shipped','Out for Delivery', 'Delivered', 'Cancelled', 'Cancellation Request', 'Return Request', 'Returned'],
//     default: 'Pending'
//   },
//   shipping: { type: Number, default: 0 },
//   subtotal: { type: Number, required: true },
//   tax: { type: Number, required: true },
//   refunded: { type: Number, default: 0 },
//   createdOn: { type: Date, default: Date.now, required: true },
//   pendingCancelTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
//   couponApplied: { type: Boolean, default: false },
//   cancelReason: { type: String },
//   returnReason: { type: String }
// }, { timestamps: true });

// module.exports = mongoose.model("Order", orderSchema);



//--------------------------------------------

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

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

  // ===========================
  // ORDER ITEMS
  // ===========================
  orderedItems: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    name: { type: String },

    quantity: {
      type: Number,
      required: true
    },

    price: {
      type: Number,
      required: true
    },

    totalPrice: {
      type: Number,
      required: true
    },

    productSnapshot: {
      image: { type: String }
    },

    // ITEM LEVEL STATUS
    status: {
      type: String,
      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Out for Delivery',
        'Delivered',
        'Cancellation Request',
        'Cancelled',
        'Return Request',
        'Returned'
      ],
      default: 'Pending'
    },

    cancelReason: { type: String },
    returnReason: { type: String },

    requestedAt: { type: Date },
    approvedAt: { type: Date },

    refundAmount: {
      type: Number,
      default: 0
    }

  }],

  // ===========================
  // PRICE BREAKDOWN
  // ===========================

  subtotal: {
    type: Number,
    required: true
  },

  offerDiscount: {
    type: Number,
    default: 0
  },

  couponDiscount: {
    type: Number,
    default: 0
  },

  discount: {
    type: Number,
    default: 0
  },

  shipping: {
    type: Number,
    default: 0
  },

  tax: {
    type: Number,
    required: true
  },

  totalPrice: {
    type: Number,
    required: true
  },

  finalAmount: {
    type: Number,
    required: true
  },

  walletUsed: {
    type: Number,
    default: 0
  },

  refunded: {
    type: Number,
    default: 0
  },

  // ===========================
  // COUPON DETAILS
  // ===========================

  couponApplied: {
    type: Boolean,
    default: false
  },

  couponCode: {
    type: String
  },

  // ===========================
  // PAYMENT DETAILS
  // ===========================

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

  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },

  paidAt: { type: Date },

  // ===========================
  // ADDRESS SNAPSHOT
  // ===========================

  address: {
    fullName: { type: String, required: true },
    phone: { type: String },
    altPhone: { type: String, default: '' },
    address: { type: String },
    landmark: { type: String, default: '' },
    locality: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' }
  },

  // ===========================
  // ORDER STATUS
  // ===========================

  status: {
    type: String,
    enum: [
      'Pending',
      'Processing',
      'Shipped',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
      'Cancellation Request',
      'Return Request',
      'Returned'
    ],
    default: 'Pending'
  },

  cancelReason: { type: String },
  returnReason: { type: String },

  deliveredAt: { type: Date },

  returnDeadline: { type: Date },

  invoiceDate: { type: Date },

  // ===========================
  // TIMESTAMPS
  // ===========================

  createdOn: {
    type: Date,
    default: Date.now
  },

  pendingCancelTime: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  }

}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
