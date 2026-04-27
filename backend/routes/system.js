const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');
const { buildWhereClause } = require('../helpers/queryBuilder');

/**
 * @swagger
 * tags:
 *   name: System
 *   description: System monitoring and control
 */

/**
 * @swagger
 * /system/health:
 *   get:
 *     summary: System health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 timestamp:
 *                   type: string
 *                 db:
 *                   type: string
 *       500:
 *         description: System unhealthy
 */
// Endpoint health check API
router.get('/health', (req, res) => {
  db.get('SELECT 1', [], (err) => {
    const dbOk = !err;
    res.status(dbOk ? 200 : 500).json({
      status: dbOk ? 'ok' : 'error',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db: dbOk ? 'ok' : (err?.message || 'unknown')
    });
  });
});

/**
 * @swagger
 * /system/client-errors:
 *   post:
 *     summary: Log client-side errors
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               errors:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Errors logged
 *       400:
 *         description: No errors provided
 *       500:
 *         description: Server error
 */
// Client-side error logging (no auth required to capture early errors)
router.post('/client-errors', (req, res) => {
  try {
    const payload = req.body || {};
    const errors = Array.isArray(payload.errors) ? payload.errors.slice(0, 100) : [];
    if (errors.length === 0) {
      return res.status(400).json({ message: 'No errors provided' });
    }

    const meta = {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      user: req.user ? { id: req.user.id, username: req.user.username } : null,
      headers: {
        'user-agent': req.headers['user-agent'] || null,
        'referer': req.headers['referer'] || null
      }
    };

    const stmt = db.prepare('INSERT INTO system_logs (level, category, message, details, created_at) VALUES (?, ?, ?, ?, datetime("now"))');
    let inserted = 0;
    errors.forEach((e) => {
      try {
        const message = String((e && e.message) ? e.message : 'Client error');
        const details = JSON.stringify({
          stack: e && e.stack ? String(e.stack) : null,
          context: e && e.context ? e.context : null,
          userAgent: e && e.userAgent ? String(e.userAgent) : (req.headers['user-agent'] || null),
          timestamp: e && e.timestamp ? String(e.timestamp) : new Date().toISOString(),
          meta
        });
        stmt.run('error', 'client', message, details, (err) => {
          if (err) {
            logger.error('Error inserting client error', { error: err.message });
          } else {
            inserted++;
          }
        });
      } catch (insErr) {
        logger.error('Client error parse failed', { error: insErr.message });
      }
    });
    stmt.finalize(() => {
      logger.info(`Logged ${inserted}/${errors.length} client errors`);
      return res.json({ logged: inserted });
    });
  } catch (err) {
    logger.error('Client error logging failed', { error: err.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /system/system/logs:
 *   get:
 *     summary: Get system logs
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *         description: Filter by log level
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of system logs
 *       500:
 *         description: Server error
 */
// Fetch system logs (Admin only)
router.get('/system/logs', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { level, category } = req.query;

  // Mapowanie filtrów na kolumny
  const filterMapping = {
    level: 'level',
    category: 'category'
  };
  
  // Budowanie WHERE
  const { clauses, params } = buildWhereClause({ level, category }, filterMapping);
  
  let baseSql = 'SELECT * FROM system_logs';
  let countSql = 'SELECT COUNT(*) as total FROM system_logs';
  
  if (clauses.length > 0) {
    const where = ' WHERE ' + clauses.join(' AND ');
    baseSql += where;
    countSql += where;
  }

  baseSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  logger.info('System Logs Query', { countSql, baseSql, params, limit, offset });

  db.get(countSql, params, (err, countRow) => {
    if (err) {
      logger.error('Error counting system logs:', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    
    const total = countRow ? countRow.total : 0;
    logger.info('System Logs Count Result', { total });
    
    db.all(baseSql, [...params, limit, offset], (err2, rows) => {
      if (err2) {
        logger.error('Error fetching system logs:', { error: err2.message });
        return res.status(500).json({ message: 'Server error' });
      }
      
      logger.info('System Logs Fetch Result', { rowCount: rows.length });
      
      res.header('Cache-Control', 'no-store');
      res.json(formatPaginatedResponse(rows, total, page, limit));
    });
  });
});

// Clear system logs (Admin only)
router.delete('/system/logs', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  db.run('DELETE FROM system_logs', function(err) {
    if (err) {
      logger.error('Error clearing system logs:', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    
    logger.info('System logs cleared by user', { userId: req.user.id, username: req.user.username });
    res.json({ message: 'System logs cleared', count: this.changes });
  });
});

// Server control endpoints
router.post('/server/restart', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to restart server' });
  }
  res.json({ message: 'Server restarting' });
  
  // Set flag in global scope (if possible) or just trigger exit
  // Note: logic in server.js handles the actual restart via process exit
  // Here we just trigger it. In modular app, we might need a way to signal server.js
  // For now, we'll replicate the process.kill behavior, but server.js needs to handle the restart loop if using pm2 or similar, 
  // or if using the simple spawn logic in server.js.
  // The original server.js had SHOULD_RESTART variable. 
  // Since we are splitting, we might lose access to SHOULD_RESTART variable in server.js scope.
  // However, process.exit(0) is standard. If running with PM2, it will restart.
  // If running with the custom spawn logic in server.js, that logic is in server.js "on exit" handlers.
  // We can emit a process event or just exit.
  
  setTimeout(() => {
    try {
      // Signal to server.js if it listens to something, or just kill.
      // If we want to preserve the "SHOULD_RESTART" behavior from server.js, we might need to export a setter or use an event.
      // Simpler approach: Just exit. If supervised, it restarts.
      // If using the custom logic in server.js, we need to verify if it works.
      process.emit('server:restart'); 
      process.kill(process.pid, 'SIGINT');
    } catch (_) {
      process.exit(0);
    }
  }, 200);
});

/**
 * @swagger
 * /system/server/stop:
 *   post:
 *     summary: Stop server
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Server stopping
 *       403:
 *         description: Insufficient permissions
 */
router.post('/server/stop', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to stop server' });
  }
  res.json({ message: 'Server stopping' });
  setTimeout(() => {
    try {
      process.emit('server:stop');
      process.kill(process.pid, 'SIGINT');
    } catch (_) {
      process.exit(0);
    }
  }, 200);
});

module.exports = router;
