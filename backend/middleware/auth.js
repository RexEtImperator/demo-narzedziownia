const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/constants');
const logger = require('../logger');
const { getClientIp } = require('../helpers/utils');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Missing authentication token' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('JWT verification failed:', {
        error: err.message,
        name: err.name,
        ip: getClientIp(req)
      });
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
