const mongoose = require("mongoose")
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');
const Product = require("./productSchema");

const orderSchema = new Schema({
    orderId : {
        type: String,
        default:()=>uuidv4(),
        unique: true
    },
    orderedItems:[{

        Product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity : {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        }
    }],
    totalPrice: {
        type: Number,
        required : true
    },
    discount:{
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['pending','Processing','Shipped','Delivered','cancelled','Return Request','Returned']
    },
    createdOn :{
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied:{
        type: Boolean,
        default: false
    }
})

const Order = mongoose.model("Order",orderSchema);
module.exports = Order;