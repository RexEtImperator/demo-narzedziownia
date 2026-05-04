const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sendDomainError } = require('../helpers/errorHelper');

/**
 * @swagger
 * tags:
 *   name: Slings
 *   description: Management of slings and chains items
 */

// Helper to run query as promise
const run = (query, params = []) => new Promise((resolve, reject) => {
  db.run(query, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (query, params = []) => new Promise((resolve, reject) => {
  db.get(query, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (query, params = []) => new Promise((resolve, reject) => {
  db.all(query, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const updateMainToolStatus = async (toolId) => {
  if (!toolId) return;
  const row = await get(
    `SELECT 
      (SELECT COUNT(*) FROM tools_slings_items WHERE tool_id = ?) as total,
      (SELECT COUNT(*) FROM tools_slings_items WHERE tool_id = ? AND status = 'issued') as issued`,
    [toolId, toolId]
  );
  const total = Number(row?.total || 0) || 0;
  const issued = Number(row?.issued || 0) || 0;
  let nextStatus = 'available';
  if (issued > 0 && issued < total) nextStatus = 'partially_issued';
  if (total > 0 && issued >= total) nextStatus = 'issued';
  await run('UPDATE tools SET status = ? WHERE id = ?', [nextStatus, toolId]);
};

/**
 * @swagger
 * /slings/by-tool/{toolId}:
 *   get:
 *     summary: Get all items for a specific tool
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.get('/by-tool/:toolId', authenticateToken, async (req, res) => {
  try {
    const items = await all(
      `SELECT tsi.*, e.first_name || ' ' || e.last_name as employee_name, e.brand_number as employee_brand_number
       FROM tools_slings_items tsi 
       LEFT JOIN employees e ON tsi.employee_id = e.id 
       WHERE tsi.tool_id = ? 
       ORDER BY tsi.production_year DESC, tsi.production_month DESC, tsi.sku ASC`,
      [req.params.toolId]
    );
    res.json(items);
  } catch (err) {
    logger.error('Error fetching sling items', { error: err.message });
    sendDomainError(res, 500, 'SLINGS_FETCH_ERROR', 'errors.slingsFetchFailed');
  }
});

/**
 * @swagger
 * /slings/issued-by-employee/{employeeId}:
 *   get:
 *     summary: Get currently issued sling items for an employee
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.get('/issued-by-employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const items = await all(
      `SELECT 
        tsi.id as issue_id,
        tsi.created_at as issued_at,
        'issued' as status,
        item.id as item_id,
        item.sku,
        item.serial_number,
        item.kind,
        item.production_year,
        item.production_month,
        t.name as tool_name,
        t.category as category,
        t.model as tool_model,
        t.manufacturer as tool_manufacturer,
        u.first_name || ' ' || u.last_name as issued_by_user_name
      FROM tools_slings_issues tsi
      JOIN tools_slings_items item ON tsi.item_id = item.id
      JOIN tools t ON item.tool_id = t.id
      LEFT JOIN users u ON tsi.issued_by_user_id = u.id
      WHERE tsi.employee_id = ? 
        AND tsi.returned_at IS NULL
      ORDER BY tsi.created_at DESC`,
      [employeeId]
    );
    res.json(items);
  } catch (err) {
    logger.error('Error fetching issued sling items', { error: err.message });
    sendDomainError(res, 500, 'SLINGS_FETCH_ISSUED_ERROR', 'errors.slingsFetchIssuedFailed');
  }
});

/**
 * /slings/issued:
 *   get:
 *     summary: Get currently issued sling items (global or filtered by employee_id)
 */
router.get('/issued', authenticateToken, async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit || 200, 10);
    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 200));
    const employeeId = req.query.employee_id ? String(req.query.employee_id) : null;

    const params = [];
    let where = `WHERE item.status = 'issued'`;
    if (employeeId) {
      where += ` AND item.employee_id = ?`;
      params.push(employeeId);
    }

    const rows = await all(
      `SELECT
        item.id as item_id,
        item.tool_id,
        item.sku,
        item.serial_number,
        item.kind,
        item.production_year,
        item.production_month,
        item.employee_id,
        item.issued_at,
        t.name as tool_name,
        t.category as tool_category,
        t.inspection_date as tool_inspection_date,
        e.first_name as employee_first_name,
        e.last_name as employee_last_name,
        e.brand_number as employee_brand_number
      FROM tools_slings_items item
      LEFT JOIN tools t ON item.tool_id = t.id
      LEFT JOIN employees e ON item.employee_id = e.id
      ${where}
      ORDER BY item.issued_at DESC
      LIMIT ?`,
      [...params, limit]
    );

    res.json(rows);
  } catch (err) {
    logger.error('Error fetching issued sling items (global)', { error: err.message });
    sendDomainError(res, 500, 'SLINGS_FETCH_ISSUED_ERROR', 'errors.slingsFetchIssuedFailed');
  }
});

/**
 * @swagger
 * /slings/by-tool/{toolId}:
 *   post:
 *     summary: Batch add items for a tool
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.post('/by-tool/:toolId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { toolId } = req.params;
  const items = req.body; // Array of items

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Items array is required' });
  }

  // Validate tool exists and get category
  const tool = await get('SELECT * FROM tools WHERE id = ?', [toolId]);
  if (!tool) {
    return res.status(404).json({ message: 'Tool not found' });
  }

  try {
    await run('BEGIN TRANSACTION');

    for (const item of items) {
      // Validate SKU uniqueness check is handled by DB constraint, but we can check here too if needed
      // item: { kind, serial_number, sku, production_year, production_month, notes }
      
      await run(
        `INSERT INTO tools_slings_items (
          tool_id, category, kind, serial_number, sku, 
          production_year, production_month, status, location, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
        [
          toolId,
          tool.category,
          item.kind,
          item.serial_number || null,
          item.sku,
          item.production_year,
          item.production_month,
          item.location || null,
          item.notes || null
        ]
      );
    }

    // Update main tool quantity (optional, as cache)
    const count = await get('SELECT COUNT(*) as total FROM tools_slings_items WHERE tool_id = ? AND status = "available"', [toolId]);
    // Note: updating tools quantity might be skipped if we want tools.quantity to reflect ALL items, not just available. 
    // Usually quantity in tools table means "total stock" or "available stock". 
    // Belts.md says: "Pole tools.quantity NIE jest źródłem prawdy... Wartość quantity w tabeli tools powinna być aktualizowana... tylko do celów wyświetlania".
    // Let's set it to count of all items (or available? usually available for quick check). 
    // Let's assume 'quantity' = count of all physical items (stock). 'available_quantity' is calculated dynamically.
    const totalCount = await get('SELECT COUNT(*) as total FROM tools_slings_items WHERE tool_id = ?', [toolId]);
    await run('UPDATE tools SET quantity = ? WHERE id = ?', [totalCount.total, toolId]);

    await run('COMMIT');
    res.status(201).json({ message: 'Items added successfully' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error adding sling items', { error: err.message });
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: 'SKU must be unique', error: err.message });
    }
    sendDomainError(res, 500, 'SLINGS_ADD_ERROR', 'errors.slingsAddFailed', { error: err.message });
  }
});

/**
 * @swagger
 * /slings/items/{itemId}:
 *   put:
 *     summary: Update an item
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.put('/items/:itemId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { itemId } = req.params;
  const { kind, serial_number, sku, production_year, production_month, notes, location } = req.body;

  try {
    // We don't allow changing tool_id or category easily here to simplify logic
    await run(
      `UPDATE tools_slings_items SET 
        kind = COALESCE(?, kind),
        serial_number = ?,
        sku = COALESCE(?, sku),
        production_year = COALESCE(?, production_year),
        production_month = COALESCE(?, production_month),
        notes = ?,
        location = ?
       WHERE id = ?`,
      [kind, serial_number, sku, production_year, production_month, notes, location, itemId]
    );
    res.json({ message: 'Item updated' });
  } catch (err) {
    logger.error('Error updating sling item', { error: err.message });
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: 'SKU must be unique' });
    }
    sendDomainError(res, 500, 'SLINGS_UPDATE_ERROR', 'errors.slingsUpdateFailed');
  }
});

/**
 * @swagger
 * /slings/items/{itemId}:
 *   delete:
 *     summary: Delete an item
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/items/:itemId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { itemId } = req.params;

  try {
    await run('BEGIN TRANSACTION');
    
    // Get tool_id before delete to update count
    const item = await get('SELECT tool_id FROM tools_slings_items WHERE id = ?', [itemId]);
    if (!item) {
      await run('ROLLBACK');
      return res.status(404).json({ message: 'Item not found' });
    }

    await run('DELETE FROM tools_slings_items WHERE id = ?', [itemId]);
    // Also delete history? Maybe keep history but nullify item_id? 
    // Usually we want to keep history. But if item is deleted, maybe it was a mistake.
    // Let's leave issues history for now, but FK might fail if we had ON DELETE CASCADE.
    // SQLite by default doesn't enforce FK unless PRAGMA enabled. We enabled it.
    // If FK constraint exists, we might need to handle issues.
    // But my migration didn't specify FOREIGN KEY constraint for issues -> item_id explicitly (just integer).
    // So it should be fine.

    // Update tool quantity
    const totalCount = await get('SELECT COUNT(*) as total FROM tools_slings_items WHERE tool_id = ?', [item.tool_id]);
    await run('UPDATE tools SET quantity = ? WHERE id = ?', [totalCount.total, item.tool_id]);

    await run('COMMIT');
    res.json({ message: 'Item deleted' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error deleting sling item', { error: err.message });
    sendDomainError(res, 500, 'SLINGS_DELETE_ERROR', 'errors.slingsDeleteFailed');
  }
});

/**
 * @swagger
 * /slings/issue:
 *   post:
 *     summary: Batch issue items
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.post('/issue', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { item_ids, employee_id } = req.body;

  if (!Array.isArray(item_ids) || item_ids.length === 0 || !employee_id) {
    return res.status(400).json({ message: 'item_ids array and employee_id are required' });
  }

  try {
    await run('BEGIN TRANSACTION');

    const employee = await get('SELECT * FROM employees WHERE id = ?', [employee_id]);
    if (!employee) throw new Error('Employee not found');

    const toolIds = new Set();
    for (const id of item_ids) {
      const item = await get('SELECT * FROM tools_slings_items WHERE id = ?', [id]);
      if (!item) throw new Error(`Item ${id} not found`);
      if (item.status !== 'available') throw new Error(`Item ${item.sku} is not available (status: ${item.status})`);
      if (item.tool_id) toolIds.add(item.tool_id);

      // Update item
      await run(
        'UPDATE tools_slings_items SET status = ?, employee_id = ?, issued_at = datetime("now") WHERE id = ?',
        ['issued', employee_id, id]
      );

      // Create issue record
      await run(
        'INSERT INTO tools_slings_issues (item_id, tool_id, employee_id, issued_by_user_id, status, created_at, returned_at) VALUES (?, ?, ?, ?, ?, datetime("now"), NULL)',
        [id, item.tool_id, employee_id, req.user.id, 'issued']
      );
    }

    for (const toolId of toolIds) {
      await updateMainToolStatus(toolId);
    }

    await run('COMMIT');
    res.json({ message: 'Items issued successfully' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error issuing items', { error: err.message });
    res.status(400).json({ message: err.message || 'Error issuing items' });
  }
});

/**
 * @swagger
 * /slings/return:
 *   post:
 *     summary: Batch return items
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.post('/return', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { item_ids } = req.body;

  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ message: 'item_ids array is required' });
  }

  try {
    await run('BEGIN TRANSACTION');

    const toolIds = new Set();
    for (const id of item_ids) {
      const item = await get('SELECT * FROM tools_slings_items WHERE id = ?', [id]);
      if (!item) throw new Error(`Item ${id} not found`);
      if (item.status !== 'issued') throw new Error(`Item ${item.sku} is not issued (status: ${item.status})`);
      if (item.tool_id) toolIds.add(item.tool_id);

      // Update item
      await run(
        'UPDATE tools_slings_items SET status = ?, employee_id = NULL, returned_at = datetime("now") WHERE id = ?',
        ['available', id]
      );

      // Create return record (history)
      // We need employee_id from previous state or we can store it? 
      // The item.employee_id currently holds who has it.
      await run(
        'INSERT INTO tools_slings_issues (item_id, tool_id, employee_id, issued_by_user_id, status, returned_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
        [id, item.tool_id, item.employee_id, req.user.id, 'returned']
      );
    }

    for (const toolId of toolIds) {
      await updateMainToolStatus(toolId);
    }

    await run('COMMIT');
    res.json({ message: 'Items returned successfully' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error returning items', { error: err.message });
    res.status(400).json({ message: err.message || 'Error returning items' });
  }
});

/**
 * @swagger
 * /slings/history:
 *   get:
 *     summary: Get global slings history
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.get('/history', authenticateToken, async (req, res) => {
  const { limit = 10, employee_id } = req.query;
  const params = [];
  let whereClause = '';

  if (employee_id) {
    whereClause = 'WHERE tsi.employee_id = ?';
    params.push(employee_id);
  }

  try {
    const history = await all(
      `SELECT 
        tsi.*,
        t.name as tool_name,
        t.category as tool_category,
        item.sku as item_sku,
        e.first_name as employee_first_name,
        e.last_name as employee_last_name,
        u.full_name as issued_by_user_name
      FROM tools_slings_issues tsi
      LEFT JOIN tools_slings_items item ON tsi.item_id = item.id
      LEFT JOIN tools t ON tsi.tool_id = t.id
      LEFT JOIN employees e ON tsi.employee_id = e.id
      LEFT JOIN users u ON tsi.issued_by_user_id = u.id
      ${whereClause}
      ORDER BY tsi.created_at DESC
      LIMIT ?`,
      [...params, limit]
    );
    res.json(history);
  } catch (err) {
    logger.error('Error fetching slings history', { error: err.message });
    sendDomainError(res, 500, 'SLINGS_HISTORY_ERROR', 'errors.slingsHistoryFailed');
  }
});

/**
 * @swagger
 * /slings/next-sku:
 *   get:
 *     summary: Get next SKU for category
 *     tags: [Slings]
 *     security:
 *       - bearerAuth: []
 */
router.get('/next-sku', authenticateToken, async (req, res) => {
  const { category } = req.query;
  // Prefixes: Zawiesia pasowe -> OSSA-ZP-, Zawiesia łańcuchowe -> OSSA-ZL-
  
  const cat = (category || '').trim().toLowerCase();
  let prefix = 'OSSA-UNKNOWN-';
  
  if (cat.includes('pasowe')) prefix = 'OSSA-ZP-';
  else if (cat.includes('łańcuchowe')) prefix = 'OSSA-ZL-';
  else if (category) {
     // Fallback or generic logic if needed, or maybe just return 400
  }

  try {
    // Find max SKU with this prefix
    const row = await get(
      `SELECT sku FROM tools_slings_items WHERE sku LIKE ? ORDER BY length(sku) DESC, sku DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNum = 1;
    if (row && row.sku) {
      const parts = row.sku.split('-');
      const numPart = parts[parts.length - 1];
      if (!isNaN(numPart)) {
        nextNum = parseInt(numPart, 10) + 1;
      }
    }

    const nextSku = `${prefix}${String(nextNum).padStart(4, '0')}`;
    res.json({ nextSku });
  } catch (err) {
    logger.error('Error generating next SKU', { error: err.message });
    res.status(500).json({ message: 'Error generating SKU' });
  }
});

module.exports = router;
