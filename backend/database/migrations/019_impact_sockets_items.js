const up = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS tools_impact_sockets_1_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_id INTEGER NOT NULL,
          sku TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL,
          size TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )`
      );

      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_1_items_tool_id ON tools_impact_sockets_1_items(tool_id)');
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_impact_sockets_1_items_sku_unique ON tools_impact_sockets_1_items(sku)');

      db.run(
        `CREATE TABLE IF NOT EXISTS tools_impact_sockets_1_issues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          tool_id INTEGER NOT NULL,
          employee_id INTEGER NOT NULL,
          issued_by_user_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          returned_at DATETIME
        )`
      );

      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_1_issues_tool_id ON tools_impact_sockets_1_issues(tool_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_1_issues_employee_id ON tools_impact_sockets_1_issues(employee_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_1_issues_item_id ON tools_impact_sockets_1_issues(item_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_1_issues_created_at ON tools_impact_sockets_1_issues(created_at DESC)');

      db.run(
        `CREATE TABLE IF NOT EXISTS tools_impact_sockets_12_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_id INTEGER NOT NULL,
          sku TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL,
          size TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )`
      );

      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_12_items_tool_id ON tools_impact_sockets_12_items(tool_id)');
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_impact_sockets_12_items_sku_unique ON tools_impact_sockets_12_items(sku)');

      db.run(
        `CREATE TABLE IF NOT EXISTS tools_impact_sockets_12_issues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          tool_id INTEGER NOT NULL,
          employee_id INTEGER NOT NULL,
          issued_by_user_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          returned_at DATETIME
        )`
      );

      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_12_issues_tool_id ON tools_impact_sockets_12_issues(tool_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_12_issues_employee_id ON tools_impact_sockets_12_issues(employee_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_12_issues_item_id ON tools_impact_sockets_12_issues(item_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_impact_sockets_12_issues_created_at ON tools_impact_sockets_12_issues(created_at DESC)', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

const down = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DROP TABLE IF EXISTS tools_impact_sockets_12_issues');
      db.run('DROP TABLE IF EXISTS tools_impact_sockets_12_items');
      db.run('DROP TABLE IF EXISTS tools_impact_sockets_1_issues');
      db.run('DROP TABLE IF EXISTS tools_impact_sockets_1_items', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = { up, down };
