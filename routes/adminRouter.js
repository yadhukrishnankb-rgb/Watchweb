

const express = require("express");
const router = express.Router();
const multer = require('multer');
const adminController = require("../controllers/admin/adminController");
const {userAuth,adminAuth} = require("../middlewares/auth")
const {upload, processImages} = require("../middlewares/multerConfig")
const categoryController = require('../controllers/admin/categoryController');
const customerController = require("../controllers/admin/customerController")
const productController = require('../controllers/admin/productController')
const isAdmin = (req, res, next) => {
    if(req.session.admin) {
        next();
    } else {
        res.redirect("/admin/login");
    }
};

router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", isAdmin, adminController.loadDashboard);
router.get("/logout",isAdmin,adminController.logout)



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
router.post('/products', isAdmin, upload, processImages, productController.addProduct);
router.put('/products/:id', isAdmin, upload, processImages, productController.editProduct);
router.delete('/products/:id', isAdmin, productController.deleteProduct);
router.get('/products/:id', isAdmin, productController.getProductById);
// Add these new routes while keeping existing routes
router.put('/products/:id/block', adminAuth, productController.blockProduct);
router.put('/products/:id/unblock', adminAuth, productController.unblockProduct);
router.delete('/products/:id/delete', adminAuth, productController.deleteProduct);

module.exports = router;