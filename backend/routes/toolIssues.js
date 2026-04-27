const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const logger = require('../logger');
const { getPaginationParams, formatPaginatedResponse, buildWhereClause } = require('../helpers/pagination');

/**
 * @swagger
 * tags:
 *   name: ToolIssues
 *   description: Tool issue and return history management
 */

/**
 * @swagger
 * /tool-issues:
 *   get:
 *     summary: Retrieve tool issue/return history
 *     tags: [ToolIssues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [issued, returned]
 *         description: Filter by status
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: integer
 *         description: Filter by employee ID (admin/manager only)
 *     responses:
 *       200:
 *         description: List of tool issues
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       tool_id:
 *                         type: integer
 *                       employee_id:
 *                         type: integer
 *                       status:
 *                         type: string
 *                       issued_at:
 *                         type: string
 *                         format: date-time
 *                       returned_at:
 *                         type: string
 *                         format: date-time
 *                       tool_name:
 *                         type: string
 *                       employee_first_name:
 *                         type: string
 *                       employee_last_name:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       500:
 *         description: Server error
 */
router.get('/', authenticateToken, requirePermission('VIEW_TOOL_HISTORY'), (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
    const { employee_id } = req.query;
    let { status } = req.query;

    if (status && typeof status === 'string' && status.includes(',')) {
      status = status.split(',').map(s => s.trim());
    }

    const isEmployeeRole = req.user.role === 'employee';

    const baseSelect = `
    SELECT 
      ti.*, 
      t.name as tool_name,
      t.sku as tool_sku,
      t.manufacturer as tool_manufacturer,
      t.model as tool_model,
      t.production_year as tool_production_year,
      t.serial_number as tool_serial_number,
      t.serial_unreadable as tool_serial_unreadable,
      t.inventory_number as tool_inventory_number,
      t.category as tool_category,
      t.description as tool_description,
      t.location as tool_location,
      t.inspection_date as tool_inspection_date,
      t.status as tool_status,
      e.first_name as employee_first_name,
      e.last_name as employee_last_name,
      e.brand_number as employee_brand_number,
      u.full_name as issued_by_user_name
    FROM tool_issues ti
    LEFT JOIN tools t ON ti.tool_id = t.id
    LEFT JOIN employees e ON ti.employee_id = e.id
    LEFT JOIN users u ON ti.issued_by_user_id = u.id
  `;

  const filterMappings = {
    status: 'ti.status',
    employee_id: 'ti.employee_id'
  };

  const executeQuery = (additionalWhere = null, additionalParams = []) => {
    // If user is admin/manager, they can filter by employee_id from query.
    // If user is employee, we ignore query employee_id and force their own id (handled below).
    const queryFilters = {};
    if (!isEmployeeRole && employee_id) {
      queryFilters.employee_id = employee_id;
    }

    const { clauses: whereClauses, params: whereParams } = buildWhereClause(queryFilters, filterMappings);

    // Handle status manually to support array (IN clause)
    if (status) {
      if (Array.isArray(status)) {
        const placeholders = status.map(() => '?').join(',');
        whereClauses.push(`ti.status IN (${placeholders})`);
        whereParams.push(...status);
      } else {
        whereClauses.push(`ti.status = ?`);
        whereParams.push(status);
      }
    }

    if (additionalWhere) {
      whereClauses.push(additionalWhere);
      whereParams.push(...additionalParams);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tool_issues ti
      LEFT JOIN tools t ON ti.tool_id = t.id
      LEFT JOIN employees e ON ti.employee_id = e.id
      LEFT JOIN users u ON ti.issued_by_user_id = u.id
      ${whereSql}
    `;

    const dataQuery = `
      ${baseSelect}
      ${whereSql}
      ORDER BY ti.issued_at DESC
      LIMIT ? OFFSET ?
    `;

    db.get(countQuery, whereParams, (err, countResult) => {
      if (err) {
        logger.error('Error fetching tool issues count', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      
      const total = countResult.total;
      
      db.all(dataQuery, [...whereParams, limit, offset], (err2, issues) => {
        if (err2) {
          logger.error('Error fetching tool issues', { error: err2.message });
          return res.status(500).json({ message: 'Server error', error: err2.message });
        }
        res.json(formatPaginatedResponse(issues, total, page, limit));
      });
    });
  };

  if (isEmployeeRole) {
    // Employee sees only own history (login → employees.login mapping)
    return db.get('SELECT id FROM employees WHERE login = ?', [req.user.username], (err, row) => {
      if (err) {
        logger.error('Error mapping user to employee', { error: err });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      if (!row || !row.id) {
        return res.json(formatPaginatedResponse([], 0, page, limit));
      }
      
      // Force filter by employee_id
      executeQuery('ti.employee_id = ?', [row.id]);
    });
  }

  // Admin/Manager
  executeQuery();
});

// Delete history
/**
 * @swagger
 * /tool-issues/history:
 *   delete:
 *     summary: Delete all tool issue and return history
 *     description: Deletes all records from tool_issues table and resets all tools status to 'available'. Requires DELETE_ISSUE_HISTORY permission.
 *     tags: [ToolIssues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: History deleted and tool statuses reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedIssues:
 *                   type: integer
 *                 updatedTools:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.delete('/history', authenticateToken, requirePermission('DELETE_ISSUE_HISTORY'), (req, res) => {
  logger.info('Starting deletion of issue and return history...');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        logger.error('Error starting transaction', { error: err });
        return res.status(500).json({ message: 'Server error' });
      }

      // Delete all records from tool_issues table
      db.run('DELETE FROM tool_issues', function(err) {
        if (err) {
          logger.error('Error deleting from tool_issues table', { error: err });
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Error deleting issue history' });
        }

        const deletedIssues = this.changes;
        logger.info(`Deleted ${deletedIssues} records from tool_issues`);

        // Reset all tools' status to 'available'
        db.run('UPDATE tools SET status = ? WHERE status != ?', ['available', 'available'], function(err) {
          if (err) {
            logger.error('Error resetting tool statuses', { error: err });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Error resetting tool statuses' });
          }

          const updatedTools = this.changes;
          logger.info(`Updated status of ${updatedTools} tools to 'available'`);
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
              `Usunięto historię wydań (${deletedIssues} rekordów) i zresetowano statusy narzędzi (${updatedTools} rekordów)`
            ],
            (auditErr) => {
              if (auditErr) {
                logger.error('Error adding audit log', { error: auditErr });
              }
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  logger.error('Error committing transaction', { error: commitErr });
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: 'Error committing transaction' });
                }
                res.status(200).json({ 
                  message: 'Issue history deleted and tool statuses reset',
                  deletedIssues,
                  updatedTools
                });
              });
            }
          );
        });
      });
    });
  });
});

// Delete tool ISSUE history (only entries with status "issued")
/**
 * @swagger
 * /tool-issues/history/issues:
 *   delete:
 *     summary: Delete only active tool issue history
 *     description: Deletes records from tool_issues where status is 'issued' and resets those tools to 'available'. Requires DELETE_ISSUE_HISTORY permission.
 *     tags: [ToolIssues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Issue history deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted_count:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.delete('/history/issues', authenticateToken, requirePermission('DELETE_ISSUE_HISTORY'), (req, res) => {
  logger.info('Deleting tool and sling ISSUE history...');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        logger.error('Error starting transaction (issues tools)', { error: err });
        return res.status(500).json({ message: 'Server error' });
      }

      db.run('DELETE FROM tool_issues WHERE status = "issued"', function(err) {
        if (err) {
          logger.error('Error deleting ISSUE entries from tool_issues', { error: err });
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Error deleting tool issue history' });
        }

        const deletedToolIssues = this.changes || 0;
        
        // Also delete from tools_slings_issues
        db.run('DELETE FROM tools_slings_issues WHERE status = "issued"', function(err) {
          if (err) {
            logger.error('Error deleting ISSUE entries from tools_slings_issues', { error: err });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Error deleting sling issue history' });
          }
          
          const deletedSlingIssues = this.changes || 0;
          const totalDeleted = deletedToolIssues + deletedSlingIssues;
          logger.info(`Deleted ${deletedToolIssues} tool issues and ${deletedSlingIssues} sling issues`);

          // Reset all tools' status to 'available'
          db.run('UPDATE tools SET status = ? WHERE status != ?', ['available', 'available'], function(err) {
            if (err) {
              logger.error('Error resetting tool statuses after deleting issues', { error: err });
              db.run('ROLLBACK');
              return res.status(500).json({ message: 'Error resetting tool statuses' });
            }
            
            // Reset all slings' status to 'available'
            db.run('UPDATE tools_slings_items SET status = ? WHERE status != ?', ['available', 'available'], function(err) {
              if (err) {
                logger.error('Error resetting sling statuses after deleting issues', { error: err });
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Error resetting sling statuses' });
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
                  `Deleted tool & sling ISSUE history (${totalDeleted} records)`
                ],
                (auditErr) => {
                  if (auditErr) {
                    logger.error('Error adding entry to audit log', { error: auditErr });
                  }
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      logger.error('Error committing transaction (issues tools)', { error: commitErr });
                      return res.status(500).json({ message: 'Error committing operation' });
                    }
                    res.json({
                      message: 'Deleted tool and sling ISSUE history',
                      deleted_count: totalDeleted
                    });
                  });
                }
              );
            });
          });
        });
      });
    });
  });
});

// Delete tool RETURN history (only entries with status 'returned')
/**
 * @swagger
 * /tool-issues/history/returns:
 *   delete:
 *     summary: Delete only returned tool history
 *     description: Deletes records from tool_issues where status is 'returned'. Requires DELETE_RETURN_HISTORY permission.
 *     tags: [ToolIssues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Return history deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted_count:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.delete('/history/returns', authenticateToken, requirePermission('DELETE_RETURN_HISTORY'), (req, res) => {
  logger.info('Deleting tool and sling RETURN history...');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        logger.error('Error starting transaction (returns tools)', { error: err });
        return res.status(500).json({ message: 'Server error' });
      }

      db.run('DELETE FROM tool_issues WHERE status = "returned"', function(err) {
        if (err) {
          logger.error('Error deleting RETURN entries from tool_issues', { error: err });
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Error deleting tool return history' });
        }

        const deletedToolReturns = this.changes || 0;
        
        // Also delete from tools_slings_issues
        db.run('DELETE FROM tools_slings_issues WHERE status = "returned"', function(err) {
          if (err) {
            logger.error('Error deleting RETURN entries from tools_slings_issues', { error: err });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Error deleting sling return history' });
          }
          
          const deletedSlingReturns = this.changes || 0;
          const totalDeleted = deletedToolReturns + deletedSlingReturns;
          logger.info(`Deleted ${deletedToolReturns} tool returns and ${deletedSlingReturns} sling returns`);

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
              `Deleted tool & sling RETURN history (${totalDeleted} records)`
            ],
            (auditErr) => {
              if (auditErr) {
                logger.error('Error adding entry to audit log', { error: auditErr });
              }
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  logger.error('Error committing transaction (returns tools)', { error: commitErr });
                  return res.status(500).json({ message: 'Error committing operation' });
                }
                res.json({
                  message: 'Deleted tool and sling RETURN history',
                  deleted_count: totalDeleted
                });
              });
            }
          );
        });
      });
    });
  });
});

module.exports = router;
