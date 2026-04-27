const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

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

const resolveImpactSocketsTables = (category) => {
  const cat = String(category || '').toLowerCase().trim();
  if (cat.includes('1/2')) {
    return { itemsTable: 'tools_impact_sockets_12_items', issuesTable: 'tools_impact_sockets_12_issues', variant: '12' };
  }
  return { itemsTable: 'tools_impact_sockets_1_items', issuesTable: 'tools_impact_sockets_1_issues', variant: '1' };
};

const resolveImpactSocketsSkuPrefix = (category) => {
  const cat = String(category || '').toLowerCase().trim();
  if (cat.includes('1/2')) return 'OSSA-N12-';
  return 'OSSA-N1-';
};

const ensureToolExists = async (toolId) => {
  const tool = await get('SELECT id, category, quantity FROM tools WHERE id = ?', [toolId]);
  if (!tool) {
    const err = new Error('Tool not found');
    err.status = 404;
    throw err;
  }
  return tool;
};

const updateToolStatusFromImpactSockets = async (toolId, itemsTable, issuesTable) => {
  const items = await all(`SELECT id, quantity FROM ${itemsTable} WHERE tool_id = ?`, [toolId]);
  const issues = await all(
    `SELECT item_id, quantity, status FROM ${issuesTable} WHERE tool_id = ? AND status IN ('issued','returned')`,
    [toolId]
  );

  const total = (items || []).reduce((acc, r) => acc + Math.max(0, Number(r.quantity || 0) || 0), 0);

  const byItem = {};
  (issues || []).forEach((row) => {
    const key = String(row.item_id);
    const qty = Math.max(0, Number(row.quantity || 0) || 0);
    if (!byItem[key]) byItem[key] = 0;
    if (row.status === 'issued') byItem[key] += qty;
    if (row.status === 'returned') byItem[key] -= qty;
  });

  const issued = Object.values(byItem).reduce((acc, v) => acc + Math.max(0, Number(v || 0) || 0), 0);

  let nextStatus = 'available';
  if (issued > 0 && issued < total) nextStatus = 'partially_issued';
  if (total > 0 && issued >= total) nextStatus = 'issued';

  await run('UPDATE tools SET status = ? WHERE id = ?', [nextStatus, toolId]);
};

