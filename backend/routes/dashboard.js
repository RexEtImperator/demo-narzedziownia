const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');

// Helper to execute count query
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.count : 0);
    });
  });
};

const tableExists = (tableName) => new Promise((resolve, reject) => {
  db.get(
    `SELECT 1 as exists_flag FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`,
    [tableName],
    (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    }
  );
});

// Helper to execute select query
const runSelectQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

// Helper to get employee ID
const getEmployeeId = (username) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM employees WHERE login = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.id : null);
    });
  });
};

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard statistics and counters
 */

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Returns statistics for the dashboard, filtered by user role (employee vs admin/manager).
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalEmployees:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 activeDepartments:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 totalPositions:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 totalTools:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 totalBhp:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 overdueToolsCount:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 overdueBhpCount:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                 overdueInspections:
 *                   type: integer
 *       500:
 *         description: Server error
 */
// Dashboard statistics download endpoint
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const rawRole = String(req.user.role || '').trim().toLowerCase();
    const isEmployee = rawRole === 'employee';

    let employeeId = null;
    if (isEmployee) {
      employeeId = await getEmployeeId(req.user.username);
      // If employee role but no employee record found, return empty stats or handle gracefully
      if (!employeeId) {
        logger.warn(`Dashboard stats: Employee record not found for user ${req.user.username}`);
      }
    }

    // Base queries
    const queries = {};

    // Global stats (Directory info) - Visible to all
    queries.totalEmployees = 'SELECT COUNT(*) as count FROM employees';
    queries.activeDepartments = 'SELECT COUNT(DISTINCT name) as count FROM departments';
    queries.totalPositions = 'SELECT COUNT(DISTINCT name) as count FROM positions';

    if (isEmployee && employeeId) {
      // Employee View - Filtered by assigned items
      
      queries.totalTools = `
        SELECT COUNT(*) as count FROM tools t
        WHERE EXISTS (SELECT 1 FROM tool_issues ti WHERE ti.tool_id = t.id AND ti.status = 'issued' AND ti.employee_id = ?)
      `;
      
      queries.totalBhp = `
        SELECT COUNT(*) as count FROM bhp b
        WHERE EXISTS (SELECT 1 FROM bhp_issues bi WHERE bi.bhp_id = b.id AND bi.status = 'issued' AND bi.employee_id = ?)
      `;

      queries.overdueToolsCount = `
        SELECT COUNT(*) as count FROM tools t
        WHERE inspection_date < date('now') AND inspection_date IS NOT NULL AND inspection_date != ''
        AND EXISTS (SELECT 1 FROM tool_issues ti WHERE ti.tool_id = t.id AND ti.status = 'issued' AND ti.employee_id = ?)
      `;

      queries.overdueBhpCount = `
        SELECT COUNT(*) as count FROM bhp b
        WHERE inspection_date < date('now') AND inspection_date IS NOT NULL AND inspection_date != ''
        AND EXISTS (SELECT 1 FROM bhp_issues bi WHERE bi.bhp_id = b.id AND bi.status = 'issued' AND bi.employee_id = ?)
      `;

    } else {
      // Admin/Manager View - Global counts
      queries.totalTools = 'SELECT COUNT(*) as count FROM tools';
      queries.totalBhp = 'SELECT COUNT(*) as count FROM bhp';
      
      queries.overdueToolsCount = `
        SELECT COUNT(*) as count FROM tools 
        WHERE inspection_date < date('now') AND inspection_date IS NOT NULL AND inspection_date != ''
      `;
      
      queries.overdueBhpCount = `
        SELECT COUNT(*) as count FROM bhp 
        WHERE inspection_date < date('now') AND inspection_date IS NOT NULL AND inspection_date != ''
      `;
      
      queries.toolsInService = `
        SELECT COUNT(*) as count FROM tools 
        WHERE service_quantity > 0 OR status = 'in_service'
      `;
    }

    // Execute queries
    const results = {};
    const keys = Object.keys(queries);
    
    await Promise.all(keys.map(async (key) => {
      const sql = queries[key];
      // Add employeeId param only for filtered queries
      const params = (isEmployee && employeeId && (
        key === 'totalTools' || 
        key === 'totalBhp' || 
        key === 'overdueToolsCount' || 
        key === 'overdueBhpCount'
      )) ? [employeeId] : [];
      
      results[key] = await runQuery(sql, params);
    }));

    // List queries
    const listQueries = {};
    if (isEmployee && employeeId) {
      listQueries.upcomingInspectionsList = `
        SELECT id, name, inspection_date, 'tool' as type, serial_number, inventory_number FROM tools t
        WHERE inspection_date IS NOT NULL AND inspection_date != '' AND inspection_date <= date('now', '+30 days')
        AND EXISTS (SELECT 1 FROM tool_issues ti WHERE ti.tool_id = t.id AND ti.status = 'issued' AND ti.employee_id = ?)
        UNION ALL
        SELECT id, COALESCE(model, inventory_number) as name, inspection_date, 'bhp' as type, serial_number, inventory_number FROM bhp b
        WHERE inspection_date IS NOT NULL AND inspection_date != '' AND inspection_date <= date('now', '+30 days')
        AND EXISTS (SELECT 1 FROM bhp_issues bi WHERE bi.bhp_id = b.id AND bi.status = 'issued' AND bi.employee_id = ?)
        ORDER BY inspection_date ASC
        LIMIT 50
      `;
    } else {
      listQueries.upcomingInspectionsList = `
        SELECT id, name, inspection_date, 'tool' as type, serial_number, inventory_number FROM tools 
        WHERE inspection_date IS NOT NULL AND inspection_date != '' AND inspection_date <= date('now', '+30 days')
        UNION ALL
        SELECT id, COALESCE(model, inventory_number) as name, inspection_date, 'bhp' as type, serial_number, inventory_number FROM bhp 
        WHERE inspection_date IS NOT NULL AND inspection_date != '' AND inspection_date <= date('now', '+30 days')
        ORDER BY inspection_date ASC
        LIMIT 50
      `;
      listQueries.toolsInServiceList = `
        SELECT id, name, service_sent_at, sku, serial_number FROM tools 
        WHERE service_quantity > 0 OR status = 'in_service'
        ORDER BY service_sent_at DESC
        LIMIT 50
      `;
    }

    const listKeys = Object.keys(listQueries);
    await Promise.all(listKeys.map(async (key) => {
      const sql = listQueries[key];
      const params = (isEmployee && employeeId && key === 'upcomingInspectionsList') ? [employeeId, employeeId] : [];
      results[key] = await runSelectQuery(sql, params);
    }));

    // Calculate combined overdue
    results.overdueInspections = (results.overdueToolsCount || 0) + (results.overdueBhpCount || 0);
    // Tools in service is standalone
    results.toolsInService = results.toolsInService || 0;

    res.json(results);

  } catch (error) {
    logger.error('Error fetching dashboard stats', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

// Sidebar counts endpoint (lightweight)
router.get('/sidebar-counts', authenticateToken, async (req, res) => {
  try {
    const rawRole = String(req.user.role || '').trim().toLowerCase();
    const canSeeAllIssued = ['administrator', 'manager', 'toolsmaster'].includes(rawRole);
    let employeeId = null;

    if (!canSeeAllIssued) {
      employeeId = await getEmployeeId(req.user.username);
    }

    const queries = {
      toolsCount: !canSeeAllIssued 
        ? `SELECT (
             (SELECT COALESCE(SUM(quantity), 0) FROM tool_issues WHERE status IN ('issued','permanent','partially_issued') AND employee_id = ?)
             +
             (SELECT COUNT(*) FROM tools_slings_items WHERE status = 'issued' AND employee_id = ?)
           ) as count`
        : `SELECT (
             (SELECT COALESCE(SUM(quantity), 0) FROM tool_issues WHERE status IN ('issued','permanent','partially_issued'))
             +
             (SELECT COUNT(*) FROM tools_slings_items WHERE status = 'issued')
           ) as count`,
      
      // Count of bhp_issues where status is 'issued' or 'permanent'
      bhpCount: !canSeeAllIssued
        ? `SELECT COUNT(*) as count FROM bhp_issues WHERE status IN ('issued', 'permanent') AND employee_id = ?`
        : `SELECT COUNT(*) as count FROM bhp_issues WHERE status IN ('issued', 'permanent')`,
        
      employeesCount: `SELECT COUNT(*) as count FROM employees`
    };

    const results = {};
    
    // Execute tools count
    results.toolsCount = await runQuery(queries.toolsCount, !canSeeAllIssued && employeeId ? [employeeId, employeeId] : []);
    
    // Execute bhp count
    results.bhpCount = await runQuery(queries.bhpCount, !canSeeAllIssued && employeeId ? [employeeId] : []);
    
    // Execute employees count
    results.employeesCount = await runQuery(queries.employeesCount);

    res.json(results);

  } catch (err) {
    logger.error('Error fetching sidebar counts', { error: err });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /dashboard/history/tools:
 *   get:
 *     summary: Get unified tool history (standard + slings)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
router.get('/history/tools', authenticateToken, async (req, res) => {
  try {
    logger.info('Fetching unified tool history...', { query: req.query });
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);
    const offset = (page - 1) * limit;
    const { employee_id, status, search } = req.query;
    
    const paramsTools = [];
    const paramsSlings = [];
    const paramsDetectors = [];
    const paramsSockets1 = [];
    const paramsSockets12 = [];
    const conditionsTools = [];
    const conditionsSlings = [];
    const conditionsDetectors = [];
    const conditionsSockets1 = [];
    const conditionsSockets12 = [];

    // Filter by Employee
    if (employee_id) {
      conditionsTools.push('ti.employee_id = ?');
      conditionsSlings.push('tsi.employee_id = ?');
      conditionsDetectors.push('tdi.employee_id = ?');
      conditionsSockets1.push('s1.employee_id = ?');
      conditionsSockets12.push('s12.employee_id = ?');
      paramsTools.push(employee_id);
      paramsSlings.push(employee_id);
      paramsDetectors.push(employee_id);
      paramsSockets1.push(employee_id);
      paramsSockets12.push(employee_id);
    }

    // Filter by Status
    if (status) {
      conditionsTools.push('ti.status = ?');
      if (status === 'permanent' || status === 'partially_issued') {
        conditionsSlings.push('1=0'); 
        conditionsDetectors.push('1=0');
        conditionsSockets1.push('1=0');
        conditionsSockets12.push('1=0');
      } else {
        conditionsSlings.push('tsi.status = ?');
        conditionsDetectors.push('tdi.status = ?');
        conditionsSockets1.push('s1.status = ?');
        conditionsSockets12.push('s12.status = ?');
        paramsSlings.push(status);
        paramsDetectors.push(status);
        paramsSockets1.push(status);
        paramsSockets12.push(status);
      }
      paramsTools.push(status);
    }

    // Filter by Search (Tool Name, SKU, Employee Name)
    if (search) {
      const searchPattern = `%${search.trim()}%`;
      conditionsTools.push('(t.name LIKE ? OR t.sku LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.brand_number LIKE ?)');
      conditionsSlings.push('(t.name LIKE ? OR item.kind LIKE ? OR item.sku LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.brand_number LIKE ?)');
      conditionsDetectors.push('(t.name LIKE ? OR item.type LIKE ? OR item.sku LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.brand_number LIKE ?)');
      conditionsSockets1.push('(t.name LIKE ? OR item.kind LIKE ? OR item.size LIKE ? OR item.sku LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.brand_number LIKE ?)');
      conditionsSockets12.push('(t.name LIKE ? OR item.kind LIKE ? OR item.size LIKE ? OR item.sku LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.brand_number LIKE ?)');
      
      paramsTools.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      paramsSlings.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      paramsDetectors.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      paramsSockets1.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      paramsSockets12.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    let whereClauseTools = conditionsTools.length ? 'WHERE ' + conditionsTools.join(' AND ') : '';
    let whereClauseSlings = conditionsSlings.length ? 'WHERE ' + conditionsSlings.join(' AND ') : '';
    let whereClauseDetectors = conditionsDetectors.length ? 'WHERE ' + conditionsDetectors.join(' AND ') : '';
    let whereClauseSockets1 = conditionsSockets1.length ? 'WHERE ' + conditionsSockets1.join(' AND ') : '';
    let whereClauseSockets12 = conditionsSockets12.length ? 'WHERE ' + conditionsSockets12.join(' AND ') : '';
    
    const hasDetectors = (await tableExists('tools_detectors_issues')) && (await tableExists('tools_detectors_items'));
    const hasSockets1 = (await tableExists('tools_impact_sockets_1_issues')) && (await tableExists('tools_impact_sockets_1_items'));
    const hasSockets12 = (await tableExists('tools_impact_sockets_12_issues')) && (await tableExists('tools_impact_sockets_12_items'));

    // Combine queries using UNION ALL
    // Common columns: id (prefixed), action, tool_name, tool_category, tool_sku, employee_name, issued_by_name, time, quantity
    
    const appendWhereCondition = (whereClause, condition) => {
      const wc = String(whereClause || '').trim();
      if (!condition) return wc;
      if (!wc) return `WHERE ${condition}`;
      return `${wc} AND ${condition}`;
    };

    let whereClauseToolsIssued = whereClauseTools;
    let paramsToolsIssued = [...paramsTools];
    let whereClauseToolsReturned = whereClauseTools;
    let paramsToolsReturned = [...paramsTools];

    if (status) {
      if (status === 'returned') {
        whereClauseToolsIssued = 'WHERE 1=0';
        paramsToolsIssued = [];
        whereClauseToolsReturned = appendWhereCondition(whereClauseToolsReturned, 'ti.returned_at IS NOT NULL');
      } else {
        whereClauseToolsReturned = 'WHERE 1=0';
        paramsToolsReturned = [];
        whereClauseToolsIssued = appendWhereCondition(whereClauseToolsIssued, 'ti.issued_at IS NOT NULL');
      }
    } else {
      whereClauseToolsIssued = appendWhereCondition(whereClauseToolsIssued, 'ti.issued_at IS NOT NULL');
      whereClauseToolsReturned = appendWhereCondition(whereClauseToolsReturned, `ti.status = 'returned' AND ti.returned_at IS NOT NULL`);
    }

    const parts = [];
    parts.push({
      sql: `
      SELECT 
        'tool-' || ti.id || '-issued' as id,
        CASE 
          WHEN ti.status = 'permanent' THEN 'wydanie_permanent'
          ELSE 'wydanie' 
        END as action,
        t.name as tool_name,
        NULL as tool_kind,
        t.category as tool_category,
        t.sku as tool_sku,
        ti.tool_id,
        e.first_name || ' ' || e.last_name as employee_name,
        u.full_name as issued_by_name,
        ti.issued_at as event_time,
        ti.quantity,
        ti.returned_at,
        ti.issued_at
      FROM tool_issues ti
      LEFT JOIN tools t ON ti.tool_id = t.id
      LEFT JOIN employees e ON ti.employee_id = e.id
      LEFT JOIN users u ON ti.issued_by_user_id = u.id
      ${whereClauseToolsIssued}
      `,
      params: paramsToolsIssued
    });
    parts.push({
      sql: `
      SELECT 
        'tool-' || ti.id || '-returned' as id,
        'zwrot' as action,
        t.name as tool_name,
        NULL as tool_kind,
        t.category as tool_category,
        t.sku as tool_sku,
        ti.tool_id,
        e.first_name || ' ' || e.last_name as employee_name,
        u.full_name as issued_by_name,
        ti.returned_at as event_time,
        ti.quantity,
        ti.returned_at,
        ti.issued_at
      FROM tool_issues ti
      LEFT JOIN tools t ON ti.tool_id = t.id
      LEFT JOIN employees e ON ti.employee_id = e.id
      LEFT JOIN users u ON ti.issued_by_user_id = u.id
      ${whereClauseToolsReturned}
      `,
      params: paramsToolsReturned
    });
    parts.push({
      sql: `
      SELECT 
        'sling-' || tsi.id as id,
        CASE 
          WHEN tsi.status = 'issued' THEN 'wydanie'
          ELSE 'zwrot'
        END as action,
        t.name as tool_name,
        item.kind as tool_kind,
        t.category as tool_category,
        item.sku as tool_sku,
        tsi.tool_id,
        e.first_name || ' ' || e.last_name as employee_name,
        u.full_name as issued_by_name,
        tsi.created_at as event_time,
        1 as quantity,
        tsi.returned_at,
        tsi.created_at as issued_at
      FROM tools_slings_issues tsi
      LEFT JOIN tools_slings_items item ON tsi.item_id = item.id
      LEFT JOIN tools t ON tsi.tool_id = t.id
      LEFT JOIN employees e ON tsi.employee_id = e.id
      LEFT JOIN users u ON tsi.issued_by_user_id = u.id
      ${whereClauseSlings}
      `,
      params: paramsSlings
    });

    if (hasDetectors) {
      parts.push({
        sql: `
      SELECT
        'detector-' || tdi.id as id,
        CASE
          WHEN tdi.status = 'issued' THEN 'wydanie'
          ELSE 'zwrot'
        END as action,
        t.name as tool_name,
        item.type as tool_kind,
        t.category as tool_category,
        item.sku as tool_sku,
        tdi.tool_id,
        e.first_name || ' ' || e.last_name as employee_name,
        u.full_name as issued_by_name,
        tdi.created_at as event_time,
        1 as quantity,
        tdi.returned_at,
        tdi.created_at as issued_at
      FROM tools_detectors_issues tdi
      LEFT JOIN tools_detectors_items item ON tdi.item_id = item.id
      LEFT JOIN tools t ON tdi.tool_id = t.id
      LEFT JOIN employees e ON tdi.employee_id = e.id
      LEFT JOIN users u ON tdi.issued_by_user_id = u.id
      ${whereClauseDetectors}
        `,
        params: paramsDetectors
      });
    }

    if (hasSockets1) {
      parts.push({
        sql: `
      SELECT
        'socket1-' || s1.id as id,
        CASE
          WHEN s1.status = 'issued' THEN 'wydanie'
          ELSE 'zwrot'
        END as action,
        t.name as tool_name,
        trim(COALESCE(item.kind, '') || CASE WHEN item.size IS NOT NULL AND item.size != '' THEN ' ' || item.size ELSE '' END) as tool_kind,
        t.category as tool_category,
        item.sku as tool_sku,
        s1.tool_id,
        e.first_name || ' ' || e.last_name as employee_name,
        u.full_name as issued_by_name,
        s1.created_at as event_time,
        s1.quantity,
        s1.returned_at,
        s1.created_at as issued_at
      FROM tools_impact_sockets_1_issues s1
      LEFT JOIN tools_impact_sockets_1_items item ON s1.item_id = item.id
      LEFT JOIN tools t ON s1.tool_id = t.id
      LEFT JOIN employees e ON s1.employee_id = e.id
      LEFT JOIN users u ON s1.issued_by_user_id = u.id
      ${whereClauseSockets1}
        `,
        params: paramsSockets1
      });
    }

    if (hasSockets12) {
      parts.push({
        sql: `
      SELECT
        'socket12-' || s12.id as id,
        CASE
          WHEN s12.status = 'issued' THEN 'wydanie'
          ELSE 'zwrot'
        END as action,
        t.name as tool_name,
        trim(COALESCE(item.kind, '') || CASE WHEN item.size IS NOT NULL AND item.size != '' THEN ' ' || item.size ELSE '' END) as tool_kind,
        t.category as tool_category,
        item.sku as tool_sku,
        s12.tool_id,
        e.first_name || ' ' || e.last_name as employee_name,
        u.full_name as issued_by_name,
        s12.created_at as event_time,
        s12.quantity,
        s12.returned_at,
        s12.created_at as issued_at
      FROM tools_impact_sockets_12_issues s12
      LEFT JOIN tools_impact_sockets_12_items item ON s12.item_id = item.id
      LEFT JOIN tools t ON s12.tool_id = t.id
      LEFT JOIN employees e ON s12.employee_id = e.id
      LEFT JOIN users u ON s12.issued_by_user_id = u.id
      ${whereClauseSockets12}
        `,
        params: paramsSockets12
      });
    }

    const unifiedQuery = parts.map(p => p.sql.trim()).join('\nUNION ALL\n');
    const params = parts.flatMap(p => p.params);

    const countSql = `SELECT COUNT(*) as count FROM (${unifiedQuery})`;
    const dataSql = `SELECT * FROM (${unifiedQuery}) ORDER BY event_time DESC LIMIT ? OFFSET ?`;

    logger.info('Running unified history query', { countSql, dataSql, params });

    const totalCount = await runQuery(countSql, params);
    logger.info(`Total unified history records: ${totalCount}`);
    
    db.all(dataSql, [...params, limit, offset], (err, rows) => {
      if (err) {
        logger.error('Error executing unified history data query', { error: err.message });
        throw err;
      }
      
      logger.info(`Fetched ${rows ? rows.length : 0} rows for page ${page}`, { 
        rowsSample: rows ? rows.slice(0, 2) : [] 
      });
      
      res.json({
        data: rows,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    });

  } catch (err) {
    logger.error('Error fetching unified tool history', { error: err.message });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
