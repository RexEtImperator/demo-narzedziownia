const db = require('../db');
const logger = require('../../logger');

module.exports = {
  up: () => {
    return new Promise((resolve, reject) => {
      db.run('ALTER TABLE users ADD COLUMN auth_user_id TEXT;', (err) => {
        if (err) {
          // Ignore if column already exists
          if (err.message.includes('duplicate column name')) {
            logger.info('Column auth_user_id already exists in users table');
            resolve();
          } else {
            logger.error('Error adding auth_user_id column to users table', { error: err.message });
            reject(err);
          }
        } else {
          logger.info('Added auth_user_id column to users table');
          resolve();
        }
      });
    });
  }
};
