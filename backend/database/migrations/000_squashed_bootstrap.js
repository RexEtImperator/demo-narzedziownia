const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    const dir = __dirname;
    const self = path.basename(__filename);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js') && f !== self)
      .sort();

    for (const file of files) {
      try {
        const migration = require(path.join(dir, file));
        if (migration && typeof migration.up === 'function') {
          await migration.up(db);
        }
      } catch (e) {
        logger.error(`Squashed bootstrap failed on ${file}`, { error: e?.message || String(e) });
        throw e;
      }
    }
  }
};

