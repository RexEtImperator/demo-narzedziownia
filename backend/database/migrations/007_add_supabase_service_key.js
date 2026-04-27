const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.all("PRAGMA table_info(app_config)", (err, rows) => {
          if (err) return reject(err);
          const existing = rows.map(r => r.name);
          if (!existing.includes('supabase_service_key')) {
            db.run('ALTER TABLE app_config ADD COLUMN supabase_service_key TEXT', (alterErr) => {
              if (alterErr) {
                logger.error('Error adding supabase_service_key:', { error: alterErr.message });
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
  }
};

