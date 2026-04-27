const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj || {})) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = String(value);
    }
  }
  return result;
}

function readJsonSafe(jsonPath) {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read JSON file:', jsonPath, e.message);
    return {};
  }
}

function parseArgs(argv) {
  const out = { langs: ['pl', 'en', 'de', 'cz'], dryRun: false, deleteExtras: false, yes: false };
  for (const a of argv || []) {
    if (a.startsWith('--langs=')) {
      const v = a.split('=')[1] || '';
      const arr = v.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const valid = ['pl', 'en', 'de', 'cz'];
      out.langs = arr.length ? arr.filter(x => valid.includes(x)) : out.langs;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--delete-extras') {
      out.deleteExtras = true;
    } else if (a === '--yes' || a === '-y') {
      out.yes = true;
    }
  }
  return out;
}

async function readDbTranslations(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT lang, key, value FROM translate', (err, rows) => {
      if (err) return reject(err);
      const byLang = { pl: {}, en: {}, de: {}, cz: {} };
      for (const r of rows || []) {
        if (!byLang[r.lang]) byLang[r.lang] = {};
        byLang[r.lang][r.key] = r.value;
      }
      resolve(byLang);
    });
  });
}

async function main() {
  const dbPath = path.join(__dirname, '..', 'backend/database.db');
  const db = new sqlite3.Database(dbPath);
  const i18nDir = path.join(__dirname, '..', 'src', 'i18n');
  const files = {
    pl: path.join(i18nDir, 'pl.json'),
    en: path.join(i18nDir, 'en.json'),
    de: path.join(i18nDir, 'de.json'),
    cz: path.join(i18nDir, 'cz.json'),
  };

  const dicts = {
    pl: flattenObject(readJsonSafe(files.pl)),
    en: flattenObject(readJsonSafe(files.en)),
    de: flattenObject(readJsonSafe(files.de)),
    cz: flattenObject(readJsonSafe(files.cz)),
  };

  const args = parseArgs(process.argv.slice(2));
  try {
    const dbDicts = await readDbTranslations(db);
    const langs = args.langs;
    const toInsert = [];
    const extrasByLang = { pl: [], en: [], de: [] };
    for (const lang of langs) {
      const fileDict = dicts[lang] || {};
      const dbDict = dbDicts[lang] || {};
      const dbKeys = new Set(Object.keys(dbDict));
      const fileKeys = new Set(Object.keys(fileDict));
      const missingKeys = Array.from(fileKeys).filter(k => !dbKeys.has(k));
      const extras = Object.keys(dbDict).filter(k => !fileKeys.has(k));
      extrasByLang[lang] = extras;
      console.log(`Lang ${lang.toUpperCase()}: missing keys = ${missingKeys.length}`);
      console.log(`Lang ${lang.toUpperCase()}: extras in DB = ${extras.length}`);
      for (const k of missingKeys) {
        toInsert.push([lang, k, fileDict[k]]);
      }
    }
    if (args.dryRun) {
      console.log(`Dry-run: would insert ${toInsert.length} keys total`);
      if (args.deleteExtras) {
        const totalExtras = langs.reduce((acc, l) => acc + (extrasByLang[l] || []).length, 0);
        console.log(`Dry-run: would delete ${totalExtras} extra keys total`);
      }
      db.close();
      return;
    }
    // Insert missing
    const insertSql = `INSERT OR IGNORE INTO translate(lang, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))`;
    const insertStmt = db.prepare(insertSql);
    let inserted = 0;
    db.serialize(() => {
      db.run('BEGIN');
      for (const row of toInsert) {
        insertStmt.run(row[0], row[1], row[2], function(err) {
          if (!err) inserted += this.changes || 0;
        });
      }
      insertStmt.finalize(async (err) => {
        if (err) {
          console.error('Error finalizing insert statement:', err.message);
          db.run('ROLLBACK', () => db.close());
          process.exitCode = 1;
          return;
        }
        // Optional delete extras
        let deleted = 0;
        if (args.deleteExtras) {
          let langsToDelete = langs.slice();
          if (!args.yes) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const chosen = [];
            for (const l of langs) {
              const count = (extrasByLang[l] || []).length;
              if (!count) continue;
              const ok = await new Promise((resolve) => {
                rl.question(`Usunąć ${count} nadmiarowych kluczy dla ${l.toUpperCase()}? [y/N] `, (answer) => {
                  const a = String(answer || '').trim().toLowerCase();
                  resolve(a === 'y' || a === 'yes');
                });
              });
              if (ok) chosen.push(l);
            }
            rl.close();
            langsToDelete = chosen;
          }
          if (langsToDelete.length) {
            const delStmt = db.prepare('DELETE FROM translate WHERE lang = ? AND key = ?');
            for (const l of langsToDelete) {
              for (const k of extrasByLang[l] || []) {
                delStmt.run(l, k, function(err) {
                  if (!err) deleted += this.changes || 0;
                });
              }
            }
            delStmt.finalize((delErr) => {
              if (delErr) {
                console.error('Error finalizing delete statement:', delErr.message);
                db.run('ROLLBACK', () => db.close());
                process.exitCode = 1;
              } else {
                db.run('COMMIT', () => {
                  console.log(`Inserted missing translation keys: ${inserted}`);
                  console.log(`Deleted extra translation keys: ${deleted}`);
                  db.close();
                });
              }
            });
            return;
          }
        }
        // No deletes requested
        db.run('COMMIT', () => {
          console.log(`Inserted missing translation keys: ${inserted}`);
          db.close();
        });
      });
    });
  } catch (e) {
    console.error('Failed to sync translations:', e.message);
    process.exitCode = 1;
    db.close();
  }
}

main();
