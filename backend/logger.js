const winston = require('winston');
require('winston-daily-rotate-file');

const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'pass', 'pwd', 'confirmPassword'];

const sanitize = winston.format((info) => {
  const mask = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(mask);
    
    for (const key of Object.keys(obj)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        obj[key] = '***';
      } else if (typeof obj[key] === 'object') {
        mask(obj[key]);
      }
    }
    return obj;
  };
  return mask(info);
});

const transportError = new winston.transports.DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error'
});

const transportCombined = new winston.transports.DailyRotateFile({
  filename: 'logs/combined-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    sanitize(),
    winston.format.json()
  ),
  defaultMeta: { service: 'backend-service' },
  transports: [
    transportError,
    transportCombined,
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

module.exports = logger;
