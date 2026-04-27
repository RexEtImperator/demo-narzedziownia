const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    const hasColumn = await new Promise((resolve) => {
      db.all("PRAGMA table_info('plant_map_reports')", [], (err, rows) => {
        if (err) {
          logger.error('Error reading plant_map_reports schema', { error: err.message });
          return resolve(false);
        }
        resolve((rows || []).some((r) => String(r.name || '').toLowerCase() === 'status'));
      });
    });

    if (!hasColumn) {
      await new Promise((resolve) => {
        db.run("ALTER TABLE plant_map_reports ADD COLUMN status TEXT DEFAULT 'aktywne'", (err) => {
          if (err) logger.error('Error adding status to plant_map_reports', { error: err.message });
          resolve();
        });
      });
    }

    await new Promise((resolve) => {
      db.run("UPDATE plant_map_reports SET status = 'aktywne' WHERE status IS NULL OR TRIM(status) = ''", (err) => {
        if (err) logger.error('Error backfilling status in plant_map_reports', { error: err.message });
        resolve();
      });
    });
  }
};

