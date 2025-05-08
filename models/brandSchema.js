const mongoose = require("mongoose")
const {Schema} = mongoose;


const brandSchema = new Schema({
    brandName : {
        type:String,
        required:true
    },
    brandImage : {
        type :[String],
        require: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    createdAt : {
        type: Date,
        default: Date.now

    }
})

const Brand = mongoose.model("Brand",brandSchema);

module.exports = Brand;