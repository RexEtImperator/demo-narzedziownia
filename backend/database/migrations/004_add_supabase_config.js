const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const columns = [
          { name: 'supabase_url', type: 'TEXT' },
          { name: 'supabase_key', type: 'TEXT' },
          { name: 'db_source', type: 'TEXT', default: "'local'" }
        ];

        let completed = 0;
        
        // Get existing columns to avoid errors
        db.all("PRAGMA table_info(app_config)", (err, rows) => {
          if (err) return reject(err);
          const existing = rows.map(r => r.name);

          const runNext = () => {
            if (completed >= columns.length) return resolve();
            const col = columns[completed];
            if (!existing.includes(col.name)) {
              let sql = `ALTER TABLE app_config ADD COLUMN ${col.name} ${col.type}`;
              if (col.default) sql += ` DEFAULT ${col.default}`;
              
              db.run(sql, (err) => {
                if (err) logger.error(`Error adding ${col.name}:`, { error: err.message });
                completed++;
                runNext();
              });
            } else {
              completed++;
              runNext();
            }
          };
          runNext();
        });
      });
    });
  }
};
