

const User = require("../../models/userSchema"); 
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt");
const crypto = require('crypto');

const messages = require("../../constants/messages");
const statusCodes = require("../../constants/statusCodes");


const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");




 const loadSignup = async (req,res)=>{
    try{

        return res.render('signup')

    }catch (error){
    
        console.log('Home page not loading',error);
        res.status(500).send('Server Error')
    
    }
 }
 

 const pageNotFound = async (req,res) => {
    try {
        res.render("page-404")
    }catch (error){
res.redirect("/pageNotFound")
    }
}




const loadHomepage = async (req, res) => {
    try {
        const user = req.session.user;
        
        // Fetch featured products (newest 8 products)
        const featuredProducts = await Product.find({ isBlocked: false })
            .populate('category')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // Fetch popular products (you can modify this based on your criteria)
        const popularProducts = await Product.find({ isBlocked: false })
            .populate('category')
            .sort({ salesCount: -1 })
            .limit(10)
            .lean();

        // Fetch new arrivals
        const newArrivals = await Product.find({ isBlocked: false })
            .populate('category')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // Fetch categories for the filter
        const categories = await Category.find({ isListed: true }).lean();

        if (user) {
            const userData = await User.findOne({ _id: user._id });
            res.render("home", {
                user: userData,
                featuredProducts,
                popularProducts,
                newArrivals,
                categories
            });
        } else {
            res.render("home", {
                user: null,
                featuredProducts,
                popularProducts,
                newArrivals,
                categories
            });
        }
    } catch (error) {
        console.log("Home page error:", error);
        res.status(500).send("Server error");
    }
};


    
    function generateOtp(){
        return Math.floor(100000+Math.random()*900000).toString();

    }
    async function sendVerficationEmail(email, otp) {
        try {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: process.env.NODEMAILER_EMAIL,
                    pass: process.env.NODEMAILER_PASSWORD // Make sure no spaces in password
                }
            });
    
            const info = await transporter.sendMail({
                from: process.env.NODEMAILER_EMAIL,
                to: email,
                subject: "Verify your account",
                text: `Your OTP is ${otp}`,
                html: `<b>Your OTP: ${otp}</b>`
            });
    
            console.log('Email sent:', info.messageId);
            return info.accepted.length > 0;
        } catch(error) {
            console.error("Email error:", error);
            return false;
        }
    }

  

const securepassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password,10)
        return passwordHash;


    }catch(error){

    }
}


const signup = async (req,res)=>{
    try {
        const {name, email, phone, password, confirmpassword} = req.body;
        console.log("Received data:", {name, email, phone, password, confirmpassword});

        // Validate all required fields
        if(!name || !email || !phone || !password || !confirmpassword) {
            return res.render('signup', {message: messages.ALL_FIELDS_REQUIRED});
        }

        if(password !== confirmpassword) {
            return res.render('signup', {message: messages.PASSWORD_MISMATCH});
        }

        const findUser = await User.findOne({email});
        if(findUser) {
            return res.render('signup', {message: messages.USER_ALREADY_EXISTS});
        }

        // Generate and send OTP
        const otp = generateOtp();
        const emailSend = await sendVerficationEmail(email, otp);

        if(!emailSend) {
            return res.render('signup', {message: messages.ERROR_SENDING_EMAIL});
        }

        // Store OTP and user data in session
        req.session.userOtp = otp;
        req.session.userData = {name, phone, email, password};

        // Log OTP for debugging
        console.log("OTP sent to email:", email);
        console.log("Generated OTP:", otp);

        return res.render("verify-otp");

    } catch(error) {
        console.error("Signup error:", error);
        return res.render('signup', {message: "An error occurred during signup"});
    }
}

const verifyOtp = async (req,res) => {
    try {
        const {otp} = req.body;
        console.log("Received OTP:", otp, "Session OTP:", req.session.userOtp);

        // Check if session data exists
        if(!req.session.userOtp || !req.session.userData) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.SESSION_EXPIRED
            });
        }

        if(otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securepassword(user.password);

            // Create new user after OTP verification
            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash
            });

            await saveUserData.save();

            // Clear sensitive session data
            req.session.userOtp = null;
            req.session.userData = null;

            
           

            return res.json({
                success: true,
                redirectUrl: "/login"
            });
        } else {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_OTP
            });
        }
    } catch(error) {
        console.error("Error verifying OTP:", error);
        return res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.VERIFY_ERROR
        });
    }
}


//resnt otp-----------------------------------------------------------------------------------------

const resendOTP = async (req, res) => {
    try {
        if (!req.session.userData) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.SESSION_EXPIRED
            });
        }

        const { email } = req.session.userData;
        const newOTP = generateOtp();
        const emailSent = await sendVerficationEmail(email, newOTP);

        if (!emailSent) {
            return res.status(statusCodes.INTERNAL_ERROR).json({
                success: false,
                message: messages.OTP_RESEND_FAILED
            });
        }

        req.session.userOtp = newOTP;
        console.log("resent otp", newOTP);
        return res.json({
            success: true,
            message: messages.OTP_RESENT_SUCCESS
        });
    } catch (error) {
        console.error("Resend OTP error:", error);
        return res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.OTP_RESEND_FAILED
        });
    }
};




const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        res.render('login');
    } catch (error) {
        console.error('Load Login Error:', error);
        res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.SERVER_ERROR });
    }
};




const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(statusCodes.UNAUTHORIZED).json({
                success: false,
                message: messages.INVALID_CREDENTIALS
            });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            return res.status(statusCodes.FORBIDDEN).json({
                success: false,
                message: messages.ACCOUNT_BLOCKED
            });
        }

        // Check if user has a password (if not, it's a Google account)
        if (!user.password) {
            return res.status(statusCodes.UNAUTHORIZED).json({
                success: false,
                message: messages.GOOGLE_ACCOUNT
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(statusCodes.UNAUTHORIZED).json({
                success: false,
                message: messages.INVALID_CREDENTIALS
            });
        }

        // Set session
        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            isBlocked: user.isBlocked
        };

        res.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.LOGIN_ERROR
        });
    }
};




const logout = async (req, res) => {
    try {
        // Destroy the session
        req.session.destroy((err) => {
            if (err) {
                    console.error('Logout Error:', err);
                    return res.status(statusCodes.INTERNAL_ERROR).json({
                        success: false,
                        message: messages.LOGOUT_ERROR
                    });
                }
            // Redirect to login page
            res.redirect('/login');
        });
    } catch (error) {
        console.error('Logout Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during logout'
        });
    }
};





 




     





    
    module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOTP,
    loadLogin,
     login,
    logout,
   
    
    
    }