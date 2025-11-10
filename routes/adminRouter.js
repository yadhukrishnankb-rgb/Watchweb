

const express = require("express");
const router = express.Router();
const multer = require('multer');
const adminController = require("../controllers/admin/adminController");
const {userAuth,adminAuth} = require("../middlewares/auth")
const {upload, processImages} = require("../middlewares/multerConfig")

const categoryController = require('../controllers/admin/categoryController');
const customerController = require("../controllers/admin/customerController")
const productController = require('../controllers/admin/productController')
const orderController = require('../controllers/admin/orderController')
const inventoryController = require('../controllers/admin/inventoryController')


const isAdmin = (req, res, next) => {
    if(req.session.admin) {
        next();
    } else {
        res.redirect("/admin/login");
    }
};

// const isAdmin = (req, res, next) => {
//     if (req.session.admin) {
//         next();
//     } else {
//         // Check if it's an API request
//         if (req.xhr || req.headers.accept?.includes('application/json')) {
//             res.status(401).json({
//                 success: false,
//                 message: 'Session expired or unauthorized. Please login again.'
//             });
//         } else {
//             res.redirect("/admin/login");
//         }
//     }
// };







router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", isAdmin, adminController.loadDashboard);
router.post("/logout",isAdmin,adminController.logout)
router.get("/logout", isAdmin, adminController.logout);




//user management routes
router.get('/customers',isAdmin,customerController.getCustomers);
router.post('/customers/search',isAdmin, customerController.searchCustomers);
router.post('/customers/block/:id',isAdmin,customerController.blockCustomer);
router.post('/customers/unblock/:id',isAdmin, customerController.unblockCustomer);


//category management routes
router.get('/categories', isAdmin, categoryController.getCategories);
router.post('/categories', isAdmin, categoryController.addCategory);
router.put('/categories/:id', isAdmin, categoryController.editCategory);
router.delete('/categories/:id', isAdmin, categoryController.deleteCategory);


// Product Management Routes
router.get('/products', isAdmin, productController.getProducts);
// router.post('/products', isAdmin, upload, processImages, productController.addProduct);
router.put('/products/:id', isAdmin, upload, processImages, productController.editProduct);
router.delete('/products/:id', isAdmin, productController.deleteProduct);
router.get('/products/:id', isAdmin, productController.getProductById);
// Add these new routes while keeping existing routes
// router.put('/products/:id/block', adminAuth, productController.blockProduct);
// router.put('/products/:id/unblock', adminAuth, productController.unblockProduct);
router.patch('/products/:id/block', isAdmin, productController.blockProduct);
router.patch('/products/:id/unblock', isAdmin, productController.unblockProduct);


//------------
router.post('/products', isAdmin, upload, productController.addProduct);

//  router.post('/admin/products', adminAuth, upload, /*processImages (no-op)*/ productController.addProduct);
//  router.put('/admin/products/:id', adminAuth, upload, productController.editProduct);
// //-----------




router.get('/orders', isAdmin, orderController.getOrders);
router.get('/orders/:id', isAdmin, orderController.getOrderDetails);
router.patch('/orders/:id/status', isAdmin, orderController.updateOrderStatus);

router.get('/inventory', isAdmin, inventoryController.getInventory);
router.patch('/inventory/:id/stock', isAdmin, inventoryController.updateStock);

module.exports = router;