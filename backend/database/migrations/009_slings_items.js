const up = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. tools_slings_items
      db.run(`CREATE TABLE IF NOT EXISTS tools_slings_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        kind TEXT NOT NULL,
        serial_number TEXT,
        sku TEXT NOT NULL UNIQUE,
        production_year INTEGER NOT NULL,
        production_month INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        employee_id INTEGER,
        issued_at DATETIME,
        returned_at DATETIME,
        location TEXT,
        notes TEXT
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_slings_tool_id ON tools_slings_items(tool_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_slings_category ON tools_slings_items(category)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_slings_status ON tools_slings_items(status)`);
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_slings_sku_unique ON tools_slings_items(sku)`);

      // 2. tools_slings_issues
      db.run(`CREATE TABLE IF NOT EXISTS tools_slings_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        tool_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        issued_by_user_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        returned_at DATETIME
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_slings_issues_item_id ON tools_slings_issues(item_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_slings_issues_employee_id ON tools_slings_issues(employee_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_slings_issues_tool_id ON tools_slings_issues(tool_id)`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

const down = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`DROP TABLE IF EXISTS tools_slings_items`);
      db.run(`DROP TABLE IF EXISTS tools_slings_issues`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = { up, down };
