const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');
const logger = require('../logger');
const { getClientIp } = require('../helpers/utils');
const { loginLimiter, refreshLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');
const { JWT_SECRET } = require('../config/constants');
const { validatePasswordStrength } = require('../helpers/auth');
const { generateCsrfToken } = require('../middleware/csrf');

// Check for Supabase Secret on load
if (!process.env.SUPABASE_JWT_SECRET) {
  logger.warn('WARNING: SUPABASE_JWT_SECRET is missing in environment variables. Supabase tokens will not be generated.');
}

const isDev = process.env.NODE_ENV === 'development';

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication management
 */

/**
 * @swagger
 * /auth/csrf-token:
 *   get:
 *     summary: Get CSRF token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 */
// CSRF Token endpoint
router.get('/auth/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ token });
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user (Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, user, viewer]
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Invalid input or user exists
 *       403:
 *         description: Forbidden (Non-admin)
 */
// Registration endpoint (administrators only)
router.post('/register', authenticateToken, (req, res) => {
  const { username, password, role } = req.body;

  const rawRole = String(req.user.role || '').trim().toLowerCase();
  const isAdmin = rawRole === 'administrator';
  if (!isAdmin) {
    return res.status(403).json({ message: 'Only administrators can add new users' });
  }

  if (!username || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  db.get('SELECT password_min_length, require_special_chars, require_numbers FROM app_config WHERE id = 1', [], (cfgErr, cfg) => {
    if (cfgErr) {
      logger.error('Error loading security config', { error: cfgErr.message });
    }
    const defaultBlacklist = ['password', '123456', 'qwerty', 'admin'];
    const policy = {
      passwordMinLength: Number(cfg?.password_min_length || 8),
      requireSpecialChars: !!cfg?.require_special_chars,
      requireNumbers: !!cfg?.require_numbers,
      requireUppercase: !!cfg?.require_uppercase,
      requireLowercase: !!cfg?.require_lowercase,
      blacklist: (() => {
        try {
          const parsed = cfg?.password_blacklist ? JSON.parse(cfg.password_blacklist) : null;
          if (!Array.isArray(parsed)) return defaultBlacklist;
          const cleaned = parsed.map(v => String(v || '').trim()).filter(Boolean);
          const unique = [...new Set(cleaned)];
          return unique.length ? unique : defaultBlacklist;
        } catch (_) {
          return defaultBlacklist;
        }
      })()
    };
    const check = validatePasswordStrength(password, policy);
    if (!check.ok) {
      return res.status(400).json({ message: check.message });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
      [username, hashedPassword, role], 
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ message: 'User with this username already exists' });
          }
          return res.status(500).json({ message: 'Server error' });
        }
        try {
          db.run('INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)', [this.lastID, hashedPassword]);
        } catch (_) {}
        res.status(201).json({ message: 'User registered successfully', id: this.lastID });
      });
  });
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 full_name:
 *                   type: string
 *                 role:
 *                   type: string
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing credentials
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many attempts
 */
