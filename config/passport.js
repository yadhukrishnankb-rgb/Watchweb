
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');

// passport.use(new GoogleStrategy({
//     clientID: process.env.GOOGLE_CLIENT_ID,
//     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     callbackURL: "/auth/google/callback"
//   },
//   async (accessToken, refreshToken, profile, done) => {
//     try {
//       // Find or create user
//       let user = await User.findOne({ googleId: profile.id });
//       if (!user) {
//         user = await User.create({
//           name: profile.displayName,
//           email: profile.emails[0].value,
//           googleId: profile.id
//         });
//       }
//       return done(null, user);
//     } catch (err) {
//       return done(err, null);
//     }
//   }
// ));

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;

      // 🔍 1. Find user by email (IMPORTANT)
      let user = await User.findOne({ email });

      if (user) {
        // 🔗 2. If user exists but googleId not linked
        if (!user.googleId) {
          user.googleId = profile.id;
          await user.save();
        }
      } else {
        // 🆕 3. Create new Google user
        user = await User.create({
          name: profile.displayName,
          email,
          googleId: profile.id,
          password: null // Explicitly mark Google user
        });
      }

      return done(null, user);
    } catch (error) {
      console.error("Google Auth Error:", error);
      return done(error, null);
    }
  }
));


// Serialize and deserialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

