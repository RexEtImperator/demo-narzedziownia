const logger = require('../../logger');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { ROOT_DIR } = require('../../config/constants');

module.exports = {
  up: async (db) => {
  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) logger.error('Error enabling WAL', { error: err.message });
      else logger.info('WAL mode enabled');
    });
    db.run('PRAGMA foreign_keys = ON;');
  });

  db.run(`CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    app_name TEXT NOT NULL,
    company_name TEXT,
    timezone TEXT,
    language TEXT,
    date_format TEXT,
    backup_frequency TEXT,
    last_backup_at DATETIME,
    tools_code_prefix TEXT,
    bhp_code_prefix TEXT,
    tool_category_prefixes TEXT,
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating app_config table:', { error: err.message });
    } else {
      // Create system_logs table
      db.run(`CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT,
        details TEXT,
        created_at DATETIME DEFAULT (datetime('now'))
      )`, (logErr) => {
        if (logErr) logger.error('Error creating system_logs table:', { error: logErr.message });
      });

      // Add missing columns if they do not exist
      db.all("PRAGMA table_info(app_config)", (err, columns) => {
        if (err) {
          logger.error('Error checking app_config table structure:', { error: err.message });
        } else {
          const columnNames = columns.map(col => col.name);
          if (!columnNames.includes('backup_frequency')) {
            db.run('ALTER TABLE app_config ADD COLUMN backup_frequency TEXT', (err) => {
              if (err) logger.error('Error adding backup_frequency column:', { error: err.message });
            });
          }
          if (!columnNames.includes('last_backup_at')) {
            db.run('ALTER TABLE app_config ADD COLUMN last_backup_at DATETIME', (err) => {
              if (err) logger.error('Error adding last_backup_at column:', { error: err.message });
            });
          }
          if (!columnNames.includes('backup_retention_days')) {
            db.run('ALTER TABLE app_config ADD COLUMN backup_retention_days INTEGER DEFAULT 30', (err) => {
              if (err) logger.error('Error adding backup_retention_days column:', { error: err.message });
            });
          }
          if (!columnNames.includes('tools_code_prefix')) {
            db.run('ALTER TABLE app_config ADD COLUMN tools_code_prefix TEXT', (err) => {
              if (err) logger.error('Error adding tools_code_prefix column:', { error: err.message });
            });
          }
          if (!columnNames.includes('bhp_code_prefix')) {
            db.run('ALTER TABLE app_config ADD COLUMN bhp_code_prefix TEXT', (err) => {
              if (err) logger.error('Error adding bhp_code_prefix column:', { error: err.message });
            });
          }
          if (!columnNames.includes('tool_category_prefixes')) {
            db.run('ALTER TABLE app_config ADD COLUMN tool_category_prefixes TEXT', (err) => {
              if (err) logger.error('Error adding tool_category_prefixes column:', { error: err.message });
            });
          }
          // Web Push (VAPID) configuration columns
          if (!columnNames.includes('vapid_public_key')) {
            db.run('ALTER TABLE app_config ADD COLUMN vapid_public_key TEXT', (err) => {
              if (err) logger.error('Error adding vapid_public_key column:', { error: err.message });
            });
          }
          if (!columnNames.includes('vapid_private_key')) {
            db.run('ALTER TABLE app_config ADD COLUMN vapid_private_key TEXT', (err) => {
              if (err) logger.error('Error adding vapid_private_key column:', { error: err.message });
            });
          }
          if (!columnNames.includes('vapid_subject')) {
            db.run('ALTER TABLE app_config ADD COLUMN vapid_subject TEXT', (err) => {
              if (err) logger.error('Error adding vapid_subject column:', { error: err.message });
            });
          }
          if (!columnNames.includes('enable_realtime_chat')) {
            db.run('ALTER TABLE app_config ADD COLUMN enable_realtime_chat INTEGER DEFAULT 0', (err) => {
              if (err) logger.error('Error adding enable_realtime_chat column:', { error: err.message });
            });
          }
          // Security configuration columns
          if (!columnNames.includes('session_timeout_minutes')) {
            db.run('ALTER TABLE app_config ADD COLUMN session_timeout_minutes INTEGER', (err) => {
              if (err) logger.error('Error adding session_timeout_minutes column:', { error: err.message });
            });
          }
          if (!columnNames.includes('password_min_length')) {
            db.run('ALTER TABLE app_config ADD COLUMN password_min_length INTEGER', (err) => {
              if (err) logger.error('Error adding password_min_length column:', { error: err.message });
            });
          }
          if (!columnNames.includes('max_login_attempts')) {
            db.run('ALTER TABLE app_config ADD COLUMN max_login_attempts INTEGER', (err) => {
              if (err) logger.error('Error adding max_login_attempts column:', { error: err.message });
            });
          }
          if (!columnNames.includes('lockout_duration_minutes')) {
            db.run('ALTER TABLE app_config ADD COLUMN lockout_duration_minutes INTEGER', (err) => {
              if (err) logger.error('Error adding lockout_duration_minutes column:', { error: err.message });
            });
          }
          if (!columnNames.includes('require_special_chars')) {
            db.run('ALTER TABLE app_config ADD COLUMN require_special_chars INTEGER', (err) => {
              if (err) logger.error('Error adding require_special_chars column:', { error: err.message });
            });
          }
          if (!columnNames.includes('require_numbers')) {
            db.run('ALTER TABLE app_config ADD COLUMN require_numbers INTEGER', (err) => {
              if (err) logger.error('Error adding require_numbers column:', { error: err.message });
            });
          }
          if (!columnNames.includes('require_uppercase')) {
            db.run('ALTER TABLE app_config ADD COLUMN require_uppercase INTEGER', (err) => {
              if (err) logger.error('Error adding require_uppercase column:', { error: err.message });
            });
          }
          if (!columnNames.includes('require_lowercase')) {
            db.run('ALTER TABLE app_config ADD COLUMN require_lowercase INTEGER', (err) => {
              if (err) logger.error('Error adding require_lowercase column:', { error: err.message });
            });
          }
          if (!columnNames.includes('password_history_length')) {
            db.run('ALTER TABLE app_config ADD COLUMN password_history_length INTEGER', (err) => {
              if (err) logger.error('Error adding password_history_length column:', { error: err.message });
            });
          }
          if (!columnNames.includes('password_blacklist')) {
            db.run('ALTER TABLE app_config ADD COLUMN password_blacklist TEXT', (err) => {
              if (err) logger.error('Error adding password_blacklist column:', { error: err.message });
            });
          }
          // SMTP configuration columns
          if (!columnNames.includes('smtp_host')) {
            db.run('ALTER TABLE app_config ADD COLUMN smtp_host TEXT', (err) => {
              if (err) logger.error('Error adding smtp_host column:', { error: err.message });
            });
          }
          if (!columnNames.includes('smtp_port')) {
            db.run('ALTER TABLE app_config ADD COLUMN smtp_port INTEGER', (err) => {
              if (err) logger.error('Error adding smtp_port column:', { error: err.message });
            });
          }
          if (!columnNames.includes('smtp_secure')) {
            db.run('ALTER TABLE app_config ADD COLUMN smtp_secure INTEGER', (err) => {
              if (err) logger.error('Error adding smtp_secure column:', { error: err.message });
            });
          }
          if (!columnNames.includes('smtp_user')) {
            db.run('ALTER TABLE app_config ADD COLUMN smtp_user TEXT', (err) => {
              if (err) logger.error('Error adding smtp_user column:', { error: err.message });
            });
          }
          if (!columnNames.includes('smtp_pass')) {
            db.run('ALTER TABLE app_config ADD COLUMN smtp_pass TEXT', (err) => {
              if (err) logger.error('Error adding smtp_pass column:', { error: err.message });
            });
          }
          if (!columnNames.includes('smtp_from')) {
            db.run('ALTER TABLE app_config ADD COLUMN smtp_from TEXT', (err) => {
              if (err) logger.error('Error adding smtp_from column:', { error: err.message });
            });
          }
          // Migration: remove legacy columns code_prefix and default_item_name if present
          if (columnNames.includes('code_prefix') || columnNames.includes('default_item_name')) {
            logger.info('Starting app_config migration: removing code_prefix and default_item_name');
            db.serialize(() => {
              db.run('BEGIN TRANSACTION');
              db.run(`CREATE TABLE IF NOT EXISTS app_config_new (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                app_name TEXT NOT NULL,
                company_name TEXT,
                timezone TEXT,
                language TEXT,
                date_format TEXT,
                backup_frequency TEXT,
                backup_retention_days INTEGER DEFAULT 30,
                last_backup_at DATETIME,
                tools_code_prefix TEXT,
                bhp_code_prefix TEXT,
                tool_category_prefixes TEXT,
                updated_at DATETIME DEFAULT (datetime('now'))
              )`, (err1) => {
                if (err1) {
                  logger.error('Error creating app_config_new', { error: err1.message });
                  db.run('ROLLBACK');
                  return;
                }
                db.run(`INSERT INTO app_config_new (id, app_name, company_name, timezone, language, date_format, backup_frequency, backup_retention_days, last_backup_at, tools_code_prefix, bhp_code_prefix, tool_category_prefixes, updated_at)
                        SELECT id, app_name, company_name, timezone, language, date_format, backup_frequency, backup_retention_days, last_backup_at, tools_code_prefix, bhp_code_prefix, tool_category_prefixes, updated_at
                        FROM app_config WHERE id = 1`, (err2) => {
                  if (err2) {
                    logger.error('Error copying data to app_config_new', { error: err2.message });
                    db.run('ROLLBACK');
                    return;
                  }
                  db.run('DROP TABLE app_config', (err3) => {
                    if (err3) {
                      logger.error('Error dropping old app_config table', { error: err3.message });
                      db.run('ROLLBACK');
                      return;
                    }
                    db.run('ALTER TABLE app_config_new RENAME TO app_config', (err4) => {
                      if (err4) {
                        logger.error('Error renaming app_config_new to app_config', { error: err4.message });
                        db.run('ROLLBACK');
                        return;
                      }
                      db.run('COMMIT', (err5) => {
                        if (err5) {
                          logger.error('Error committing app_config migration', { error: err5.message });
                        } else {
                          logger.info('app_config migration completed successfully.');
                        }
                      });
                    });
                  });
                });
              });
            });
          }
        }
      });
      // Ensure a default configuration record exists
      db.get('SELECT COUNT(*) as count FROM app_config WHERE id = 1', [], (err, row) => {
        if (err) {
          logger.error('Error checking app_config', { error: err.message });
        } else if (row.count === 0) {
          db.run(
            `INSERT INTO app_config (id, app_name, company_name, timezone, language, date_format, backup_frequency, backup_retention_days) 
             VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
            [
              'Management System',
              'My Company',
              'Europe/Warsaw',
              'pl',
              'DD/MM/YYYY',
              'daily',
              30
            ],
            (err) => {
              if (err) {
                logger.error('Error initializing app_config', { error: err.message });
              } else {
              logger.info('Initialized default application configuration (app_config)');
                // Ensure VAPID keys exist for Web Push (generate if missing)
                try {
                  const webpush = (() => { try { return require('web-push'); } catch (_) { return null; } })();
                  if (webpush) {
                    db.get('SELECT vapid_public_key AS pub, vapid_private_key AS priv, vapid_subject AS subj FROM app_config WHERE id = 1', [], (vErr, vRow) => {
                      if (!vErr) {
                        const hasKeys = !!(vRow && vRow.pub && vRow.priv);
                        if (!hasKeys) {
                          try {
                            const keys = webpush.generateVAPIDKeys();
                            // Ensure keys are URL-safe Base64 (remove padding)
                            const publicKey = keys.publicKey.replace(/=+$/, '');
                            const privateKey = keys.privateKey.replace(/=+$/, '');
                            
                            const subject = (vRow && vRow.subj) || 'mailto:admin@localhost';
                            db.run('UPDATE app_config SET vapid_public_key = ?, vapid_private_key = ?, vapid_subject = COALESCE(vapid_subject, ?) WHERE id = 1', [publicKey, privateKey, subject]);
                            logger.info('Generated VAPID keys and stored in app_config');
                          } catch (genErr) {
                            logger.error('Failed to generate VAPID keys', { error: genErr.message });
                          }
                        }
                      }
                    });
                  }
                } catch (_) { /* noop */ }
                db.run(
                  `UPDATE app_config SET 
                    session_timeout_minutes = COALESCE(session_timeout_minutes, 30),
                    password_min_length = COALESCE(password_min_length, 8),
                    max_login_attempts = COALESCE(max_login_attempts, 5),
                    lockout_duration_minutes = COALESCE(lockout_duration_minutes, 15),
                    require_special_chars = COALESCE(require_special_chars, 1),
                    require_numbers = COALESCE(require_numbers, 1),
                    require_uppercase = COALESCE(require_uppercase, 1),
                    require_lowercase = COALESCE(require_lowercase, 1),
                    password_history_length = COALESCE(password_history_length, 3),
                    password_blacklist = COALESCE(password_blacklist, '["password","123456","qwerty","admin"]')
                  WHERE id = 1`
                );
              }
            }
          );
        }
      });
    }
  });

  function createDatabaseIndexes() {
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_tool_issues_tool_status ON tool_issues(tool_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_tool_issues_employee_status ON tool_issues(employee_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_tool_issues_returned ON tool_issues(returned_at) WHERE status = "returned"',
      'CREATE INDEX IF NOT EXISTS idx_tool_issues_issued_by ON tool_issues(issued_by_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_tool_issues_issued_at ON tool_issues(issued_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_issues_bhp_status ON bhp_issues(bhp_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_issues_employee_status ON bhp_issues(employee_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_issues_returned ON bhp_issues(returned_at) WHERE status = "returned"',
      'CREATE INDEX IF NOT EXISTS idx_bhp_issues_issued_by ON bhp_issues(issued_by_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_issues_issued_at ON bhp_issues(issued_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_tools_sku ON tools(sku)',
      'CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category)',
      'CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status)',
      'CREATE INDEX IF NOT EXISTS idx_tools_location ON tools(location)',
      'CREATE INDEX IF NOT EXISTS idx_tools_qr ON tools(qr_code)',
      'CREATE INDEX IF NOT EXISTS idx_tools_barcode ON tools(barcode)',
      'CREATE INDEX IF NOT EXISTS idx_tools_serial ON tools(serial_number)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_inventory ON bhp(inventory_number)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_status ON bhp(status)',
      'CREATE INDEX IF NOT EXISTS idx_bhp_inspection ON bhp(inspection_date)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_type ON notifications(user_id, type)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_employees_login ON employees(login)',
      'CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)',
      'CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department)',
      'CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position)',
      'CREATE INDEX IF NOT EXISTS idx_employees_names ON employees(last_name, first_name)',
      'CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation ON chat_participants(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint)',
      'CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user ON mobile_push_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
      'CREATE INDEX IF NOT EXISTS idx_inventory_counts_session ON inventory_counts(session_id, tool_id)'
    ];

    indices.forEach((indexSql) => {
      db.run(indexSql, (err) => {
        if (err && !err.message.includes('already exists')) {
          logger.error('Error creating index', { error: err.message });
        } else if (!err) {
          logger.info(`Index created: ${indexSql.split(' ')[5]}`);
        }
      });
    });
  }

  createDatabaseIndexes();

  db.run(`CREATE TABLE IF NOT EXISTS tool_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating tool_categories table', { error: err.message });
    } else {
      const defaults = ['Ręczne', 'Elektronarzędzia', 'Spawalnicze', 'Pneumatyczne', 'Akumulatorowe'];
      db.all('SELECT name FROM tool_categories', [], (listErr, rows) => {
        if (listErr) {
          logger.error('Error checking tool_categories', { error: listErr.message });
          return;
        }

        const existing = new Set((rows || []).map((r) => r?.name).filter(Boolean));
        const missing = defaults.filter((name) => !existing.has(name));

        if (missing.length === 0) return;

        const stmt = db.prepare('INSERT OR IGNORE INTO tool_categories (name) VALUES (?)');
        let pending = missing.length;

        missing.forEach((name) => {
          stmt.run(name, (insErr) => {
            if (insErr) {
              logger.error('Error seeding tool_categories', { error: insErr.message, name });
            }

            pending -= 1;
            if (pending === 0) {
              stmt.finalize((finErr) => {
                if (finErr) {
                  logger.error('Error finalizing tool_categories seed', { error: finErr.message });
                } else {
                  logger.info('Seeded default tool categories', { inserted: missing.length });
                }
              });
            }
          });
        });
      });
    }
  });

  // Ensure VAPID keys exist even if app_config was initialized earlier
  try {
    const webpush = (() => { try { return require('web-push'); } catch (_) { return null; } })();
    if (webpush) {
      db.get('SELECT vapid_public_key AS pub, vapid_private_key AS priv, vapid_subject AS subj FROM app_config WHERE id = 1', [], (vErr, vRow) => {
        if (!vErr) {
          const hasKeys = !!(vRow && vRow.pub && vRow.priv);
          if (!hasKeys) {
            try {
              const keys = webpush.generateVAPIDKeys();
              const subject = (vRow && vRow.subj) || 'mailto:admin@localhost';
              db.run('UPDATE app_config SET vapid_public_key = ?, vapid_private_key = ?, vapid_subject = COALESCE(vapid_subject, ?) WHERE id = 1', [keys.publicKey, keys.privateKey, subject]);
              logger.info('Generated VAPID keys and stored in app_config');
            } catch (genErr) {
              logger.error('Failed to generate VAPID keys', { error: genErr.message });
            }
          }
        }
      });
    }
  } catch (_) { /* noop */ }
  db.run(`CREATE TABLE IF NOT EXISTS roles_meta (
    role TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    color TEXT,
    priority INTEGER,
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table roles_meta', { error: err.message });
    }
  });
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    full_name TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating users table', { error: err.message });
    } else {
      // Check if the table has new columns; if not, add them
      db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
          logger.error('Error checking users table structure', { error: err.message });
        } else {
          const columnNames = columns.map(col => col.name);
          
          // Add missing columns if they don't exist
          if (!columnNames.includes('full_name')) {
            db.run('ALTER TABLE users ADD COLUMN full_name TEXT', (err) => {
              if (err) logger.error('Error adding full_name column', { error: err.message });
            });
          }
          if (!columnNames.includes('created_at')) {
            db.run('ALTER TABLE users ADD COLUMN created_at DATETIME', (err) => {
              if (err) logger.error('Error adding created_at column', { error: err.message });
            });
          }
          if (!columnNames.includes('updated_at')) {
            db.run('ALTER TABLE users ADD COLUMN updated_at DATETIME', (err) => {
              if (err) logger.error('Error adding updated_at column:', { error: err.message });
            });
          }
          if (!columnNames.includes('failed_login_attempts')) {
            db.run('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0', (err) => {
              if (err) logger.error('Error adding failed_login_attempts column:', { error: err.message });
            });
          }
          if (!columnNames.includes('lockout_until')) {
            db.run('ALTER TABLE users ADD COLUMN lockout_until DATETIME', (err) => {
              if (err) logger.error('Error adding lockout_until column:', { error: err.message });
            });
          }
          if (!columnNames.includes('first_name')) {
            db.run('ALTER TABLE users ADD COLUMN first_name TEXT', (err) => {
              if (err) logger.error('Error adding first_name column:', { error: err.message });
            });
          }
          if (!columnNames.includes('last_name')) {
            db.run('ALTER TABLE users ADD COLUMN last_name TEXT', (err) => {
              if (err) logger.error('Error adding last_name column:', { error: err.message });
            });
          }
          if (!columnNames.includes('phone')) {
            db.run('ALTER TABLE users ADD COLUMN phone TEXT', (err) => {
              if (err) logger.error('Error adding phone column:', { error: err.message });
            });
          }
          if (!columnNames.includes('department')) {
            db.run('ALTER TABLE users ADD COLUMN department TEXT', (err) => {
              if (err) logger.error('Error adding department column:', { error: err.message });
            });
          }
          if (!columnNames.includes('position')) {
            db.run('ALTER TABLE users ADD COLUMN position TEXT', (err) => {
              if (err) logger.error('Error adding position column:', { error: err.message });
            });
          }
          if (!columnNames.includes('brand_number')) {
            db.run('ALTER TABLE users ADD COLUMN brand_number TEXT', (err) => {
              if (err) logger.error('Error adding brand_number column:', { error: err.message });
            });
          }
          if (!columnNames.includes('email')) {
            db.run('ALTER TABLE users ADD COLUMN email TEXT', (err) => {
              if (err) logger.error('Error adding email column:', { error: err.message });
            });
          }
          if (!columnNames.includes('employee_id')) {
            db.run('ALTER TABLE users ADD COLUMN employee_id INTEGER', (err) => {
              if (err) logger.error('Error adding employee_id column:', { error: err.message });
            });
          }
          if (!columnNames.includes('active')) {
            db.run('ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1', (err) => {
              if (err) logger.error('Error adding active column:', { error: err.message });
            });
          }
          if (!columnNames.includes('must_change_password')) {
            db.run('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0', (err) => {
              if (err) logger.error('Error adding must_change_password column:', { error: err.message });
            });
          }
        }
  });

  // Add default user
  const hashedPassword = bcrypt.hashSync('admin', 5);
      
      // Wait for columns to be added before checking the user
      setTimeout(() => {
        db.get('SELECT * FROM users WHERE username = ?', ['admintest'], (err, user) => {
          if (err) {
            logger.error('Error checking user:', { error: err.message });
          } else if (!user) {
            db.run('INSERT INTO users (username, password, role, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))', 
              ['admintest', hashedPassword, 'administrator', 'Orlen Serwis'], 
              (err) => {
                if (err) {
                  logger.error('Error adding user admintest:', { error: err.message });
                } else {
                  logger.info('Added default user admintest');
                }
              });
          } else if (!user.full_name) {
            // Update existing user with missing data
            db.run('UPDATE users SET full_name = ?, role = ?, updated_at = datetime(\'now\') WHERE username = ?', 
              ['Orlen Serwis', 'administrator', 'admintest'], 
              (err) => {
                if (err) {
                  logger.error('Error updating user admintest:', { error: err.message });
                } else {
                  logger.info('Updated user admintest');
              }
            });
          }
          // Backfill: split full_name into first_name/last_name and sync user data from employees by login
          try {
            db.all('SELECT id, username, full_name, first_name, last_name FROM users', [], (uErr, uRows) => {
              if (!uErr && Array.isArray(uRows)) {
                uRows.forEach((u) => {
                  const fn = u.first_name || '';
                  const ln = u.last_name || '';
                  if ((!fn || !ln) && (u.full_name || '')) {
                    const parts = String(u.full_name).trim().split(/\s+/);
                    if (parts.length) {
                      const first = parts.shift();
                      const last = parts.join(' ');
                      db.run('UPDATE users SET first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?), updated_at = datetime("now") WHERE id = ?', [first || null, last || null, u.id]);
                    }
                  }
                });
              }
            });
            db.all('SELECT u.id AS uid, e.id AS eid, e.first_name, e.last_name, e.phone, e.department, e.position, e.brand_number, e.email FROM users u JOIN employees e ON e.login = u.username', [], (mErr, pairs) => {
              if (!mErr && Array.isArray(pairs)) {
                pairs.forEach((p) => {
                  db.run('UPDATE users SET first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?), phone = COALESCE(phone, ?), department = COALESCE(department, ?), position = COALESCE(position, ?), brand_number = COALESCE(brand_number, ?), email = COALESCE(email, ?), employee_id = COALESCE(employee_id, ?) WHERE id = ?', [p.first_name || null, p.last_name || null, p.phone || null, p.department || null, p.position || null, p.brand_number || null, p.email || null, p.eid || null, p.uid]);
                });
              }
            });
          } catch (_) { /* noop */ }
        });
      }, 100);
    }
  });

  // Refresh tokens table
  db.run(`CREATE TABLE IF NOT EXISTS user_refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, token),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating user_refresh_tokens table:', { error: err.message });
    }
  });
  // Tools table
  db.run(`CREATE TABLE IF NOT EXISTS tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    quantity INTEGER DEFAULT 1,
    location TEXT,
    category TEXT,
    description TEXT,
    barcode TEXT,
    qr_code TEXT,
    serial_number TEXT,
    serial_unreadable INTEGER DEFAULT 0,
    status TEXT DEFAULT 'available',
    inventory_number TEXT,
    nfc_tag_id TEXT UNIQUE,
    service_quantity INTEGER DEFAULT 0,
    service_sent_at DATETIME NULL,
    service_order_number TEXT,
    inspection_date DATETIME,
    manufacturer TEXT,
    model TEXT,
    production_year INTEGER,
    production_date TEXT,
    min_stock INTEGER,
    max_stock INTEGER,
    is_consumable INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating tools table:', { error: err.message });
    } else {
      // Check if the table has new columns; if not, add them
      db.all("PRAGMA table_info(tools)", (err, columns) => {
        if (err) {
          logger.error('Error checking tools table structure:', { error: err.message });
        } else {
          const existingColumns = new Set(columns.map(col => col.name));
          const ensureColumn = (name, ddl, cb) => {
            if (existingColumns.has(name)) return cb();
            db.run(`ALTER TABLE tools ADD COLUMN ${ddl}`, (e) => {
              if (e) {
                logger.error(`Error adding ${name} column:`, { error: e.message });
                return cb(e);
              }
              existingColumns.add(name);
              cb();
            });
          };

          const required = [
            ['sku', 'sku TEXT'],
            ['quantity', 'quantity INTEGER DEFAULT 1'],
            ['description', 'description TEXT'],
            ['barcode', 'barcode TEXT'],
            ['qr_code', 'qr_code TEXT'],
            ['serial_number', 'serial_number TEXT'],
            ['serial_unreadable', 'serial_unreadable INTEGER DEFAULT 0'],
            ['status', 'status TEXT DEFAULT "available"'],
            ['inventory_number', 'inventory_number TEXT'],
            ['service_quantity', 'service_quantity INTEGER DEFAULT 0'],
            ['service_sent_at', 'service_sent_at DATETIME NULL'],
            ['service_order_number', 'service_order_number TEXT'],
            ['inspection_date', 'inspection_date DATETIME'],
            ['manufacturer', 'manufacturer TEXT'],
            ['model', 'model TEXT'],
            ['production_year', 'production_year INTEGER'],
            ['production_date', 'production_date TEXT'],
            ['min_stock', 'min_stock INTEGER'],
            ['max_stock', 'max_stock INTEGER'],
            ['is_consumable', 'is_consumable INTEGER DEFAULT 0'],
            ['nfc_tag_id', 'nfc_tag_id TEXT']
          ];

          const ensureAll = (i, done) => {
            if (i >= required.length) return done();
            const [name, ddl] = required[i];
            ensureColumn(name, ddl, (e) => {
              if (e) return done(e);
              ensureAll(i + 1, done);
            });
          };

          // Remove deprecated columns if present
          const deprecatedCols = ['issued_to_employee_id', 'issued_at', 'issued_by_user_id'];
          const hasDeprecated = deprecatedCols.some(c => existingColumns.has(c));
          const continueAfterDeprecatedMigration = (done) => {
            if (!hasDeprecated) return done();
            logger.info('Migrating tools table: removing deprecated issued_* columns');
            db.serialize(() => {
              db.run('BEGIN');
              db.run(`CREATE TABLE IF NOT EXISTS tools_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sku TEXT UNIQUE NOT NULL,
                quantity INTEGER DEFAULT 1,
                location TEXT,
                category TEXT,
                description TEXT,
                barcode TEXT,
                qr_code TEXT,
                serial_number TEXT,
                inventory_number TEXT,
                nfc_tag_id TEXT UNIQUE,
                min_stock INTEGER,
                max_stock INTEGER,
                is_consumable INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT (datetime('now')),
                updated_at DATETIME DEFAULT (datetime('now')),
                serial_unreadable INTEGER DEFAULT 0,
                status TEXT DEFAULT 'available',
                service_quantity INTEGER DEFAULT 0,
                service_sent_at DATETIME NULL,
                service_order_number TEXT,
                inspection_date DATETIME,
                manufacturer TEXT,
                model TEXT,
                production_year INTEGER
              )`);
              db.run(`INSERT INTO tools_new (
                id, name, sku, quantity, location, category, description, barcode, qr_code, serial_number, inventory_number,
                min_stock, max_stock, is_consumable, created_at, updated_at, serial_unreadable, status, service_quantity, service_sent_at,
                service_order_number, inspection_date, manufacturer, model, production_year, nfc_tag_id
              )
              SELECT 
                id, name, sku, quantity, location, category, description, barcode, qr_code, serial_number, inventory_number,
                min_stock, max_stock, is_consumable, created_at, updated_at, 
                COALESCE(serial_unreadable, 0), COALESCE(status, 'available'), COALESCE(service_quantity, 0), service_sent_at,
                service_order_number, inspection_date, manufacturer, model, production_year, nfc_tag_id
              FROM tools`, (insErr) => {
                if (insErr) {
                  logger.error('Error migrating tools data:', { error: insErr.message });
                  db.run('ROLLBACK');
                  return;
                }
                db.run('DROP TABLE tools', (dropErr) => {
                  if (dropErr) {
                    logger.error('Error dropping old tools table:', { error: dropErr.message });
                    db.run('ROLLBACK');
                    return;
                  }
                  db.run('ALTER TABLE tools_new RENAME TO tools', (renameErr) => {
                    if (renameErr) {
                      logger.error('Error renaming tools_new to tools:', { error: renameErr.message });
                      db.run('ROLLBACK');
                      return;
                    }
                    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_inventory_number_unique ON tools(inventory_number) WHERE inventory_number IS NOT NULL', (idxErr) => {
                      if (idxErr) {
                        logger.error('Error recreating unique index for inventory_number:', { error: idxErr.message });
                        db.run('ROLLBACK');
                        return;
                      }
                      db.run('COMMIT');
                      logger.info('Tools table migrated successfully (deprecated columns removed)');
                      done();
                    });
                  });
                });
              });
            });
          };

          db.serialize(() => {
            ensureAll(0, () => {
              db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_nfc_tag_id ON tools(nfc_tag_id) WHERE nfc_tag_id IS NOT NULL', (idxErr) => {
                if (idxErr) logger.error('Error creating index for nfc_tag_id:', { error: idxErr.message });
              });

              continueAfterDeprecatedMigration(() => {
                db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_inventory_number_unique ON tools(inventory_number) WHERE inventory_number IS NOT NULL', (idxErr) => {
                  if (idxErr) {
                    logger.error('Error creating unique index for inventory_number:', { error: idxErr.message });
                  } else {
                    logger.info('Ensured unique index for inventory_number in tools table');
                  }
                });

                // Insert sample tools with the new structure
                db.get('SELECT COUNT(*) as count FROM tools', (cntErr, result) => {
                  if (cntErr) {
                    logger.error('Error checking tools:', { error: cntErr.message });
                  } else if ((result?.count || 0) === 0) {
                    const sampleTools = [
                      ['W01', 'Wiertarko-wkrętarka udarowa Bosch', 'OSSA-H1ZUF1', 1, 'Narzędziownia', 'Elektronarzędzia', 'Wiertarko-wkrętarka udarowa 18V', 'QR17590493791001', 'QR17590493791001', '123456', 0, 'BOSCH', null, null],
                      ['MP01', 'Młot pneumatyczny', 'OSSA-H1ZUF21', 1, 'Narzędziownia', 'Pneumatyczne', 'Młot pneumatyczny 5 kg', 'QR17590493791002', 'QR17590493791002', '123456', 0, null, null, null],
                      ['SK01', 'Szlifierka kątowa', 'OSSA-H1ZUF3', 1, 'Narzędziownia', 'Elektronarzędzia', 'Szlifierka kątowa 125 mm', 'QR17590493791003', 'QR17590493791003', '123456', 0, 'METABO', 'WQ 1400', 2022],
                      ['S01', 'Spawarka MIG/MAG', 'OSSA-H1ZUF4', 1, 'Hala spawaczy', 'Spawalnicze', 'Spawarka MIG/MAG 200 A', 'QR17590493791004', 'QR17590493791004', '123456', 0, null, null, null],
                      ['PL01', 'Pilarka łańcuchowa', 'OSSA-H1ZUF5', 1, 'Narzędziownia', 'Ręczne', 'Pilarka łańcuchowa spalinowa 40 cm', 'QR17590493791005', 'QR17590493791005', '123456', 0, null,  null, null],
                      ['KP17', 'Klucz płaski 17', 'OSSA-H1ZUF6', 3, 'Narzędziownia', 'Ręczne', 'Przykład ilościowo', 'QR17590493791006', 'QR17590493791006', null, 1, null, null, null]

                    ];

                    const stmt = db.prepare('INSERT OR IGNORE INTO tools (inventory_number, name, sku, quantity, location, category, description, barcode, qr_code, serial_number, serial_unreadable, manufacturer, model, production_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    let pending = sampleTools.length;
                    sampleTools.forEach((tool) => {
                      stmt.run(tool, (insErr) => {
                        if (insErr) {
                          logger.error('Error adding tool:', { error: insErr.message });
                        }
                        pending -= 1;
                        if (pending === 0) {
                          stmt.finalize((finErr) => {
                            if (finErr) logger.error('Error finalizing tools seed:', { error: finErr.message });
                            else logger.info('Inserted sample tools with codes');
                          });
                        }
                      });
                    });
                  }
                });
              });
            });
          });
        }
      });
    }
  });

  // Password history table
  db.run(`CREATE TABLE IF NOT EXISTS user_password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    changed_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating user_password_history table:', { error: err.message });
    } else {
      // Index for efficient history checks
      db.run('CREATE INDEX IF NOT EXISTS idx_password_history_user ON user_password_history(user_id, changed_at DESC)', (iErr) => {
        if (iErr) logger.error('Error creating idx_password_history_user:', { error: iErr.message });
      });
    }
  });

  // Tool issues table (new structure for issuing single items)
  db.run(`CREATE TABLE IF NOT EXISTS tool_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    issued_by_user_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    issued_at DATETIME DEFAULT (datetime('now', 'localtime')),
    returned_at DATETIME NULL,
    status TEXT DEFAULT 'issued',
    FOREIGN KEY (tool_id) REFERENCES tools (id),
    FOREIGN KEY (employee_id) REFERENCES employees (id),
    FOREIGN KEY (issued_by_user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table tool_issues:', { error: err.message });
    } else {
      logger.info('Table tool_issues has been created or already exists');
      // Performance indexes
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_tool_issues_tool_id ON tool_issues(tool_id)',
        'CREATE INDEX IF NOT EXISTS idx_tool_issues_employee_id ON tool_issues(employee_id)',
        'CREATE INDEX IF NOT EXISTS idx_tool_issues_status ON tool_issues(status)'
      ];
      indexes.forEach(sql => db.run(sql, (iErr) => {
        if (iErr) logger.error('Error creating index for tool_issues:', { error: iErr.message });
      }));
    }
  });

  // Tool service history table
  db.run(`CREATE TABLE IF NOT EXISTS tool_service_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id INTEGER NOT NULL,
    action TEXT NOT NULL, -- 'sent' | 'received'
    quantity INTEGER NOT NULL,
    order_number TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (tool_id) REFERENCES tools (id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table tool_service_history:', { error: err.message });
    } else {
      logger.info('Table tool_service_history has been created or already exists');
    }
  });

  // BHP table
  db.run(`CREATE TABLE IF NOT EXISTS bhp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_number TEXT UNIQUE NOT NULL,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    catalog_number TEXT,
    inspection_date DATETIME,
    is_set INTEGER DEFAULT 0,
    shock_absorber_serial TEXT,
    shock_absorber_name TEXT,
    shock_absorber_model TEXT,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table bhp:', { error: err.message });
    } else {
      db.all("PRAGMA table_info(bhp)", (infoErr, columns) => {
        if (infoErr) {
          logger.error('Error checking bhp table structure:', { error: infoErr.message });
          return;
        }

        const existingColumns = new Set((columns || []).map((c) => c.name));
        const requiredColumns = [
          ['inventory_number', 'inventory_number TEXT UNIQUE'],
          ['manufacturer', 'manufacturer TEXT'],
          ['model', 'model TEXT'],
          ['serial_number', 'serial_number TEXT'],
          ['catalog_number', 'catalog_number TEXT'],
          ['inspection_date', 'inspection_date DATETIME'],
          ['is_set', 'is_set INTEGER DEFAULT 0'],
          ['shock_absorber_serial', 'shock_absorber_serial TEXT'],
          ['shock_absorber_name', 'shock_absorber_name TEXT'],
          ['shock_absorber_model', 'shock_absorber_model TEXT'],
          ['shock_absorber_catalog_number', 'shock_absorber_catalog_number TEXT'],
          ['harness_start_date', 'harness_start_date DATETIME'],
          ['shock_absorber_start_date', 'shock_absorber_start_date DATETIME'],
          ['shock_absorber_production_date', 'shock_absorber_production_date DATETIME'],
          ['production_date', 'production_date DATETIME'],
          ['has_shock_absorber', 'has_shock_absorber INTEGER DEFAULT 0'],
          ['has_srd', 'has_srd INTEGER DEFAULT 0'],
          ['srd_manufacturer', 'srd_manufacturer TEXT'],
          ['srd_model', 'srd_model TEXT'],
          ['srd_serial_number', 'srd_serial_number TEXT'],
          ['srd_catalog_number', 'srd_catalog_number TEXT'],
          ['srd_production_date', 'srd_production_date DATETIME'],
          ['status', 'status TEXT DEFAULT "available"'],
          ['nfc_tag_id', 'nfc_tag_id TEXT UNIQUE']
        ];

        const addColumnIfMissing = (name, ddl, cb) => {
          if (existingColumns.has(name)) return cb();

          const wantsUnique = /\bUNIQUE\b/i.test(ddl);
          const ddlSafe = String(ddl).replace(/\s+UNIQUE\b/i, '');
          db.run(`ALTER TABLE bhp ADD COLUMN ${ddlSafe}`, (alterErr) => {
            if (alterErr) {
              logger.error(`Error adding column ${name}:`, { error: alterErr.message });
              return cb(alterErr);
            }

            existingColumns.add(name);

            if (!wantsUnique) return cb();
            const idxName = `idx_bhp_${name}_unique`;
            db.run(
              `CREATE UNIQUE INDEX IF NOT EXISTS ${idxName} ON bhp(${name}) WHERE ${name} IS NOT NULL`,
              (idxErr) => {
                if (idxErr) {
                  logger.error(`Error creating unique index for ${name}:`, { error: idxErr.message });
                  return cb(idxErr);
                }
                cb();
              }
            );
          });
        };

        const ensureAllColumns = (i, done) => {
          if (i >= requiredColumns.length) return done();
          const [name, ddl] = requiredColumns[i];
          addColumnIfMissing(name, ddl, (colErr) => {
            if (colErr) return done(colErr);
            ensureAllColumns(i + 1, done);
          });
        };

        const seedSampleBhp = () => {
          db.get('SELECT COUNT(*) as count FROM bhp', [], (cntErr, row) => {
            if (cntErr) {
              logger.error('Error checking bhp:', { error: cntErr.message });
              return;
            }
            if ((row?.count || 0) !== 0) return;

            const sampleBhp = [
              [
                'S005',
                'PROTEKT',
                'P-22 PRO',
                '19730342',
                'AB12201',
                '2025-10-04 00:00:00+00',
                1,
                '19663539',
                'PROTEKT',
                'LB100',
                'BW200/LB100',
                '2023-10-01 00:00:00+00',
                null,
                '2020-01-01 00:00:00+00',
                '2020-01-01 00:00:00+00',
                0,
                0,
                null,
                null,
                null,
                null,
                null,
                'available',
                '2025-10-03 06:09:03+00',
                '2025-10-03 09:44:49+00',
                null
              ],
              [
                'S006',
                'PROTEKT',
                'P-22 PRO',
                '19730328',
                'AB12201',
                '2026-09-25 00:00:00+00',
                1,
                '19663545',
                'PROTEKT',
                'LB100',
                'BW200/LB100',
                '2023-10-01 00:00:00+00',
                null,
                '2020-01-01 00:00:00+00',
                '2019-08-01 00:00:00+00',
                1,
                0,
                null,
                null,
                null,
                null,
                null,
                'available',
                '2025-10-03 09:53:33+00',
                '2025-12-22 10:40:22+00',
                null
              ]
            ];

            const stmt = db.prepare(
              'INSERT OR IGNORE INTO bhp (inventory_number, manufacturer, model, serial_number, catalog_number, inspection_date, is_set, shock_absorber_serial, shock_absorber_name, shock_absorber_model, shock_absorber_catalog_number, harness_start_date, shock_absorber_start_date, shock_absorber_production_date, production_date, has_shock_absorber, has_srd, srd_manufacturer, srd_model, srd_serial_number, srd_catalog_number, srd_production_date, status, created_at, updated_at, nfc_tag_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );

            let pending = sampleBhp.length;
            sampleBhp.forEach((item) => {
              stmt.run(item, (insErr) => {
                if (insErr) logger.error('Error adding bhp sample:', { error: insErr.message });
                pending -= 1;
                if (pending === 0) {
                  stmt.finalize((finErr) => {
                    if (finErr) {
                      logger.error('Error finalizing bhp sample seed:', { error: finErr.message });
                    } else {
                      logger.info('Inserted sample BHP equipment');
                    }
                  });
                }
              });
            });
          });
        };

        db.serialize(() => {
          ensureAllColumns(0, (ensureErr) => {
            if (ensureErr) return;
            seedSampleBhp();
          });
        });
      });
    }
  });

  // PPE issue/return table
  db.run(`CREATE TABLE IF NOT EXISTS bhp_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bhp_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    issued_by_user_id INTEGER NOT NULL,
    issued_at DATETIME DEFAULT (datetime('now', 'localtime')),
    returned_at DATETIME NULL,
    status TEXT DEFAULT 'issued',
    FOREIGN KEY (bhp_id) REFERENCES bhp (id),
    FOREIGN KEY (employee_id) REFERENCES employees (id),
    FOREIGN KEY (issued_by_user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table bhp_issues:', { error: err.message });
    } else {
      logger.info('Table bhp_issues has been created or already exists');
      // Performance indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_bhp_issues_bhp_id ON bhp_issues(bhp_id)', (iErr) => {
        if (iErr) logger.error('Error creating idx_bhp_issues_bhp_id:', { error: iErr.message });
      });
      db.run('CREATE INDEX IF NOT EXISTS idx_bhp_issues_employee_id ON bhp_issues(employee_id)', (iErr) => {
        if (iErr) logger.error('Error creating idx_bhp_issues_employee_id:', { error: iErr.message });
      });
    }
  });

  // Notifications table (user-specific notifications like return requests)
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    employee_id INTEGER NULL,
    subject TEXT,
    target_url TEXT,
    message TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    read_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table notifications:', { error: err.message });
    } else {
      logger.info('Table notifications has been created or already exists');
      // Helpful indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)');
      db.run('CREATE INDEX IF NOT EXISTS idx_notifications_item ON notifications(item_type, item_id)');
    }
  });

  // Custom notifications history (AppConfig -> Powiadomienia)
  db.run(`CREATE TABLE IF NOT EXISTS notification_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'broadcast' | 'custom'
    sender TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table notification_history:', { error: err.message });
    } else {
      db.run('CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(type)');
      db.run('CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at DESC)');
    }
  });
  
  db.all('PRAGMA table_info(notifications)', [], (e1, cols1) => {
    if (!e1) {
      const hasSubject = Array.isArray(cols1) && cols1.some(c => String(c.name).toLowerCase() === 'subject');
      const hasTargetUrl = Array.isArray(cols1) && cols1.some(c => String(c.name).toLowerCase() === 'target_url');
      const hasInventoryNumber = Array.isArray(cols1) && cols1.some(c => String(c.name).toLowerCase() === 'inventory_number');
      const hasModel = Array.isArray(cols1) && cols1.some(c => String(c.name).toLowerCase() === 'model');

      if (!hasSubject) {
        db.run('ALTER TABLE notifications ADD COLUMN subject TEXT', [], (eAlter) => {
          if (eAlter) logger.error('Failed to add subject to notifications:', { error: eAlter.message });
        });
      }
      if (!hasTargetUrl) {
        db.run('ALTER TABLE notifications ADD COLUMN target_url TEXT', [], (eAlter) => {
          if (eAlter) logger.error('Failed to add target_url to notifications:', { error: eAlter.message });
        });
      }
      if (!hasInventoryNumber) {
        db.run('ALTER TABLE notifications ADD COLUMN inventory_number TEXT', [], (eAlter) => {
          if (eAlter) logger.error('Failed to add inventory_number to notifications:', { error: eAlter.message });
        });
      }
      if (!hasModel) {
        db.run('ALTER TABLE notifications ADD COLUMN model TEXT', [], (eAlter) => {
          if (eAlter) logger.error('Failed to add model to notifications:', { error: eAlter.message });
        });
      }
    }
  });
  db.all('PRAGMA table_info(notification_history)', [], (e2, cols2) => {
    if (!e2) {
      const hasSubject = Array.isArray(cols2) && cols2.some(c => String(c.name).toLowerCase() === 'subject');
      if (!hasSubject) {
        db.run('ALTER TABLE notification_history ADD COLUMN subject TEXT', [], (eAlter) => {
          if (eAlter) logger.error('Failed to add subject to notification_history:', { error: eAlter.message });
        });
      }
    }
  });

  // Web Push: subscriptions
  db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, endpoint),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating push_subscriptions table:', { error: err.message });
    } else {
      db.run('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
    }
  });

  // Mobile Push: Expo tokens
  db.run(`CREATE TABLE IF NOT EXISTS mobile_push_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, token),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating mobile_push_tokens table:', { error: err.message });
    } else {
      db.run('CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user ON mobile_push_tokens(user_id)');
    }
  });

  // Recipients for custom notifications (store snapshot of names)
  db.run(`CREATE TABLE IF NOT EXISTS notification_history_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id INTEGER NOT NULL,
    user_id INTEGER,
    name TEXT,
    FOREIGN KEY(history_id) REFERENCES notification_history(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table notification_history_recipients:', { error: err.message });
    } else {
      db.run('CREATE INDEX IF NOT EXISTS idx_notification_recipients_history ON notification_history_recipients(history_id)');
    }
  });
  // Employees table
  db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    position TEXT NOT NULL,
    department TEXT NOT NULL,
    brand_number TEXT,
    email TEXT,
    login TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table employees:', { error: err.message });
    } else {
      // Check if table has new columns; add if missing
      db.all("PRAGMA table_info(employees)", (err, columns) => {
        if (err) {
          logger.error('Error checking employees table structure:', { error: err.message });
        } else {
          const columnNames = columns.map(col => col.name);
          if (!columnNames.includes('first_name')) {
            db.run('ALTER TABLE employees ADD COLUMN first_name TEXT', (err) => {
              if (err) logger.error('Error adding column first_name:', { error: err.message });
            });
          }
          if (!columnNames.includes('last_name')) {
            db.run('ALTER TABLE employees ADD COLUMN last_name TEXT', (err) => {
              if (err) logger.error('Error adding column last_name:', { error: err.message });
            });
          }
          if (!columnNames.includes('phone')) {
            db.run('ALTER TABLE employees ADD COLUMN phone TEXT', (err) => {
              if (err) logger.error('Error adding column phone:', { error: err.message });
            });
          }
          if (!columnNames.includes('created_at')) {
            db.run('ALTER TABLE employees ADD COLUMN created_at DATETIME DEFAULT (datetime(\'now\'))', (err) => {
              if (err) logger.error('Error adding column created_at:', { error: err.message });
            });
          }
          if (!columnNames.includes('brand_number')) {
            db.run('ALTER TABLE employees ADD COLUMN brand_number TEXT', (err) => {
              if (err) logger.error('Error adding column brand_number:', { error: err.message });
            });
          }
          if (!columnNames.includes('email')) {
            db.run('ALTER TABLE employees ADD COLUMN email TEXT', (err) => {
              if (err) logger.error('Error adding column email:', { error: err.message });
            });
          }
          if (!columnNames.includes('login')) {
            db.run('ALTER TABLE employees ADD COLUMN login TEXT', (err) => {
              if (err) logger.error('Error adding column login:', { error: err.message });
            });
          }
          if (!columnNames.includes('rfid_uid')) {
            db.run('ALTER TABLE employees ADD COLUMN rfid_uid TEXT', (err) => {
              if (err) logger.error('Error adding column rfid_uid:', { error: err.message });
            });
          }
          if (!columnNames.includes('status')) {
            db.run("ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'active'", (err) => {
              if (err) logger.error('Error adding column status:', { error: err.message });
            });
          }
        }
      });

      // Insert real employees
      const sampleEmployees = [
        ['Dawid', 'Kowalski', '+48 000 000 000', 'Narzędziowiec', 'Narzędziownia', '1'],
        ['Piotr', 'Kowalski', '+48 123 456 785', 'Narzędziowiec', 'Narzędziownia', '2'],
      ];

      db.get('SELECT COUNT(*) as count FROM employees', (err, result) => {
        if (err) {
          logger.error('Error checking employees:', { error: err.message });
        } else if (result.count === 0) {
          const stmt = db.prepare('INSERT INTO employees (first_name, last_name, phone, position, department, brand_number) VALUES (?, ?, ?, ?, ?, ?)');
          sampleEmployees.forEach(employee => {
            stmt.run(employee, (err) => {
              if (err) {
                logger.error('Error adding employee:', { error: err.message });
              }
            });
          });
          stmt.finalize();
          logger.info('Added real employees');
        }
      });
    }
  });

  // Chat tables
  db.run(`CREATE TABLE IF NOT EXISTS chat_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_participants (
    conversation_id INTEGER,
    user_id INTEGER,
    PRIMARY KEY (conversation_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    sender_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (!err) {
      db.all("PRAGMA table_info(chat_messages)", (err, columns) => {
        if (!err) {
          const names = (columns || []).map(c => c.name);
          if (!names.includes('reply_to_id')) {
            db.run("ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER DEFAULT NULL", (e) => {
              if (e) logger.error('Error adding reply_to_id column:', { error: e.message });
            });
          }
        }
      });
    }
  });
  db.run(`CREATE TABLE IF NOT EXISTS chat_message_reads (
    message_id INTEGER,
    user_id INTEGER,
    read_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    message_id INTEGER,
    filename TEXT,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    url TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_typing_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    user_id INTEGER,
    created_at DATETIME DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_blocks (
    conversation_id INTEGER,
    blocked_user_id INTEGER,
    blocked_by INTEGER,
    blocked_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (conversation_id, blocked_user_id)
  )`);

  // Audit logs table
  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table audit_logs:', { error: err.message });
    } else {
      logger.info('Table audit_logs has been created or already exists');
      // Migration: add missing columns in audit_logs
      db.all("PRAGMA table_info(audit_logs)", (infoErr, columns) => {
        if (infoErr) {
          logger.error('Error checking audit_logs table structure:', { error: infoErr.message });
          return;
        }
        const columnNames = (columns || []).map(c => c.name);
        if (!columnNames.includes('target_type')) {
          db.run('ALTER TABLE audit_logs ADD COLUMN target_type TEXT', (alterErr) => {
            if (alterErr) logger.error('Error adding column target_type:', { error: alterErr.message });
          });
        }
        if (!columnNames.includes('target_id')) {
          db.run('ALTER TABLE audit_logs ADD COLUMN target_id TEXT', (alterErr) => {
            if (alterErr) logger.error('Error adding column target_id:', { error: alterErr.message });
          });
        }
      });
    }
  });

  // Departments table
  db.run(`CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table departments:', { error: err.message });
    } else {
      logger.info('Table departments has been created or already exists');
      // Add missing columns if they do not exist (ensure sequential execution)
      db.all("PRAGMA table_info(departments)", (err, columns) => {
        if (err) {
          logger.error('Error checking departments table structure:', { error: err.message });
        } else {
          const columnNames = columns.map(col => col.name);
          db.serialize(() => {
            if (!columnNames.includes('manager_id')) {
              db.run('ALTER TABLE departments ADD COLUMN manager_id INTEGER', (alterErr) => {
                if (alterErr) logger.error('Error adding column manager_id:', { error: alterErr.message });
              });
            }
            if (!columnNames.includes('status')) {
              db.run('ALTER TABLE departments ADD COLUMN status TEXT DEFAULT "active"', (alterErr) => {
                if (alterErr) logger.error('Error adding column status:', { error: alterErr.message });
              });
            }
            if (!columnNames.includes('updated_at')) {
              db.run('ALTER TABLE departments ADD COLUMN updated_at DATETIME', (alterErr) => {
                if (alterErr) logger.error('Error adding column updated_at:', { error: alterErr.message });
              });
            }
            // Migration: set status='active' for existing records without status
            db.run('UPDATE departments SET status = COALESCE(NULLIF(status, ""), "active") WHERE status IS NULL OR TRIM(status) = ""', (migErr) => {
              if (migErr) logger.error('Error migrating status in departments:', { error: migErr.message });
            });

            const defaultDepartments = [
              'Administracja',
              'Automatyczny',
              'Elektryczny',
              'Mechaniczny',
              'Narzędziownia',
              'Skrawanie',
              'Pomiarowy',
              'Zewnętrzny',
              'Ślusarko-spawalniczy'
            ];

            db.all('SELECT name FROM departments', [], (listErr, rows) => {
              if (listErr) {
                logger.error('Error checking departments', { error: listErr.message });
                return;
              }

              const existing = new Set((rows || []).map((r) => r?.name).filter(Boolean));
              const missing = defaultDepartments.filter((name) => !existing.has(name));
              if (missing.length === 0) return;

              const stmt = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
              let pending = missing.length;
              missing.forEach((name) => {
                stmt.run(name, (insErr) => {
                  if (insErr) logger.error('Error seeding departments', { error: insErr.message, name });
                  pending -= 1;
                  if (pending === 0) {
                    stmt.finalize((finErr) => {
                      if (finErr) logger.error('Error finalizing departments seed', { error: finErr.message });
                      else logger.info('Seeded default departments', { inserted: missing.length });
                    });
                  }
                });
              });
            });
          });
        }
      });
    }
  });

  // Positions table
  db.run(`CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table positions:', { error: err.message });
    } else {
      logger.info('Table positions has been created or already exists');
      // Add missing columns if they do not exist (ensure sequential execution)
      db.all("PRAGMA table_info(positions)", (err, columns) => {
        if (err) {
          logger.error('Error checking positions table structure:', { error: err.message });
        } else {
          const columnNames = columns.map(col => col.name);
          db.serialize(() => {
            if (!columnNames.includes('description')) {
              db.run('ALTER TABLE positions ADD COLUMN description TEXT', (alterErr) => {
                if (alterErr) logger.error('Error adding column description:', { error: alterErr.message });
              });
            }
            if (!columnNames.includes('department_id')) {
              db.run('ALTER TABLE positions ADD COLUMN department_id INTEGER', (alterErr) => {
                if (alterErr) logger.error('Error adding column department_id:', { error: alterErr.message });
              });
            }
            if (!columnNames.includes('requirements')) {
              db.run('ALTER TABLE positions ADD COLUMN requirements TEXT', (alterErr) => {
                if (alterErr) logger.error('Error adding column requirements:', { error: alterErr.message });
              });
            }
            if (!columnNames.includes('status')) {
              db.run('ALTER TABLE positions ADD COLUMN status TEXT DEFAULT "active"', (alterErr) => {
                if (alterErr) logger.error('Error adding column status:', { error: alterErr.message });
              });
            }
            if (!columnNames.includes('updated_at')) {
              db.run('ALTER TABLE positions ADD COLUMN updated_at DATETIME', (alterErr) => {
                if (alterErr) logger.error('Error adding column updated_at', { error: alterErr.message });
              });
            }
            // Migration: set status='active' for existing records without status
            db.run('UPDATE positions SET status = COALESCE(NULLIF(status, ""), "active") WHERE status IS NULL OR TRIM(status) = ""', (migErr) => {
              if (migErr) logger.error('Error migrating status in positions', { error: migErr.message });
            });

            const defaultPositions = [
              'Kierownik działu',
              'Automatyk',
              'Elektryk',
              'Mechanik',
              'Narzędziowiec',
              'Pomiarowiec',
              'Tokarz',
              'Spawacz',
              'Ślusarz',
              'Zewnętrzny'
            ];

            db.all('SELECT name FROM positions', [], (listErr, rows) => {
              if (listErr) {
                logger.error('Error checking positions', { error: listErr.message });
                return;
              }

              const existing = new Set((rows || []).map((r) => r?.name).filter(Boolean));
              const missing = defaultPositions.filter((name) => !existing.has(name));
              if (missing.length === 0) return;

              const stmt = db.prepare('INSERT OR IGNORE INTO positions (name) VALUES (?)');
              let pending = missing.length;
              missing.forEach((name) => {
                stmt.run(name, (insErr) => {
                  if (insErr) logger.error('Error seeding positions', { error: insErr.message, name });
                  pending -= 1;
                  if (pending === 0) {
                    stmt.finalize((finErr) => {
                      if (finErr) logger.error('Error finalizing positions seed', { error: finErr.message });
                      else logger.info('Seeded default positions', { inserted: missing.length });
                    });
                  }
                });
              });
            });
          });
        }
      });
    }
  });

  // Role permissions table
  db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(role, permission)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table role_permissions', { error: err.message });
    } else {
      logger.info('Table role_permissions has been created or already exists');
      
      // Initialize default role permissions (excluding 'viewer' role)
      const defaultPermissions = {
        'administrator': ['VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS', 'VIEW_ANALYTICS', 'VIEW_ALL_TOOLS', 'VIEW_TOOL_HISTORY', 'MANAGE_DEPARTMENTS', 'MANAGE_POSITIONS', 'SYSTEM_SETTINGS', 'VIEW_ADMIN', 'MANAGE_USERS', 'VIEW_AUDIT_LOG', 'VIEW_BHP', 'VIEW_BHP_HISTORY', 'MANAGE_BHP', 'VIEW_QUICK_ACTIONS', 'DELETE_ISSUE_HISTORY', 'DELETE_RETURN_HISTORY', 'DELETE_SERVICE_HISTORY', 'MANAGE_EMPLOYEES', 'VIEW_DATABASE', 'MANAGE_DATABASE', 'VIEW_INVENTORY', 'INVENTORY_MANAGE_SESSIONS', 'INVENTORY_SCAN', 'INVENTORY_ACCEPT_CORRECTION', 'INVENTORY_DELETE_CORRECTION', 'INVENTORY_EXPORT_CSV', 'NOTIFY'],
        'manager': ['VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'MANAGE_DEPARTMENTS', 'MANAGE_POSITIONS', 'VIEW_ANALYTICS', 'VIEW_ALL_TOOLS', 'VIEW_TOOL_HISTORY', 'VIEW_BHP', 'VIEW_BHP_HISTORY', 'MANAGE_BHP', 'VIEW_QUICK_ACTIONS', 'MANAGE_EMPLOYEES', 'VIEW_INVENTORY', 'INVENTORY_MANAGE_SESSIONS', 'INVENTORY_SCAN', 'INVENTORY_ACCEPT_CORRECTION', 'INVENTORY_EXPORT_CSV', 'NOTIFY'],
        'toolsmaster': ['VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS', 'VIEW_ANALYTICS', 'VIEW_ALL_TOOLS', 'VIEW_TOOL_HISTORY', 'MANAGE_DEPARTMENTS', 'MANAGE_POSITIONS', 'MANAGE_USERS', 'VIEW_AUDIT_LOG', 'VIEW_BHP', 'VIEW_BHP_HISTORY', 'MANAGE_BHP', 'VIEW_QUICK_ACTIONS', 'MANAGE_EMPLOYEES', 'VIEW_INVENTORY', 'INVENTORY_MANAGE_SESSIONS', 'INVENTORY_SCAN', 'INVENTORY_ACCEPT_CORRECTION', 'INVENTORY_DELETE_CORRECTION', 'INVENTORY_EXPORT_CSV', 'NOTIFY'],
        'hr': ['VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'MANAGE_DEPARTMENTS', 'MANAGE_POSITIONS', 'VIEW_USERS', 'VIEW_TOOLS', 'VIEW_BHP'],
        'supervisor': ['VIEW_USERS', 'VIEW_TOOLS', 'VIEW_BHP', 'VIEW_TOOL_HISTORY', 'VIEW_BHP_HISTORY'],
        'engineer': ['VIEW_TOOLS', 'VIEW_BHP', 'VIEW_TOOL_HISTORY', 'VIEW_BHP_HISTORY'],
        'employee': ['VIEW_TOOLS', 'VIEW_BHP', 'VIEW_TOOL_HISTORY', 'VIEW_BHP_HISTORY'],
        'user': []
      };

      // Seed default permissions if role_permissions table is empty
      db.get('SELECT COUNT(*) as count FROM role_permissions', [], (countErr, row) => {
        if (countErr) {
          logger.error('Error checking role_permissions:', { error: countErr.message });
        } else {
          const expectedCount = Object.values(defaultPermissions)
            .map((perms) => Array.from(new Set(perms || [])).filter(Boolean).length)
            .reduce((sum, n) => sum + n, 0);

          if ((row?.count || 0) >= expectedCount) return;

          db.serialize(() => {
            const stmt = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
            try {
              Object.entries(defaultPermissions).forEach(([role, perms]) => {
                const uniquePerms = Array.from(new Set(perms || [])).filter(Boolean);
                uniquePerms.forEach((perm) => {
                  stmt.run([role, perm], (runErr) => {
                    if (runErr) {
                      logger.error('Error seeding role_permissions', { error: runErr.message, role, permission: perm });
                    }
                  });
                });
              });
              logger.info('Initialized default role permissions in role_permissions');
            } catch (seedErr) {
              logger.error('Error initializing role permissions:', { error: seedErr.message });
            } finally {
              stmt.finalize();
            }
          });
        }
      });
    }
  });
  // ===== Inventory tables =====
  db.run(`CREATE TABLE IF NOT EXISTS inventory_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',  -- active | paused | ended
    owner_user_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT (datetime('now')),
    paused_at DATETIME,
    finished_at DATETIME,
    notes TEXT
  )`, (err) => {
    if (err) {
      logger.error('Error creating table inventory_sessions:', { error: err.message });
    } else {
      logger.info('Table inventory_sessions has been created or already exists');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS inventory_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    tool_id INTEGER NOT NULL,
    code TEXT,
    counted_qty INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(session_id, tool_id),
    FOREIGN KEY (session_id) REFERENCES inventory_sessions(id),
    FOREIGN KEY (tool_id) REFERENCES tools(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table inventory_counts:', { error: err.message });
    } else {
      logger.info('Table inventory_counts has been created or already exists');
      db.run('CREATE INDEX IF NOT EXISTS idx_inventory_counts_session ON inventory_counts(session_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_inventory_counts_tool ON inventory_counts(tool_id)');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS inventory_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    tool_id INTEGER NOT NULL,
    difference_qty INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    accepted_by_user_id INTEGER,
    accepted_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES inventory_sessions(id),
    FOREIGN KEY (tool_id) REFERENCES tools(id)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table inventory_corrections:', { error: err.message });
    } else {
      logger.info('Table inventory_corrections has been created or already exists');
    }
  });

  // Reports table
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by_user_id INTEGER,
    created_by_username TEXT,
    type TEXT NOT NULL, -- employee | tool | bhp | other
    employee_id INTEGER,
    employee_name_manual TEXT,
    tool_id INTEGER,
    bhp_category TEXT,
    subject TEXT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL, -- low | medium | high
    status TEXT NOT NULL DEFAULT 'accepted', -- accepted | checking | resolved
    attachments TEXT, -- JSON array
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      logger.error('Error creating table reports', { error: err.message });
    } else {
      db.run('CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type)');
      db.run('CREATE INDEX IF NOT EXISTS idx_reports_severity ON reports(severity)');
      db.run('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)');
      logger.info('Table reports has been created or already exists');
      // Ensure missing columns are added (on-the-fly migrations)
      db.all("PRAGMA table_info(reports)", (infoErr, columns) => {
        if (infoErr) {
          logger.error('Error checking reports table structure', { error: infoErr.message });
          return;
        }
        const names = (columns || []).map(c => c.name);
        if (!names.includes('employee_name_manual')) {
          db.run('ALTER TABLE reports ADD COLUMN employee_name_manual TEXT', (alterErr) => {
            if (alterErr) {
              logger.error('Error adding column employee_name_manual', { error: alterErr.message });
            } else {
              logger.info('Added column employee_name_manual to reports table');
            }
          });
        }
      });
    }
  });

  // i18n translations table (stores language key overrides)
  db.run(`CREATE TABLE IF NOT EXISTS translate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lang TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(lang, key)
  )`, (err) => {
    if (err) {
      logger.error('Error creating table translate:', { error: err.message });
    } else {
      seedTranslationsFromFiles(db);
    }
  });
  }
};

// Helpers to flatten/unflatten JSON objects (dot keys)
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

function readJsonSafeAsync(jsonPath) {
  return fs.promises.readFile(jsonPath, 'utf8')
    .then(raw => JSON.parse(raw))
    .catch(e => {
      logger.error('Failed to read JSON file:', { path: jsonPath, error: e.message });
      return {};
    });
}

function seedTranslationsFromFiles(db) {
  db.get('SELECT COUNT(*) as cnt FROM translate', [], async (err, row) => {
    if (err) {
      logger.error('Error checking translate table contents:', { error: err.message });
      return;
    }
    const cnt = row?.cnt || 0;
    if (cnt > 0) {
      return; // Records exist already; do not reseed
    }
    const plPath = path.join(ROOT_DIR, 'src', 'i18n', 'pl.json');
    const enPath = path.join(ROOT_DIR, 'src', 'i18n', 'en.json');
    const dePath = path.join(ROOT_DIR, 'src', 'i18n', 'de.json');
    const czPath = path.join(ROOT_DIR, 'src', 'i18n', 'cz.json');
    
    try {
      const [plDict, enDict, deDict, czDict] = await Promise.all([
        readJsonSafeAsync(plPath),
        readJsonSafeAsync(enPath),
        readJsonSafeAsync(dePath),
        readJsonSafeAsync(czPath)
      ]);

      const plFlat = flattenObject(plDict);
      const enFlat = flattenObject(enDict);
      const deFlat = flattenObject(deDict);
      const czFlat = flattenObject(czDict);
      
      const insertStmt = db.prepare('INSERT OR IGNORE INTO translate (lang, key, value, updated_at) VALUES (?, ?, ?, datetime("now"))');
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        for (const [k, v] of Object.entries(plFlat)) {
          insertStmt.run('pl', k, v);
        }
        for (const [k, v] of Object.entries(enFlat)) {
          insertStmt.run('en', k, v);
        }
        for (const [k, v] of Object.entries(deFlat)) {
          insertStmt.run('de', k, v);
        }
        for (const [k, v] of Object.entries(czFlat)) {
          insertStmt.run('cz', k, v);
        }
        insertStmt.finalize();
        db.run('COMMIT');
      });
      logger.info('Seeded translations from i18n files into translate table');
    } catch (e) {
      logger.error('Error seeding translations:', { error: e.message });
    }
  });
}
