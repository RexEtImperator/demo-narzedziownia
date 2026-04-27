const logger = require('../../logger');

module.exports.up = async (db) => {
  return new Promise((resolve) => {
    db.all('PRAGMA table_info(app_config)', (err, rows) => {
      if (err) {
        logger.error('Error checking app_config table info', { error: err.message });
        return resolve();
      }

      const hasMap = Array.isArray(rows) && rows.some(r => r && r.name === 'map');
      if (!hasMap) {
        db.run('ALTER TABLE app_config ADD COLUMN map INTEGER DEFAULT 0', (e2) => {
          if (e2) logger.error('Error adding map column to app_config', { error: e2.message });
          db.run('UPDATE app_config SET map = 0 WHERE map IS NULL', (e3) => {
            if (e3) logger.error('Error backfilling map column in app_config', { error: e3.message });
            resolve();
          });
        });
      } else {
        db.run('UPDATE app_config SET map = COALESCE(map, 0) WHERE id = 1', (e3) => {
          if (e3) logger.error('Error ensuring map value in app_config', { error: e3.message });
          resolve();
        });
      }
    });
  });
};
