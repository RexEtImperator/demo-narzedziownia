const db = require('../database/db');
const logger = require('../logger');


function initFullTextSearch() {
  db.serialize(() => {
    // Create FTS table for tools (External Content Table)
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS tools_fts USING fts5(
      name, 
      sku, 
      inventory_number, 
      category, 
      location, 
      status, 
      description,
      content='tools',
      content_rowid='id'
    )`, (err) => {
      if (err) {
        logger.warn('FTS5 not supported or error creating table', { error: err.message });
        return;
      }
      
      // Triggers to keep FTS index in sync with 'tools' table
      const triggers = [
        `CREATE TRIGGER IF NOT EXISTS tools_ai AFTER INSERT ON tools BEGIN
           INSERT INTO tools_fts(rowid, name, sku, inventory_number, category, location, status, description) 
           VALUES (new.id, new.name, new.sku, new.inventory_number, new.category, new.location, new.status, new.description);
         END;`,
        `CREATE TRIGGER IF NOT EXISTS tools_ad AFTER DELETE ON tools BEGIN
           INSERT INTO tools_fts(tools_fts, rowid, name, sku, inventory_number, category, location, status, description) 
           VALUES('delete', old.id, old.name, old.sku, old.inventory_number, old.category, old.location, old.status, old.description);
         END;`,
        `CREATE TRIGGER IF NOT EXISTS tools_au AFTER UPDATE ON tools BEGIN
           INSERT INTO tools_fts(tools_fts, rowid, name, sku, inventory_number, category, location, status, description) 
           VALUES('delete', old.id, old.name, old.sku, old.inventory_number, old.category, old.location, old.status, old.description);
           INSERT INTO tools_fts(rowid, name, sku, inventory_number, category, location, status, description) 
           VALUES (new.id, new.name, new.sku, new.inventory_number, new.category, new.location, new.status, new.description);
         END;`
      ];
      
      let triggerErrors = 0;
      triggers.forEach(t => db.run(t, err => {
         if (err) {
           logger.error('Error creating FTS trigger', { error: err.message });
           triggerErrors++;
         }
      }));
      
      // If table was just created or exists, ensure it's populated. 
      // For external content tables, 'rebuild' is the best way to sync if unsure.
      // But rebuild might be expensive on startup.
      // We can check if empty. But external content table queries 'tools' for content, so it might appear empty if index is empty?
      // Actually, querying an external content FTS table returns data from the content table, 
      // but MATCH queries rely on the index.
      // Let's run a quick rebuild if we think it's necessary, or just rely on triggers for new data.
      // To be safe for existing data, we should run rebuild once.
      // db.run("INSERT INTO tools_fts(tools_fts) VALUES('rebuild')");
      // Since we don't know if this is first run, let's run rebuild if the tools table is not empty but fts is (hard to check index size directly).
      // We'll just run rebuild. It's usually fast enough for moderate datasets.
      if (triggerErrors === 0) {
        db.run("INSERT INTO tools_fts(tools_fts) VALUES('rebuild')", (err) => {
           if (err) logger.warn('Error rebuilding FTS index', { error: err.message });
           else logger.info('FTS index rebuilt.');
        });
      }
    });
  });
}

module.exports = { initFullTextSearch };