// Login endpoint
router.post('/login', loginLimiter, (req, res) => {
  logger.info('Login attempt', { ip: getClientIp(req), username: req.body.username });
  
  const { username, password } = req.body;

  if (!username || !password) {
    logger.warn('Missing username or password');
    return res.status(400).json({ message: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      logger.error('Database error during login', { error: err?.message || err });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }

    if (!user) {
      logger.warn('User not found', { username });
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    db.get('SELECT session_timeout_minutes, max_login_attempts, lockout_duration_minutes FROM app_config WHERE id = 1', [], (cfgErr, cfg) => {
      if (cfgErr) {
        logger.error('Error loading security config', { error: cfgErr.message });
      }
      const sessionTimeout = Number(cfg?.session_timeout_minutes || 30);
      const maxAttempts = Number(cfg?.max_login_attempts || 5);
      const lockoutMinutes = Number(cfg?.lockout_duration_minutes || 15);
      const now = new Date();
      const lu = user.lockout_until ? new Date(user.lockout_until) : null;
      if (lu && !isNaN(lu.getTime()) && lu > now) {
        const minsLeft = Math.ceil((lu - now) / 60000);
        return res.status(429).json({ message: `Konto zablokowane. Spróbuj ponownie za ${minsLeft} minut.` });
      }
      const passwordIsValid = bcrypt.compareSync(password, user.password);
      logger.info('Password valid check', { isValid: passwordIsValid, username });
      if (!passwordIsValid) {
        const nextAttempts = Number(user.failed_login_attempts || 0) + 1;
        if (nextAttempts >= maxAttempts) {
          const until = new Date(Date.now() + lockoutMinutes * 60000).toISOString();
          db.run('UPDATE users SET failed_login_attempts = 0, lockout_until = ?, updated_at = datetime("now") WHERE id = ?', [until, user.id]);
        } else {
          db.run('UPDATE users SET failed_login_attempts = ?, updated_at = datetime("now") WHERE id = ?', [nextAttempts, user.id]);
        }
        return res.status(401).json({ message: 'Invalid username or password' });
      }
      db.run('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, updated_at = datetime("now") WHERE id = ?', [user.id]);
      
      // Generate standard JWT
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: `${sessionTimeout}m` }
      );

      // Generate Supabase JWT if secret is available
      let supabaseToken = null;
      if (process.env.SUPABASE_JWT_SECRET) {
        try {
            logger.info('Generowanie tokenu Supabase dla użytkownika', { username: user.username, role: user.role });
            // Use auth_user_id (UUID) if available, otherwise fallback to id (might fail RLS if not UUID)
            const sub = user.auth_user_id || String(user.id);
    
            supabaseToken = jwt.sign({
              role: 'authenticated',
              sub: sub,
              aud: 'authenticated',
              exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24h
              user_metadata: { 
                username: user.username,
                full_name: user.full_name,
                role: user.role
              }
            }, process.env.SUPABASE_JWT_SECRET);
        } catch (tokenErr) {
            logger.error('Błąd generowania tokenu Supabase', { error: tokenErr.message });
            // Don't crash login, just continue without supabase token
            supabaseToken = null;
        }
      } else {
        logger.warn('BRAK ZMIENNEJ SUPABASE_JWT_SECRET - Token Supabase nie został wygenerowany!', { 
           env_keys: Object.keys(process.env).filter(k => k.includes('SUPABASE')) 
        });
      }

      db.get('SELECT COUNT(*) AS cnt FROM user_password_history WHERE user_id = ?', [user.id], (hErr, hRow) => {
        if (!hErr && Number(hRow?.cnt || 0) === 0) {
          try {
            db.run('INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)', [user.id, user.password]);
          } catch (_) {}
        }
      });
      const finalizeLogin = () => {
        const minSec = (process.env.NODE_ENV === 'development' ? 1800 : 60);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: Math.max(minSec, sessionTimeout * 60) });
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const refreshExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
        db.run('INSERT INTO user_refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, refreshToken, refreshExpiresAt], (rtErr) => {
          if (rtErr) {
            logger.error('Error creating refresh token', { error: rtErr.message });
          }
          logger.info('Login successful for user', { username });
          // Always use 'lax' for better compatibility with port separation (3000/3001)
          const sameSite = 'lax';
          // Force secure to false on localhost/HTTP to ensure cookie is set
          const isLocalhost = String(req.headers.host || '').includes('localhost') || String(req.headers.host || '').includes('127.0.0.1');
          const secure = isLocalhost ? false : !!(req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.HTTPS === 'true');
          const cookieOptions = { httpOnly: true, sameSite, secure, path: '/' };
          try { res.cookie('refresh_token', refreshToken, cookieOptions); } catch (_) { /* noop */ }
          res.status(200).json({ id: user.id, username: user.username, full_name: user.full_name, first_name: user.first_name || null, last_name: user.last_name || null, email: user.email || null, brand_number: user.brand_number || null, role: user.role, token: token, supabase_token: supabaseToken });
        });
      };
      const isEmployeeRole = String(user.role || '').trim().toLowerCase() === 'employee';
      if (isEmployeeRole) {
        db.get('SELECT status FROM employees WHERE login = ?', [user.username], (empErr, empRow) => {
          if (empErr) {
            return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', empErr?.message);
          }
          const s = String(empRow?.status || '').trim().toLowerCase();
          if (s === 'suspended') {
            return res.status(403).json({ message: 'Twoje konto jest zawieszone. Skontaktuj się ze swoim pracodawcą.' });
          }
          return finalizeLogin();
        });
      } else {
        finalizeLogin();
      }
    });
  });
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing refresh token
 *       401:
 *         description: Invalid or expired refresh token
 */
