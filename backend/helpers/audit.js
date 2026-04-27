const db = require('../database/db');
const logger = require('../logger');

const logSystemEvent = (level, category, message, details = {}) => {
  const detailsStr = JSON.stringify(details);
  db.run('INSERT INTO system_logs (level, category, message, details) VALUES (?, ?, ?, ?)',
    [level, category, message, detailsStr],
    (err) => {
      if (err) logger.error('Error writing to system_logs', { error: err.message });
    }
  );
};

module.exports = { logSystemEvent };
