const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { performBackup, BACKUP_DIR } = require('../services/scheduler');
const { logSystemEvent } = require('../helpers/audit');

/**
 * @swagger
 * tags:
 *   name: Backup
 *   description: Database backup management
 */

/**
 * @swagger
 * /backup/run:
 *   post:
 *     summary: Run manual backup
 *     description: Creates a new backup of the database (Administrator only).
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup completed
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// Run manual backup (administrator only)
router.post('/run', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to run backup' });
  }
  performBackup((err, dest) => {
    if (err) return res.status(500).json({ message: 'Server error', error: err.message });
    return res.json({ message: 'Backup completed', file: path.basename(dest) });
  });
});

// Backup list (administrator only)
router.get('/list', authenticateToken, async (req, res) => {
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to view backups' });
  }
  
  try {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    
    fs.readdir(BACKUP_DIR, async (err, dirFiles) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      
      try {
        const files = dirFiles.filter(f => f.startsWith('database-') && f.endsWith('.db'));
        const results = await Promise.all(files.map(async f => {
          const full = path.join(BACKUP_DIR, f);
          let createdAt = null;
          try {
            const stat = await fs.promises.stat(full);
            createdAt = stat.mtime.toISOString();
          } catch (_) {}
          return { file: f, createdAt };
        }));
        res.json({ backups: results });
      } catch (processErr) {
         res.status(500).json({ message: 'Server error', error: processErr.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Download backup (administrator only)
router.get('/download/:filename', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to download backup' });
  }
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('database-') || !filename.endsWith('.db')) {
    return res.status(400).json({ message: 'Invalid filename' });
  }
  const filePath = path.join(BACKUP_DIR, filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ message: 'File not found' });
    }
    res.download(filePath, filename, (err) => {
      if (err) {
        logger.error('Error downloading backup', { error: err.message });
      }
    });
  });
});

/**
 * @swagger
 * /backup/restore:
 *   post:
 *     summary: Restore backup
 *     description: Restores the database from a backup file (Administrator only).
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *     responses:
 *       200:
 *         description: Database restored
 *       400:
 *         description: Invalid file name
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// Restore backup (administrator)
router.post('/restore', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to restore backup' });
  }
  const { file } = req.body || {};
  if (!file || typeof file !== 'string') {
    return res.status(400).json({ message: 'Backup file name is required' });
  }
  const base = path.basename(file);
  if (!base.startsWith('database-') || !base.endsWith('.db')) {
    return res.status(400).json({ message: 'Invalid backup file name' });
  }
  
  fs.mkdir(BACKUP_DIR, { recursive: true }, (mkdirErr) => {
    if (mkdirErr) {
      return res.status(500).json({ message: 'Error creating backup directory', error: mkdirErr.message });
    }
    const src = path.join(BACKUP_DIR, base);
    // Assuming database.db is in backend root, relative to this file (routes/backup.js) it is ../database.db
    // But original code used __dirname (which was server.js).
    // routes/backup.js is in backend/routes, so backend root is ..
    const dest = path.join(__dirname, '../database.db');
    
    fs.access(src, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).json({ message: 'Backup file not found' });
      }
      
      fs.copyFile(src, dest, (copyErr) => {
        if (copyErr) {
          logger.error('Error restoring backup', { error: copyErr.message });
          logSystemEvent('error', 'BACKUP', 'Database restore failed', { file: base, error: copyErr.message, user: req.user.username });
          return res.status(500).json({ message: 'Server error', error: copyErr.message });
        }
        
        logger.info('Przywrócono bazę danych z kopii', { path: src });
        logSystemEvent('warn', 'BACKUP', 'Database restored from backup', { file: base, user: req.user.username });
        return res.json({ message: 'Database restored from backup', file: base });
      });
    });
  });
});

module.exports = router;
