const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');

/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: System audit logs
 */

/**
 * @swagger
 * /audit:
 *   get:
 *     summary: Get audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of audit logs
 *       500:
 *         description: Server error
 */
// Endpoint: fetch audit logs
router.get('/', authenticateToken, (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { action, username, startDate, endDate } = req.query;

  let baseSql = `
    SELECT 
      al.*,
      u.full_name as user_full_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
  `;
  
  let countSql = `
    SELECT COUNT(*) as total
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
  `;

  const whereClauses = [];
  const params = [];

  // Filtrowanie po akcji
  if (action && action !== 'all') {
    whereClauses.push('al.action = ?');
    params.push(action);
  }

  // Filter by username
  if (username) {
    whereClauses.push('(al.username LIKE ? OR u.full_name LIKE ?)');
    params.push(`%${username}%`, `%${username}%`);
  }

  // Filter by start date
  if (startDate) {
    whereClauses.push('DATE(al.timestamp) >= DATE(?)');
    params.push(startDate);
  }

  // Filter by end date
  if (endDate) {
    whereClauses.push('DATE(al.timestamp) <= DATE(?)');
    params.push(endDate);
  }

  let whereSql = '';
  if (whereClauses.length > 0) {
    whereSql = ' WHERE ' + whereClauses.join(' AND ');
    baseSql += whereSql;
    countSql += whereSql;
  }

  baseSql += ' ORDER BY al.timestamp DESC LIMIT ? OFFSET ?';

  db.get(countSql, params, (err, countResult) => {
    if (err) {
      logger.error('Error counting audit logs', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }

    const total = countResult?.total || 0;

    db.all(baseSql, [...params, limit, offset], (err2, logs) => {
      if (err2) {
        logger.error('Error fetching audit logs', { error: err2.message });
        return res.status(500).json({ message: 'Server error', error: err2.message });
      }

      res.json(formatPaginatedResponse(logs, total, page, limit));
    });
  });
});

/**
 * @swagger
 * /audit:
 *   post:
 *     summary: Create audit log entry
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *               details:
 *                 type: string
 *     responses:
 *       201:
 *         description: Audit log created
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
// Endpoint dodawania wpisu do audytu
router.post('/', authenticateToken, (req, res) => {
  const { action, details } = req.body;
  const user_id = req.user.id;
  const username = req.user.username;
  const ip_address = req.ip || req.connection.remoteAddress;
  const user_agent = req.get('User-Agent');

  if (!action) {
    return res.status(400).json({ message: 'Action is required' });
  }

  const query = `
    INSERT INTO audit_logs (user_id, username, action, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [user_id, username, action, details || null, ip_address, user_agent], function(err) {
    if (err) {
      logger.error('Error adding audit entry', { error: err.message, user_id, action });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }

    res.status(201).json({ 
      message: 'Audit entry added',
      id: this.lastID 
    });
  });
});

// Endpoint pobierania statystyk audytu
router.get('/stats', authenticateToken, (req, res) => {
  const { days = 30 } = req.query;

  const queries = {
    // Overall statistics
    totalLogs: `SELECT COUNT(*) as count FROM audit_logs WHERE DATE(timestamp) >= DATE('now', '-${days} days')`,
    
    // Statystyki po akcjach
    actionStats: `
      SELECT action, COUNT(*) as count 
      FROM audit_logs 
      WHERE DATE(timestamp) >= DATE('now', '-${days} days')
      GROUP BY action 
      ORDER BY count DESC
    `,
    // Statistics by users
    userStats: `
      SELECT 
        al.username,
        u.full_name,
        COUNT(*) as count 
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE DATE(al.timestamp) >= DATE('now', '-${days} days')
      GROUP BY al.user_id, al.username, u.full_name
      ORDER BY count DESC
      LIMIT 10
    `,
    // Daily activity
    dailyActivity: `
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as count
      FROM audit_logs 
      WHERE DATE(timestamp) >= DATE('now', '-${days} days')
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `
  };

  const results = {};
  let completed = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, (err, rows) => {
      if (err) {
        logger.error(`Error fetching stats ${key}`, { error: err.message });
        results[key] = [];
      } else {
        results[key] = key === 'totalLogs' ? rows[0] : rows;
      }

      completed++;
      if (completed === totalQueries) {
        res.json(results);
      }
    });
  });
});

// Endpoint: delete all audit logs (admin only)
router.delete('/', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {

  db.run('DELETE FROM audit_logs', function(err) {
    if (err) {
      logger.error('Error deleting audit logs', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }

    const deletedCount = this.changes || 0;
    return res.json({ message: 'Audit logs deleted', deleted_count: deletedCount });
  });
});

module.exports = router;
