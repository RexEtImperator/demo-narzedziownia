const up = (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("ALTER TABLE tools ADD COLUMN sku_unreadable BOOLEAN DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) return reject(err);
        
        db.run("ALTER TABLE tools ADD COLUMN serial_unreadable BOOLEAN DEFAULT 0", (err) => {
          if (err && !err.message.includes('duplicate column')) return reject(err);
          resolve();
        });
      });
    });
  });
};

const down = (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // SQLite doesn't support dropping columns easily in older versions, 
      // but for completeness we can try or ignore
      try {
        db.run("ALTER TABLE tools DROP COLUMN sku_unreadable");
        db.run("ALTER TABLE tools DROP COLUMN serial_unreadable");
      } catch (e) {
        // ignore
      }
      resolve();
    });
  });
};

module.exports = { up, down };
