const { ERROR_CODES } = require('../config/errorCodes');

const sendDomainError = (res, code, details) => {
  const m = ERROR_CODES[code] || { status: 500, key: 'errors.server', fallback: 'Server error' };
  return res.sendError(m.status, code, m.key, m.fallback, details);
};

module.exports = { sendDomainError };
