const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.all('PRAGMA table_info(app_config)', (err, rows) => {
          if (err) return reject(err);
          const existing = (rows || []).map(r => r.name);
          if (!existing.includes('help')) {
            db.run('ALTER TABLE app_config ADD COLUMN help INTEGER DEFAULT 0', (e2) => {
              if (e2) logger.error('Error adding help column to app_config', { error: e2.message });
              db.run('UPDATE app_config SET help = 0 WHERE help IS NULL', (e3) => {
                if (e3) logger.error('Error initializing help column', { error: e3.message });
                resolve();
              });
            });
          } else {
            db.run('UPDATE app_config SET help = COALESCE(help, 0) WHERE id = 1', (e3) => {
              if (e3) logger.error('Error normalizing help column', { error: e3.message });
              resolve();
            });
          }
        });
      });
    });
  }
};

