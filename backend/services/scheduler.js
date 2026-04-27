const db = require('../database/db');
const logger = require('../logger');
const { logSystemEvent } = require('../helpers/audit');
const path = require('path');
const fs = require('fs');
const { ROOT_DIR } = require('../config/constants');

const BACKUP_DIR = path.join(__dirname, 'backups');

function ensureBackupDirSync() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      logger.info('Utworzono katalog kopii zapasowych', { path: BACKUP_DIR });
    }
  } catch (err) {
    logger.error('Nie udało się utworzyć katalogu kopii zapasowych', { error: err.message });
  }
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function cleanupBackups() {
  db.get('SELECT backup_retention_days FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) return logger.error('Error reading retention config', { error: err.message });
    const days = row?.backup_retention_days || 30;
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    fs.readdir(BACKUP_DIR, (err, files) => {
      if (err) return logger.error('Error reading backup dir', { error: err.message });
      
      files.forEach(file => {
        if (!file.startsWith('database-') || !file.endsWith('.db')) return;
        const filePath = path.join(BACKUP_DIR, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (stats.mtime < thresholdDate) {
            fs.unlink(filePath, (err) => {
              if (err) logger.error('Error deleting old backup', { file, error: err.message });
              else logger.info('Deleted old backup', { file });
            });
          }
        });
      });
    });
  });
}

function performBackup(callback) {
  fs.mkdir(BACKUP_DIR, { recursive: true }, (mkdirErr) => {
    if (mkdirErr) {
      logger.error('Nie udało się utworzyć katalogu kopii zapasowych', { error: mkdirErr.message });
      if (callback) callback(mkdirErr);
      return;
    }
    const src = path.join(__dirname, '../database.db');
    const stamp = formatTimestamp(new Date());
    const dest = path.join(BACKUP_DIR, `database-${stamp}.db`);
    
    fs.copyFile(src, dest, (err) => {
      if (err) {
        logger.error('Error performing backup', { error: err.message });
        logSystemEvent('error', 'BACKUP', 'Backup creation failed', { error: err.message });
        if (callback) callback(err);
        return;
      }
      
      logger.info('Wykonano kopiÄ™ bazy danych', { path: dest });
      logSystemEvent('info', 'BACKUP', 'Backup created successfully', { file: path.basename(dest) });
      // Zaktualizuj last_backup_at
      db.run('UPDATE app_config SET last_backup_at = datetime("now"), updated_at = datetime("now") WHERE id = 1');
      cleanupBackups();
      if (callback) callback(null, dest);
    });
  });
}

function shouldRunBackup(frequency, lastBackupAt) {
  const now = new Date();
  let thresholdMs;
  switch ((frequency || 'daily')) {
    case 'weekly':
      thresholdMs = 7 * 24 * 60 * 60 * 1000; // 7 dni
      break;
    case 'monthly':
      thresholdMs = 30 * 24 * 60 * 60 * 1000; // ~30 dni
      break;
    case 'daily':
    default:
thresholdMs = 24 * 60 * 60 * 1000; // 1 day
  }
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt);
  return (now - last) >= thresholdMs;
}

function checkAndRunBackup() {
  db.get('SELECT backup_frequency, last_backup_at FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) {
      logger.error('Error reading backup config', { error: err.message });
      return;
    }
    const freq = row?.backup_frequency || 'daily';
    const last = row?.last_backup_at || null;
    if (shouldRunBackup(freq, last)) {
      performBackup();
    }
  });
}

function initBackupScheduler() {
  ensureBackupDirSync();
  // Run an hourly check to determine whether to perform a backup
  setInterval(checkAndRunBackup, 60 * 60 * 1000);
  logger.info('Backup scheduler started (checks hourly).');
}

function initTokenCleanupScheduler() {
  const cleanup = () => {
    db.run('DELETE FROM user_refresh_tokens WHERE expires_at < datetime("now")', function(err) {
      if (err) logger.error('Error cleaning up expired tokens', { error: err.message });
      else if (this.changes > 0) logger.info(`Cleaned up ${this.changes} expired refresh tokens.`);
    });
  };
  // Run every 24 hours
  setInterval(cleanup, 24 * 60 * 60 * 1000);
  logger.info('Token cleanup scheduler started (daily).');
  // Run once on startup
  cleanup();
}


module.exports = {
  initBackupScheduler,
  initTokenCleanupScheduler,
  performBackup,
  BACKUP_DIR
};

