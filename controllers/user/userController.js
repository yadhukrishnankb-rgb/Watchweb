
const User = require("../../models/userSchema"); 
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt");
const messages = require("../../constants/messages");
const statusCodes = require("../../constants/statusCodes");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Review = require("../../models/reviewSchema");
const { session } = require("passport");
const { addToWallet } = require("./walletController");
const { getOfferDetails } = require("../../helpers/priceUtils");
const { offerPopulate } = require("../../helpers/populateUtils");


 const loadSignup = async (req,res)=>{
    try{

         return res.render('signup')

    }catch (error){
    
        res.status(500).send('Server Error')
    
    }
 }



 const pageNotFound = async (req,res) => {
    try {
        res.status(404).render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}



const loadHomepage = async (req, res) => {
    try {
        const user = req.session.user;

        
        const baseQuery = Product.find({ isBlocked: false })
            .populate(offerPopulate)   
            .lean();

        
        let featuredProducts = await baseQuery.clone()
            .sort({ createdAt: -1 })
            .limit(10);

        
        let popularProducts = await baseQuery.clone()
            .sort({ salesCount: -1 })
            .limit(10);

        
        let newArrivals = await baseQuery.clone()
            .sort({ createdAt: -1 })
            .limit(10);

      
const injectOffer = (p) => {
    const offerDetails = getOfferDetails(p);
    return { 
        ...p, 
        ...offerDetails,
        
        displayPrice: offerDetails.effectivePrice,
        originalPrice: offerDetails.offerPercent > 0 ? 
                      Math.round((typeof p.salesPrice === 'number' ? p.salesPrice : (p.price || p.regularPrice || 0)) * 100) / 100 : 
                      null
    };
};

const addRatingsToProducts = async (products) => {
    if (!products || products.length === 0) return products;
    
    const productIds = products.map(p => p._id);
    const ratingsData = await Review.aggregate([
        { $match: { product: { $in: productIds } } },
        {
            $group: {
                _id: '$product',
                averageRating: { $avg: '$rating' },
                numReviews: { $sum: 1 }
            }
        }
    ]);

    const ratingsMap = new Map();  
    ratingsData.forEach(rating => {
        ratingsMap.set(rating._id.toString(), {
            averageRating: Math.round(rating.averageRating * 10) / 10, 
            numReviews: rating.numReviews
        });
    });

    // Add ratings to products
    return products.map(product => ({
        ...product,
        averageRating: ratingsMap.get(product._id.toString())?.averageRating || 0,
        numReviews: ratingsMap.get(product._id.toString())?.numReviews || 0
    }));
};


featuredProducts = featuredProducts.map(injectOffer);
popularProducts = popularProducts.map(injectOffer);
newArrivals = newArrivals.map(injectOffer);

        // Add ratings to all product arrays
        featuredProducts = await addRatingsToProducts(featuredProducts);
        popularProducts = await addRatingsToProducts(popularProducts);
        newArrivals = await addRatingsToProducts(newArrivals);
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
                    pass: process.env.NODEMAILER_PASSWORD // no spaces in password
                }
            });
    
            const info = await transporter.sendMail({
                from: process.env.NODEMAILER_EMAIL,
                to: email,
                subject: "Verify your account",
                text: `Your OTP is ${otp}`,
                html: `<b>Your OTP: ${otp}</b>`
            });
    
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
        const { name, email, phone, password, confirmpassword, referralCode } = req.body;
        const trimmedName = name ? name.trim() : '';
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPhone = phone ? phone.trim() : '';
        const trimmedReferralCode = referralCode ? referralCode.trim() : '';

        // Validate all required fields
        if (!trimmedName || !trimmedEmail || !trimmedPhone || !password || !confirmpassword) {
            return res.render('signup', {message: messages.ALL_FIELDS_REQUIRED});
        }

        const namePattern = /^[A-Za-z\s]+$/;
        if (!namePattern.test(trimmedName)) {
            return res.render('signup', { message: 'Name can only contain alphabets and spaces' });
        }

        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailPattern.test(trimmedEmail)) {
            return res.render('signup', { message: 'Enter a valid email address' });
        }

        const phonePattern = /^[6-9]\d{9}$/;
        if (!/^\d+$/.test(trimmedPhone)) {
            return res.render('signup', { message: 'Phone number must contain only digits' });
        }
        if (trimmedPhone.length !== 10) {
            return res.render('signup', { message: 'Phone number must be exactly 10 digits' });
        }
        if (!phonePattern.test(trimmedPhone)) {
            return res.render('signup', { message: 'Phone number must start with 6, 7, 8, or 9' });
        }

        if(password !== confirmpassword) {
            return res.render('signup', {message: messages.PASSWORD_MISMATCH});
        }

        // Check if email already exists
        const findUserByEmail = await User.findOne({ email: trimmedEmail });
        if(findUserByEmail) {
            return res.render('signup', {message: messages.USER_ALREADY_EXISTS});
        }

        // Check if phone already exists
        const findUserByPhone = await User.findOne({ phone: trimmedPhone });
        if(findUserByPhone) {
            return res.render('signup', {message: messages.PHONE_ALREADY_EXISTS});
        }

        //Find referral if code provided
        let referredBy = null;
        if (trimmedReferralCode) {
            const referrer = await User.findOne({
                referralCode: trimmedReferralCode.toUpperCase()
            });
            if(referrer) {
                referredBy = referrer._id;
            }else{

            }
        }
    
        // Generate and send OTP
        const otp = generateOtp();
        const emailSend = await sendVerficationEmail(trimmedEmail, otp);

        if(!emailSend) {
            return res.render('signup', {message: messages.ERROR_SENDING_EMAIL});
        }

        // Store OTP and user data in session
        req.session.userOtp = otp;
        req.session.userOtpExpires = Date.now() + 2 * 60 * 1000;
        req.session.userData = { name: trimmedName, phone: trimmedPhone, email: trimmedEmail, password, referredBy };

       

        return res.render("verify-otp", { timer: 120, otpLength: 6 });

    } catch(error) {
        console.error("Signup error:", error);
        return res.render('signup', {message: "An error occurred during signup"});
    }
}




