const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { cacheMiddleware, clearCache } = require('../middleware/cache');
const { normalizeRoleKeyLocal, roleAliasesForLocal } = require('../helpers/auth');
const { validateString } = require('../helpers/utils');
const { sanitizeInput } = require('../helpers/sanitize');
const { importUpload } = require('../middleware/upload');
const { importLimiter } = require('../middleware/rateLimiters');
const { sendDomainError } = require('../helpers/errorHelper');
const { validate, Joi } = require('../middleware/validation');
const { checkDuplicateNotification } = require('../helpers/notifications');
const { getPaginationParams, formatPaginatedResponse, buildOrderClause, buildWhereClause } = require('../helpers/pagination');
const { buildFtsSearchPattern } = require('../helpers/queryBuilder');
const { triggerWebhooks } = require('../helpers/webhookSender');
const path = require('path');
const xlsx = require('xlsx');

/**
 * @swagger
 * tags:
 *   name: Tools
 *   description: Management of tools and inventory
 */

/**
 * @swagger
 * /tools/search:
 *   get:
 *     summary: Search tools by code
 *     description: Search for tools using SKU, barcode, QR code, or inventory number
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: The code to search for (partial match supported)
 *     responses:
 *       200:
 *         description: List of matching tools
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   code:
 *                     type: string
 *                   issued_quantity:
 *                     type: integer
 *                   available_quantity:
 *                     type: integer
 *       400:
 *         description: Code parameter is missing
 *       500:
 *         description: Server error
 */
// Search tools
router.get('/search', authenticateToken, (req, res) => {
  logger.info('=== TOOLS SEARCH REQUEST ===', { query: req.query });
  
  const { code } = req.query;
  
  if (!code) {
    logger.warn('No code provided for tool search');
    return res.status(400).json({ message: 'Code is required' });
  }

  logger.info('Searching for tool with code', { code });

  // Search tool by SKU, barcode, QR code or NFC Tag ID
  const query = `
      SELECT 
        t.*, 
        CASE 
          WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
             (SELECT COUNT(*) FROM tools_slings_items tsi WHERE tsi.tool_id = t.id AND tsi.status = 'issued')
          ELSE
             COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0)
        END AS issued_quantity,
        CASE 
          WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
             (SELECT COUNT(*) FROM tools_slings_items tsi WHERE tsi.tool_id = t.id AND tsi.status = 'available')
          ELSE
             (COALESCE(t.quantity, 0) - COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0))
        END AS available_quantity,
        CASE 
          WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
             (SELECT COUNT(*) FROM tools_slings_items tsi WHERE tsi.tool_id = t.id)
          ELSE
             COALESCE(t.quantity, 0)
        END AS quantity
      FROM tools t
      LEFT JOIN tool_issues ti ON t.id = ti.tool_id
      WHERE t.sku = ? OR t.barcode = ? OR t.qr_code = ? OR t.inventory_number = ? OR t.nfc_tag_id = ? OR t.name LIKE ? OR t.serial_number LIKE ? OR t.id IN (SELECT tool_id FROM tools_slings_items WHERE sku = ?)
      GROUP BY t.id
    `;

  const searchPattern = `%${code}%`;
  db.all(query, [code, code, code, code, code, searchPattern, searchPattern, code], (err, tools) => {
    if (err) {
      logger.error('Error searching for tool', { error: err });
      return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err?.message);
    }
    logger.info(`Found ${tools ? tools.length : 0} tools for code: ${code}`);
    return res.status(200).json(tools || []);
  });
});

/**
 * @swagger
 * /tools/suggestions:
 *   get:
 *     summary: Get tool suggestions
 *     description: Get unique manufacturers, models, and years for a given category
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         required: true
 *         description: Tool category
 *     responses:
 *       200:
 *         description: Suggestions object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 manufacturer:
 *                   type: array
 *                   items:
 *                     type: string
 *                 model:
 *                   type: array
 *                   items:
 *                     type: string
 *                 production_year:
 *                   type: array
 *                   items:
 *                     type: integer
 *       400:
 *         description: Category parameter is missing
 */
// Tool suggestions
router.get('/suggestions', authenticateToken, cacheMiddleware(300), (req, res) => {
  const rawCategory = (req.query.category || '').trim();
  
  // Jeśli podano kategorię, filtrujemy. Jeśli nie, pobieramy ogólne dane dla wszystkich kategorii.
  const catFilterM = rawCategory ? 'AND LOWER(category) = LOWER(?)' : '';
  const catParams = rawCategory ? [rawCategory] : [];

  const sqlManufacturer = `SELECT DISTINCT manufacturer FROM tools WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) <> "" ${catFilterM} ORDER BY manufacturer COLLATE NOCASE`;
  const sqlModel = `SELECT DISTINCT model FROM tools WHERE model IS NOT NULL AND TRIM(model) <> "" ${catFilterM} ORDER BY model COLLATE NOCASE`;
  const sqlYear = `SELECT DISTINCT production_year FROM tools WHERE production_year IS NOT NULL ${catFilterM} ORDER BY production_year ASC`;
  const sqlLocation = `SELECT DISTINCT location FROM tools WHERE location IS NOT NULL AND TRIM(location) <> "" ORDER BY location COLLATE NOCASE`;
  const sqlInventory = `SELECT DISTINCT inventory_number FROM tools WHERE inventory_number IS NOT NULL AND TRIM(inventory_number) <> "" ORDER BY inventory_number COLLATE NOCASE`;

  const out = { manufacturer: [], model: [], production_year: [], location: [], inventory_number: [] };

  db.all(sqlManufacturer, catParams, (errM, rowsM) => {
    if (errM) return sendDomainError(res, 'INTERNAL_SERVER_ERROR', errM.message);
    out.manufacturer = (rowsM || []).map(r => r.manufacturer).filter(v => typeof v === 'string');
    
    db.all(sqlModel, catParams, (errMo, rowsMo) => {
      if (errMo) return sendDomainError(res, 'INTERNAL_SERVER_ERROR', errMo.message);
      out.model = (rowsMo || []).map(r => r.model).filter(v => typeof v === 'string');
      
      db.all(sqlYear, catParams, (errY, rowsY) => {
        if (errY) return sendDomainError(res, 'INTERNAL_SERVER_ERROR', errY.message);
        out.production_year = (rowsY || []).map(r => r.production_year).filter(v => v !== null && v !== undefined);
        
        db.all(sqlLocation, [], (errL, rowsL) => {
          if (errL) return sendDomainError(res, 'INTERNAL_SERVER_ERROR', errL.message);
          out.location = (rowsL || []).map(r => r.location).filter(v => typeof v === 'string');

          db.all(sqlInventory, [], (errI, rowsI) => {
            if (errI) return sendDomainError(res, 'INTERNAL_SERVER_ERROR', errI.message);
            out.inventory_number = (rowsI || []).map(r => r.inventory_number).filter(v => typeof v === 'string');
            
            res.json(out);
          });
        });
      });
    });
  });
});

/**
 * @swagger
 * /tools/service-history:
 *   delete:
 *     summary: Delete entire service history
 *     description: Removes all records from tool_service_history table. Requires DELETE_SERVICE_HISTORY permission.
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Operation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted_count:
 *                   type: integer
 *       403:
 *         description: Permission denied
 *       500:
 *         description: Server error
 */
