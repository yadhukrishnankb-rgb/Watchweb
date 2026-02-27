

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
const couponController = require('../controllers/admin/couponController')

// Auth routes
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.post("/logout", adminAuth, adminController.logout);
router.get("/logout", adminAuth, adminController.logout);

// User management routes
router.get('/customers', adminAuth, customerController.getCustomers);
router.post('/customers/search', adminAuth, customerController.searchCustomers);
router.post('/customers/block/:id', adminAuth, customerController.blockCustomer);
router.post('/customers/unblock/:id', adminAuth, customerController.unblockCustomer);

// Category management routes
router.get('/categories', adminAuth, categoryController.getCategories);
router.post('/categories', adminAuth, categoryController.addCategory);
router.put('/categories/:id', adminAuth, categoryController.editCategory);
router.delete('/categories/:id', adminAuth, categoryController.deleteCategory);

// Product management routes
router.get('/products', adminAuth, productController.getProducts);
router.post('/products', adminAuth, upload, productController.addProduct);
router.put('/products/:id', adminAuth, upload, processImages, productController.editProduct);
router.delete('/products/:id', adminAuth, productController.deleteProduct);
router.get('/products/:id', adminAuth, productController.getProductById);
router.patch('/products/:id/block', adminAuth, productController.blockProduct);
router.patch('/products/:id/unblock', adminAuth, productController.unblockProduct);

// Orders & Requests
router.get('/orders', adminAuth, orderController.getOrders);
router.get('/orders/:id', adminAuth, orderController.getOrderDetails);
router.patch('/orders/:id/status', adminAuth, orderController.updateOrderStatus);
router.get('/requests', adminAuth, orderController.getRequests);
router.post('/orders/:orderId/items/:itemId/approve', adminAuth, orderController.approveRequest);

// Inventory
router.get('/inventory', adminAuth, inventoryController.getInventory);
router.patch('/inventory/:id/stock', adminAuth, inventoryController.updateStock);


// Coupon management routes
router.get('/coupons', adminAuth, couponController.getCoupons);
router.post('/coupons', adminAuth, couponController.createCoupon);
router.post('/coupons/:id', adminAuth, couponController.editCoupon);
router.delete('/coupons/:id', adminAuth, couponController.deleteCoupon);
router.patch('/coupons/:id/toggle', adminAuth, couponController.toggleCoupon);
module.exports = router;