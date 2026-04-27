const logger = require('../logger');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/constants');

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header) return null;
  const parts = String(header).split(' ');
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) return parts[1];
  return null;
};

const tryAttachUserFromToken = (req) => {
  if (req.user) return;
  const token = getBearerToken(req);
  if (!token || !JWT_SECRET) return;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload && typeof payload === 'object') {
      req.user = payload;
    }
  } catch (_) {
    return;
  }
};

const auditLogger = (req, res, next) => {
  tryAttachUserFromToken(req);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = req.user && typeof req.user === 'object' ? req.user : null;
    const userId = user?.id ?? (req.userId || 'anonymous');
    const userRole = user?.role ?? 'unknown';
    
    // Skip OPTIONS requests
    if (req.method === 'OPTIONS') return;

    // Filter sensitive data from body
    let logBody = { ...req.body };
    if (logBody.password) logBody.password = '***';
    if (logBody.newPassword) logBody.newPassword = '***';
    if (logBody.oldPassword) logBody.oldPassword = '***';
    if (logBody.token) logBody.token = '***';

    logger.info('audit', {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId,
      userRole,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(logBody).substring(0, 1000) : undefined
    });
  });
  next();
};

module.exports = { auditLogger };
