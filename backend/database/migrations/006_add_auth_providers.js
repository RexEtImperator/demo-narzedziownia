const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    db.serialize(() => {
      // Create auth_providers table
      db.run(`CREATE TABLE IF NOT EXISTS auth_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL UNIQUE,
        client_id TEXT,
        client_secret TEXT,
        redirect_uri TEXT,
        enabled INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )`, (err) => {
        if (err) {
          logger.error('Error creating auth_providers table:', { error: err.message });
        } else {
          logger.info('Created auth_providers table');
          
          // Insert default providers (disabled)
          const stmt = db.prepare('INSERT OR IGNORE INTO auth_providers (provider, enabled) VALUES (?, 0)');
          stmt.run('google');
          stmt.run('github');
          stmt.finalize();
        }
      });

      // Add auth_provider column to users table if not exists
      db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
          logger.error('Error checking users table structure:', { error: err.message });
        } else {
          const columnNames = columns.map(col => col.name);
          if (!columnNames.includes('auth_provider')) {
            db.run('ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "local"', (err) => {
              if (err) logger.error('Error adding auth_provider column to users:', { error: err.message });
              else logger.info('Added auth_provider column to users');
            });
          }
          if (!columnNames.includes('auth_provider_id')) {
            db.run('ALTER TABLE users ADD COLUMN auth_provider_id TEXT', (err) => {
              if (err) logger.error('Error adding auth_provider_id column to users:', { error: err.message });
              else logger.info('Added auth_provider_id column to users');
            });
          }
        }
      });
    });
  }
};
