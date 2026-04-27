const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(tools)", (err, columns) => {
        if (err) return reject(err);
        const columnNames = columns.map(col => col.name);
        if (!columnNames.includes('production_date')) {
          db.run('ALTER TABLE tools ADD COLUMN production_date TEXT', (err) => {
            if (err) {
              logger.error('Error adding production_date column', { error: err.message });
              reject(err);
            } else {
              logger.info('Added production_date column to tools');
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  }
};
