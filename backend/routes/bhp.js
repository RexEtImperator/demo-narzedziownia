const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sanitizeInput } = require('../helpers/sanitize');
const { sendDomainError } = require('../helpers/errorHelper');
const logger = require('../logger');
const { getPaginationParams, formatPaginatedResponse, buildOrderClause, buildWhereClause } = require('../helpers/pagination');
const { cacheMiddleware } = require('../middleware/cache');

/**
 * @swagger
 * tags:
 *   name: BHP
 *   description: PPE (Personal Protective Equipment) management
 */

/**
 * @swagger
 * /bhp:
 *   get:
 *     summary: List all PPE items
 *     tags: [BHP]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query (inventory number, manufacturer, model, serial)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: List of PPE items
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
 *                       inventory_number:
 *                         type: string
 *                       manufacturer:
 *                         type: string
 *                       model:
 *                         type: string
 *                       serial_number:
 *                         type: string
 *                       status:
 *                         type: string
 *                       inspection_date:
 *                         type: string
 *                         format: date
 *                       assigned_employee_first_name:
 *                         type: string
 *                       assigned_employee_last_name:
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
// Fetch PPE equipment
router.get('/', authenticateToken, requirePermission('VIEW_BHP'), cacheMiddleware(30), (req, res) => {
  const rawRole = String(req.user.role || '').trim().toLowerCase();
  const isEmployeeRole = rawRole === 'employee';

  const { page, limit, offset } = getPaginationParams(req.query);
  
  const allowedSort = {
    inventory_number: 'b.inventory_number',
    manufacturer: 'b.manufacturer',
    model: 'b.model',
    serial_number: 'b.serial_number',
    production_date: 'b.production_date',
    inspection_date: 'b.inspection_date',
    status: 'b.status'
  };

  const orderSql = buildOrderClause(
    req.query.sortBy,
    req.query.sortDir,
    allowedSort,
    'b.inventory_number',
    { useCollateNocase: true }
  );

  const baseSelect = `
    SELECT 
      b.*, 
      e.id AS assigned_employee_id,
      e.first_name AS assigned_employee_first_name,
      e.last_name AS assigned_employee_last_name
    FROM bhp b
    LEFT JOIN (
      SELECT bhp_id, employee_id
      FROM bhp_issues
      WHERE id IN (
        SELECT MAX(id)
        FROM bhp_issues
        WHERE status IN ('issued', 'permanent')
        GROUP BY bhp_id
      )
    ) bi ON bi.bhp_id = b.id
    LEFT JOIN employees e ON e.id = bi.employee_id
  `;

  // Filter mappings
  const filterMappings = { status: 'b.status' };
  const { clauses: whereClauses, params: whereParams } = buildWhereClause({ status: req.query.status }, filterMappings);

  // Search
  const search = (req.query.search || '').trim();
  if (search) {
    whereClauses.push(`(
      LOWER(b.inventory_number) LIKE LOWER(?) OR
      LOWER(b.manufacturer) LIKE LOWER(?) OR
      LOWER(b.model) LIKE LOWER(?) OR
      LOWER(b.serial_number) LIKE LOWER(?) OR
      b.nfc_tag_id = ?
    )`);
    const like = `%${search}%`;
    whereParams.push(like, like, like, like, search);
  }

  const executeQuery = (additionalWhere = null, additionalParams = []) => {
    const finalWhereClauses = [...whereClauses];
    const finalWhereParams = [...whereParams];

    if (additionalWhere) {
      finalWhereClauses.push(additionalWhere);
      finalWhereParams.push(...additionalParams);
    }

    const whereSql = finalWhereClauses.length ? `WHERE ${finalWhereClauses.join(' AND ')}` : '';
    
    const countQuery = `SELECT COUNT(*) as total FROM bhp b ${whereSql}`;
    const dataQuery = `${baseSelect} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;

    db.get(countQuery, finalWhereParams, (err, countResult) => {
      if (err) {
        logger.error('Error counting BHP items', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      
      const total = countResult.total;
      
      db.all(dataQuery, [...finalWhereParams, limit, offset], (err2, rows) => {
        if (err2) {
          logger.error('Error fetching BHP items', { error: err2.message });
          return res.status(500).json({ message: 'Server error', error: err2.message });
        }
        res.json(formatPaginatedResponse(rows, total, page, limit));
      });
    });
  };

  if (isEmployeeRole) {
    return db.get('SELECT id FROM employees WHERE login = ?', [req.user.username], (mapErr, empRow) => {
      if (mapErr) {
        logger.error('Error mapping user to employee (BHP)', { error: mapErr.message });
        return res.status(500).json({ message: 'Server error', error: mapErr.message });
      }
      if (!empRow || !empRow.id) {
        return res.json(formatPaginatedResponse([], 0, page, limit));
      }
      
      const employeeExistsClause = `EXISTS (
        SELECT 1 FROM bhp_issues bi 
        WHERE bi.bhp_id = b.id AND bi.status = 'issued' AND bi.employee_id = ?
      )`;
      
      executeQuery(employeeExistsClause, [empRow.id]);
    });
  }

  // Admin/Manager role
  executeQuery();
});

/**
 * @swagger
 * /bhp:
 *   post:
 *     summary: Add new PPE equipment
 *     tags: [BHP]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_number
 *             properties:
 *               inventory_number:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *               model:
 *                 type: string
 *               serial_number:
 *                 type: string
 *               catalog_number:
 *                 type: string
 *               production_date:
 *                 type: string
 *                 format: date
 *               inspection_date:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *               is_set:
 *                 type: boolean
 *               has_shock_absorber:
 *                 type: boolean
 *               has_srd:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: PPE item created
 *       400:
 *         description: Invalid input or inventory number exists
 *       500:
 *         description: Server error
 */
