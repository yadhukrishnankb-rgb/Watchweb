
const express = require("express");
const app = express();
const path = require("path");
require("dotenv").config();
process.noDeprecation = true;
const session = require("express-session");
const flash = require('connect-flash');


let MongoStore;
try {
    MongoStore = require('connect-mongo');
} catch (err) {
    console.warn('connect-mongo not installed — using MemoryStore. Run `npm i connect-mongo` to enable persistent sessions.');
    MongoStore = null;
}


const passport = require("passport"); // Changed from local path to package
 


const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require('./routes/adminRouter');
const Cart = require('./models/cartSchema');
const Wishlist = require('./models/wishlistSchema');

// Initialize database
db();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));




// --- SESSION (single configuration, persisted to MongoDB) ---
app.set('trust proxy', 1); // if behind proxy (Heroku/nginx) — keep if needed


// create store (MongoStore if available, otherwise MemoryStore)
const store = MongoStore
  ? MongoStore.create({
      mongoUrl: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/project',
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60
    })
  : new session.MemoryStore();





app.use(session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    store,
    rolling: true, // refresh cookie expiration on activity
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // set true in production with HTTPS
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
}));



// Passport initialization
require("./config/passport"); // Add passport config
app.use(passport.initialize());
app.use(passport.session());

// Cache control
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); // Fixed casing
    next();
});
// Use flash for one-time messages
app.use(flash());

// Populate template-local `user` so EJS views (header etc.) can access
// the logged-in user whether using session-based auth or Passport (OAuth).
app.use((req, res, next) => {
    res.locals.user = req.session && req.session.user ? req.session.user : (req.user || null);
    next();
});

// Populate cart and wishlist counts for the header badges
app.use(async (req, res, next) => {
    try {
        const user = req.session && req.session.user ? req.session.user : (req.user || null);
        if (!user || !user._id) {
            res.locals.cartCount = 0;
            res.locals.wishlistCount = 0;
            return next();
        }

        const userId = user._id;
        const cart = await Cart.findOne({ userId }).select('items').lean();
        const wishlist = await Wishlist.findOne({ userId }).select('products').lean();

        res.locals.cartCount = (cart && Array.isArray(cart.items)) ? cart.items.length : 0;
        res.locals.wishlistCount = (wishlist && Array.isArray(wishlist.products)) ? wishlist.products.length : 0;
        return next();
    } catch (err) {
        res.locals.cartCount = res.locals.cartCount || 0;
        res.locals.wishlistCount = res.locals.wishlistCount || 0;
        return next();
    }
});




// View engine setup
app.set("view engine", "ejs");
app.set("views", [
    path.join(__dirname, 'views'),
    path.join(__dirname, 'views/user'),
    path.join(__dirname, 'views/admin')
]);
app.use(express.static(path.join(__dirname, "public")));




// Routes
app.use("/", userRouter);
 app.use("/admin",adminRouter);

// Server setup
const PORT = process.env.PORT || 3000; // Fixed port configuration
app.listen(PORT, () => {
    console.log(`Server Running on port ${PORT}`);
});

module.exports = app;










