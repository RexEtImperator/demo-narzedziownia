const up = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.all("PRAGMA table_info(tools_detectors_items)", (err, rows) => {
        if (err) return reject(err);
        const cols = (rows || []).map(r => r.name);
        const hasSku = cols.includes('sku');

        const next = () => {
          db.run(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_detectors_items_sku_unique
             ON tools_detectors_items(sku)
             WHERE sku IS NOT NULL`,
            (e3) => {
              if (e3) return reject(e3);
              resolve();
            }
          );
        };

        if (hasSku) {
          return next();
        }

        db.run('ALTER TABLE tools_detectors_items ADD COLUMN sku TEXT', (e2) => {
          if (e2) return reject(e2);
          db.run(
            `UPDATE tools_detectors_items
             SET sku = 'OSSA-DET-' || printf('%04d', id)
             WHERE sku IS NULL OR sku = ''`,
            (e4) => {
              if (e4) return reject(e4);
              next();
            }
          );
        });
      });
    });
  });
};

const down = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DROP INDEX IF EXISTS idx_detectors_items_sku_unique', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = { up, down };