// Add BHP equipment
router.post('/', authenticateToken, requirePermission('MANAGE_BHP'), (req, res) => {
  const { inventory_number, manufacturer, model, serial_number, catalog_number, production_date, inspection_date, is_set, has_shock_absorber, has_srd, shock_absorber_serial, shock_absorber_name, shock_absorber_model, shock_absorber_catalog_number, harness_start_date, shock_absorber_start_date, shock_absorber_production_date, srd_manufacturer, srd_model, srd_serial_number, srd_catalog_number, srd_production_date, status, nfc_tag_id } = req.body;

  if (!inventory_number) {
    return res.status(400).json({ message: 'Inventory number is required' });
  }

  const query = `INSERT INTO bhp (inventory_number, manufacturer, model, serial_number, catalog_number, production_date, inspection_date, is_set, has_shock_absorber, has_srd, shock_absorber_serial, shock_absorber_name, shock_absorber_model, shock_absorber_catalog_number, harness_start_date, shock_absorber_start_date, shock_absorber_production_date, srd_manufacturer, srd_model, srd_serial_number, srd_catalog_number, srd_production_date, status, nfc_tag_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [inventory_number, manufacturer, model, serial_number, catalog_number, production_date, inspection_date, is_set ? 1 : 0, has_shock_absorber ? 1 : 0, has_srd ? 1 : 0, shock_absorber_serial, shock_absorber_name, shock_absorber_model, shock_absorber_catalog_number, harness_start_date, shock_absorber_start_date, shock_absorber_production_date, srd_manufacturer, srd_model, srd_serial_number, srd_catalog_number, srd_production_date, status || 'available', nfc_tag_id || null];

  db.run(query, params, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        if (err.message.includes('nfc_tag_id')) return res.status(400).json({ message: 'Item with this NFC Tag ID already exists' });
        return res.status(400).json({ message: 'An item with this inventory number already exists' });
      }
      return res.status(500).json({ message: 'Server error' });
    }
    db.get('SELECT * FROM bhp WHERE id = ?', [this.lastID], (err, item) => {
      if (err) return res.status(500).json({ message: 'Error fetching new item' });
      res.status(201).json(item);
    });
  });
});

/**
 * @swagger
 * /bhp/{id}:
 *   put:
 *     summary: Update PPE equipment
 *     tags: [BHP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: PPE Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_number:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *               model:
 *                 type: string
 *               serial_number:
 *                 type: string
 *               status:
 *                 type: string
 *               inspection_date:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: PPE item updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
  // Update PPE equipment
router.put('/:id', authenticateToken, requirePermission('MANAGE_BHP'), (req, res) => {
  const id = req.params.id;
  let {
    inventory_number,
    manufacturer,
    model,
    serial_number,
    catalog_number,
    production_date,
    inspection_date,
    is_set,
    has_shock_absorber,
    has_srd,
    shock_absorber_serial,
    shock_absorber_name,
    shock_absorber_model,
    shock_absorber_catalog_number,
    harness_start_date,
    shock_absorber_start_date,
    shock_absorber_production_date,
    srd_manufacturer,
    srd_model,
    srd_serial_number,
    srd_catalog_number,
    srd_production_date,
    status,
    nfc_tag_id
  } = req.body;

  // Input Sanitization
  inventory_number = sanitizeInput(inventory_number);
  manufacturer = sanitizeInput(manufacturer);
  model = sanitizeInput(model);
  serial_number = sanitizeInput(serial_number);
  catalog_number = sanitizeInput(catalog_number);
  shock_absorber_serial = sanitizeInput(shock_absorber_serial);
  shock_absorber_name = sanitizeInput(shock_absorber_name);
  shock_absorber_model = sanitizeInput(shock_absorber_model);
  shock_absorber_catalog_number = sanitizeInput(shock_absorber_catalog_number);
  srd_manufacturer = sanitizeInput(srd_manufacturer);
  srd_model = sanitizeInput(srd_model);
  srd_serial_number = sanitizeInput(srd_serial_number);
  srd_catalog_number = sanitizeInput(srd_catalog_number);
  status = sanitizeInput(status);
  nfc_tag_id = sanitizeInput(nfc_tag_id);

  if (!inventory_number) {
    return res.status(400).json({ message: 'Required inventory number' });
  }

  // Do not overwrite existing values with NULL/"" if field not provided.
  // For text fields treat empty string as no change.
  const query = `
    UPDATE bhp SET
      inventory_number = COALESCE(NULLIF(?, ''), inventory_number),
      manufacturer = COALESCE(NULLIF(?, ''), manufacturer),
      model = COALESCE(NULLIF(?, ''), model),
      serial_number = COALESCE(NULLIF(?, ''), serial_number),
      catalog_number = COALESCE(NULLIF(?, ''), catalog_number),
      production_date = COALESCE(?, production_date),
      inspection_date = COALESCE(?, inspection_date),
      is_set = COALESCE(?, is_set),
      has_shock_absorber = COALESCE(?, has_shock_absorber),
      has_srd = COALESCE(?, has_srd),
      shock_absorber_serial = COALESCE(NULLIF(?, ''), shock_absorber_serial),
      shock_absorber_name = COALESCE(NULLIF(?, ''), shock_absorber_name),
      shock_absorber_model = COALESCE(NULLIF(?, ''), shock_absorber_model),
      shock_absorber_catalog_number = COALESCE(NULLIF(?, ''), shock_absorber_catalog_number),
      harness_start_date = COALESCE(?, harness_start_date),
      shock_absorber_start_date = COALESCE(?, shock_absorber_start_date),
      shock_absorber_production_date = COALESCE(?, shock_absorber_production_date),
      srd_manufacturer = COALESCE(NULLIF(?, ''), srd_manufacturer),
      srd_model = COALESCE(NULLIF(?, ''), srd_model),
      srd_serial_number = COALESCE(NULLIF(?, ''), srd_serial_number),
      srd_catalog_number = COALESCE(NULLIF(?, ''), srd_catalog_number),
      srd_production_date = COALESCE(?, srd_production_date),
      status = COALESCE(NULLIF(?, ''), status),
      nfc_tag_id = COALESCE(?, nfc_tag_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  const params = [
    inventory_number,
    manufacturer,
    model,
    serial_number,
    catalog_number,
    production_date,
    inspection_date,
    typeof is_set === 'number' ? is_set : (is_set ? 1 : 0),
    typeof has_shock_absorber === 'number' ? has_shock_absorber : (has_shock_absorber ? 1 : 0),
    typeof has_srd === 'number' ? has_srd : (has_srd ? 1 : 0),
    shock_absorber_serial,
    shock_absorber_name,
    shock_absorber_model,
    shock_absorber_catalog_number,
    harness_start_date,
    shock_absorber_start_date,
    shock_absorber_production_date,
    srd_manufacturer,
    srd_model,
    srd_serial_number,
    srd_catalog_number,
    srd_production_date,
    status || 'available',
    nfc_tag_id || null,
    id
  ];

  db.run(query, params, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        if (err.message.includes('nfc_tag_id')) return res.status(400).json({ message: 'Item with this NFC Tag ID already exists' });
        return res.status(400).json({ message: 'An item with this inventory number already exists' });
      }
      return res.status(500).json({ message: 'Server error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'BHP item not found' });
    }
    // Return updated record for easier verification
    db.get('SELECT * FROM bhp WHERE id = ?', [id], (getErr, row) => {
      if (getErr) {
        return res.status(500).json({ message: 'Error fetching updated item' });
      }
      try {
        const parseDate = (val) => {
          if (!val) return null;
          const str = String(val).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
          const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
          if (m) {
            const [, dd, mm, yyyy] = m;
            return new Date(`${yyyy}-${mm}-${dd}`);
          }
          const d = new Date(str);
          return isNaN(d.getTime()) ? null : d;
        };
        const today = new Date();
        today.setHours(0,0,0,0);
        const insp = parseDate(row?.inspection_date);
        const isOverdue = insp && insp.getTime() < today.getTime();
        const isAvailable = String(row?.status || '').toLowerCase() === 'available';

        if (isOverdue && isAvailable) {
          db.get('SELECT employee_id FROM bhp_issues WHERE bhp_id = ? AND status = "issued" ORDER BY issued_at DESC LIMIT 1', [id], (e2, active) => {
            if (e2) return;
            const employeeId = active ? active.employee_id : null;
            if (!employeeId) return; // only for assigned employee
            db.get('SELECT u.id as user_id FROM users u JOIN employees e ON u.username = e.login WHERE e.id = ?', [employeeId], (muErr, muRow) => {
              if (muErr || !muRow || !muRow.user_id) return;
              const targetUserId = muRow.user_id;
              db.get('SELECT id FROM notifications WHERE user_id = ? AND type = "overdue_inspection" AND item_type = "bhp" AND item_id = ?', [targetUserId, id], (nErr, existing) => {
                if (nErr) return;
                if (!existing) {
                  db.run('INSERT INTO notifications (user_id, type, item_type, item_id, employee_id, message, read, created_at) VALUES (?, "overdue_inspection", "bhp", ?, ?, NULL, 0, datetime("now"))', [targetUserId, id, employeeId]);
                }
              });
            });
          });
        } else {
          db.run('DELETE FROM notifications WHERE type = "overdue_inspection" AND item_type = "bhp" AND item_id = ?', [id]);
        }
      } catch (_) { /* noop */ }
      res.status(200).json({ message: 'BHP item updated', item: row });
    });
  });
});

