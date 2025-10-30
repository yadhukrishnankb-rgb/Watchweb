const express = require("express")
const router = express.Router();
const userController = require("../controllers/user/userController")
const passport = require("passport")//----------------
const productController = require("../controllers/user/productController")//========
const profileController = require("../controllers/user/profileController");
const {isUser,checkBlockedStatus} = require('../middlewares/auth')




router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage)
router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signup)
router.post("/verify-otp",userController.verifyOtp)
 router.post("/resend-otp",userController.resendOTP)
 router.get("/", userController.loadHomepage);
router.get('/shop', userController.listProducts);


router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);




router.get('/forgot-password', profileController.loadForgotPassword);
router.post('/forgot-password', profileController.sendForgotPasswordOtp);
router.get('/forgot-password-otp', profileController.loadForgotPasswordOtp);
router.post('/forgot-password-otp', profileController.verifyForgotPasswordOtp);
router.post('/resend-otp', profileController.resendForgotPasswordOtp);
router.get('/reset-password', profileController.loadResetPassword);
router.post('/reset-password', profileController.handleResetPassword);



router.get('/profile', profileController.profilePage);
router.get('/profile/edit', profileController.editProfilePage);
router.post('/profile/edit', profileController.updateProfile);
router.get('/profile/verify-email', profileController.verifyEmailPage);
router.post('/profile/verify-email', profileController.verifyEmailOtp);
router.get('/profile/change-password', profileController.changePasswordPage);
router.post('/profile/change-password', profileController.changePassword);
router.post('/order/:id/cancel', profileController.cancelOrder);



router.get('/product/:id', productController.getProductDetails);
// Add this route with your other routes
router.get('/search', productController.searchProducts);









router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));


router.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login'
    }),
    (req, res) => {
        res.redirect('/');
    }
);



module.exports = router;

//------------------------------------------------------------------------------------








































