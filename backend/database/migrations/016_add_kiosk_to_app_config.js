const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.all('PRAGMA table_info(app_config)', (err, rows) => {
          if (err) return reject(err);
          const existing = (rows || []).map(r => r.name);
          if (!existing.includes('kiosk')) {
            db.run('ALTER TABLE app_config ADD COLUMN kiosk INTEGER DEFAULT 1', (e2) => {
              if (e2) logger.error('Error adding kiosk column to app_config', { error: e2.message });
              db.run('UPDATE app_config SET kiosk = 1 WHERE kiosk IS NULL', (e3) => {
                if (e3) logger.error('Error initializing kiosk column', { error: e3.message });
                resolve();
              });
            });
          } else {
            db.run('UPDATE app_config SET kiosk = COALESCE(kiosk, 1) WHERE id = 1', (e3) => {
              if (e3) logger.error('Error normalizing kiosk column', { error: e3.message });
              resolve();
            });
          }
        });
      });
    });
  }
};