/**
 * @swagger
 * /bhp/{id}:
 *   delete:
 *     summary: Delete PPE equipment
 *     tags: [BHP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: PPE Item ID
 *     responses:
 *       200:
 *         description: PPE item deleted
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
// Delete PPE equipment
router.delete('/:id', authenticateToken, requirePermission('MANAGE_BHP'), (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM bhp WHERE id = ?', [id], function(err) {
    if (err) {
      return sendDomainError(res, 'BHP_DELETE_FAILED', err?.message);
    }
    if (this.changes === 0) {
      return sendDomainError(res, 'BHP_ITEM_NOT_FOUND');
    }
    res.status(200).json({ message: 'BHP item deleted' });
  });
});

/**
 * @swagger
 * /bhp/{id}/issue:
 *   post:
 *     summary: Issue PPE item to employee
 *     tags: [BHP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: PPE Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee_id
 *             properties:
 *               employee_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: PPE item issued
 *       400:
 *         description: Item not found, already issued, or invalid employee
 *       500:
 *         description: Server error
 */
// Issue PPE item to employee (single piece)
router.post('/:id/issue', authenticateToken, requirePermission('MANAGE_BHP'), (req, res) => {
  const bhpId = req.params.id;
  const { employee_id, is_permanent } = req.body;
  const userId = req.user.id;

  if (!employee_id) {
    return sendDomainError(res, 'EMPLOYEE_INVALID_ID');
  }

  const targetStatus = is_permanent ? 'permanent' : 'issued';

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
      if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);

      db.get('SELECT * FROM bhp WHERE id = ?', [bhpId], (err, item) => {
        if (err) {
          db.run('ROLLBACK');
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
        }
        if (!item) {
          db.run('ROLLBACK');
          return sendDomainError(res, 'BHP_ITEM_NOT_FOUND');
        }
        if (item.status === 'issued' || item.status === 'permanent') {
          db.run('ROLLBACK');
          return sendDomainError(res, 'BHP_ALREADY_ISSUED');
        }

        db.get('SELECT * FROM employees WHERE id = ?', [employee_id], (err, employee) => {
          if (err) {
            db.run('ROLLBACK');
            return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
          }
          if (!employee) {
            db.run('ROLLBACK');
            return sendDomainError(res, 'EMPLOYEE_NOT_FOUND');
          }

          db.run(
            'INSERT INTO bhp_issues (bhp_id, employee_id, issued_by_user_id, status) VALUES (?, ?, ?, ?)',
            [bhpId, employee_id, userId, targetStatus],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                return sendDomainError(res, 'BHP_ISSUE_FAILED', err?.message);
              }
              const issueId = this.lastID;
              
              db.run('UPDATE bhp SET status = ? WHERE id = ?', [targetStatus, bhpId], function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return sendDomainError(res, 'BHP_ISSUE_FAILED', err?.message);
                }
                
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    db.run('ROLLBACK');
                    return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Transaction commit failed');
                  }
                  
                  res.status(200).json({ 
                    message: 'BHP item issued', 
                    issue_id: issueId,
                    employee_id: employee.id,
                    employee_first_name: employee.first_name,
                    employee_last_name: employee.last_name,
                    employee_brand_number: employee.brand_number || null,
                    status: targetStatus
                  });
                });
              });
            }
          );
        });
      });
    });
  });
});

