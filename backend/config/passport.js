const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../database/db');
const logger = require('../logger');

module.exports = (app) => {
  app.use(passport.initialize());

  // Load Google Strategy
  db.get('SELECT * FROM auth_providers WHERE provider = ? AND enabled = 1', ['google'], (err, row) => {
    if (err) {
      logger.error('Error loading Google auth provider config', { error: err.message });
      return;
    }
    
    if (!row || !row.client_id || !row.client_secret) {
      logger.info('Google auth provider not configured or disabled');
      return;
    }

    try {
      passport.use(new GoogleStrategy({
          clientID: row.client_id,
          clientSecret: row.client_secret,
          callbackURL: row.redirect_uri || '/api/auth/google/callback',
          passReqToCallback: true
        },
        function(req, accessToken, refreshToken, profile, cb) {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const googleId = profile.id;

          if (!email) {
            return cb(new Error('No email found in Google profile'));
          }

          // Check if user exists with this googleId
          db.get('SELECT * FROM users WHERE auth_provider = ? AND auth_provider_id = ?', ['google', googleId], (err, user) => {
             if (err) return cb(err);
             if (user) {
               return cb(null, user);
             }

             // Check if user exists with email (link account)
             db.get('SELECT * FROM users WHERE email = ?', [email], (err, existingUser) => {
               if (err) return cb(err);
               if (existingUser) {
                 // Link account
                 db.run('UPDATE users SET auth_provider = ?, auth_provider_id = ? WHERE id = ?', ['google', googleId, existingUser.id], (err) => {
                   if (err) return cb(err);
                   return cb(null, { ...existingUser, auth_provider: 'google', auth_provider_id: googleId });
                 });
               } else {
                 // User does not exist. 
                 // Option 1: Auto-create (uncomment to enable)
                 /*
                 const username = email.split('@')[0];
                 const stmt = db.prepare('INSERT INTO users (username, email, role, auth_provider, auth_provider_id, active) VALUES (?, ?, ?, ?, ?, 1)');
                 stmt.run(username, email, 'viewer', 'google', googleId, function(err) {
                   if (err) return cb(err);
                   return cb(null, { id: this.lastID, username, email, role: 'viewer' });
                 });
                 */
                 
                 // Option 2: Reject
                 return cb(null, false, { message: 'User not found. Please contact administrator.' });
               }
             });
          });
        }
      ));
      logger.info('Google auth strategy configured');
    } catch (e) {
      logger.error('Error configuring Google strategy', { error: e.message });
    }
  });
};
