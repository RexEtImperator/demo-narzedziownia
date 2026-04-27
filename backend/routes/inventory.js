const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sendDomainError } = require('../helpers/errorHelper');
const { triggerWebhooks } = require('../helpers/webhookSender');
const path = require('path');

const toLocalTimestampWithOffset = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
};

// Create a new inventory session (admin)
/**
 * @swagger
 * /inventory/sessions:
 *   post:
 *     summary: Create a new inventory session
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session created
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/sessions', authenticateToken, requirePermission('INVENTORY_MANAGE_SESSIONS'), (req, res) => {
  const { name, notes } = req.body || {};
  const normalized = String(name || '').trim();
  if (!normalized) {
    return sendDomainError(res, 'INVENTORY_SESSION_NAME_REQUIRED');
  }
  const now = toLocalTimestampWithOffset();
  db.run(
    "INSERT INTO inventory_sessions (name, owner_user_id, status, started_at, notes) VALUES (?, ?, 'active', ?, ?)",
    [normalized, req.user.id, now, notes || null],
    function(err) {
      if (err) {
        return res.sendError(500, 'INVENTORY_SESSION_CREATE_FAILED', 'inventory.errors.createSessionFailed', 'Server error', { error: err.message });
      }
      db.get('SELECT * FROM inventory_sessions WHERE id = ?', [this.lastID], (getErr, row) => {
        if (getErr) return sendDomainError(res, 'INVENTORY_SESSION_FETCH_FAILED', { error: getErr.message });
        res.status(201).json(row);
      });
    }
  );
});

// Zmiana statusu sesji (pause/resume/end) - admin
/**
 * @swagger
 * /inventory/sessions/{id}/status:
 *   put:
 *     summary: Change session status (pause, resume, end)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
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
 *                 enum: [pause, resume, end]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid action
 *       404:
 *         description: Session not found
 *       500:
 *         description: Server error
 */
router.put('/sessions/:id/status', authenticateToken, requirePermission('INVENTORY_MANAGE_SESSIONS'), (req, res) => {
  const { action } = req.body || {};
  const id = req.params.id;
  let sql = null;
  let params = [id];
  if (action === 'pause') {
    const now = toLocalTimestampWithOffset();
    sql = "UPDATE inventory_sessions SET status = 'paused', paused_at = ? WHERE id = ? AND status = 'active'";
    params = [now, id];
  } else if (action === 'resume') {
    sql = "UPDATE inventory_sessions SET status = 'active', paused_at = NULL WHERE id = ? AND status = 'paused'";
  } else if (action === 'end') {
    const now = toLocalTimestampWithOffset();
    sql = "UPDATE inventory_sessions SET status = 'ended', finished_at = ? WHERE id = ? AND status != 'ended'";
    params = [now, id];
  } else {
    return sendDomainError(res, 'INVENTORY_SESSION_INVALID_ACTION');
  }
  db.run(sql, params, function(err) {
    if (err) return res.sendError(500, 'INVENTORY_SESSION_UPDATE_FAILED', 'inventory.errors.updateSessionFailed', 'Server error', { error: err.message });
    if (this.changes === 0) return sendDomainError(res, 'INVENTORY_SESSION_NOT_FOUND');
    db.get('SELECT * FROM inventory_sessions WHERE id = ?', [id], (getErr, row) => {
      if (getErr) return sendDomainError(res, 'INVENTORY_SESSION_FETCH_FAILED', { error: getErr.message });
      res.json(row);
    });
  });
});