/**
 * @swagger
 * /bhp/{id}/return:
 *   post:
 *     summary: Return PPE equipment
 *     tags: [BHP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: PPE Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issue_id
 *             properties:
 *               issue_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: PPE item returned
 *       400:
 *         description: Invalid issue ID or no active issue found
 *       500:
 *         description: Server error
 */
// Return PPE equipment
router.post('/:id/return', authenticateToken, requirePermission('MANAGE_BHP'), (req, res) => {
  const bhpId = req.params.id;
  const { issue_id } = req.body;

  if (!issue_id) {
    return res.sendError(400, 'ISSUE_ID_REQUIRED', 'bhp.errors.returnDataFetchFailed', 'Issue ID is required');
  }

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
      if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);

      db.get('SELECT * FROM bhp_issues WHERE id = ? AND bhp_id = ? AND (status = "issued" OR status = "permanent")', [issue_id, bhpId], (err, issue) => {
        if (err) {
          db.run('ROLLBACK');
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
        }
        if (!issue) {
          db.run('ROLLBACK');
          return sendDomainError(res, 'BHP_NO_ACTIVE_ISSUE');
        }

        db.run('UPDATE bhp_issues SET status = "returned", returned_at = datetime("now") WHERE id = ?', [issue_id], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return sendDomainError(res, 'BHP_RETURN_FAILED', err?.message);
          }
          if (this.changes === 0) {
            db.run('ROLLBACK');
            return sendDomainError(res, 'BHP_RETURN_FAILED', 'Failed to update issue status');
          }
          
          db.run('UPDATE bhp SET status = ? WHERE id = ?', ['available', bhpId], function(err) {
              if (err) {
                db.run('ROLLBACK');
                return sendDomainError(res, 'BHP_RETURN_FAILED', err?.message);
              }
              
              db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                db.run('ROLLBACK');
                return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Transaction commit failed');
              }

              // Post-commit logic (notifications)
              try {
                const employeeId = issue.employee_id;
                if (employeeId) {
                  db.get('SELECT u.id as user_id FROM users u JOIN employees e ON u.username = e.login WHERE e.id = ?', [employeeId], (muErr, muRow) => {
                    if (muErr || !muRow || !muRow.user_id) {
                      return res.status(200).json({ message: 'BHP item returned' });
                    }
                    const targetUserId = muRow.user_id;
                    db.run('DELETE FROM notifications WHERE user_id = ? AND type = "overdue_inspection" AND item_type = "bhp" AND item_id = ?', [targetUserId, bhpId], function(_delErr) {
                      return res.status(200).json({ message: 'BHP item returned' });
                    });
                  });
                  return; 
                }
              } catch (_) { /* noop */ }
              
              res.status(200).json({ message: 'BHP item returned' });
            });
          });
        });
      });
    });
  });
});

