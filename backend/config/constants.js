const path = require('path');
// Try to load .env from backend folder first, then fallback to root
const envPathBackend = path.join(__dirname, '../.env');
const envPathRoot = path.join(__dirname, '../../.env');
require('dotenv').config({ path: require('fs').existsSync(envPathBackend) ? envPathBackend : envPathRoot });

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET,
  ROOT_DIR: path.resolve(__dirname, '../../'),
  START_DELAY_MS: Number(process.env.RESTART_DELAY || 0),
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.ethereal.email',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@narzedziownia.local',
};