// Delete service history
router.delete('/service-history', authenticateToken, requirePermission('DELETE_SERVICE_HISTORY'), (req, res) => {
  logger.info('Starting deletion of service history (modular)...');

  db.run('DELETE FROM tool_service_history', function(err) {
    if (err) {
      logger.error('Error deleting service history', { error: err });
      return res.status(500).json({ message: 'Server error while deleting service history' });
    }

    const deletedCount = this.changes || 0;
    logger.info(`Deleted ${deletedCount} records from table tool_service_history`);

    const auditQuery = `
      INSERT INTO audit_logs (user_id, username, action, details, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `;

    db.run(
      auditQuery,
      [
        req.user.id,
        req.user.username,
        'DELETE_SERVICE_HISTORY',
        `Deleted service history (${deletedCount} records)`
      ],
      (auditErr) => {
        if (auditErr) {
          logger.error('Error adding audit log entry', { error: auditErr });
        }
        return res.status(200).json({
          message: 'Service history deleted',
          deleted_count: deletedCount
        });
      }
    );
  });
});

/**
 * @swagger
 * /tools:
 *   get:
 *     summary: List tools
 *     description: Get a paginated list of tools with filtering and sorting
 *     tags: [Tools]
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
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
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
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated list of tools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
/**
 * @swagger
 * /tools:
 *   get:
 *     summary: List tools
 *     description: Get a paginated list of tools with filtering and sorting
 *     tags: [Tools]
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
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
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
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated list of tools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
// List tools
router.get('/', authenticateToken, requirePermission('VIEW_TOOLS'), cacheMiddleware(30), (req, res) => {
  const rawRole = String(req.user.role || '').trim().toLowerCase();
  
  const detectCanViewAll = (cb) => {
    if (req.user.role === 'administrator') return cb(true);
    const roleKey = normalizeRoleKeyLocal(req.user.role);
    const aliases = roleAliasesForLocal(roleKey);
    const placeholders = aliases.map(() => '?').join(', ');
    const sql = `SELECT 1 as ok FROM role_permissions WHERE role IN (${placeholders}) AND permission = ?`;
    db.get(sql, [...aliases, 'VIEW_ALL_TOOLS'], (err, row) => {
      if (err) {
        logger.error('Error while checking VIEW_ALL_TOOLS permission:', { error: err.message });
        return cb(false);
      }
      cb(!!(row && row.ok));
    });
  };
  const { page, limit, offset } = getPaginationParams(req.query);
  const search = (req.query.search || '').trim();
  const category = (req.query.category || '').trim();
  const status = (req.query.status || '').trim();
  
  const allowedSort = {
    name: 't.name',
    sku: 't.sku',
    inventory_number: 't.inventory_number',
    category: 't.category',
    status: 't.status',
    location: 't.location',
    production_year: 't.production_year',
    inspection_date: 't.inspection_date'
  };
  
  const orderSql = buildOrderClause(
    req.query.sortBy, 
    req.query.sortDir, 
    allowedSort, 
    't.inventory_number', 
    { useCollateNocase: true }
  );

  const hasQueryParams = Boolean(req.query.page || req.query.limit || req.query.search || req.query.category || req.query.status || req.query.sortBy || req.query.sortDir);

  detectCanViewAll((canViewAll) => {
    if (!hasQueryParams) {
      if (canViewAll) {
        return db.all(`SELECT * FROM tools ${orderSql.replace('t.', '')}`, [], (err, tools) => {
          if (err) {
            return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err?.message);
          }
          res.status(200).json(tools);
        });
      }
      return db.get('SELECT id FROM employees WHERE login = ?', [req.user.username], (mapErr, empRow) => {
        if (mapErr) {
          logger.error('Error mapping user to employee:', { error: mapErr.message });
          return sendDomainError(res, 'INTERNAL_SERVER_ERROR', mapErr.message);
        }
        if (!empRow || !empRow.id) {
          return res.status(200).json([]);
        }
        const sql = `
          WITH ti_agg AS (
            SELECT tool_id, COALESCE(SUM(CASE WHEN LOWER(status) IN ('issued','partially_issued','permanent') THEN quantity ELSE 0 END), 0) AS issued_qty
            FROM tool_issues
            GROUP BY tool_id
          ),
          tsi_agg AS (
            SELECT 
              tool_id,
              COALESCE(SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END), 0) AS sl_issued,
              COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS sl_available,
              COUNT(*) AS sl_total
            FROM tools_slings_items
            GROUP BY tool_id
          )
          SELECT 
            t.*,
            CASE 
              WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
                 COALESCE(tsi_agg.sl_issued, 0)
              ELSE
                 COALESCE(ti_agg.issued_qty, 0)
            END AS issued_quantity,
            CASE 
              WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
                 COALESCE(tsi_agg.sl_available, 0)
              ELSE
                 (COALESCE(t.quantity, 0) - COALESCE(ti_agg.issued_qty, 0))
            END AS available_quantity,
            CASE 
              WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
                 COALESCE(tsi_agg.sl_total, 0)
              ELSE
                 COALESCE(t.quantity, 0)
            END AS quantity
          FROM tools t
          LEFT JOIN ti_agg ON ti_agg.tool_id = t.id
          LEFT JOIN tsi_agg ON tsi_agg.tool_id = t.id
          WHERE EXISTS (
            SELECT 1 FROM tool_issues ti
            WHERE ti.tool_id = t.id AND LOWER(ti.status) IN ('issued','partially_issued','permanent') AND ti.employee_id = ?
          )
          ${orderSql}
        `;
        db.all(sql, [empRow.id], (err, rows) => {
          if (err) {
            return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err.message);
          }
          res.status(200).json(rows);
        });
      });
    }

  const whereClauses = [];
  const whereParams = [];
  let subMatchCteSql = '';
  let subMatchParams = [];

  if (search) {
    const ftsQuery = buildFtsSearchPattern(search);
    const likePattern = `%${search}%`;

    subMatchCteSql = `
      sub_match AS (
        SELECT 
          tool_id,
          MIN(matched_sku) AS matched_sku,
          MIN(matched_inventory_number) AS matched_inventory_number
        FROM (
          SELECT tool_id, sku AS matched_sku, NULL AS matched_inventory_number
          FROM tools_slings_items
          WHERE LOWER(sku) LIKE LOWER(?) OR LOWER(serial_number) LIKE LOWER(?) OR LOWER(kind) LIKE LOWER(?)
          
          UNION ALL
          
          SELECT tool_id, sku AS matched_sku, NULL AS matched_inventory_number
          FROM tools_impact_sockets_1_items
          WHERE LOWER(sku) LIKE LOWER(?) OR LOWER(kind) LIKE LOWER(?)
          
          UNION ALL
          
          SELECT tool_id, sku AS matched_sku, NULL AS matched_inventory_number
          FROM tools_impact_sockets_12_items
          WHERE LOWER(sku) LIKE LOWER(?) OR LOWER(kind) LIKE LOWER(?)
          
          UNION ALL
          
          SELECT tool_id, sku AS matched_sku, inventory_number AS matched_inventory_number
          FROM tools_detectors_items
          WHERE LOWER(sku) LIKE LOWER(?) OR LOWER(inventory_number) LIKE LOWER(?) OR LOWER(type) LIKE LOWER(?) OR LOWER(serial_number) LIKE LOWER(?)
        ) m
        GROUP BY tool_id
      )
    `.trim();

    subMatchParams = [
      likePattern, likePattern, likePattern,
      likePattern, likePattern,
      likePattern, likePattern,
      likePattern, likePattern, likePattern, likePattern
    ];
    
    const conditions = [
      't.nfc_tag_id = ?',
      't.barcode = ?',
      't.qr_code = ?',
      'LOWER(t.sku) LIKE LOWER(?)',
      'LOWER(t.inventory_number) LIKE LOWER(?)',
      'LOWER(t.name) LIKE LOWER(?)',
      'LOWER(t.serial_number) LIKE LOWER(?)',
      't.id IN (SELECT tool_id FROM sub_match)'
    ];
    
    const params = [
      search, 
      search, 
      search, 
      likePattern, 
      likePattern, 
      likePattern, 
      likePattern
    ];

    if (ftsQuery) {
      // Hybrid search: FTS OR direct column matches
      conditions.unshift(`t.id IN (SELECT rowid FROM tools_fts WHERE tools_fts MATCH ?)`);
      params.unshift(ftsQuery);
    }
      
    whereClauses.push(`(${conditions.join(' OR ')})`);
    whereParams.push(...params);
  }

  const filterMappings = {
    category: 't.category',
    status: 't.status'
  };
  
  const { clauses: filterClauses, params: filterParams } = buildWhereClause({ category, status }, filterMappings);
  
  whereClauses.push(...filterClauses);
  whereParams.push(...filterParams);

    const employeeJoinClause = canViewAll ? '' : `EXISTS (
      SELECT 1 FROM tool_issues ti 
      WHERE ti.tool_id = t.id AND ti.status = 'issued' AND ti.employee_id = ?
    )`;

    if (!canViewAll) {
      return db.get('SELECT id FROM employees WHERE login = ?', [req.user.username], (mapErr, empRow) => {
        if (mapErr) {
          logger.error('Error mapping user to employee', { error: mapErr.message });
          return sendDomainError(res, 'INTERNAL_SERVER_ERROR', mapErr.message);
        }
        if (!empRow || !empRow.id) {
          return res.json(formatPaginatedResponse([], 0, page, limit));
        }
        const whereParts = [];
        if (employeeJoinClause) whereParts.push(employeeJoinClause);
        if (whereClauses.length) whereParts.push(whereClauses.join(' AND '));
        const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      const countQuery = `
        ${subMatchCteSql ? `WITH ${subMatchCteSql}` : ''}
        SELECT COUNT(*) as total
        FROM tools t
        ${whereSql}
      `;

      const dataQuery = `
        WITH ${subMatchCteSql ? `${subMatchCteSql},` : ''} ti_agg AS (
          SELECT tool_id, COALESCE(SUM(CASE WHEN LOWER(status) IN ('issued','partially_issued','permanent') THEN quantity ELSE 0 END), 0) AS issued_qty
          FROM tool_issues
          GROUP BY tool_id
        ),
        tsi_agg AS (
          SELECT 
            tool_id,
            COALESCE(SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END), 0) AS sl_issued,
            COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS sl_available,
            COUNT(*) AS sl_total
          FROM tools_slings_items
          GROUP BY tool_id
        )
        SELECT 
          t.*,
          ${subMatchCteSql ? 'COALESCE(sm.matched_sku, t.sku)' : 't.sku'} AS display_sku,
          ${subMatchCteSql ? 'COALESCE(sm.matched_inventory_number, t.inventory_number)' : 't.inventory_number'} AS display_inventory_number,
          CASE 
            WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
               COALESCE(tsi_agg.sl_issued, 0)
            ELSE
               COALESCE(ti_agg.issued_qty, 0)
          END AS issued_quantity,
          CASE 
            WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
               COALESCE(tsi_agg.sl_available, 0)
            ELSE
               (COALESCE(t.quantity, 0) - COALESCE(ti_agg.issued_qty, 0))
          END AS available_quantity,
          CASE 
            WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
               COALESCE(tsi_agg.sl_total, 0)
            ELSE
               COALESCE(t.quantity, 0)
          END AS quantity
        FROM tools t
        LEFT JOIN ti_agg ON ti_agg.tool_id = t.id
        LEFT JOIN tsi_agg ON tsi_agg.tool_id = t.id
        ${subMatchCteSql ? 'LEFT JOIN sub_match sm ON sm.tool_id = t.id' : ''}
        ${whereSql}
        ${orderSql}
        LIMIT ? OFFSET ?
      `;

      const paramsBase = employeeJoinClause ? [empRow.id, ...whereParams] : whereParams;
      const paramsBaseWithCte = subMatchCteSql ? [...subMatchParams, ...paramsBase] : paramsBase;

      db.get(countQuery, paramsBaseWithCte, (err, countResult) => {
        if (err) {
          logger.error('Error counting tools:', { error: err.message });
          return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err.message);
        }
        const total = countResult.total;
        db.all(dataQuery, [...paramsBaseWithCte, limit, offset], (err2, rows) => {
          if (err2) {
            logger.error('Error fetching tools:', { error: err2.message });
            return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err2.message);
          }
          return res.json(formatPaginatedResponse(rows, total, page, limit));
        });
      });
    });
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `
    ${subMatchCteSql ? `WITH ${subMatchCteSql}` : ''}
    SELECT COUNT(*) as total
    FROM tools t
    ${whereSql}
  `;
  const dataQuery = `
    WITH ${subMatchCteSql ? `${subMatchCteSql},` : ''} ti_agg AS (
      SELECT tool_id, COALESCE(SUM(CASE WHEN LOWER(status) IN ('issued','partially_issued','permanent') THEN quantity ELSE 0 END), 0) AS issued_qty
      FROM tool_issues
      GROUP BY tool_id
    ),
    tsi_agg AS (
      SELECT 
        tool_id,
        COALESCE(SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END), 0) AS sl_issued,
        COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS sl_available,
        COUNT(*) AS sl_total
      FROM tools_slings_items
      GROUP BY tool_id
    )
    SELECT 
      t.*,
      ${subMatchCteSql ? 'COALESCE(sm.matched_sku, t.sku)' : 't.sku'} AS display_sku,
      ${subMatchCteSql ? 'COALESCE(sm.matched_inventory_number, t.inventory_number)' : 't.inventory_number'} AS display_inventory_number,
      CASE 
        WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
           COALESCE(tsi_agg.sl_issued, 0)
        ELSE
           COALESCE(ti_agg.issued_qty, 0)
      END AS issued_quantity,
      CASE 
        WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
           COALESCE(tsi_agg.sl_available, 0)
        ELSE
           (COALESCE(t.quantity, 0) - COALESCE(ti_agg.issued_qty, 0))
      END AS available_quantity,
      CASE 
        WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
           COALESCE(tsi_agg.sl_total, 0)
        ELSE
           COALESCE(t.quantity, 0)
      END AS quantity
    FROM tools t
    LEFT JOIN ti_agg ON ti_agg.tool_id = t.id
    LEFT JOIN tsi_agg ON tsi_agg.tool_id = t.id
    ${subMatchCteSql ? 'LEFT JOIN sub_match sm ON sm.tool_id = t.id' : ''}
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;

    const whereParamsWithCte = subMatchCteSql ? [...subMatchParams, ...whereParams] : whereParams;
    db.get(countQuery, whereParamsWithCte, (err, countResult) => {
      if (err) {
        logger.error('Error counting tools', { error: err.message });
        return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err.message);
      }
      const total = countResult.total;
      db.all(dataQuery, [...whereParamsWithCte, limit, offset], (err2, rows) => {
        if (err2) {
          logger.error('Error fetching tools', { error: err2.message });
          return sendDomainError(res, 'INTERNAL_SERVER_ERROR', err2.message);
        }
        return res.json(formatPaginatedResponse(rows, total, page, limit));
      });
    });
  });
});

/**
 * @swagger
 * /tools/{id}/service:
 *   post:
 *     summary: Send tool to service
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: integer
 *               service_order_number:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tool sent to service
 *       400:
 *         description: Invalid quantity
 *       404:
 *         description: Tool not found
 */
