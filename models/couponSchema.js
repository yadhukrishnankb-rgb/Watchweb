const mongoose = require("mongoose")
const {Schema} = mongoose;

const couponSchema = new mongoose.Schema({
    name:{
        type:String,
        require: true,
        unique: true
    },
    createdOn : {
        type:Date,
        default:Date.now,
        required:true
    },
    expireon : {
        type:Date,
        required:true
    },
    offerPrice:{
        type:Date,
        required:true
    },
    minimumPrice: {
        type: Number,
        required:true
    },
    isList: {
        type: Boolean,
        default:true
    },
    userId:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User'
    }]

})

const Coupon = mongoose.model("Coupon",couponSchema)

module.exports = Coupon;