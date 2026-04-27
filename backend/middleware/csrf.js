const crypto = require('crypto');
const logger = require('../logger');

const CSRF_COOKIE_NAME = 'x-csrf-token';

/**
 * Generate a CSRF token and set it as a cookie
 */
const generateCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  
  // Set cookie (httpOnly: true for security, secure in prod)
  // We use SameSite=Strict to prevent CSRF in most modern browsers
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.HTTPS === 'true',
    sameSite: 'Lax',
    path: '/'
  });
  
  return token;
};

/**
 * Middleware to protect against CSRF
 * Requires cookie-parser to be initialized first
 */
const csrfProtection = (req, res, next) => {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF check for login, logout, and refresh endpoints
  // These endpoints are either public or use specific tokens (refresh token in cookie/body)
  const path = req.path || req.originalUrl;
  if (path.includes('/login') || 
      path.includes('/auth/refresh') || 
      path.includes('/auth/logout')) {
    return next();
  }

  // Get token from cookie
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  
  // Get token from header
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn(`CSRF Validation Failed. Method: ${req.method}, URL: ${req.url}, IP: ${req.ip}`);
    return res.status(403).json({ 
      error: 'Invalid CSRF Token',
      code: 'CSRF_ERROR'
    });
  }

  next();
};

module.exports = {
  generateCsrfToken,
  csrfProtection,
  CSRF_COOKIE_NAME
};
