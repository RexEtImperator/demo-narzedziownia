const up = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS tools_detectors_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          inventory_number TEXT,
          serial_number TEXT,
          calibration_date TEXT,
          next_calibration_date TEXT,
          status TEXT NOT NULL DEFAULT 'available',
          employee_id INTEGER,
          issued_at DATETIME,
          returned_at DATETIME
        )`
      );

      db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_items_tool_id ON tools_detectors_items(tool_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_items_status ON tools_detectors_items(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_items_employee_id ON tools_detectors_items(employee_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_items_next_cal ON tools_detectors_items(next_calibration_date)`);
      db.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_detectors_items_inventory_unique
         ON tools_detectors_items(inventory_number)
         WHERE inventory_number IS NOT NULL`
      );

      db.run(
        `CREATE TABLE IF NOT EXISTS tools_detectors_issues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          tool_id INTEGER NOT NULL,
          employee_id INTEGER NOT NULL,
          issued_by_user_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          returned_at DATETIME
        )`,
        (err) => {
          if (err) return reject(err);
          db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_issues_item_id ON tools_detectors_issues(item_id)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_issues_employee_id ON tools_detectors_issues(employee_id)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_detectors_issues_tool_id ON tools_detectors_issues(tool_id)`, (err2) => {
            if (err2) return reject(err2);
            resolve();
          });
        }
      );
    });
  });
};

const down = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`DROP TABLE IF EXISTS tools_detectors_items`);
      db.run(`DROP TABLE IF EXISTS tools_detectors_issues`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = { up, down };
