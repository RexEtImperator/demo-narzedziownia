const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(bhp)', (err, columns) => {
        if (err) return reject(err);
        const names = (columns || []).map((c) => c.name);
        if (names.includes('nfc_tag_id')) {
          return resolve();
        }
        db.run('ALTER TABLE bhp ADD COLUMN nfc_tag_id TEXT', (alterErr) => {
          if (alterErr) {
            logger.error('Error adding nfc_tag_id column to bhp', { error: alterErr.message });
            return reject(alterErr);
          }
          db.run(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_bhp_nfc_tag_id ON bhp(nfc_tag_id) WHERE nfc_tag_id IS NOT NULL',
            (idxErr) => {
              if (idxErr) {
                logger.error('Error creating unique index for bhp.nfc_tag_id', { error: idxErr.message });
                return reject(idxErr);
              }
              logger.info('Added nfc_tag_id column to bhp and created unique index');
              resolve();
            }
          );
        });
      });
    });
  }
};