router.get('/issued', authenticateToken, async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit || 200, 10);
    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 200));
    const employeeId = req.query.employee_id ? String(req.query.employee_id) : null;

    const fetchIssues = async (issuesTable, itemsTable, variant) => {
      const params = [];
      let where = `WHERE i.status IN ('issued','returned')`;
      if (employeeId) {
        where += ' AND i.employee_id = ?';
        params.push(employeeId);
      }
      const rows = await all(
        `SELECT
          i.item_id,
          i.tool_id,
          i.employee_id,
          i.quantity,
          i.status,
          i.created_at,
          i.returned_at,
          it.sku,
          it.kind,
          it.size,
          e.first_name as employee_first_name,
          e.last_name as employee_last_name,
          e.brand_number as employee_brand_number,
          t.name as tool_name,
          t.category as tool_category,
          t.inspection_date as tool_inspection_date
        FROM ${issuesTable} i
        JOIN ${itemsTable} it ON it.id = i.item_id
        JOIN employees e ON e.id = i.employee_id
        JOIN tools t ON t.id = i.tool_id
        ${where}
        ORDER BY i.created_at DESC
        LIMIT 10000`,
        params
      );
      return (rows || []).map(r => ({ ...r, variant }));
    };

    const [issues1, issues12] = await Promise.all([
      fetchIssues('tools_impact_sockets_1_issues', 'tools_impact_sockets_1_items', '1'),
      fetchIssues('tools_impact_sockets_12_issues', 'tools_impact_sockets_12_items', '12')
    ]);

    const byKey = new Map();
    const take = (rows) => {
      (rows || []).forEach((row) => {
        const itemId = row?.item_id;
        const empId = row?.employee_id;
        if (!itemId || !empId) return;
        const key = `${row.variant}:${itemId}:${empId}`;
        const prev = byKey.get(key) || {
          variant: row.variant,
          item_id: itemId,
          tool_id: row.tool_id,
          employee_id: empId,
          quantity: 0,
          issued_at: null,
          sku: row.sku,
          kind: row.kind,
          size: row.size,
          tool_name: row.tool_name,
          tool_category: row.tool_category,
          tool_inspection_date: row.tool_inspection_date,
          employee_first_name: row.employee_first_name,
          employee_last_name: row.employee_last_name,
          employee_brand_number: row.employee_brand_number
        };
        const qty = Number(row.quantity || 0) || 0;
        if (row.status === 'issued') {
          prev.quantity += qty;
          if (!prev.issued_at) prev.issued_at = row.created_at;
        } else if (row.status === 'returned') {
          prev.quantity -= qty;
        }
        byKey.set(key, prev);
      });
    };

    take(issues1);
    take(issues12);

    const out = Array.from(byKey.values())
      .map(v => ({ ...v, quantity: Math.max(0, Number(v.quantity || 0)) }))
      .filter(v => v.quantity > 0)
      .sort((a, b) => new Date(b.issued_at || 0) - new Date(a.issued_at || 0))
      .slice(0, limit);

    res.json(out);
  } catch (err) {
    logger.error('Error fetching issued impact sockets', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.get('/next-sku', authenticateToken, async (req, res) => {
  try {
    let category = req.query.category || '';
    try { category = decodeURIComponent(category); } catch (_) { void 0; }
    category = String(category || '').trim();
    if (!category) {
      return res.status(400).json({ message: 'Missing category' });
    }

    const { itemsTable } = resolveImpactSocketsTables(category);
    const prefix = resolveImpactSocketsSkuPrefix(category);

    const rows = await all(
      `SELECT sku FROM ${itemsTable} WHERE sku LIKE ? ORDER BY sku DESC LIMIT 50`,
      [`${prefix}%`]
    );

    let nextNum = 1;
    if (rows && rows.length > 0) {
      let maxNum = 0;
      for (const item of rows) {
        const parts = String(item.sku || '').split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum) && lastNum > maxNum) maxNum = lastNum;
      }
      nextNum = maxNum + 1;
    }

    const nextSku = `${prefix}${String(nextNum).padStart(4, '0')}`;
    res.json({ nextSku });
  } catch (err) {
    logger.error('Error generating next impact sockets sku', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.get('/by-tool/:toolId', authenticateToken, async (req, res) => {
  try {
    const toolId = req.params.toolId;
    const tool = await ensureToolExists(toolId);
    const { itemsTable, issuesTable } = resolveImpactSocketsTables(tool.category);

    const items = await all(
      `SELECT * FROM ${itemsTable} WHERE tool_id = ? ORDER BY sku ASC, kind ASC, size ASC`,
      [toolId]
    );

    const itemIds = (items || []).map(i => i.id);
    const issuedMap = {};
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      const issues = await all(
        `SELECT item_id, quantity, status FROM ${issuesTable} WHERE tool_id = ? AND item_id IN (${placeholders})`,
        [toolId, ...itemIds]
      );
      (issues || []).forEach(row => {
        const key = row.item_id;
        const qty = Number(row.quantity || 0);
        if (!issuedMap[key]) issuedMap[key] = 0;
        if (row.status === 'issued') issuedMap[key] += qty;
        if (row.status === 'returned') issuedMap[key] -= qty;
      });
    }

    const out = (items || []).map(i => {
      const issuedQty = Math.max(0, Number(issuedMap[i.id] || 0));
      const totalQty = Math.max(0, Number(i.quantity || 0));
      const availableQty = Math.max(0, totalQty - issuedQty);
      return { ...i, issued_quantity: issuedQty, available_quantity: availableQty };
    });

    res.json(out);
  } catch (err) {
    logger.error('Error fetching impact sockets items', { error: err.message });
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.post('/by-tool/:toolId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  const toolId = req.params.toolId;
  const rows = req.body;

  try {
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const tool = await ensureToolExists(toolId);
    const { itemsTable } = resolveImpactSocketsTables(tool.category);

    const skuSet = new Set();
    const toInsert = rows.map(r => ({
      tool_id: toolId,
      sku: String(r.sku || '').trim(),
      kind: String(r.kind || '').trim(),
      size: String(r.size || '').trim(),
      quantity: Math.max(1, parseInt(r.quantity || 1, 10))
    }));

    for (const r of toInsert) {
      if (!r.sku || !r.kind || !r.size) {
        return res.status(400).json({ message: 'Missing sku, kind or size' });
      }
      if (skuSet.has(r.sku)) {
        return res.status(400).json({ message: `Duplicate SKU in request: ${r.sku}` });
      }
      skuSet.add(r.sku);
    }

    const skus = toInsert.map(r => r.sku);
    const placeholders = skus.map(() => '?').join(',');
    const existing = await all(
      `SELECT sku FROM ${itemsTable} WHERE sku IN (${placeholders})`,
      skus
    );
    if (existing && existing.length > 0) {
      const existingSkus = existing.map(i => i.sku).join(', ');
      return res.status(400).json({ message: `Następujące kody SKU są już zajęte: ${existingSkus}` });
    }

    await run('BEGIN TRANSACTION');
    try {
      for (const r of toInsert) {
        await run(
          `INSERT INTO ${itemsTable} (tool_id, sku, kind, size, quantity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [toolId, r.sku, r.kind, r.size, r.quantity]
        );
      }

      const sumRow = await get(`SELECT SUM(quantity) as sum FROM ${itemsTable} WHERE tool_id = ?`, [toolId]);
      const sum = Math.max(0, Number(sumRow?.sum || 0) || 0);
      await run('UPDATE tools SET quantity = ? WHERE id = ?', [sum, toolId]);

      await run('COMMIT');
    } catch (e) {
      await run('ROLLBACK');
      throw e;
    }

    res.json({ message: 'Items added successfully' });
  } catch (err) {
    try { await run('ROLLBACK'); } catch (_) { void 0; }
    logger.error('Error adding impact sockets items', { error: err.message });
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.put('/items/:itemId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const toolId = req.body?.tool_id;
    if (!toolId) return res.status(400).json({ message: 'tool_id is required' });

    const tool = await ensureToolExists(toolId);
    const { itemsTable } = resolveImpactSocketsTables(tool.category);

    const updates = [];
    const params = [];

    if (req.body.sku !== undefined) {
      const v = String(req.body.sku || '').trim();
      if (!v) return res.status(400).json({ message: 'Missing sku' });
      updates.push('sku = ?');
      params.push(v);
    }
    if (req.body.kind !== undefined) {
      const v = String(req.body.kind || '').trim();
      if (!v) return res.status(400).json({ message: 'Missing kind' });
      updates.push('kind = ?');
      params.push(v);
    }
    if (req.body.size !== undefined) {
      const v = String(req.body.size || '').trim();
      if (!v) return res.status(400).json({ message: 'Missing size' });
      updates.push('size = ?');
      params.push(v);
    }
    if (req.body.quantity !== undefined) {
      const v = Math.max(1, parseInt(req.body.quantity || 1, 10));
      updates.push('quantity = ?');
      params.push(v);
    }

    updates.push("updated_at = datetime('now')");

    await run(
      `UPDATE ${itemsTable} SET ${updates.join(', ')} WHERE id = ? AND tool_id = ?`,
      [...params, itemId, toolId]
    );

    const sumRow = await get(`SELECT SUM(quantity) as sum FROM ${itemsTable} WHERE tool_id = ?`, [toolId]);
    const sum = Math.max(0, Number(sumRow?.sum || 0) || 0);
    await run('UPDATE tools SET quantity = ? WHERE id = ?', [sum, toolId]);

    res.json({ message: 'Item updated' });
  } catch (err) {
    logger.error('Error updating impact sockets item', { error: err.message });
    const msg = String(err.message || '');
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.delete('/items/:itemId', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const toolId = req.body?.tool_id;
    if (!toolId) return res.status(400).json({ message: 'tool_id is required' });

    const tool = await ensureToolExists(toolId);
    const { itemsTable } = resolveImpactSocketsTables(tool.category);

    await run(`DELETE FROM ${itemsTable} WHERE id = ? AND tool_id = ?`, [itemId, toolId]);

    const sumRow = await get(`SELECT SUM(quantity) as sum FROM ${itemsTable} WHERE tool_id = ?`, [toolId]);
    const sum = Math.max(0, Number(sumRow?.sum || 0) || 0);
    await run('UPDATE tools SET quantity = ? WHERE id = ?', [sum, toolId]);

    res.json({ message: 'Item deleted' });
  } catch (err) {
    logger.error('Error deleting impact sockets item', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/outstanding', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  try {
    const { tool_id, employee_id, item_ids } = req.body || {};
    if (!tool_id || !employee_id || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ message: 'tool_id, employee_id and item_ids are required' });
    }

    const tool = await ensureToolExists(tool_id);
    const { issuesTable } = resolveImpactSocketsTables(tool.category);

    const placeholders = item_ids.map(() => '?').join(',');
    const issues = await all(
      `SELECT item_id, quantity, status FROM ${issuesTable}
       WHERE tool_id = ? AND employee_id = ? AND item_id IN (${placeholders})`,
      [tool_id, employee_id, ...item_ids]
    );

    const out = {};
    (issues || []).forEach(row => {
      const key = row.item_id;
      const qty = Number(row.quantity || 0);
      if (!out[key]) out[key] = 0;
      if (row.status === 'issued') out[key] += qty;
      if (row.status === 'returned') out[key] -= qty;
    });

    Object.keys(out).forEach(k => { out[k] = Math.max(0, out[k]); });
    res.json({ outstanding: out });
  } catch (err) {
    logger.error('Error fetching outstanding impact sockets', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/issue', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  try {
    const { tool_id, employee_id, items } = req.body || {};
    const userId = req.user?.id;

    if (!tool_id || !employee_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'tool_id, employee_id and items are required' });
    }

    const tool = await ensureToolExists(tool_id);
    const { itemsTable, issuesTable } = resolveImpactSocketsTables(tool.category);

    const itemIds = items.map(i => i.item_id);
    const placeholders = itemIds.map(() => '?').join(',');

    const dbItems = await all(
      `SELECT id, tool_id, quantity FROM ${itemsTable} WHERE tool_id = ? AND id IN (${placeholders})`,
      [tool_id, ...itemIds]
    );
    const itemMap = {};
    (dbItems || []).forEach(i => { itemMap[i.id] = i; });

    const issues = await all(
      `SELECT item_id, quantity, status FROM ${issuesTable} WHERE tool_id = ? AND item_id IN (${placeholders})`,
      [tool_id, ...itemIds]
    );

    const issuedMap = {};
    (issues || []).forEach(row => {
      const key = row.item_id;
      const qty = Number(row.quantity || 0);
      if (!issuedMap[key]) issuedMap[key] = 0;
      if (row.status === 'issued') issuedMap[key] += qty;
      if (row.status === 'returned') issuedMap[key] -= qty;
    });

    for (const it of items) {
      const row = itemMap[it.item_id];
      if (!row) return res.status(400).json({ message: `Item ${it.item_id} not found` });
      const reqQty = Math.max(1, parseInt(it.quantity || 1, 10));
      const alreadyIssued = Math.max(0, Number(issuedMap[it.item_id] || 0));
      const available = Math.max(0, Number(row.quantity || 0) - alreadyIssued);
      if (reqQty > available) {
        return res.status(400).json({ message: `Brak dostępnej ilości (item_id=${it.item_id}). Dostępne: ${available}` });
      }
    }

    await run('BEGIN TRANSACTION');
    try {
      for (const it of items) {
        const reqQty = Math.max(1, parseInt(it.quantity || 1, 10));
        await run(
          `INSERT INTO ${issuesTable} (item_id, tool_id, employee_id, issued_by_user_id, quantity, status, created_at, returned_at)
           VALUES (?, ?, ?, ?, ?, 'issued', datetime('now'), NULL)`,
          [it.item_id, tool_id, employee_id, userId, reqQty]
        );
      }

      await updateToolStatusFromImpactSockets(tool_id, itemsTable, issuesTable);
      await run('COMMIT');
    } catch (e) {
      await run('ROLLBACK');
      throw e;
    }

    res.json({ message: 'Items issued successfully' });
  } catch (err) {
    try { await run('ROLLBACK'); } catch (_) { void 0; }
    logger.error('Error issuing impact sockets items', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/return', authenticateToken, requirePermission('MANAGE_TOOLS'), async (req, res) => {
  try {
    const { tool_id, employee_id, items } = req.body || {};

    if (!tool_id || !employee_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'tool_id, employee_id and items are required' });
    }

    const tool = await ensureToolExists(tool_id);
    const { itemsTable, issuesTable } = resolveImpactSocketsTables(tool.category);

    const itemIds = items.map(i => i.item_id);
    const placeholders = itemIds.map(() => '?').join(',');

    const issues = await all(
      `SELECT item_id, quantity, status FROM ${issuesTable}
       WHERE tool_id = ? AND employee_id = ? AND item_id IN (${placeholders})`,
      [tool_id, employee_id, ...itemIds]
    );

    const outstanding = {};
    (issues || []).forEach(row => {
      const key = row.item_id;
      const qty = Number(row.quantity || 0);
      if (!outstanding[key]) outstanding[key] = 0;
      if (row.status === 'issued') outstanding[key] += qty;
      if (row.status === 'returned') outstanding[key] -= qty;
    });

    for (const it of items) {
      const reqQty = Math.max(1, parseInt(it.quantity || 1, 10));
      const outQty = Math.max(0, Number(outstanding[it.item_id] || 0));
      if (reqQty > outQty) {
        return res.status(400).json({ message: `Nie można zwrócić więcej niż wydano (item_id=${it.item_id}). Wydane: ${outQty}` });
      }
    }

    await run('BEGIN TRANSACTION');
    try {
      for (const it of items) {
        const reqQty = Math.max(1, parseInt(it.quantity || 1, 10));
        let remaining = reqQty;

        const issuedRows = await all(
          `SELECT id, quantity
           FROM ${issuesTable}
           WHERE tool_id = ? AND employee_id = ? AND item_id = ? AND status = 'issued'
           ORDER BY created_at DESC, id DESC`,
          [tool_id, employee_id, it.item_id]
        );

        for (const row of issuedRows) {
          if (remaining <= 0) break;
          const rowQty = Math.max(0, Number(row.quantity || 0) || 0);

          if (rowQty <= remaining) {
            await run(
              `UPDATE ${issuesTable}
               SET status = 'returned', returned_at = datetime('now')
               WHERE id = ?`,
              [row.id]
            );
            remaining -= rowQty;
          } else {
            const nextQty = Math.max(0, rowQty - remaining);
            if (nextQty <= 0) {
              await run(
                `UPDATE ${issuesTable}
                 SET status = 'returned', quantity = 0, returned_at = datetime('now')
                 WHERE id = ?`,
                [row.id]
              );
            } else {
              await run(
                `UPDATE ${issuesTable}
                 SET quantity = ?
                 WHERE id = ?`,
                [nextQty, row.id]
              );
            }
            remaining = 0;
          }
        }

        if (remaining > 0) {
          const err = new Error(`Nie można zwrócić więcej niż wydano (item_id=${it.item_id}).`);
          err.status = 400;
          throw err;
        }
      }

      await updateToolStatusFromImpactSockets(tool_id, itemsTable, issuesTable);
      await run('COMMIT');
    } catch (e) {
      await run('ROLLBACK');
      throw e;
    }

    res.json({ message: 'Items returned successfully' });
  } catch (err) {
    try { await run('ROLLBACK'); } catch (_) { void 0; }
    logger.error('Error returning impact sockets items', { error: err.message });
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
