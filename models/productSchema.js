// const mongoose = require("mongoose")
// const {Schema} = mongoose;

// const productSchema = new Schema({
//     productName : {
//         type: String,
//         required: true,
//     },
//     discription: {
//         type :String,
//         required : true,
//     },
//     brand: {
//         type :String,
//         required: true,
//     },
//     category: {
//         type:Schema.Types.ObjectId,
//         ref:"Category",
//         required:true,
//     },
//     regularPrice:{
//         type:Number,
//         required:true,
//     },
//     salesPrice:{
//         type:Number,
//         required:true
//     },
//     productOffer : {
//         type: Number,
//         default: 0,
//     },
//     quantity : {
//         type:Number,
//         default:true
//     },
//     color: {
//         type:String,
//         required:true
//     },
//     productImage: {
//         type:[String],
//         required:true
//     },
//     isBlocked: {
//         type:Boolean,
//         default:false
//     },
//     status: {
//       type: String,
//       enum:["Available","out of stock","Discountinued"],
//       requied:true,
//       default:"Available"
//     },


// },{timestamp:true});

// const Product = mongoose.model("Product",productSchema);

// module.exports = Product;




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