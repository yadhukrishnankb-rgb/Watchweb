const User = require("../../models/userSchema"); 
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt");





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


const loadHomepage = async(req,res)=>{
    try {
        const user = req.session.user;
    // return res.render("home");
    if(user){
        const userData = await User.findOne({_id:user._id});
        res.render("home",{user:userData})

    }else{
        return res.render("home");
    }
    } catch (error) {
    console.log("Home page not found")
    res.status(500).send("server error")
    }
    }


    
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
            return res.render('signup', {message: "All fields are required"});
        }

        if(password !== confirmpassword) {
            return res.render('signup', {message: "Password do not match"});
        }

        const findUser = await User.findOne({email});
        if(findUser) {
            return res.render('signup', {message: "User with this email already exists"});
        }

        // Generate and send OTP
        const otp = generateOtp();
        const emailSend = await sendVerficationEmail(email, otp);

        if(!emailSend) {
            return res.render('signup', {message: "Error sending email"});
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
            return res.status(400).json({
                success: false,
                message: "Session expired. Please signup again"
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

            // Set user session
            req.session.user = saveUserData._id;

            return res.json({
                success: true,
                redirectUrl: "/"
            });
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP, please try again"
            });
        }
    } catch(error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during verification"
        });
    }
}


//resnt otp-----------------------------------------------------------------------------------------

const resendOTP = async (req, res) => {
    try {
        if (!req.session.userData) {
            return res.status(400).json({
                success: false,
                message: "Session expired. Please signup again"
            });
        }

        const { email } = req.session.userData;
        const newOTP = generateOtp();
        const emailSent = await sendVerficationEmail(email, newOTP);

        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP"
            });
        }

        req.session.userOtp = newOTP;
        console.log("resent otp", newOTP);
        return res.json({
            success: true,
            message: "OTP resent successfully"
        });
    } catch (error) {
        console.error("Resend OTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to resend OTP"
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
        res.status(500).render('error', { message: 'Internal Server Error' });
    }
};


const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked. Please contact administrator.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
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
        res.status(500).json({
            success: false,
            message: 'An error occurred during login'
        });
    }
};


const logout = async (req, res) => {
    try {
        // Destroy the session
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout Error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Error during logout'
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
    logout
    
    
    
    }