const express = require("express")
const router = express.Router();
const userController = require("../controllers/user/userController")
const passport = require("passport")//----------------
const productController = require("../controllers/user/productController")//========
const {isUser,checkBlockedStatus} = require('../middlewares/auth')
router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage)
router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signup)
router.post("/verify-otp",userController.verifyOtp)
 router.post("/resend-otp",userController.resendOTP)
 


router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);



// router.get('/products', productController.listProducts);

// router.get('/forgot-password', userController.getForgotPasswordPage);
// router.post('/forgot-password', userController.forgotPassword);

//---------------------------------------------
// router.get('/shop', productController.listProducts);
// router.get('/products/:id', productController.getProductDetails);
// router.get('/category/:id', productController.getProductsByCategory);

// Search and filter routes
// router.get('/products/search', productController.listProducts);  // Reuse listProducts with search params
// router.get('/products/filter', productController.listProducts);  // Reuse listProducts with filter params


// router.get('/products/featured', productController.getFeaturedProducts);



//--------------------




router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));


router.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/signup'
    }),
    (req, res) => {
        res.redirect('/');
    }
);



module.exports = router;

//------------------------------------------------------------------------------------








































