

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const env = require("dotenv").config();


const connectDB = async ()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("DB connected")
    } catch (error){

        console.log("DB Connection error 555 ",error);
        process.exit(1);

    }
}

 

module.exports = connectDB;