router.post('/:id/service', authenticateToken, (req, res) => {
  const toolId = req.params.id;
  const { quantity, service_order_number } = req.body;

  db.get('SELECT id, quantity, COALESCE(service_quantity, 0) as service_quantity FROM tools WHERE id = ?', [toolId], (err, tool) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    const sendQuantity = Math.max(1, parseInt(quantity || 1, 10));
    const availableForService = tool.quantity - tool.service_quantity;
    if (sendQuantity > availableForService) {
      return res.status(400).json({ message: `Cannot send more than ${availableForService} items` });
    }

    const newServiceQuantity = tool.service_quantity + sendQuantity;

    let updateSql = 'UPDATE tools SET service_quantity = ?, service_sent_at = ?, service_order_number = COALESCE(?, service_order_number)';
    const params = [newServiceQuantity, new Date().toISOString(), service_order_number || null];
    if (tool.quantity === 1 && newServiceQuantity >= 1) {
      updateSql += ', status = ?';
      params.push('serwis');
    }
    updateSql += ' WHERE id = ?';
    params.push(toolId);

    db.run(updateSql, params, function(updateErr) {
      if (updateErr) {
        return res.status(500).json({ message: 'Server error' });
      }

      db.run('INSERT INTO tool_service_history (tool_id, action, quantity, order_number) VALUES (?, ?, ?, ?)', [toolId, 'sent', sendQuantity, service_order_number || null], (histErr) => {
        if (histErr) logger.error('Error inserting service history (sent)', { error: histErr });
      });

      db.get('SELECT * FROM tools WHERE id = ?', [toolId], (getErr, updatedTool) => {
        if (getErr) {
          return res.status(500).json({ message: 'Error fetching updated tool' });
        }
        res.status(200).json({ message: `Sent ${sendQuantity} item(s) to service${service_order_number ? ` (order: ${service_order_number})` : ''}`, tool: updatedTool });
      });
    });
  });
});

