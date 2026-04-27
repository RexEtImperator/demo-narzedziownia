const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const logger = require('../logger');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');
const { buildOrderClause, buildWhereClause } = require('../helpers/queryBuilder');

/**
 * @swagger
 * tags:
 *   name: BHPIssues
 *   description: BHP (PPE) issue history management
 */

/**
 * @swagger
 * /bhp-issues:
 *   get:
 *     summary: Get BHP issue history
 *     tags: [BHPIssues]
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
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of BHP issues
 *       500:
 *         description: Server error
 */
// Endpoint: fetch all PPE issues/returns with pagination
router.get('/', authenticateToken, requirePermission('VIEW_BHP_HISTORY'), (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const filters = { status: req.query.status };
  
  if (filters.status && typeof filters.status === 'string' && filters.status.includes(',')) {
    filters.status = filters.status.split(',').map(s => s.trim());
  }

  const mappings = { status: 'bi.status' };

  const allowedSort = {
    issued_at: 'bi.issued_at',
    status: 'bi.status'
  };
  const orderClause = buildOrderClause(req.query.sortBy, req.query.sortDir || 'DESC', allowedSort, 'bi.issued_at');

  const baseSelect = `
    SELECT 
      bi.*,
      b.inventory_number AS bhp_inventory_number,
      b.manufacturer AS bhp_manufacturer,
      b.model AS bhp_model,
      b.production_date AS bhp_production_date,
      b.serial_number AS bhp_serial_number,
      b.catalog_number AS bhp_catalog_number,
      b.inspection_date AS bhp_inspection_date,
      b.has_shock_absorber AS bhp_has_shock_absorber,
      b.has_srd AS bhp_has_srd,
      b.shock_absorber_serial AS bhp_shock_absorber_serial,
      b.srd_serial_number AS bhp_srd_serial_number,
      b.status AS bhp_status,
      b.is_set AS bhp_is_set,
      e.first_name AS employee_first_name,
      e.last_name AS employee_last_name,
      e.brand_number AS employee_brand_number,
      u.full_name AS issued_by_user_name
    FROM bhp_issues bi
    LEFT JOIN bhp b ON bi.bhp_id = b.id
    LEFT JOIN employees e ON bi.employee_id = e.id
    LEFT JOIN users u ON bi.issued_by_user_id = u.id
  `;

  const { clauses, params } = buildWhereClause(filters, mappings);

  // Search filter
  if (req.query.search) {
    const searchPattern = `%${req.query.search.trim()}%`;
    clauses.push('(b.inventory_number LIKE ? OR b.model LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.brand_number LIKE ?)');
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const isEmployeeRole = req.user.role === 'employee';

  const buildQueriesAndRespond = (extraClauses = [], extraParams = []) => {
    const allClauses = [...clauses, ...extraClauses];
    const allParams = [...params, ...extraParams];
    const whereSql = allClauses.length ? ` WHERE ${allClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM bhp_issues bi${whereSql}`;
    const dataSql = `${baseSelect}${whereSql} ${orderClause} LIMIT ? OFFSET ?`;

    db.get(countSql, allParams, (err, row) => {
      if (err) {
        logger.error('Error counting BHP issues', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      const total = row?.total || 0;
      db.all(dataSql, [...allParams, limit, offset], (err2, issues) => {
        if (err2) {
          logger.error('Error fetching BHP issues', { error: err2.message });
          return res.status(500).json({ message: 'Server error', error: err2.message });
        }
        res.json(formatPaginatedResponse(issues, total, page, limit));
      });
    });
  };

  if (isEmployeeRole) {
    return db.get('SELECT id FROM employees WHERE login = ?', [req.user.username], (err, row) => {
      if (err) {
        logger.error('Error mapping user to employee (BHP)', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      if (!row || !row.id) {
        return res.json(formatPaginatedResponse([], 0, page, limit));
      }
      buildQueriesAndRespond(['bi.employee_id = ?'], [row.id]);
    });
  }

  const employeeIdFilter = req.query.employee_id ? ['bi.employee_id = ?'] : [];
  const employeeIdParams = req.query.employee_id ? [req.query.employee_id] : [];
  buildQueriesAndRespond(employeeIdFilter, employeeIdParams);
});

/**
 * @swagger
 * /bhp-issues/history/issues:
 *   delete:
 *     summary: Delete BHP issue history
 *     tags: [BHPIssues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: History deleted
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// Delete BHP ISSUE history
router.delete('/history/issues', authenticateToken, requirePermission('DELETE_ISSUE_HISTORY'), (req, res) => {
  logger.info('Deleting BHP ISSUE history...');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        logger.error('Error starting transaction (issues bhp)', { error: err });
        return res.status(500).json({ message: 'Server error' });
      }

      db.run('DELETE FROM bhp_issues WHERE status = "issued"', function(err) {
        if (err) {
          logger.error('Error deleting ISSUE entries from bhp_issues', { error: err });
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Error deleting BHP issue history' });
        }

        const deletedCount = this.changes || 0;
        logger.info(`Deleted ${deletedCount} ISSUE records from bhp_issues`);

        db.run('UPDATE bhp SET status = ? WHERE status != ?', ['available', 'issued'], function(err) {
          if (err) {
            logger.error('Error resetting BHP statuses after deleting issues', { error: err });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Error resetting BHP statuses' });
          }

          const auditQuery = `
            INSERT INTO audit_logs (user_id, username, action, details, timestamp)
            VALUES (?, ?, ?, ?, datetime('now'))
          `;
          db.run(
            auditQuery,
            [
              req.user.id,
              req.user.username,
              'DELETE_ISSUE_HISTORY',
              `Deleted BHP ISSUE history (${deletedCount} records)`
            ],
            (auditErr) => {
              if (auditErr) {
                logger.error('Error adding entry to audit log', { error: auditErr });
              }
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  logger.error('Error committing transaction (issues bhp)', { error: commitErr });
                  return res.status(500).json({ message: 'Error committing operation' });
                }
                res.json({
                  message: 'Deleted BHP ISSUE history',
                  deleted_count: deletedCount
                });
              });
            }
          );
        });
      });
    });
  });
});

// Delete BHP RETURN history
router.delete('/history/returns', authenticateToken, requirePermission('DELETE_RETURN_HISTORY'), (req, res) => {
  logger.info('Deleting BHP RETURN history...');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        logger.error('Error starting transaction (returns bhp)', { error: err });
        return res.status(500).json({ message: 'Server error' });
      }

      db.run('DELETE FROM bhp_issues WHERE status = "returned"', function(err) {
        if (err) {
          logger.error('Error deleting RETURN entries from bhp_issues', { error: err });
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Error deleting BHP return history' });
        }

        const deletedCount = this.changes || 0;
        logger.info(`Deleted ${deletedCount} RETURN records from bhp_issues`);

        const auditQuery = `
          INSERT INTO audit_logs (user_id, username, action, details, timestamp)
          VALUES (?, ?, ?, ?, datetime('now'))
        `;

        db.run(
          auditQuery,
          [
            req.user.id,
            req.user.username,
            'DELETE_RETURN_HISTORY',
            `Deleted BHP RETURN history (${deletedCount} records)`
          ],
          (auditErr) => {
            if (auditErr) {
              logger.error('Error adding entry to audit log', { error: auditErr });
            }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                logger.error('Error committing transaction (returns bhp)', { error: commitErr });
                return res.status(500).json({ message: 'Error committing operation' });
              }
              res.json({
                message: 'Deleted BHP RETURN history',
                deleted_count: deletedCount
              });
            });
          }
        );
      });
    });
  });
});

module.exports = router;
