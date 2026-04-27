const logger = require('../logger');
const { logSystemEvent } = require('../helpers/audit');

const responseHandler = (req, res, next) => {
  res.sendError = (status, code, messageKey, fallbackMessage, details) => {
    const s = status || 500;
    if (s >= 500) {
      logger.error('ServerError', { code, messageKey, fallbackMessage, details, url: req.originalUrl, method: req.method, ip: req.ip });
      logSystemEvent('error', 'SYSTEM', fallbackMessage || 'Server Error', { code, details, url: req.originalUrl });
    } else {
      logger.warn('ClientError', { status: s, code, messageKey, fallbackMessage, details, url: req.originalUrl, method: req.method, ip: req.ip });
      // Optionally log 4xx errors if they are critical, e.g. permission denied
      if (code === 'PERMISSION_DENIED') {
        logSystemEvent('warn', 'AUTH', 'Permission denied', { user: req.user?.username, url: req.originalUrl });
      }
    }
    const payload = { error: fallbackMessage || 'Server error', code: code || 'INTERNAL_SERVER_ERROR', messageKey: messageKey || 'errors.server' };
    if (details) payload.details = details;
    return res.status(s).json(payload);
  };
  next();
};

module.exports = { responseHandler };