/**
 * @swagger
 * /tools/{id}/service/receive:
 *   post:
 *     summary: Receive tool from service
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Tool received from service
 *       400:
 *         description: Invalid quantity
 *       404:
 *         description: Tool not found
 */
router.post('/:id/service/receive', authenticateToken, (req, res) => {
  const toolId = req.params.id;
  const { quantity } = req.body || {};

  db.get('SELECT id, quantity, COALESCE(service_quantity, 0) as service_quantity, service_order_number FROM tools WHERE id = ?', [toolId], (err, tool) => {
    if (err) {
      return res.status(500).json({ message: 'Server error' });
    }
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    const current = tool.service_quantity;
    const receiveQuantity = Math.max(1, parseInt(quantity || current, 10));
    if (receiveQuantity > current) {
      return res.status(400).json({ message: `Maksymalnie można odebrać ${current} szt.` });
    }

    const remaining = current - receiveQuantity;

    let updateSql = 'UPDATE tools SET service_quantity = ?';
    const params = [remaining];
    if (remaining === 0) {
      updateSql += ', service_sent_at = NULL, service_order_number = NULL, status = "available"';
    }
    updateSql += ' WHERE id = ?';
    params.push(toolId);

    db.run(updateSql, params, function(updateErr) {
      if (updateErr) {
        return res.status(500).json({ message: 'Server error' });
      }

      db.run('INSERT INTO tool_service_history (tool_id, action, quantity, order_number) VALUES (?, ?, ?, ?)', [toolId, 'received', receiveQuantity, tool.service_order_number || null], function(histErr) {
        if (histErr) {
          return res.status(500).json({ message: 'Server error' });
        }

        db.get('SELECT * FROM tools WHERE id = ?', [toolId], (getErr, updatedTool) => {
          if (getErr) {
            return res.status(500).json({ message: 'Error fetching updated tool' });
          }
          res.status(200).json({ message: `Received ${receiveQuantity} item(s) from service`, tool: updatedTool, remaining });
        });
      });
    });
  });
});

/**
 * @swagger
 * /tools/import:
 *   post:
 *     summary: Import tools from Excel
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import processed
 *       400:
 *         description: No file or invalid file
 */
router.post('/import', authenticateToken, importLimiter, importUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet);
    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ message: 'File is empty or invalid' });
    }
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const runInsert = (params) => new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO tools (\n        name, sku, quantity, location, category, description, \n        barcode, qr_code, serial_number, serial_unreadable, \n        inventory_number, manufacturer, model, production_year,\n        is_consumable, created_at, updated_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        params,
        function(err) { if (err) reject(err); else resolve(this); }
      );
    });
    const getVal = (row, keys) => {
      if (!Array.isArray(keys)) keys = [keys];
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (found) return row[found];
      }
      return null;
    };
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowIndex = i + 2;
      const name = getVal(row, ['name', 'nazwa', 'tool name']);
      const sku = getVal(row, ['sku', 'kod', 'code', 'index']);
      if (!name || !sku) { errorCount++; errors.push({ row: rowIndex, message: 'Missing Name or SKU' }); continue; }
      const quantity = parseInt(getVal(row, ['quantity', 'qty', 'ilość', 'ilosc']) || '1', 10);
      const location = getVal(row, ['location', 'lokalizacja', 'miejsce']) || '';
      const category = getVal(row, ['category', 'kategoria']) || 'General';
      const description = getVal(row, ['description', 'opis']) || '';
      const inventoryNumber = getVal(row, ['inventory_number', 'inventory number', 'numer inwentarzowy', 'nr inw']) || null;
      const serialNumber = getVal(row, ['serial_number', 'serial number', 'numer seryjny', 'sn']) || null;
      const manufacturer = getVal(row, ['manufacturer', 'producent']) || null;
      const model = getVal(row, ['model']) || null;
      const prodYearVal = getVal(row, ['production_year', 'production year', 'rok produkcji', 'rok']);
      const prodYear = prodYearVal ? parseInt(prodYearVal, 10) : null;
      const barcode = getVal(row, ['barcode', 'kod kreskowy']) || sku;
      const qrCode = getVal(row, ['qr_code', 'qr']) || sku;
      const isConsumableVal = String(getVal(row, ['is_consumable', 'consumable', 'materiał eksploatacyjny']) || '').toLowerCase();
      const isConsumable = ['yes', 'true', 'tak', '1'].includes(isConsumableVal) ? 1 : 0;
      const serialUnreadableVal = String(getVal(row, ['serial_unreadable', 'unreadable', 'nieczytelny']) || '').toLowerCase();
      const serialUnreadable = ['yes', 'true', 'tak', '1'].includes(serialUnreadableVal) ? 1 : 0;
      try {
        await runInsert([
          name, sku, quantity, location, category, description,
          barcode, qrCode, serialNumber, serialUnreadable,
          inventoryNumber, manufacturer, model, prodYear,
          isConsumable
        ]);
        successCount++;
      } catch (err) {
        errorCount++;
        let msg = err.message;
        if (msg.includes('UNIQUE constraint failed')) {
          if (msg.includes('sku')) msg = `SKU '${sku}' already exists`;
          else if (msg.includes('inventory_number')) msg = `Inventory Number '${inventoryNumber}' already exists`;
        }
        errors.push({ row: rowIndex, message: msg, sku });
      }
    }
    res.json({ message: 'Import processed', total: rawData.length, success: successCount, failed: errorCount, errors });
  } catch (e) {
    logger.error('Import tools error', { error: e.message });
    res.status(500).json({ message: 'Server error during import', error: e.message });
  }
});

