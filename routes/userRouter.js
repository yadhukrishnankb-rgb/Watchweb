const express = require("express")
const router = express.Router();
const userController = require("../controllers/user/userController")
const passport = require("passport")
const productController = require("../controllers/user/productController")
const profileController = require("../controllers/user/profileController");

const cartController = require("../controllers/user/cartController")
const wishlistController = require("../controllers/user/wishlistController")

const checkoutController = require("../controllers/user/checkoutController");

const orderController = require("../controllers/user/orderController")

const { cancelOrder } = require('../controllers/user/orderController');


const { userAuth: isUser, checkBlockedStatus } = require('../middlewares/auth');

const { profileUpload } = require('../middlewares/multerConfig');



router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage)
 router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signup)
router.post("/verify-otp",userController.verifyOtp)
router.post("/resend-otp",userController.resendOTP)
router.get('/shop',productController.listProducts);



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



// === PROFILE & ADDRESS ROUTES - FINAL WORKING ORDER ===
router.delete('/profile/address/:index/delete', isUser, profileController.deleteAddress);

router.post('/profile/address', isUser, profileController.manageAddress);
router.post('/profile/address/:index/edit', isUser, profileController.manageAddress);
router.get('/profile/address', isUser, profileController.addressPage);

router.get('/profile/address/:index/default', profileController.setDefaultAddress)

router.get('/profile/edit', isUser, profileController.editProfilePage);
router.post('/profile/edit', isUser, profileController.updateProfile);
router.get('/profile/verify-email', isUser, profileController.verifyEmailPage);
router.post('/profile/verify-email', isUser, profileController.verifyEmailOtp);
router.get('/profile/change-password', isUser, profileController.changePasswordPage);
router.post('/profile/change-password', isUser, profileController.changePassword);
router.post('/order/:id/cancel', isUser, profileController.cancelOrder);

router.post('/profile/upload-picture', isUser, profileUpload, profileController.uploadProfilePicture);

// MOST GENERAL ROUTE - ABSOLUTELY LAST!
router.get('/profile', isUser, profileController.profilePage);







router.get('/product/:id', productController.getProductDetails);
// Add this route with your other routes
router.get('/search', productController.searchProducts);





// Cart Routes (Protected)
router.get('/cart', isUser, checkBlockedStatus, cartController.viewCart);
router.post('/cart/add', isUser, checkBlockedStatus, cartController.addToCart);
router.post('/cart/update', isUser, checkBlockedStatus, cartController.updateQuantity);
router.delete('/cart/remove/:productId', isUser, checkBlockedStatus, cartController.removeFromCart);

// Wishlist routes
router.get('/wishlist', isUser, (req, res, next) => {
    try { return wishlistController.viewWishlist(req, res, next); }
    catch (e) { next(e); }
});
router.post('/wishlist/add', isUser, (req, res, next) => {
    try { return wishlistController.addToWishlist(req, res, next); }
    catch (e) { next(e); }
});
router.post('/wishlist/remove', isUser, (req, res, next) => {
    try { return wishlistController.removeFromWishlist(req, res, next); }
    catch (e) { next(e); }
});



router.get('/checkout', isUser, checkBlockedStatus, checkoutController.loadCheckout);
router.post('/checkout/order-success', isUser, checkBlockedStatus, checkoutController.placeOrder);
router.post('/checkout/payment/verify', isUser,checkBlockedStatus, checkoutController.verifyPayment );
router.get('/order-success/:id', isUser, checkoutController.orderSuccess);
router.get('/order-failed/:id', isUser, (req, res) => {
  res.render('user/order-failed', { orderId: req.params.id });
});




// Individual item actions - HIGHEST PRIORITY
router.post('/orders/:orderId/items/:itemId/cancel', isUser, orderController.requestCancelItem);
router.post('/orders/:orderId/items/:itemId/return', isUser, orderController.requestReturnItem);


router.get('/orders', isUser, orderController.listOrders);

// Order-level actions
router.post('/orders/:id/cancel', isUser, orderController.cancelOrder);
router.post('/orders/:id/return', isUser, orderController.returnOrder);

// Invoice & Details - order matters!
router.get('/orders/:id/invoice', isUser, orderController.downloadInvoice);
router.get('/orders/:id', isUser, orderController.orderDetails); 





// Direct checkout (Buy Now)
router.post('/checkout/direct', isUser, checkBlockedStatus, checkoutController.directCheckout);
// Direct order (Buy Now → Place Order)
router.post('/checkout/direct-order', isUser, checkBlockedStatus, checkoutController.directPlaceOrder);
// Add address from checkout (AJAX)
router.post('/checkout/add-address', isUser, checkBlockedStatus, checkoutController.addAddressFromCheckout);




router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));


router.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login'
    }),
    (req, res) => {
        req.session.user = req.user;
        res.redirect('/');
    }
);



module.exports = router;

