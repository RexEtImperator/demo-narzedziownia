const fs = require('fs');
const path = require('path');
const db = require('./db');
const logger = require('../logger');

const runMigrations = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create migrations table
      db.run(`CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) return reject(err);

        // Get applied migrations
        db.all('SELECT name FROM migrations', async (err, rows) => {
          if (err) return reject(err);
          const applied = new Set(rows.map(r => r.name));
          
          const migrationDir = path.join(__dirname, 'migrations');
          if (!fs.existsSync(migrationDir)) {
             fs.mkdirSync(migrationDir);
          }
          
          const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.js')).sort();

          const bootstrap = '000_squashed_bootstrap.js';
          if (applied.size === 0 && files.includes(bootstrap)) {
            logger.info(`Running squashed bootstrap migration: ${bootstrap}`);
            try {
              const migration = require(path.join(migrationDir, bootstrap));
              await migration.up(db);
              await new Promise((res, rej) => {
                db.run('INSERT INTO migrations (name) VALUES (?)', [bootstrap], (e) => e ? rej(e) : res());
              });

              await new Promise((res, rej) => {
                db.serialize(() => {
                  const stmt = db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)');
                  for (const f of files) {
                    if (f === bootstrap) continue;
                    stmt.run([f]);
                  }
                  stmt.finalize((e) => e ? rej(e) : res());
                });
              });

              logger.info('Squashed bootstrap completed; marked all migrations as applied.');
              return resolve();
            } catch (e) {
              logger.error(`Squashed bootstrap migration failed`, { error: e.message });
              return reject(e);
            }
          }

          for (const file of files) {
            if (!applied.has(file)) {
              logger.info(`Running migration: ${file}`);
              try {
                const migration = require(path.join(migrationDir, file));
                await migration.up(db);
                await new Promise((res, rej) => {
                   db.run('INSERT INTO migrations (name) VALUES (?)', [file], (e) => e ? rej(e) : res());
                });
                logger.info(`Migration ${file} completed`);
              } catch (e) {
                logger.error(`Migration ${file} failed`, { error: e.message });
                return reject(e);
              }
            }
          }
          resolve();
        });
      });
    });
  });
};

module.exports = runMigrations;