const createToolSchema = Joi.object({
  name: Joi.string().required().trim().min(2).max(100),
  sku: Joi.string().trim().max(50).allow(null, '').optional(),
  quantity: Joi.number().integer().min(0).default(0),
  location: Joi.string().allow('', null).trim().max(100),
  category: Joi.string().allow('', null).trim().max(50),
  description: Joi.string().allow('', null).trim().max(500),
  barcode: Joi.string().allow('', null).trim().max(100),
  qr_code: Joi.string().allow('', null).trim().max(100),
  serial_number: Joi.string().allow('', null).trim().max(100),
  inventory_number: Joi.string().allow('', null).trim().max(100),
  manufacturer: Joi.string().allow('', null).trim().max(100),
  model: Joi.string().allow('', null).trim().max(100),
  production_year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1).allow(null),
  production_date: Joi.string().allow('', null).trim().max(20),
  nfc_tag_id: Joi.string().allow('', null).trim().max(50),
  min_stock: Joi.number().integer().min(0).allow(null),
  max_stock: Joi.number().integer().min(0).allow(null),
  is_consumable: Joi.boolean().truthy(1).truthy('1').falsy(0).falsy('0').default(false),
  serial_unreadable: Joi.boolean().truthy(1).truthy('1').falsy(0).falsy('0').default(false),
  inspection_date: Joi.date().iso().allow(null, '')
});

router.schemas = { ...(router.schemas || {}), createToolSchema };

/**
 * @swagger
 * /tools:
 *   post:
 *     summary: Create a new tool
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, sku]
 *             properties:
 *               name:
 *                 type: string
 *               sku:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               location:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               inventory_number:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *               model:
 *                 type: string
 *               production_year:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Tool created
 *       400:
 *         description: Validation error or duplicate
 */
