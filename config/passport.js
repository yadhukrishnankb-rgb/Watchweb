// const passport = require('passport');
// const GoogleStrategy = require("passport-google-oauth20").Strategy;
// const User = require("../models/userSchema");
// // const { ProfilingLevel } = require('mongodb');
// const env = require("dotenv").config();



// passport.use(new GoogleStrategy({
//     clientId: process.env.GOOGLE_CLIENT_ID,
//     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     callbackURL: "/auth/google/callback",

// },
 
// async (accessToken, refreshToken,Profile,done)=>{

//     try{
//         let User = await User.findOne({googleId:Profile.id});
//         if(User){
//             return done(null,User);
//         }else{
//             User = new User({
//                 name:Profile.displayName,
//                 email:profile.emails[0].value,
//                 googleId:profile.id,

//             })

//             await User.save();
//             return done(null,User);
//         }
//     }catch(error){
      
//         return done(error,null)


//     }
// }

// ));


// passport.serializeUser((User,done)=>{
//     done(null,User.id)
// });

// passport.deserializeUser((id,done)=>{
//     User.findById(id)
//     .then(user=>{
//         done(null,user)
//     }).catch(err =>{
//         done(err,null)
//     })
// })


// module.exports = passport;



//-------------------------------------------------------------------------------


const passport = require('passport');
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
require("dotenv").config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID, // Changed from clientId to clientID
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => { // Changed Profile to profile
    try {
        let user = await User.findOne({ googleId: profile.id }); // Changed User to user (variable)
        if (user) {
            return done(null, user);
        } else {
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id
            });
            await user.save();
            return done(null, user);
        }
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => { // Changed User to user
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => { // Added async
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;



//----------------------------------------------------------------------------------------



