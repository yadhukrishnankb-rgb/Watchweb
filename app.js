
const express = require("express");
const app = express();
const path = require("path");
require("dotenv").config();
const session = require("express-session");


let MongoStore;
try {
    MongoStore = require('connect-mongo');
} catch (err) {
    console.warn('connect-mongo not installed — using MemoryStore. Run `npm i connect-mongo` to enable persistent sessions.');
    MongoStore = null;
}


const passport = require("passport"); // Changed from local path to package
 



const flash = require('connect-flash');


const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require('./routes/adminRouter');

// Initialize database
db();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));




//-----------------------------------------
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
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/project',
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // set true in production with HTTPS
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
}));

//------------------------------------------------------------------------

// Passport initialization
require("./config/passport"); // Add passport config
app.use(passport.initialize());
app.use(passport.session());

// Cache control
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); // Fixed casing
    next();
});

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));
app.use(flash());



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










