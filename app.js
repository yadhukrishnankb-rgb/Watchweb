


const express = require("express");
const app = express();
const path = require("path");
require("dotenv").config();
const session = require("express-session");
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

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Changed from true to false for better security
    cookie: { // Fixed typo from cookies to cookie
        secure: process.env.NODE_ENV === 'production', // Make secure in production
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
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





//------------------------------------------------------------------------------------------

// Add after your session middleware
// app.use((req, res, next) => {
//     res.locals.user = req.session.user;
//     next();
// });



