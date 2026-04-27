// Report differences between src/i18n/*.json and DB (translate table)
// Shows: missing values ​​in DB, extra values ​​in DB, discrepancies in values ​​(DB vs. file)

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

function diffLang(lang, fileDict, dbDict) {
  const fileKeys = new Set(Object.keys(fileDict));
  const dbKeys = new Set(Object.keys(dbDict || {}));

  const missing = []; // klucze w plikach, brak w DB
  const extra = []; // klucze w DB, brak w plikach
  const mismatched = []; // klucze w obu, ale wartości różne

  for (const k of fileKeys) {
    if (!dbKeys.has(k)) missing.push(k);
    else if (String(dbDict[k]) !== String(fileDict[k])) {
      mismatched.push({ key: k, file: fileDict[k], db: dbDict[k] });
    }
  }
  for (const k of dbKeys) {
    if (!fileKeys.has(k)) extra.push(k);
  }
  return { missing, extra, mismatched };
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

  try {
    const dbDicts = await readDbTranslations(db);
    const langs = ['pl', 'en', 'de', 'cz'];
    const summary = {};
    const extrasByLang = { pl: [], en: [], de: [], cz: [] };
    for (const lang of langs) {
      const diff = diffLang(lang, dicts[lang], dbDicts[lang] || {});
      summary[lang] = {
        missing: diff.missing.length,
        extra: diff.extra.length,
        mismatched: diff.mismatched.length,
      };
      extrasByLang[lang] = diff.extra.slice();
      console.log(`\n=== ${lang.toUpperCase()} ===`);
      console.log(`Missing in DB: ${diff.missing.length}`);
      if (diff.missing.length) console.log(diff.missing.join('\n'));
      console.log(`\nExtra in DB: ${diff.extra.length}`);
      if (diff.extra.length) console.log(diff.extra.join('\n'));
      console.log(`\nMismatched values: ${diff.mismatched.length}`);
      if (diff.mismatched.length) {
        for (const m of diff.mismatched) {
          console.log(`${m.key}\n  file: ${m.file}\n  db:   ${m.db}`);
        }
      }
    }
    console.log('\nSummary:', summary);

    const args = parseArgs(process.argv.slice(2));
    const langsWithExtras = langs.filter((l) => (extrasByLang[l] || []).length > 0);
    if (langsWithExtras.length === 0) {
      return;
    }

    let langsToDelete = [];
    if (args.deleteExtrasLangs.length) {
      langsToDelete = args.deleteExtrasLangs.filter((l) => langsWithExtras.includes(l));
      if (!args.yes) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const confirmed = await askYesNo(rl, `Usunąć nadmiarowe klucze dla [${langsToDelete.join(', ')}]? [y/N] `);
        rl.close();
        if (!confirmed) langsToDelete = [];
      }
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      for (const l of langs) {
        const count = (extrasByLang[l] || []).length;
        if (!count) continue;
        const ok = await askYesNo(rl, `Usunąć ${count} nadmiarowych kluczy dla ${l.toUpperCase()}? [y/N] `);
        if (ok) langsToDelete.push(l);
      }
      rl.close();
    }

    if (langsToDelete.length) {
      if (args.dryRun) {
        console.log(`Dry-run: usunięto extras dla: ${langsToDelete.join(', ')}`);
      } else {
        const total = await deleteExtras(db, extrasByLang, langsToDelete);
        console.log('Usunięto kluczy:', total);
      }
    }
  } catch (e) {
    console.error('Failed to generate translation diff report:', e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();

function parseArgs(argv) {
  const out = { deleteExtrasLangs: [], yes: false, dryRun: false };
  for (const a of argv || []) {
    if (a.startsWith('--delete-extras=')) {
      const v = a.split('=')[1] || '';
      out.deleteExtrasLangs = v.split(',').map((s) => s.trim()).filter((s) => ['pl', 'en', 'de', 'cz', 'all'].includes(s));
      if (out.deleteExtrasLangs.includes('all')) out.deleteExtrasLangs = ['pl', 'en', 'de', 'cz'];
    } else if (a === '--yes' || a === '-y') {
      out.yes = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    }
  }
  return out;
}

function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const a = String(answer || '').trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

function deleteExtras(db, extrasByLang, langsToDelete) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN');
      const stmt = db.prepare('DELETE FROM translate WHERE lang = ? AND key = ?');
      let count = 0;
      try {
        for (const l of langsToDelete) {
          for (const k of extrasByLang[l] || []) {
            stmt.run([l, k], function(err) {
              if (!err) count += this.changes || 0;
            });
          }
        }
        stmt.finalize((err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          db.run('COMMIT', (cerr) => {
            if (cerr) return reject(cerr);
            resolve(count);
          });
        });
      } catch (e) {
        stmt.finalize(() => {
          db.run('ROLLBACK');
          reject(e);
        });
      }
    });
  });
}
