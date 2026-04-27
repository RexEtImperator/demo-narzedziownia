const logger = require('../logger');
const { logSystemEvent } = require('../helpers/audit');

const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      const msg = `Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`;
      logger.warn(`[PERFORMANCE] ${msg}`);
      logSystemEvent('warn', 'PERFORMANCE', msg, { 
        method: req.method, 
        url: req.originalUrl, 
        duration,
        ip: req.ip || req.socket.remoteAddress 
      });
    }
  });
  next();
};

module.exports = performanceMonitor;
