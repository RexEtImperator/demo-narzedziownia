const rateLimit = require('express-rate-limit');
const { getClientIp } = require('../helpers/utils');

const isLocalhost = (req) => {
  const ip = getClientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '192.168.10.99';
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => getClientIp(req),
  skip: isLocalhost, // Whitelist localhost
  validate: { trustProxy: false }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: isLocalhost, // Whitelist localhost
  validate: { trustProxy: false }
});

const mutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: isLocalhost, // Whitelist localhost
  validate: { trustProxy: false }
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 import requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many import requests, please try again later.' },
  skip: isLocalhost, // Whitelist localhost
  validate: { trustProxy: false }
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Limit each IP to 2000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
  message: { error: 'Too many requests, please try again later.' }
});

module.exports = {
  loginLimiter,
  refreshLimiter,
  mutateLimiter,
  globalLimiter,
  importLimiter
};
