const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    await new Promise((resolve) => {
      db.run(`CREATE TABLE IF NOT EXISTS plant_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        coords TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )`, (err) => {
        if (err) logger.error('Error creating plant_map table', { error: err.message });
        db.run('CREATE INDEX IF NOT EXISTS idx_plant_map_type ON plant_map(type)', () => resolve());
      });
    });

    await new Promise((resolve) => {
      db.run(`CREATE TABLE IF NOT EXISTS plant_map_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        obszar TEXT,
        obiekt TEXT,
        status TEXT DEFAULT 'aktywne',
        awaria TEXT NOT NULL,
        priorytet TEXT,
        data TEXT,
        pracownik TEXT NOT NULL,
        zlecajacy TEXT,
        opis TEXT,
        created_by_user_id INTEGER,
        created_by_username TEXT,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )`, (err) => {
        if (err) logger.error('Error creating plant_map_reports table', { error: err.message });
        db.run('CREATE INDEX IF NOT EXISTS idx_plant_map_reports_created_at ON plant_map_reports(created_at)', () => resolve());
      });
    });

    const seed = async (role, perm) => new Promise((resolve) => {
      db.get('SELECT 1 as ok FROM role_permissions WHERE role = ? AND permission = ? LIMIT 1', [role, perm], (selErr, row) => {
        if (selErr) {
          logger.error('Error checking role_permissions for seed', { error: selErr.message });
          return resolve();
        }
        if (row && row.ok) return resolve();
        db.run('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)', [role, perm], (insErr) => {
          if (insErr) logger.error('Error seeding role_permissions', { error: insErr.message, role, perm });
          resolve();
        });
      });
    });

    const rolesWithView = ['administrator', 'manager', 'toolsmaster', 'supervisor', 'engineer', 'employee', 'hr'];
    const rolesWithManage = ['administrator', 'manager', 'toolsmaster', 'supervisor', 'engineer'];

    for (const r of rolesWithView) {
      await seed(r, 'VIEW_MAP');
    }
    for (const r of rolesWithManage) {
      await seed(r, 'MANAGE_MAP');
    }
  }
};
