const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sendDomainError } = require('../helpers/errorHelper');

const run = (query, params = []) => new Promise((resolve, reject) => {
  db.run(query, params, function (err) {
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
      (SELECT COUNT(*) FROM tools_detectors_items WHERE tool_id = ?) as total,
      (SELECT COUNT(*) FROM tools_detectors_items WHERE tool_id = ? AND status = 'issued') as issued`,
    [toolId, toolId]
  );
  const total = Number(row?.total || 0) || 0;
  const issued = Number(row?.issued || 0) || 0;
  let nextStatus = 'available';
  if (issued > 0 && issued < total) nextStatus = 'partially_issued';
  if (total > 0 && issued >= total) nextStatus = 'issued';
  await run('UPDATE tools SET status = ? WHERE id = ?', [nextStatus, toolId]);
};

router.get('/by-tool/:toolId', authenticateToken, async (req, res) => {
  try {
    const items = await all(
      `SELECT tdi.*, e.first_name || ' ' || e.last_name as employee_name, e.brand_number as employee_brand_number
       FROM tools_detectors_items tdi
       LEFT JOIN employees e ON tdi.employee_id = e.id
       WHERE tdi.tool_id = ?
       ORDER BY tdi.id ASC`,
      [req.params.toolId]
    );
    res.json(items);
  } catch (err) {
    logger.error('Error fetching detectors items', { error: err.message });
    sendDomainError(res, 500, 'DETECTORS_FETCH_ERROR', 'errors.detectorsFetchFailed');
  }
});

router.get('/next-sku', authenticateToken, async (req, res) => {
  const prefix = 'OSSA-TTM-';
  try {
    const row = await get(
      `SELECT sku FROM tools_detectors_items WHERE sku LIKE ? ORDER BY length(sku) DESC, sku DESC LIMIT 1`,
      [`${prefix}%`]
    );
    let nextNum = 1;
    if (row && row.sku) {
      const parts = String(row.sku).split('-');
      const numPart = parts[parts.length - 1];
      if (!isNaN(numPart)) nextNum = parseInt(numPart, 10) + 1;
    }
    const nextSku = `${prefix}${String(nextNum).padStart(4, '0')}`;
    res.json({ nextSku });
  } catch (err) {
    logger.error('Error generating next detectors sku', { error: err.message });
    res.status(500).json({ message: 'Error generating SKU' });
  }
});

router.post('/by-tool/:toolId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { toolId } = req.params;
  const items = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Items array is required' });
  }

  const tool = await get('SELECT * FROM tools WHERE id = ?', [toolId]);
  if (!tool) {
    return res.status(404).json({ message: 'Tool not found' });
  }

  try {
    await run('BEGIN TRANSACTION');

    for (const item of items) {
      const sku = item.sku ? String(item.sku).trim() : null;
      const type = String(item.type || '').trim();
      if (!sku) throw new Error('sku is required');
      if (!type) throw new Error('type is required');
      const inventoryNumber = item.inventory_number ? String(item.inventory_number).trim() : null;
      const serialNumber = item.serial_number ? String(item.serial_number).trim() : null;
      const calibrationDate = item.calibration_date ? String(item.calibration_date).slice(0, 10) : null;
      const nextCalibrationDate = item.next_calibration_date ? String(item.next_calibration_date).slice(0, 10) : null;

      await run(
        `INSERT INTO tools_detectors_items (
          tool_id, sku, type, inventory_number, serial_number,
          calibration_date, next_calibration_date,
          status, employee_id, issued_at, returned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', NULL, NULL, NULL)`,
        [toolId, sku, type, inventoryNumber, serialNumber, calibrationDate, nextCalibrationDate]
      );
    }

    const totalCount = await get('SELECT COUNT(*) as total FROM tools_detectors_items WHERE tool_id = ?', [toolId]);
    await run('UPDATE tools SET quantity = ? WHERE id = ?', [totalCount.total, toolId]);

    await run('COMMIT');
    res.status(201).json({ message: 'Items added successfully' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error adding detectors items', { error: err.message });
    if (String(err.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: 'Inventory number must be unique', error: err.message });
    }
    res.status(400).json({ message: err.message || 'Error adding items' });
  }
});

router.put('/items/:itemId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { itemId } = req.params;
  const { sku, type, inventory_number, serial_number, calibration_date, next_calibration_date } = req.body || {};

  try {
    await run(
      `UPDATE tools_detectors_items SET
        sku = COALESCE(?, sku),
        type = COALESCE(?, type),
        inventory_number = ?,
        serial_number = ?,
        calibration_date = ?,
        next_calibration_date = ?
       WHERE id = ?`,
      [
        sku ? String(sku).trim() : null,
        type ? String(type).trim() : null,
        inventory_number !== undefined ? (inventory_number ? String(inventory_number).trim() : null) : null,
        serial_number !== undefined ? (serial_number ? String(serial_number).trim() : null) : null,
        calibration_date !== undefined ? (calibration_date ? String(calibration_date).slice(0, 10) : null) : null,
        next_calibration_date !== undefined ? (next_calibration_date ? String(next_calibration_date).slice(0, 10) : null) : null,
        itemId
      ]
    );
    res.json({ message: 'Item updated' });
  } catch (err) {
    logger.error('Error updating detectors item', { error: err.message });
    if (String(err.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: 'Inventory number must be unique' });
    }
    sendDomainError(res, 500, 'DETECTORS_UPDATE_ERROR', 'errors.detectorsUpdateFailed');
  }
});