const verifyOtp = async (req,res) => {
    try {
        const { otp } = req.body;

        // Check if session data exists
        if(!req.session.userOtp || !req.session.userData) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.SESSION_EXPIRED
            });
        }

        if (!req.session.userOtpExpires || req.session.userOtpExpires < Date.now()) {
            req.session.userOtp = null;
            req.session.userOtpExpires = null;
            req.session.userData = null;
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.OTP_EXPIRED
            });
        }
        
        if(otp === req.session.userOtp) {
            const user = req.session.userData;

            // Check if email already exists (race condition check)
            const existingEmail = await User.findOne({ email: user.email });
            if (existingEmail) {
                req.session.userOtp = null;
                req.session.userData = null;
                return res.status(statusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "Email already registered"
                });
            }

            // Check if phone already exists (race condition check)
            const existingPhone = await User.findOne({ phone: user.phone });
            if (existingPhone) {
                req.session.userOtp = null;
                req.session.userData = null;
                return res.status(statusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "Phone number already registered"
                });
            }

            const passwordHash = await securepassword(user.password);

           
            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                referredBy: user.referredBy|| null
            });

            await saveUserData.save();

            // Clear session immediately after successful user creation
            req.session.userOtp = null;
            req.session.userOtpExpires = null;
            req.session.userData = null;

            //referal reward 
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

                
          saveUserData.referralRewardClaimed = true;
          await saveUserData.save();

          
          referrer.referralCount = (referrer.referralCount || 0) + 1;
          referrer.referralEarnings = (referrer.referralEarnings || 0) + referrerReward;
          await referrer.save();

            }
        }

            

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

        // Clear session on error
        req.session.userOtp = null;
        req.session.userData = null;

        // Handle MongoDB E11000 duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            const message = field === 'phone' ? 'Phone number already registered' : 'Email already registered';
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: message
            });
        }

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

        if (req.session.userOtpExpires && req.session.userOtpExpires < Date.now()) {
            req.session.userOtp = null;
            req.session.userOtpExpires = null;
            req.session.userData = null;
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.OTP_EXPIRED
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
        req.session.userOtpExpires = Date.now() + 2 * 60 * 1000;
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

        const errorKey = req.query.error;
        const loginError = errorKey === 'blocked'
            ? messages.ACCOUNT_BLOCKED
            : errorKey || '';

        res.render('login', { loginError });
    } catch (error) {
        console.error('Load Login Error:', error);
        res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.SERVER_ERROR });
    }
};



const login = async (req, res) => {
    const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    const handleError = (status, message) => {
        if (isJsonRequest) {
            return res.status(status).json({ success: false, message });
        }
        return res.status(status).render('login', { loginError: message });
    };

    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return handleError(statusCodes.UNAUTHORIZED, messages.INVALID_CREDENTIALS);
        }

        if (user.isBlocked) {
            if (isJsonRequest) {
                return res.status(statusCodes.FORBIDDEN).json({
                    success: false,
                    message: messages.ACCOUNT_BLOCKED
                });
            }
            return res.redirect('/login?error=blocked');
        }

        if (!user.password) {
            return handleError(statusCodes.UNAUTHORIZED, messages.GOOGLE_ACCOUNT);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return handleError(statusCodes.UNAUTHORIZED, messages.INVALID_CREDENTIALS);
        }

        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            isBlocked: false
        };

        if (isJsonRequest) {
            return res.json({ success: true, redirectUrl: '/' });
        }
        return res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        if (isJsonRequest) {
            return res.status(statusCodes.INTERNAL_ERROR).json({
                success: false,
                message: messages.LOGIN_ERROR
            });
        }
        return res.status(statusCodes.INTERNAL_ERROR).render('login', { loginError: messages.LOGIN_ERROR });
    }
};




const logout = async (req, res) => {
  try {
   if (!req.session) return res.redirect('/login');

  req.session.user = null;    
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