/**
 * @swagger
 * /bhp/{id}/details:
 *   get:
 *     summary: Get PPE details
 *     description: Retrieve PPE details along with active issues and inspection reminder status
 *     tags: [BHP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: PPE Item ID
 *     responses:
 *       200:
 *         description: PPE details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 inventory_number:
 *                   type: string
 *                 active_issues:
 *                   type: array
 *                   items:
 *                     type: object
 *                 review_reminder:
 *                   type: object
 *                   properties:
 *                     days:
 *                       type: integer
 *                     is_overdue:
 *                       type: boolean
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
// PPE details + active issues and inspection reminder status
router.get('/:id/details', authenticateToken, (req, res) => {
  const bhpId = req.params.id;

  db.get('SELECT * FROM bhp WHERE id = ?', [bhpId], (err, item) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    if (!item) return sendDomainError(res, 'BHP_ITEM_NOT_FOUND');

    const issuesQuery = `
      SELECT 
        bi.*, 
        e.first_name as employee_first_name, 
        e.last_name as employee_last_name, 
        e.brand_number as employee_brand_number,
        u.full_name as issued_by_user_name
      FROM bhp_issues bi
      LEFT JOIN employees e ON bi.employee_id = e.id
      LEFT JOIN users u ON bi.issued_by_user_id = u.id
      WHERE bi.bhp_id = ?
      ORDER BY bi.issued_at DESC
    `;

    db.all(issuesQuery, [bhpId], (err, issues) => {
      if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);

      // Compute days to inspection
      let reviewReminder = null;
      if (item.inspection_date) {
        const now = new Date();
        const insp = new Date(item.inspection_date);
        const diffDays = Math.ceil((insp - now) / (1000 * 60 * 60 * 24));
        reviewReminder = {
          days_to_review: diffDays,
          status: diffDays < 0 ? 'po_terminie' : (diffDays <= 30 ? 'zbliża_się' : 'ok')
        };
      }

      res.json({ ...item, issues, reviewReminder });
    });
  });
});

// BHP issue/return history (all entries)
router.get('/:id/history', authenticateToken, requirePermission('VIEW_BHP_HISTORY'), (req, res) => {
  const bhpId = req.params.id;
  const query = `
    SELECT 
      bi.*, 
      e.first_name as employee_first_name, 
      e.last_name as employee_last_name, 
      u.full_name as issued_by_user_name
    FROM bhp_issues bi
    LEFT JOIN employees e ON bi.employee_id = e.id
    LEFT JOIN users u ON bi.issued_by_user_id = u.id
    WHERE bi.bhp_id = ?
    ORDER BY bi.issued_at DESC
  `;
  db.all(query, [bhpId], (err, rows) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    res.json(rows);
  });
});

module.exports = router;
