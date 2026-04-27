const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Error connecting to database', { error: err.message });
  } else {
    logger.info('Connected to SQLite database');
    db.serialize(() => {
      const run = (sql) => db.run(sql, (e) => {
        if (e) logger.warn('SQLite init statement failed', { error: e.message, sql });
      });

      const ensureIndexIfTableExists = (tableName, sql) => {
        db.get(
          "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
          [tableName],
          (lookupErr, row) => {
            if (lookupErr || !row) return;
            db.run(sql, (e) => {
              if (e) logger.warn('SQLite init statement failed', { error: e.message, sql });
            });
          }
        );
      };

      db.run('PRAGMA journal_mode = WAL;', (walErr) => {
        if (walErr) logger.error('Error enabling WAL mode', { error: walErr.message });
        else logger.info('SQLite WAL mode enabled');
      });
      run('PRAGMA foreign_keys = ON;');
      run('PRAGMA busy_timeout = 5000;');
      run('PRAGMA synchronous = NORMAL;');
      run('PRAGMA temp_store = MEMORY;');
      run('PRAGMA cache_size = -20000;');
      run('PRAGMA mmap_size = 268435456;');
      run('PRAGMA optimize;');

      ensureIndexIfTableExists('tools', 'CREATE INDEX IF NOT EXISTS idx_tools_inventory_number ON tools(inventory_number)');
      ensureIndexIfTableExists('tools', 'CREATE INDEX IF NOT EXISTS idx_tools_sku ON tools(sku)');
      ensureIndexIfTableExists('tools', 'CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category)');
      ensureIndexIfTableExists('tools', 'CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status)');
      ensureIndexIfTableExists('tools', 'CREATE INDEX IF NOT EXISTS idx_tools_nfc_tag_id ON tools(nfc_tag_id)');

      ensureIndexIfTableExists('tool_issues', 'CREATE INDEX IF NOT EXISTS idx_tool_issues_tool_status ON tool_issues(tool_id, status)');
      ensureIndexIfTableExists('tool_issues', 'CREATE INDEX IF NOT EXISTS idx_tool_issues_employee_status ON tool_issues(employee_id, status)');

      ensureIndexIfTableExists('tools_slings_items', 'CREATE INDEX IF NOT EXISTS idx_tools_slings_items_tool_status ON tools_slings_items(tool_id, status)');
      ensureIndexIfTableExists('tools_slings_items', 'CREATE INDEX IF NOT EXISTS idx_tools_slings_items_employee_status ON tools_slings_items(employee_id, status)');

      ensureIndexIfTableExists('employees', 'CREATE INDEX IF NOT EXISTS idx_employees_login ON employees(login)');

      ensureIndexIfTableExists('bhp', 'CREATE INDEX IF NOT EXISTS idx_bhp_inventory_number ON bhp(inventory_number)');
      ensureIndexIfTableExists('bhp', 'CREATE INDEX IF NOT EXISTS idx_bhp_status ON bhp(status)');
      ensureIndexIfTableExists('bhp', 'CREATE INDEX IF NOT EXISTS idx_bhp_nfc_tag_id ON bhp(nfc_tag_id)');
      ensureIndexIfTableExists('bhp_issues', 'CREATE INDEX IF NOT EXISTS idx_bhp_issues_bhp_status_id ON bhp_issues(bhp_id, status, id)');
      ensureIndexIfTableExists('bhp_issues', 'CREATE INDEX IF NOT EXISTS idx_bhp_issues_employee_status ON bhp_issues(employee_id, status)');
    });
  }
});

module.exports = db;