// Lista sesji + liczba zliczonych pozycji
router.get('/sessions', authenticateToken, (req, res) => {
  const sql = `
    SELECT s.*, (
      SELECT COUNT(*) FROM inventory_counts ic WHERE ic.session_id = s.id
    ) AS counted_items
    FROM inventory_sessions s
    ORDER BY s.started_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.sendError(500, 'INVENTORY_SESSION_LIST_FAILED', 'inventory.errors.listSessionsFailed', 'Server error', { error: err.message });
    res.json(rows);
  });
});

// Delete ended session (admin)
router.delete('/sessions/:id', authenticateToken, requirePermission('INVENTORY_MANAGE_SESSIONS'), (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM inventory_sessions WHERE id = ?', [id], (findErr, session) => {
    if (findErr) return res.sendError(500, 'INVENTORY_SESSION_FETCH_FAILED', 'inventory.errors.fetchSessionFailed', 'Server error', { error: findErr.message });
    if (!session) return sendDomainError(res, 'INVENTORY_SESSION_NOT_FOUND');
    if (session.status !== 'ended') return sendDomainError(res, 'INVENTORY_SESSION_STATUS_INVALID');

    let deletedCounts = 0;
    let deletedCorrections = 0;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run('DELETE FROM inventory_counts WHERE session_id = ?', [id], function(countErr) {
        if (countErr) {
          db.run('ROLLBACK');
          return sendDomainError(res, 'INVENTORY_DELETE_COUNTS_FAILED', { error: countErr.message });
        }
        deletedCounts = this.changes || 0;

        db.run('DELETE FROM inventory_corrections WHERE session_id = ?', [id], function(corrErr) {
          if (corrErr) {
            db.run('ROLLBACK');
            return sendDomainError(res, 'INVENTORY_DELETE_CORRECTIONS_FAILED', { error: corrErr.message });
          }
          deletedCorrections = this.changes || 0;

          db.run('DELETE FROM inventory_sessions WHERE id = ?', [id], function(sessErr) {
            if (sessErr) {
              db.run('ROLLBACK');
              return sendDomainError(res, 'INVENTORY_DELETE_SESSION_FAILED', { error: sessErr.message });
            }
            if (this.changes === 0) {
              db.run('ROLLBACK');
              return sendDomainError(res, 'INVENTORY_SESSION_NOT_FOUND');
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Error committing transaction', error: commitErr.message });
              }

              const details = `session:${id} name:${session.name} counts:${deletedCounts} corrections:${deletedCorrections}`;
              db.run(
                "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_session_delete', ?, datetime('now'))",
                [req.user.id, req.user.username, details],
                (auditErr) => {
                  if (auditErr) {
                    logger.error('Error adding audit log', { error: auditErr.message });
                  }
                  return res.json({ 
                    message: 'Session permanently deleted', 
                    deleted: true,
                    session_id: Number(id),
                    deleted_counts: deletedCounts,
                    deleted_corrections: deletedCorrections
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

// Skanowanie i zliczanie w sesji
/**
 * @swagger
 * /inventory/sessions/{id}/scan:
 *   post:
 *     summary: Scan item in session
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 default: 1
 *     responses:
 *       201:
 *         description: Item scanned
 *       404:
 *         description: Session or tool not found
 *       400:
 *         description: Invalid session status
 *       500:
 *         description: Server error
 */
router.post('/sessions/:id/scan', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const { code, quantity } = req.body || {};
  const qty = Math.max(1, parseInt(quantity || 1, 10));
  if (!code || String(code).trim() === '') {
    return sendDomainError(res, 'INVENTORY_CODE_REQUIRED');
  }

  db.get('SELECT * FROM inventory_sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err) return res.sendError(500, 'INVENTORY_SESSION_FETCH_FAILED', 'inventory.errors.fetchSessionFailed', 'Server error');
    if (!session) return sendDomainError(res, 'INVENTORY_SESSION_NOT_FOUND');
    if (session.status !== 'active') return res.sendError(400, 'INVENTORY_SESSION_STATUS_INVALID', 'inventory.errors.sessionStatusInvalid', 'Session is not active');

    const findToolSql = `
      SELECT * FROM tools 
      WHERE sku = ? OR barcode = ? OR qr_code = ? OR inventory_number = ? 
         OR id IN (SELECT tool_id FROM tools_slings_items WHERE sku = ?)
      LIMIT 1
    `;
    db.get(findToolSql, [code, code, code, code, code], (findErr, tool) => {
      if (findErr) return res.sendError(500, 'INVENTORY_TOOL_FETCH_FAILED', 'inventory.errors.toolFetchFailed', 'Server error');
      if (!tool) return sendDomainError(res, 'INVENTORY_TOOL_NOT_FOUND');

      db.get('SELECT id, counted_qty FROM inventory_counts WHERE session_id = ? AND tool_id = ?', [sessionId, tool.id], (getErr, countRow) => {
        if (getErr) return res.sendError(500, 'INVENTORY_COUNT_GET_FAILED', 'inventory.errors.countFetchFailed', 'Server error');
        if (!countRow) {
          db.run(
            'INSERT INTO inventory_counts (session_id, tool_id, code, counted_qty) VALUES (?, ?, ?, ?)',
            [sessionId, tool.id, code, qty],
            function(insErr) {
              if (insErr) return res.sendError(500, 'INVENTORY_COUNT_SET_FAILED', 'inventory.errors.countSetFailed', 'Server error', { error: insErr.message });
              db.get('SELECT * FROM inventory_counts WHERE id = ?', [this.lastID], (cErr, newRow) => {
                if (cErr) return res.sendError(500, 'INVENTORY_COUNT_GET_FAILED', 'inventory.errors.countFetchFailed', 'Server error');
                // Zapis audytu
                db.run(
                  "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_scan', ?, datetime('now'))",
                  [req.user.id, req.user.username, `session:${sessionId} tool:${tool.id} qty:${qty}`]
                );
                res.status(201).json({ message: 'Count added', count: newRow, tool });
              });
            }
          );
        } else {
          const updatedQty = (countRow.counted_qty || 0) + qty;
          db.run(
            "UPDATE inventory_counts SET counted_qty = ?, updated_at = datetime('now') WHERE id = ?",
            [updatedQty, countRow.id],
            function(updErr) {
              if (updErr) return res.sendError(500, 'INVENTORY_COUNT_SET_FAILED', 'inventory.errors.countSetFailed', 'Server error', { error: updErr.message });
              db.get('SELECT * FROM inventory_counts WHERE id = ?', [countRow.id], (cErr, row) => {
                if (cErr) return res.sendError(500, 'INVENTORY_COUNT_GET_FAILED', 'inventory.errors.countFetchFailed', 'Server error');
                db.run(
                  "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_scan', ?, datetime('now'))",
                  [req.user.id, req.user.username, `session:${sessionId} tool:${tool.id} qty:+${qty}`]
                );
                res.json({ message: 'Count updated', count: row, tool });
              });
            }
          );
        }
      });
    });
  });
});

// Set counted quantity for a tool in the session (upsert)
/**
 * @swagger
 * /inventory/sessions/{id}/counts/{toolId}:
 *   put:
 *     summary: Set counted quantity for a tool
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *       - in: path
 *         name: toolId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tool ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - counted_qty
 *             properties:
 *               counted_qty:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Count updated
 *       201:
 *         description: Count created
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Session or tool not found
 *       500:
 *         description: Server error
 */
router.put('/sessions/:id/counts/:toolId', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const toolId = req.params.toolId;
  const { counted_qty } = req.body || {};
  const qty = Math.max(0, parseInt(counted_qty, 10));
  if (Number.isNaN(qty)) {
    return sendDomainError(res, 'INVENTORY_REQUIRED_FIELDS');
  }

  db.get('SELECT * FROM inventory_sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err) return res.sendError(500, 'INVENTORY_SESSION_FETCH_FAILED', 'inventory.errors.fetchSessionFailed', 'Server error');
    if (!session) return sendDomainError(res, 'INVENTORY_SESSION_NOT_FOUND');

    db.get('SELECT * FROM tools WHERE id = ?', [toolId], (toolErr, tool) => {
      if (toolErr) return res.sendError(500, 'INVENTORY_TOOL_FETCH_FAILED', 'inventory.errors.toolFetchFailed', 'Server error');
      if (!tool) return sendDomainError(res, 'TOOL_NOT_FOUND');

      db.get('SELECT id FROM inventory_counts WHERE session_id = ? AND tool_id = ?', [sessionId, toolId], (getErr, countRow) => {
        if (getErr) return res.sendError(500, 'INVENTORY_COUNT_GET_FAILED', 'inventory.errors.countFetchFailed', 'Server error');
        if (!countRow) {
          db.run(
            'INSERT INTO inventory_counts (session_id, tool_id, code, counted_qty) VALUES (?, ?, ?, ?)',
            [sessionId, toolId, tool.sku || null, qty],
            function(insErr) {
              if (insErr) return res.sendError(500, 'INVENTORY_COUNT_SET_FAILED', 'inventory.errors.countSetFailed', 'Server error', { error: insErr.message });
              db.get('SELECT * FROM inventory_counts WHERE id = ?', [this.lastID], (cErr, newRow) => {
                if (cErr) return res.sendError(500, 'INVENTORY_COUNT_GET_FAILED', 'inventory.errors.countFetchFailed', 'Server error');
                db.run(
                  "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_count_set', ?, datetime('now'))",
                  [req.user.id, req.user.username, `session:${sessionId} tool:${toolId} set:${qty}`]
                );
                res.status(201).json({ message: 'Count quantity set', count: newRow });
              });
            }
          );
        } else {
          db.run(
            "UPDATE inventory_counts SET counted_qty = ?, updated_at = datetime('now') WHERE id = ?",
            [qty, countRow.id],
            function(updErr) {
              if (updErr) return res.sendError(500, 'INVENTORY_COUNT_SET_FAILED', 'inventory.errors.countSetFailed', 'Server error', { error: updErr.message });
              db.get('SELECT * FROM inventory_counts WHERE id = ?', [countRow.id], (cErr, row) => {
                if (cErr) return res.sendError(500, 'INVENTORY_COUNT_GET_FAILED', 'inventory.errors.countFetchFailed', 'Server error');
  
                db.run(
                  "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_count_set', ?, datetime('now'))",
                  [req.user.id, req.user.username, `session:${sessionId} tool:${toolId} set:${qty}`]
                );
                res.json({ message: 'Count quantity updated', count: row });
              });
            }
          );
        }
      });
    });
  });
});

// Session differences (also includes zero differences)
/**
 * @swagger
 * /inventory/sessions/{id}/differences:
 *   get:
 *     summary: Get session differences
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: List of differences
 *       500:
 *         description: Server error
 */
router.get('/sessions/:id/differences', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const sql = `
    SELECT 
      t.id AS tool_id, t.name, t.sku, t.quantity AS system_qty, 
      COALESCE(ic.counted_qty, 0) AS counted_qty,
      (COALESCE(ic.counted_qty, 0) - COALESCE(t.quantity, 0)) AS difference
    FROM tools t
    LEFT JOIN inventory_counts ic ON ic.tool_id = t.id AND ic.session_id = ?
    ORDER BY ABS(difference) DESC, t.name
  `;
  db.all(sql, [sessionId], (err, rows) => {
    if (err) return res.sendError(500, 'INVENTORY_DIFFERENCES_FETCH_FAILED', 'inventory.errors.fetchDifferencesFailed', 'Server error', { error: err.message });
    res.json(rows);
  });
});

// History of counts and corrections
/**
 * @swagger
 * /inventory/sessions/{id}/history:
 *   get:
 *     summary: Get session history (counts and corrections)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: History data
 *       500:
 *         description: Server error
 */
router.get('/sessions/:id/history', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const countsQuery = `
    SELECT ic.*, t.name AS tool_name, t.sku AS tool_sku
    FROM inventory_counts ic
    JOIN tools t ON t.id = ic.tool_id
    WHERE ic.session_id = ?
    ORDER BY ic.updated_at DESC
  `;
  const correctionsQuery = `
    SELECT c.*, t.name AS tool_name, t.sku AS tool_sku, u.username AS accepted_by_username
    FROM inventory_corrections c
    JOIN tools t ON t.id = c.tool_id
    LEFT JOIN users u ON u.id = c.accepted_by_user_id
    WHERE c.session_id = ?
    ORDER BY c.created_at DESC
  `;
  db.all(countsQuery, [sessionId], (err, counts) => {
    if (err) return res.sendError(500, 'INVENTORY_HISTORY_FETCH_FAILED', 'inventory.errors.fetchHistoryFailed', 'Server error', { error: err.message });
    db.all(correctionsQuery, [sessionId], (err2, corrections) => {
      if (err2) return res.sendError(500, 'INVENTORY_HISTORY_FETCH_FAILED', 'inventory.errors.fetchHistoryFailed', 'Server error', { error: err2.message });
      res.json({ counts, corrections });
    });
  });
});

// Add difference correction
router.post('/sessions/:id/corrections', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const { tool_id, difference_qty, reason } = req.body || {};
  if (!tool_id || typeof difference_qty !== 'number') {
    return sendDomainError(res, 'INVENTORY_REQUIRED_FIELDS');
  }
  db.run(
    'INSERT INTO inventory_corrections (session_id, tool_id, difference_qty, reason) VALUES (?, ?, ?, ?)',
    [sessionId, tool_id, difference_qty, reason || null],
    function(err) {
      if (err) return res.sendError(500, 'INVENTORY_CORRECTION_CREATE_FAILED', 'inventory.errors.correctionCreateFailed', 'Server error', { error: err.message });
      db.get('SELECT * FROM inventory_corrections WHERE id = ?', [this.lastID], (getErr, row) => {
        if (getErr) return res.sendError(500, 'INVENTORY_CORRECTION_FETCH_FAILED', 'inventory.errors.correctionFetchFailed', 'Error fetching correction');
        res.status(201).json(row);
      });
    }
  );
});

// Akceptacja korekty (admin)
router.post('/corrections/:id/accept', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return sendDomainError(res, 'PERMISSION_DENIED');
  }
  const id = req.params.id;
  db.run(
    "UPDATE inventory_corrections SET accepted_by_user_id = ?, accepted_at = datetime('now') WHERE id = ?",
    [req.user.id, id],
    function(err) {
      if (err) return res.sendError(500, 'INVENTORY_CORRECTION_ACCEPT_FAILED', 'inventory.errors.correctionAcceptFailed', 'Server error', { error: err.message });
      if (this.changes === 0) return sendDomainError(res, 'INVENTORY_CORRECTION_NOT_FOUND');

      // After acceptance, apply the correction to the tool's system quantity
      db.get('SELECT * FROM inventory_corrections WHERE id = ?', [id], (getErr, corr) => {
        if (getErr || !corr) return res.sendError(500, 'INVENTORY_CORRECTION_FETCH_FAILED', 'inventory.errors.correctionFetchFailed', 'Error fetching correction to apply');
        db.run(
          'UPDATE tools SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?',
          [corr.difference_qty, corr.tool_id],
          function(updErr) {
            if (updErr) return sendDomainError(res, 'INVENTORY_CORRECTION_APPLY_FAILED', { error: updErr.message });
            // Zapisz zdarzenie w logach audytu
            db.run(
              "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_correction_accept', ?, datetime('now'))",
              [req.user.id, req.user.username, `correction:${id} tool:${corr.tool_id} diff:${corr.difference_qty}`]
            );
            triggerWebhooks('inventory.correction.accepted', {
              correction_id: id,
              tool_id: corr.tool_id,
              difference_qty: corr.difference_qty,
              accepted_by: req.user.username
            });
            res.json({ message: 'Correction accepted and applied', id, tool_id: corr.tool_id, applied_difference: corr.difference_qty });
          }
        );
      });
    }
  );
});

// Usuwanie korekty (admin)
/**
 * @swagger
 * /inventory/corrections/{id}:
 *   delete:
 *     summary: Delete inventory correction
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Correction ID
 *     responses:
 *       200:
 *         description: Correction deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Correction not found
 *       400:
 *         description: Correction already approved
 *       500:
 *         description: Server error
 */
router.delete('/corrections/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return sendDomainError(res, 'PERMISSION_DENIED');
  }
  const id = req.params.id;
  db.get('SELECT * FROM inventory_corrections WHERE id = ?', [id], (findErr, corr) => {
    if (findErr) return res.sendError(500, 'INVENTORY_CORRECTION_FETCH_FAILED', 'inventory.errors.correctionFetchFailed', 'Server error', { error: findErr.message });
    if (!corr) return sendDomainError(res, 'INVENTORY_CORRECTION_NOT_FOUND');
    if (corr.accepted_at) return sendDomainError(res, 'INVENTORY_CORRECTION_ALREADY_APPROVED');

    db.run('DELETE FROM inventory_corrections WHERE id = ?', [id], function(delErr) {
      if (delErr) return res.sendError(500, 'INVENTORY_CORRECTION_DELETE_FAILED', 'inventory.errors.correctionDeleteFailed', 'Server error', { error: delErr.message });
      if (this.changes === 0) return sendDomainError(res, 'INVENTORY_CORRECTION_NOT_FOUND');
      db.run(
        "INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, 'inventory_correction_delete', ?, datetime('now'))",
        [req.user.id, req.user.username, `correction:${id} session:${corr.session_id} tool:${corr.tool_id} diff:${corr.difference_qty}`],
        (auditErr) => {
          if (auditErr) logger.error('Error adding audit log', { error: auditErr.message });
          res.json({ message: 'Correction deleted', id: Number(id), deleted: true });
        }
      );
    });
  });
});

// =============================================================================
// ADVANCED INVENTORY: STOCK ALERTS & REORDERING
// =============================================================================

/**
 * @swagger
 * /inventory/low-stock:
 *   get:
 *     summary: Get low stock items
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of low stock items
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
 *                   sku:
 *                     type: string
 *                   quantity:
 *                     type: integer
 *                   min_stock:
 *                     type: integer
 *                   max_stock:
 *                     type: integer
 *                   reorder_quantity:
 *                     type: integer
 *       500:
 *         description: Server error
 */
router.get('/low-stock', authenticateToken, (req, res) => {
  const sql = `
    SELECT id, name, sku, quantity, min_stock, max_stock, 
           (max_stock - quantity) as reorder_quantity
    FROM tools
    WHERE quantity <= min_stock AND min_stock IS NOT NULL
    ORDER BY (quantity - min_stock) ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.sendError(500, 'INVENTORY_LOW_STOCK_FAILED', 'inventory.errors.lowStockFailed', 'Server error', { error: err.message });
    res.json(rows);
  });
});

/**
 * @swagger
 * /inventory/reorder-suggestions:
 *   get:
 *     summary: Get reordering suggestions
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reordering suggestions
 *       500:
 *         description: Server error
 */
router.get('/reorder-suggestions', authenticateToken, (req, res) => {
  const sql = `
    SELECT id, name, sku, quantity, min_stock, max_stock,
           (max_stock - quantity) as suggested_order
    FROM tools
    WHERE quantity < max_stock AND max_stock IS NOT NULL
    ORDER BY (quantity / CAST(max_stock AS FLOAT)) ASC
    LIMIT 50
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.sendError(500, 'INVENTORY_SUGGESTIONS_FAILED', 'inventory.errors.suggestionsFailed', 'Server error', { error: err.message });
    res.json(rows);
  });
});

module.exports = router;
