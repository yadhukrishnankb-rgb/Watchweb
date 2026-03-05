
const User = require("../../models/userSchema"); 
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt");
// const crypto = require('crypto');
const messages = require("../../constants/messages");
const statusCodes = require("../../constants/statusCodes");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const { session } = require("passport");
const { addToWallet } = require("./walletController");


 const loadSignup = async (req,res)=>{
    try{

         return res.render('signup')

    }catch (error){
    
        console.log('Signup page error',error);
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
        const now = new Date();
        // Fetch featured products (newest 8 products)
        let featuredProducts = await Product.find({ isBlocked: false })
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // Fetch popular products (you can modify this based on your criteria)
        let popularProducts = await Product.find({ isBlocked: false })
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .sort({ salesCount: -1 })
            .limit(10)
            .lean();

        // Fetch new arrivals
        let newArrivals = await Product.find({ isBlocked: false })
            .populate({
                path: 'category',
                populate: { path: 'offer' }
            })
            .populate({ path: 'offer' })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // helper to inject offer fields - applies MAXIMUM discount from product or category
        const injectOffer = p => {
            let productDiscount = 0;
            let categoryDiscount = 0;
            const nowDate = new Date();

            // Check product offer
            if (p.offer && p.offer.percentage > 0 && p.offer.isActive) {
                if ((!p.offer.startDate || p.offer.startDate <= nowDate) && (!p.offer.endDate || p.offer.endDate >= nowDate)) {
                    productDiscount = p.offer.percentage;
                }
            }

            // Check category offer
            if (p.category && p.category.offer && p.category.offer.percentage > 0 && p.category.offer.isActive) {
                if ((!p.category.offer.startDate || p.category.offer.startDate <= nowDate) && (!p.category.offer.endDate || p.category.offer.endDate >= nowDate)) {
                    categoryDiscount = p.category.offer.percentage;
                }
            }

            // Apply MAXIMUM discount
            const offerPercent = Math.max(productDiscount, categoryDiscount);
            let offerStart = null;
            let offerEnd = null;
            let offerSource = null;

            if (offerPercent > 0) {
                // Determine which offer source provided the max discount
                if (productDiscount === offerPercent && productDiscount > 0) {
                    offerStart = p.offer.startDate;
                    offerEnd = p.offer.endDate;
                    offerSource = 'product';
                } else if (categoryDiscount === offerPercent && categoryDiscount > 0) {
                    offerStart = p.category.offer.startDate;
                    offerEnd = p.category.offer.endDate;
                    offerSource = 'category';
                }
            }

            return { ...p, offerPercent, offerStart, offerEnd, offerSource };
        };

        featuredProducts = featuredProducts.map(injectOffer);
        popularProducts = popularProducts.map(injectOffer);
        newArrivals = newArrivals.map(injectOffer);

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
        const {name, email, phone, password, confirmpassword, referralCode} = req.body;
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

        //Find referral if code provided
        let referredBy = null;
        if (referralCode && referralCode.trim()) {
            const referrer = await User.findOne({
                referralCode: referralCode.trim().toUpperCase()
            });
            if(referrer) {
                referredBy = referrer._id;
            }else{

            }
        }
    
        // Generate and send OTP
        const otp = generateOtp();
        const emailSend = await sendVerficationEmail(email, otp);

        if(!emailSend) {
            return res.render('signup', {message: messages.ERROR_SENDING_EMAIL});
        }

        // Store OTP and user data in session
        req.session.userOtp = otp;
        req.session.userData = {name, phone, email, password,referredBy};

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
                password: passwordHash,
                referredBy: user.referredBy|| null
            });

            await saveUserData.save();

            //referal reward logic
            if(saveUserData.referredBy && !saveUserData.referralRewardClaimed) {
                const referrer = await User.findById(saveUserData.referredBy);

            

            if(referrer) {
                const referrerReward = 100;
                const referredReward = 50;
              //credit referrer
                await addToWallet(
                    referrer._id,
                    referrerReward,
                    'credit',
                    `Referral bonus from ${saveUserData.name || saveUserData.email}'s signup`,
                    null
                );

                await addToWallet(
                    saveUserData._id,
                    referredReward,
                    'credit',
                    'Signup bonus via referral',
                    null
                );

                // Mark as claimed (prevents double credit if bug)
          saveUserData.referralRewardClaimed = true;
          await saveUserData.save();

          // Optional: update referrer stats
          referrer.referralCount = (referrer.referralCount || 0) + 1;
          referrer.referralEarnings = (referrer.referralEarnings || 0) + referrerReward;
          await referrer.save();

          console.log(`Referral reward credited: ${referrerReward} to referrer, ${referredReward} to new user`);
            }
        }

            // Clear sensitive session data
            req.session.userOtp = null;
            req.session.userData = null;

            return res.json({
                success: true,
                redirectUrl: "/"
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
            isBlocked: false
        };

        res.json({ success: true, redirectUrl: '/' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.LOGIN_ERROR
        });
    }
};



// const logout = async (req, res) => {
//     try {
//         // Destroy the session
//         req.session.destroy((err) => {
//             if (err) {
//                     console.error('Logout Error:', err);
//                     return res.status(statusCodes.INTERNAL_ERROR).json({
//                         success: false,
//                         message: messages.LOGOUT_ERROR
//                     });
//                 }
//             // Redirect to login page
//             res.redirect('/login');
//         });


//     } catch (error) {
//         console.error('Logout Error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error during logout'
//         });
//     }
// };


const logout = async (req, res) => {
  try {
   if (!req.session) return res.redirect('/login');

  req.session.user = null;    // remove only user
  res.redirect('/login');
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