// Refresh access token
router.post('/auth/refresh', refreshLimiter, (req, res) => {
  const parseCookie = (raw) => {
    try {
      const out = {}; if (!raw) return out;
      String(raw).split(';').forEach(pair => { const [k, v] = String(pair).trim().split('='); if (k) out[k] = decodeURIComponent(v || ''); });
      return out;
    } catch (_) { return {}; }
  };
  const cookies = parseCookie(req.headers.cookie || '');
  const cookieRefresh = cookies.refresh_token;
  const bodyRefresh = (req.body && req.body.refresh_token) ? String(req.body.refresh_token).trim() : '';
  
  // DEBUG LOGGING
  if (!cookieRefresh && !bodyRefresh) {
    logger.warn('Refresh attempt failed: No token found', { 
      hasCookie: !!req.headers.cookie,
      cookiesKeys: Object.keys(cookies),
      hasBodyToken: !!bodyRefresh,
      origin: req.headers.origin
    });
  }

  const refresh_token = cookieRefresh || bodyRefresh;
  if (!refresh_token) {
    return res.status(400).json({ message: 'Missing refresh_token' });
  }
  db.get('SELECT user_id, expires_at FROM user_refresh_tokens WHERE token = ?', [refresh_token], (err, row) => {
    if (err) {
      logger.error('Error fetching refresh token:', { error: err.message });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    if (!row) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    const exp = new Date(row.expires_at);
    if (isNaN(exp.getTime()) || exp < new Date()) {
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    db.get('SELECT id, username, role FROM users WHERE id = ?', [row.user_id], (uErr, user) => {
      if (uErr) {
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', uErr?.message);
      }
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      db.get('SELECT session_timeout_minutes FROM app_config WHERE id = 1', [], (cfgErr, cfg) => {
        const sessionTimeout = cfgErr ? 30 : Number(cfg?.session_timeout_minutes || 30);
        const minSec = (process.env.NODE_ENV === 'development' ? 1800 : 60);
        const access = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: Math.max(minSec, sessionTimeout * 60) });
        const newRefresh = crypto.randomBytes(32).toString('hex');
        const newExpires = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
        db.run('UPDATE user_refresh_tokens SET token = ?, expires_at = ?, updated_at = datetime("now") WHERE token = ?', [newRefresh, newExpires, refresh_token], (updErr) => {
          if (updErr) {
            logger.error('Error rotating refresh token:', { error: updErr.message });
          }
          // Always use 'lax' for better compatibility with port separation (3000/3001)
          const sameSite = 'lax';
          // Force secure to false on localhost/HTTP
          const isLocalhost = String(req.headers.host || '').includes('localhost') || String(req.headers.host || '').includes('127.0.0.1');
          const secure = isLocalhost ? false : !!(req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.HTTPS === 'true');
          const cookieOptions = { httpOnly: true, sameSite, secure, path: '/' };
          try { res.cookie('refresh_token', newRefresh, cookieOptions); } catch (_) { /* noop */ }
          
          // Generate Supabase JWT if secret is available (same as login)
          let supabaseToken = null;
          if (process.env.SUPABASE_JWT_SECRET) {
            try {
                // Use auth_user_id (UUID) if available, otherwise fallback to id
                const sub = user.auth_user_id || String(user.id);
        
                supabaseToken = jwt.sign({
                  role: 'authenticated',
                  sub: sub,
                  aud: 'authenticated',
                  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24h
                  user_metadata: { 
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role
                  }
                }, process.env.SUPABASE_JWT_SECRET);
            } catch (tokenErr) {
                logger.error('Błąd generowania tokenu Supabase przy odświeżaniu', { error: tokenErr.message });
                supabaseToken = null;
            }
          }

          return res.json({ token: access, supabase_token: supabaseToken });
        });
      });
    });
  });
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
// Logout
router.post('/auth/logout', authenticateToken, (req, res) => {
  const uid = req.user.id;
  db.run('DELETE FROM user_refresh_tokens WHERE user_id = ?', [uid], function(err) {
    if (err) {
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    // Always use 'lax' for better compatibility with port separation (3000/3001)
    const sameSite = 'lax';
    // Force secure to false on localhost/HTTP
    const isLocalhost = String(req.headers.host || '').includes('localhost') || String(req.headers.host || '').includes('127.0.0.1');
    const secure = isLocalhost ? false : !!(req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.HTTPS === 'true');
    const cookieOptions = { httpOnly: true, sameSite, secure, path: '/' };
    try { res.clearCookie('refresh_token', cookieOptions); } catch (_) { /* noop */ }
    res.json({ status: 'ok', revoked: this.changes || 0 });
  });
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
// Get current user
router.get('/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, full_name, first_name, last_name, email, brand_number, role FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  });
});

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Initiate Google OAuth login
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get('/auth/google', (req, res, next) => {
  // Check if strategy is available (simplified check)
  // We rely on passport to throw/error if not found, caught by global handler
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  })(req, res, next);
});

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to frontend with token
 */
router.get('/auth/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=auth_failed' }),
  (req, res) => {
    // Successful authentication
    const user = req.user;
    
    // Generate JWT
    db.get('SELECT session_timeout_minutes FROM app_config WHERE id = 1', [], (cfgErr, cfg) => {
        const sessionTimeout = cfgErr ? 30 : Number(cfg?.session_timeout_minutes || 30);
        const minSec = (process.env.NODE_ENV === 'development' ? 1800 : 60);
        const expiresIn = Math.max(minSec, sessionTimeout * 60);
        
        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          JWT_SECRET,
          { expiresIn }
        );

        // Generate Refresh Token
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();

        db.run('INSERT INTO user_refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', 
          [user.id, refreshToken, expiresAt], 
          (err) => {
            if (err) {
              logger.error('Error saving refresh token after Google login:', { error: err.message });
            }

            // Set refresh cookie
            const sameSite = 'lax';
            const isLocalhost = String(req.headers.host || '').includes('localhost') || String(req.headers.host || '').includes('127.0.0.1');
            const secure = isLocalhost ? false : !!(req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.HTTPS === 'true');
            const cookieOptions = { httpOnly: true, sameSite, secure, path: '/' };
            
            try { res.cookie('refresh_token', refreshToken, cookieOptions); } catch (_) { /* noop */ }

            // Redirect to frontend
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
            res.redirect(`${frontendUrl}/login?token=${token}`);
        });
    });
  }
);

module.exports = router;