router.delete('/items/:itemId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { itemId } = req.params;

  try {
    await run('BEGIN TRANSACTION');
    const item = await get('SELECT tool_id FROM tools_detectors_items WHERE id = ?', [itemId]);
    if (!item) {
      await run('ROLLBACK');
      return res.status(404).json({ message: 'Item not found' });
    }

    await run('DELETE FROM tools_detectors_items WHERE id = ?', [itemId]);

    const totalCount = await get('SELECT COUNT(*) as total FROM tools_detectors_items WHERE tool_id = ?', [item.tool_id]);
    await run('UPDATE tools SET quantity = ? WHERE id = ?', [totalCount.total, item.tool_id]);

    await run('COMMIT');
    res.json({ message: 'Item deleted' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error deleting detectors item', { error: err.message });
    sendDomainError(res, 500, 'DETECTORS_DELETE_ERROR', 'errors.detectorsDeleteFailed');
  }
});

router.post('/issue', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { item_ids, employee_id } = req.body || {};

  if (!Array.isArray(item_ids) || item_ids.length === 0 || !employee_id) {
    return res.status(400).json({ message: 'item_ids array and employee_id are required' });
  }

  try {
    await run('BEGIN TRANSACTION');

    const employee = await get('SELECT * FROM employees WHERE id = ?', [employee_id]);
    if (!employee) throw new Error('Employee not found');

    const toolIds = new Set();
    for (const id of item_ids) {
      const item = await get('SELECT * FROM tools_detectors_items WHERE id = ?', [id]);
      if (!item) throw new Error(`Item ${id} not found`);
      if (item.status !== 'available') throw new Error(`Item ${item.id} is not available (status: ${item.status})`);
      if (item.tool_id) toolIds.add(item.tool_id);

      await run(
        'UPDATE tools_detectors_items SET status = ?, employee_id = ?, issued_at = datetime("now") WHERE id = ?',
        ['issued', employee_id, id]
      );

      await run(
        'INSERT INTO tools_detectors_issues (item_id, tool_id, employee_id, issued_by_user_id, status, created_at, returned_at) VALUES (?, ?, ?, ?, ?, datetime("now"), NULL)',
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
    logger.error('Error issuing detectors items', { error: err.message });
    res.status(400).json({ message: err.message || 'Error issuing items' });
  }
});

router.post('/return', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const { item_ids } = req.body || {};

  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ message: 'item_ids array is required' });
  }

  try {
    await run('BEGIN TRANSACTION');

    const toolIds = new Set();
    for (const id of item_ids) {
      const item = await get('SELECT * FROM tools_detectors_items WHERE id = ?', [id]);
      if (!item) throw new Error(`Item ${id} not found`);
      if (item.status !== 'issued') throw new Error(`Item ${item.id} is not issued (status: ${item.status})`);
      if (item.tool_id) toolIds.add(item.tool_id);

      const prevEmployeeId = item.employee_id;

      await run(
        'UPDATE tools_detectors_items SET status = ?, employee_id = NULL, returned_at = datetime("now") WHERE id = ?',
        ['available', id]
      );

      await run(
        'INSERT INTO tools_detectors_issues (item_id, tool_id, employee_id, issued_by_user_id, status, returned_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
        [id, item.tool_id, prevEmployeeId, req.user.id, 'returned']
      );
    }

    for (const toolId of toolIds) {
      await updateMainToolStatus(toolId);
    }

    await run('COMMIT');
    res.json({ message: 'Items returned successfully' });
  } catch (err) {
    await run('ROLLBACK');
    logger.error('Error returning detectors items', { error: err.message });
    res.status(400).json({ message: err.message || 'Error returning items' });
  }
});

module.exports = router;
