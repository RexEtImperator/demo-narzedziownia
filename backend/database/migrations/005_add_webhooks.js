const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    db.serialize(() => {
      // Webhooks table
      db.run(`CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        events TEXT NOT NULL, -- JSON array of event names
        secret TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )`, (err) => {
        if (err) logger.error('Error creating webhooks table:', { error: err.message });
        else logger.info('Created webhooks table');
      });

      // Webhook delivery logs
      db.run(`CREATE TABLE IF NOT EXISTS webhook_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER NOT NULL,
        event TEXT NOT NULL,
        status_code INTEGER,
        response_body TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT (datetime('now')),
        FOREIGN KEY(webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
      )`, (err) => {
        if (err) logger.error('Error creating webhook_logs table:', { error: err.message });
        else logger.info('Created webhook_logs table');
      });
    });
  }
};