router.post('/', authenticateToken, validate(createToolSchema), (req, res) => {
  clearCache('/api/tools');
  // Dane są już zwalidowane i znajdują się w req.body
  // validate() usuwa nieznane pola (stripUnknown: true), więc nie musimy ręcznie wybierać pól, ale
  // dla pewności i przejrzystości SQL, pobierzemy je z req.body.
  
  const { 
    name, sku, quantity, location, category, description, 
    barcode, qr_code, serial_number, serial_unreadable, 
    inventory_number, inspection_date, min_stock, max_stock, 
    is_consumable, manufacturer, model, production_year, production_date, nfc_tag_id 
  } = req.body;

  // Sanitizacja jest już częściowo zapewniona przez Joi (typy), ale sanitizeInput usuwa XSS.
  // Joi nie usuwa tagów HTML domyślnie. Możemy użyć sanitizeInput na stringach.
  // Ale ponieważ używamy sparametryzowanych zapytań SQL, SQL Injection nam nie grozi.
  // XSS przy wyświetlaniu - frontend powinien dbać, ale backend też może.
  // Zachowajmy sanitizeInput dla pól tekstowych dla bezpieczeństwa.
  
  const safeName = sanitizeInput(name);
  // Jeśli sku jest null lub pusty, zapisz jako null (żeby uniknąć problemów z UNIQUE constraint dla pustych stringów)
  const safeSku = (sku === null || sku === undefined || sku === '') ? null : sanitizeInput(sku);
  const safeInventoryNumberSanitized = sanitizeInput(inventory_number);
  const safeInventoryNumber = safeInventoryNumberSanitized && safeInventoryNumberSanitized.trim() ? safeInventoryNumberSanitized.trim() : null;

  // ... reszta ...
  // W sumie, skoro mamy validate, kod poniżej można uprościć, ale sanitizeInput nadal warto użyć.

  db.run(
    `INSERT INTO tools (
      name, sku, quantity, location, category, description, 
      barcode, qr_code, serial_number, serial_unreadable, 
      inventory_number, inspection_date, min_stock, max_stock, 
      is_consumable, manufacturer, model, production_year, production_date, nfc_tag_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      safeName, safeSku, quantity, sanitizeInput(location), sanitizeInput(category), sanitizeInput(description),
      sanitizeInput(barcode), sanitizeInput(qr_code), sanitizeInput(serial_number), serial_unreadable ? 1 : 0,
      safeInventoryNumber, inspection_date, min_stock, max_stock,
      is_consumable ? 1 : 0, sanitizeInput(manufacturer), sanitizeInput(model), production_year, sanitizeInput(production_date), sanitizeInput(nfc_tag_id)
    ],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          if (err.message.includes('nfc_tag_id')) return res.status(400).json({ message: 'Tool with this NFC Tag ID already exists' });
          return res.status(400).json({ message: 'Tool with this SKU or Inventory Number already exists' });
        }
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.status(201).json({ message: 'Tool added', id: this.lastID });
    }
  );
});

// Get tool by code (internal/by-code)
/**
 * @swagger
 * /tools/by-code/{code}:
 *   get:
 *     summary: Get tool by SKU or Inventory Number
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tool details
 *       404:
 *         description: Tool not found
 *       400:
 *         description: Invalid code
 */
router.get('/by-code/:code', authenticateToken, (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) {
    return sendDomainError(res, 'INVALID_TOOL_CODE', 'tools.errors.invalidCode', 'Invalid tool code');
  }
  db.get(
    `SELECT 
       t.*, 
       COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0) AS issued_quantity,
       (t.quantity - COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0)) AS available_quantity
     FROM tools t
     LEFT JOIN tool_issues ti ON t.id = ti.tool_id
     WHERE t.sku = ? OR t.inventory_number = ?
     GROUP BY t.id`,
    [code, code],
    (err, row) => {
      if (err) {
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
      }
      if (!row) {
        return sendDomainError(res, 'TOOL_NOT_FOUND');
      }
      return res.json(row);
    }
  );
});

/**
 * @swagger
 * /tools/{id}:
 *   get:
 *     summary: Get tool by ID
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tool details
 *       404:
 *         description: Tool not found
 */
router.get('/:id', authenticateToken, (req, res) => {
  const toolId = req.params.id;
  const query = `
    SELECT 
      t.*, 
      COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0) AS issued_quantity,
      (t.quantity - COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0)) AS available_quantity
    FROM tools t
    LEFT JOIN tool_issues ti ON t.id = ti.tool_id
    WHERE t.id = ?
    GROUP BY t.id
  `;
  db.get(query, [toolId], (err, tool) => {
    if (err) {
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    if (!tool) {
      return sendDomainError(res, 'TOOL_NOT_FOUND');
    }
    return res.json(tool);
  });
});



// Get tool details
/**
 * @swagger
 * /tools/{id}/details:
 *   get:
 *     summary: Get tool details with active issues
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tool details with issues
 *       404:
 *         description: Tool not found
 */
router.get('/:id/details', authenticateToken, (req, res) => {
  const toolId = req.params.id;
  logger.info(`Pobieranie szczegółów narzędzia ID: ${toolId}`);

  const query = `
    SELECT 
      t.*,
      CASE 
        WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
           (SELECT COUNT(*) FROM tools_slings_items tsi WHERE tsi.tool_id = t.id AND tsi.status = 'issued')
        ELSE
           COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0)
      END as issued_quantity,
      CASE 
        WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
           (SELECT COUNT(*) FROM tools_slings_items tsi WHERE tsi.tool_id = t.id AND tsi.status = 'available')
        ELSE
           (COALESCE(t.quantity, 0) - COALESCE(SUM(CASE WHEN ti.status = 'issued' THEN ti.quantity ELSE 0 END), 0))
      END as available_quantity,
      CASE 
        WHEN LOWER(t.category) IN ('zawiesia pasowe', 'zawiesia łańcuchowe') THEN 
           (SELECT COUNT(*) FROM tools_slings_items tsi WHERE tsi.tool_id = t.id)
        ELSE
           COALESCE(t.quantity, 0)
      END as quantity
    FROM tools t
    LEFT JOIN tool_issues ti ON t.id = ti.tool_id
    WHERE t.id = ?
    GROUP BY t.id
  `;

  db.get(query, [toolId], (err, tool) => {
    if (err) {
      logger.error(`Error fetching tool ID ${toolId} from database`, { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    if (!tool) {
      logger.info(`Tool ID ${toolId} not found`);
      return res.status(404).json({ message: 'Tool not found' });
    }

    // Fetch issue details
    const issuesQuery = `
      SELECT 
        ti.*,
        e.first_name as employee_first_name,
        e.last_name as employee_last_name,
        e.brand_number as employee_brand_number,
        u.full_name as issued_by_user_name
      FROM tool_issues ti
      LEFT JOIN employees e ON ti.employee_id = e.id
      LEFT JOIN users u ON ti.issued_by_user_id = u.id
      WHERE ti.tool_id = ? AND LOWER(ti.status) IN ('issued', 'partially_issued', 'permanent')
      ORDER BY ti.issued_at DESC
    `;

    db.all(issuesQuery, [toolId], (err, issues) => {
      if (err) {
        logger.error(`Error fetching issues for tool ID ${toolId} from database`, { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }

      const result = {
        ...tool,
        issues: issues
      };

      logger.info(`Tool ID ${toolId} details found`, { name: tool.name });
      res.json(result);
    });
  });
});


/**
 * @swagger
 * /tools/{id}:
 *   put:
 *     summary: Update a tool
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               sku:
 *                 type: string
 *               quantity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Tool updated
 *       404:
 *         description: Tool not found
 *       400:
 *         description: Validation error
 */
router.put('/:id', authenticateToken, (req, res) => {
  clearCache('/api/tools');
  const { name, sku, quantity, location, category, description, barcode, qr_code, serial_number, serial_unreadable, status, inventory_number, inspection_date, min_stock, max_stock, is_consumable, manufacturer, model, production_year, production_date, nfc_tag_id } = req.body;
  const id = req.params.id;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const safeSku = (sku === null || sku === undefined || sku === '') ? null : sanitizeInput(sku);
  
  const serialProvided = serial_number && String(serial_number).trim().length > 0;
  const unreadableFlag = !!serial_unreadable;
  if (!serialProvided && !unreadableFlag) return res.status(400).json({ message: 'Factory serial number is required or mark as unreadable' });
  const minStockSan = (min_stock === '' || min_stock === null || typeof min_stock === 'undefined') ? null : Math.max(0, parseInt(min_stock, 10));
  const maxStockSan = (max_stock === '' || max_stock === null || typeof max_stock === 'undefined') ? null : Math.max(0, parseInt(max_stock, 10));
  if (minStockSan !== null && maxStockSan !== null && maxStockSan < minStockSan) return res.status(400).json({ message: 'Maximum stock cannot be less than minimum stock' });
  let prodYearSan = null;
  if (typeof production_year !== 'undefined' && production_year !== null && String(production_year).trim() !== '') {
    const parsed = parseInt(production_year, 10);
    if (!Number.isNaN(parsed)) prodYearSan = parsed;
  }
  db.run(
    'UPDATE tools SET name = ?, sku = ?, quantity = ?, location = ?, category = ?, description = ?, barcode = ?, qr_code = ?, serial_number = ?, serial_unreadable = ?, inventory_number = ?, inspection_date = ?, min_stock = ?, max_stock = ?, is_consumable = ?, status = ?, manufacturer = ?, model = ?, production_year = ?, production_date = ?, nfc_tag_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, safeSku, quantity || 1, location, category, description, barcode || safeSku, qr_code || safeSku, serialProvided ? serial_number : null, unreadableFlag ? 1 : 0, inventory_number || null, inspection_date || null, minStockSan, maxStockSan, is_consumable ? 1 : 0, status || 'available', manufacturer || null, model || null, prodYearSan, production_date || null, nfc_tag_id || null, id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed: tools.inventory_number')) return res.status(400).json({ message: 'Tool with this inventory number already exists' });
        if (err.message.includes('UNIQUE constraint failed: tools.nfc_tag_id') || (err.message.includes('UNIQUE constraint failed') && err.message.includes('nfc_tag_id'))) return res.status(400).json({ message: 'Tool with this NFC Tag ID already exists' });
        if (err.message.includes('UNIQUE constraint failed')) return res.status(400).json({ message: 'Tool with this SKU already exists' });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ message: 'Tool not found' });
      db.get('SELECT * FROM tools WHERE id = ?', [id], (getErr, row) => {
        if (getErr) return res.status(500).json({ message: 'Error fetching updated tool' });
        try {
          const parseDate = (val) => {
            if (!val) return null;
            const str = String(val).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
            const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
            if (m) { const [, dd, mm, yyyy] = m; return new Date(`${yyyy}-${mm}-${dd}`); }
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
          };
          const today = new Date(); today.setHours(0,0,0,0);
          const insp = parseDate(row?.inspection_date);
          const isOverdue = insp && insp.getTime() < today.getTime();
          const isAvailable = String(row?.status || '').toLowerCase() === 'available';
          if (isOverdue && isAvailable) {
            db.get('SELECT employee_id FROM tool_issues WHERE tool_id = ? AND status = "issued" ORDER BY issued_at DESC LIMIT 1', [id], (e2, active) => {
              if (e2) return;
              const employeeId = active ? active.employee_id : null;
              if (!employeeId) return;
              db.get('SELECT u.id as user_id FROM users u JOIN employees e ON u.username = e.login WHERE e.id = ?', [employeeId], (muErr, muRow) => {
                if (muErr || !muRow || !muRow.user_id) return;
                const targetUserId = muRow.user_id;
                db.get('SELECT id FROM notifications WHERE user_id = ? AND type = "overdue_inspection" AND item_type = "tool" AND item_id = ?', [targetUserId, id], (nErr, existing) => {
                  if (nErr) return;
                  if (!existing) {
                    db.run('INSERT INTO notifications (user_id, type, item_type, item_id, employee_id, message, read, created_at) VALUES (?, "overdue_inspection", "tool", ?, ?, NULL, 0, datetime("now"))', [targetUserId, id, employeeId]);
                  }
                });
              });
            });
          } else {
            db.run('DELETE FROM notifications WHERE type = "overdue_inspection" AND item_type = "tool" AND item_id = ?', [id]);
          }
        } catch (_) {}
        res.status(200).json({ message: 'Tool updated successfully', item: row });
      });
    }
  );
});

/**
 * @swagger
 * /tools/{id}:
 *   delete:
 *     summary: Delete a tool
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tool deleted
 *       404:
 *         description: Tool not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authenticateToken, (req, res) => {
  clearCache('/api/tools');
  const id = req.params.id;
  db.run('DELETE FROM tools WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (this.changes === 0) return res.status(404).json({ message: 'Tool not found' });
    res.status(200).json({ message: 'Tool deleted successfully' });
  });
});

/**
 * @swagger
 * /tools/{id}/issue:
 *   post:
 *     summary: Issue a tool to an employee
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [employee_id]
 *             properties:
 *               employee_id:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 default: 1
 *     responses:
 *       200:
 *         description: Tool issued successfully
 *       400:
 *         description: Insufficient quantity or invalid input
 *       404:
 *         description: Tool or Employee not found
 */
router.post('/:id/issue', authenticateToken, (req, res) => {
  const toolId = req.params.id;
  const { employee_id, quantity = 1, status = 'issued' } = req.body;
  const userId = req.user.id;
  
  if (!employee_id) return res.status(400).json({ message: 'Employee ID is required' });
  if (quantity < 1) return res.status(400).json({ message: 'Quantity must be greater than 0' });
  
  const validStatuses = ['issued', 'permanent'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status. Must be "issued" or "permanent"' });
  }
  const issueStatus = status || 'issued';

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
      if (err) return res.status(500).json({ message: 'Transaction error' });
      db.get('SELECT * FROM tools WHERE id = ?', [toolId], (err2, tool) => {
        if (err2) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
        if (!tool) { db.run('ROLLBACK'); return res.status(404).json({ message: 'Tool not found' }); }
        
        // Count issued (both types count towards availability)
        db.get(
          'SELECT COALESCE(SUM(quantity), 0) as issued_quantity, COALESCE(SUM(CASE WHEN LOWER(status) = "permanent" THEN quantity ELSE 0 END), 0) as permanent_quantity FROM tool_issues WHERE tool_id = ? AND LOWER(status) IN ("issued", "partially_issued", "permanent")',
          [toolId],
          (err3, result) => {
          if (err3) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
          
          const toolQuantity = Number(tool?.quantity || 0) || 0;
          const alreadyIssuedQuantity = Number(result?.issued_quantity || 0) || 0;
          const alreadyPermanentQuantity = Number(result?.permanent_quantity || 0) || 0;
          const requestQuantity = Number(quantity || 0) || 0;

          const availableQuantity = toolQuantity - alreadyIssuedQuantity;
          if (availableQuantity < quantity) { db.run('ROLLBACK'); return res.status(400).json({ message: `Insufficient quantity available. Available: ${availableQuantity}, requested: ${quantity}` }); }
          
          db.get('SELECT * FROM employees WHERE id = ?', [employee_id], (err4, employee) => {
            if (err4) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
            if (!employee) { db.run('ROLLBACK'); return res.status(404).json({ message: 'Employee not found' }); }
            
            db.run('INSERT INTO tool_issues (tool_id, employee_id, issued_by_user_id, quantity, status) VALUES (?, ?, ?, ?, ?)', [toolId, employee_id, userId, quantity, issueStatus], function(err5) {
              if (err5) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
              const issueId = this.lastID;
              
              const newIssuedQuantity = alreadyIssuedQuantity + requestQuantity;
              const newPermanentQuantity = alreadyPermanentQuantity + (issueStatus === 'permanent' ? requestQuantity : 0);
              let newToolStatus;
              if (newIssuedQuantity === 0) newToolStatus = 'available';
              else if (newIssuedQuantity < toolQuantity) newToolStatus = 'partially_issued';
              else if (newPermanentQuantity >= toolQuantity && newPermanentQuantity === newIssuedQuantity) newToolStatus = 'permanent';
              else newToolStatus = 'issued';
              
              db.run('UPDATE tools SET status = ? WHERE id = ?', [newToolStatus, toolId], function(err6) {
                if (err6) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
                
                db.run('COMMIT', async (commitErr) => {
                  if (commitErr) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Transaction commit failed' }); }
                  
                  if (employee.login) {
                    try {
                      const userRow = await new Promise((resolve) => { db.get('SELECT id FROM users WHERE username = ?', [employee.login], (err, row) => resolve(row)); });
                      if (userRow) {
                        const isDuplicate = await checkDuplicateNotification(db, userRow.id, 'new_issue', 'tool', toolId);
                        if (!isDuplicate) {
                          const msg = `Masz nowe narzędzie: ${tool.name}`;
                          db.run('INSERT INTO notifications (user_id, type, item_type, item_id, employee_id, message, read, created_at) VALUES (?, "new_issue", "tool", ?, ?, ?, 0, datetime("now"))', [userRow.id, toolId, employee.id, msg]);
                        }
                      }
                    } catch (notifErr) { logger.error('Error in notification logic', { error: notifErr.message }); }
                  }
                  
                  triggerWebhooks('tool.issue', {
                    tool_id: toolId,
                    tool_name: tool.name,
                    employee_id: employee_id,
                    employee_name: `${employee.first_name} ${employee.last_name}`,
                    quantity: quantity,
                    status: issueStatus,
                    issued_by: req.user.username
                  });
                  
                  res.status(200).json({ 
                    message: `Issued ${quantity} items of the tool`, 
                    issue_id: issueId, 
                    available_quantity: availableQuantity - quantity, 
                    employee_id: employee.id, 
                    employee_first_name: employee.first_name, 
                    employee_last_name: employee.last_name, 
                    employee_brand_number: employee.brand_number || null 
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

router.post('/:id/return', authenticateToken, (req, res) => {
  const toolId = req.params.id;
  const { issue_id, quantity } = req.body;
  if (!issue_id) return res.status(400).json({ message: 'Issue ID is required' });
  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
      if (beginErr) { logger.error('Transaction begin error', { error: beginErr.message }); return res.status(500).json({ message: 'Server error' }); }
      db.get('SELECT * FROM tool_issues WHERE id = ? AND tool_id = ? AND LOWER(status) IN ("issued", "partially_issued", "permanent")', [issue_id, toolId], (err, issue) => {
        if (err) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
        if (!issue) { db.run('ROLLBACK'); return res.status(404).json({ message: 'Issue not found or already returned' }); }
        const returnQuantity = quantity || issue.quantity;
        if (returnQuantity > issue.quantity) { db.run('ROLLBACK'); return res.status(400).json({ message: 'Cannot return more than was issued' }); }
        if (returnQuantity === issue.quantity) {
          db.run('UPDATE tool_issues SET status = "returned", returned_at = datetime("now") WHERE id = ?', [issue_id], function(err2) {
            if (err2) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
            try {
              const employeeId = issue.employee_id;
              if (employeeId) {
                db.get('SELECT u.id as user_id FROM users u JOIN employees e ON u.username = e.login WHERE e.id = ?', [employeeId], (muErr, muRow) => {
                  if (!muErr && muRow && muRow.user_id) {
                    const targetUserId = muRow.user_id;
                    db.run('DELETE FROM notifications WHERE user_id = ? AND type = "overdue_inspection" AND item_type = "tool" AND item_id = ?', [targetUserId, toolId]);
                    db.run('DELETE FROM notifications WHERE user_id = ? AND type = "return_request" AND item_type = "tool" AND item_id = ?', [targetUserId, toolId]);
                  }
                });
              }
            } catch (_) {}
            updateToolStatus(toolId, res, returnQuantity, true);
          });
        } else {
          db.run('UPDATE tool_issues SET quantity = ? WHERE id = ?', [issue.quantity - returnQuantity, issue_id], function(err3) {
            if (err3) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
            db.run('INSERT INTO tool_issues (tool_id, employee_id, issued_by_user_id, quantity, status, returned_at) VALUES (?, ?, ?, ?, "returned", datetime("now"))', [toolId, issue.employee_id, issue.issued_by_user_id, returnQuantity], function(err4) {
              if (err4) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
              try {
                db.get('SELECT COALESCE(SUM(quantity), 0) as emp_active FROM tool_issues WHERE tool_id = ? AND employee_id = ? AND LOWER(status) IN ("issued", "partially_issued", "permanent")', [toolId, issue.employee_id], (qErr, qRow) => {
                  const remaining = qErr ? null : parseInt(qRow?.emp_active ?? '0', 10);
                  if (!qErr && remaining === 0) {
                    db.get('SELECT u.id as user_id FROM users u JOIN employees e ON u.username = e.login WHERE e.id = ?', [issue.employee_id], (muErr, muRow) => {
                      if (!muErr && muRow && muRow.user_id) {
                        const targetUserId = muRow.user_id;
                        db.run('DELETE FROM notifications WHERE user_id = ? AND type = "overdue_inspection" AND item_type = "tool" AND item_id = ?', [targetUserId, toolId]);
                        db.run('DELETE FROM notifications WHERE user_id = ? AND type = "return_request" AND item_type = "tool" AND item_id = ?', [targetUserId, toolId]);
                      }
                      updateToolStatus(toolId, res, returnQuantity, true);
                    });
                  } else {
                    updateToolStatus(toolId, res, returnQuantity, true);
                  }
                });
              } catch (_) { updateToolStatus(toolId, res, returnQuantity, true); }
            });
          });
        }
      });
    });
  });
  function updateToolStatus(toolId, res, returnedQuantity, inTransaction = false) {
    db.get(
      'SELECT COALESCE(SUM(quantity), 0) as issued_quantity, COALESCE(SUM(CASE WHEN LOWER(status) = "permanent" THEN quantity ELSE 0 END), 0) as permanent_quantity FROM tool_issues WHERE tool_id = ? AND LOWER(status) IN ("issued", "partially_issued", "permanent")',
      [toolId],
      (err, result) => {
      if (err) { if (inTransaction) db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
      db.get('SELECT quantity FROM tools WHERE id = ?', [toolId], (err2, tool) => {
        if (err2) { if (inTransaction) db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
        const toolQuantity = Number(tool?.quantity || 0) || 0;
        const issuedQuantity = Number(result?.issued_quantity || 0) || 0;
        const permanentQuantity = Number(result?.permanent_quantity || 0) || 0;
        let newStatus;
        if (issuedQuantity === 0) newStatus = 'available';
        else if (issuedQuantity < toolQuantity) newStatus = 'partially_issued';
        else if (permanentQuantity >= toolQuantity && permanentQuantity === issuedQuantity) newStatus = 'permanent';
        else newStatus = 'issued';
        db.run('UPDATE tools SET status = ? WHERE id = ?', [newStatus, toolId], function(err3) {
          if (err3) { if (inTransaction) db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
          if (inTransaction) {
            db.run('COMMIT', (commitErr) => {
              if (commitErr) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Transaction commit failed' }); }
              respondSuccess();
            });
          } else {
            respondSuccess();
          }
          function respondSuccess() {
            triggerWebhooks('tool.return', {
              tool_id: toolId,
              tool_name: tool.name,
              quantity: returnedQuantity,
              received_by: req.user.username
            });
            res.status(200).json({ message: `Returned ${returnedQuantity} items of the tool`, new_status: newStatus, available_quantity: tool.quantity - result.issued_quantity });
          }
        });
      });
    });
  }
});

// Create a return request notification for tool
router.post('/:id/notify-return', authenticateToken, requirePermission('MANAGE_TOOLS'), (req, res) => {
  const toolId = parseInt(req.params.id, 10);
  const { message, target_employee_id, target_brand_number } = req.body || {};
  const senderUserId = req.user.id;

  if (!toolId) {
    return res.status(400).json({ message: 'Invalid tool ID' });
  }

  db.get('SELECT id FROM tools WHERE id = ?', [toolId], (err, tool) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (!tool) return res.status(404).json({ message: 'Tool not found' });

    const resolveEmployeeId = (cb) => {
      if (target_employee_id) return cb(null, target_employee_id);
      if (target_brand_number) {
        return db.get('SELECT id FROM employees WHERE brand_number = ?', [String(target_brand_number)], (e1, r1) => {
          if (e1) return cb(e1);
          if (r1 && r1.id) return cb(null, r1.id);
          return cb(null, null);
        });
      }
      db.get('SELECT employee_id FROM tool_issues WHERE tool_id = ? AND LOWER(status) IN ("issued", "partially_issued", "permanent") ORDER BY issued_at DESC LIMIT 1', [toolId], (e2, active) => {
        if (e2) return cb(e2);
        cb(null, active ? active.employee_id : null);
      });
    };

    resolveEmployeeId((mapErr, employeeId) => {
      if (mapErr) return res.status(500).json({ message: 'Server error' });
      const resolveRecipientUserId = (cb) => {
        if (!employeeId) return cb(null, null);
        db.get('SELECT id FROM users WHERE employee_id = ? LIMIT 1', [employeeId], (uErr, uRow) => {
          if (uErr) return cb(uErr);
          if (uRow && uRow.id) return cb(null, uRow.id);
          db.get('SELECT login, brand_number FROM employees WHERE id = ?', [employeeId], (eErr, eRow) => {
            if (eErr) return cb(eErr);
            const login = eRow && eRow.login ? eRow.login : null;
            const brand = eRow && eRow.brand_number ? eRow.brand_number : null;
            if (!login) return cb(null, null);
            db.get('SELECT id FROM users WHERE username = ? LIMIT 1', [login], (u2Err, u2Row) => {
              if (u2Err) return cb(u2Err);
              if (u2Row && u2Row.id) return cb(null, u2Row.id);
              if (brand) {
                db.get('SELECT id FROM users WHERE brand_number = ? LIMIT 1', [brand], (u3Err, u3Row) => {
                  if (u3Err) return cb(u3Err);
                  return cb(null, u3Row && u3Row.id ? u3Row.id : null);
                });
              } else {
                return cb(null, null);
              }
            });
          });
        });
      };
      resolveRecipientUserId((uMapErr, recipientUserId) => {
        if (uMapErr) return res.status(500).json({ message: 'Server error' });
        const targetUserId = recipientUserId || senderUserId;
        db.run(
          'INSERT INTO notifications (user_id, type, item_type, item_id, employee_id, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime("now"))',
          [targetUserId, 'return_request', 'tool', toolId, employeeId, message || null],
          function(err3) {
            if (err3) {
              logger.error('Error creating notification (tool)', { error: err3.message });
              return res.status(500).json({ message: 'Server error' });
            }
            try {
              logger.info(`[NOTIFY] return_request tool: item_id=${toolId}, employee_id=${employeeId ?? 'null'}, user_id=${targetUserId}, message='${message || ''}', id=${this.lastID}`);
              if (typeof global.wsClients !== 'undefined') {
                 const clientSet = global.wsClients.get(targetUserId);
                 if (clientSet) {
                   const payload = JSON.stringify({
                     type: 'notification',
                     data: {
                       title: 'Prośba o zwrot narzędzia',
                       message: message || 'Prośba o zwrot narzędzia',
                       url: `/tools/${toolId}` // Link to tool details
                     }
                   });
                   clientSet.forEach(ws => {
                     try { if (ws.readyState === 1) ws.send(payload); } catch (_) {}
                   });
                 }
              }
            } catch (_) { }
            res.status(201).json({ message: 'Return request notification created', id: this.lastID, employee_id: employeeId, user_id: targetUserId });
          }
        );
      });
    });
  });
});

// Fetch return request notifications history for a specific tool
router.get('/:id/return-requests', authenticateToken, requirePermission('VIEW_TOOL_HISTORY'), (req, res) => {
  const toolId = parseInt(req.params.id, 10);
  if (!toolId) {
    return res.status(400).json({ message: 'Invalid tool ID' });
  }
  const sql = `
    SELECT n.id, n.user_id, n.item_id, n.message, n.read, n.read_at, n.created_at,
           COALESCE(u.full_name, u.username) AS recipient_name
    FROM notifications n
    LEFT JOIN users u ON u.id = n.user_id
    WHERE n.type = 'return_request' AND n.item_type = 'tool' AND n.item_id = ?
    ORDER BY n.created_at DESC
  `;
  db.all(sql, [toolId], (err, rows) => {
    if (err) {
      logger.error('Error fetching return request notifications', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    const out = (rows || []).map(r => ({
      id: r.id,
      user_id: r.user_id,
      tool_id: r.item_id,
      message: r.message || '',
      read: !!r.read,
      read_at: r.read_at || null,
      created_at: r.created_at,
      recipient_name: r.recipient_name || ''
    }));
    return res.json(out);
  });
});

module.exports = router;
