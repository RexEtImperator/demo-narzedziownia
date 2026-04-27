const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { triggerWebhooks } = require('../helpers/webhookSender');
const { sendDomainError } = require('../helpers/errorHelper');

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Webhook integration management
 */

/**
 * @swagger
 * /webhooks:
 *   get:
 *     summary: List all webhooks
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  db.all('SELECT * FROM webhooks ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.sendError(500, 'WEBHOOKS_FETCH_FAILED', 'webhooks.errors.fetchFailed', 'Server error', { error: err.message });
    
    // Parse events JSON
    const result = rows.map(row => ({
      ...row,
      events: (() => { try { return JSON.parse(row.events); } catch (_) { return []; } })()
    }));
    
    res.json(result);
  });
});

/**
 * @swagger
 * /webhooks:
 *   post:
 *     summary: Create a new webhook
 *     tags: [Webhooks]
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
 *               - url
 *               - events
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               secret:
 *                 type: string
 *     responses:
 *       201:
 *         description: Webhook created
 */
router.post('/', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const { name, url, events, secret } = req.body;
  
  if (!name || !url || !Array.isArray(events) || events.length === 0) {
    return sendDomainError(res, 'WEBHOOKS_INVALID_INPUT');
  }

  const eventsJson = JSON.stringify(events);
  
  db.run(
    'INSERT INTO webhooks (name, url, events, secret, active) VALUES (?, ?, ?, ?, 1)',
    [name, url, eventsJson, secret || null],
    function(err) {
      if (err) return res.sendError(500, 'WEBHOOKS_CREATE_FAILED', 'webhooks.errors.createFailed', 'Server error', { error: err.message });
      
      db.get('SELECT * FROM webhooks WHERE id = ?', [this.lastID], (getErr, row) => {
        if (getErr) return res.status(201).json({ id: this.lastID });
        res.status(201).json({
          ...row,
          events: JSON.parse(row.events)
        });
      });
    }
  );
});

/**
 * @swagger
 * /webhooks/{id}:
 *   put:
 *     summary: Update a webhook
 *     tags: [Webhooks]
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
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               secret:
 *                 type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated
 */
router.put('/:id', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const id = req.params.id;
  const { name, url, events, secret, active } = req.body;
  
  // We need to fetch existing to know what to update if fields are missing, 
  // but for simplicity we'll assume full object or COALESCE in SQL
  // However, events array handling is tricky in SQL directly without fetch.
  
  db.get('SELECT * FROM webhooks WHERE id = ?', [id], (err, row) => {
    if (err || !row) return sendDomainError(res, 'WEBHOOKS_NOT_FOUND');
    
    const newName = name !== undefined ? name : row.name;
    const newUrl = url !== undefined ? url : row.url;
    const newEvents = events !== undefined ? JSON.stringify(events) : row.events;
    const newSecret = secret !== undefined ? secret : row.secret;
    const newActive = active !== undefined ? (active ? 1 : 0) : row.active;
    
    db.run(
      "UPDATE webhooks SET name = ?, url = ?, events = ?, secret = ?, active = ?, updated_at = datetime('now') WHERE id = ?",
      [newName, newUrl, newEvents, newSecret, newActive, id],
      function(updErr) {
        if (updErr) return res.sendError(500, 'WEBHOOKS_UPDATE_FAILED', 'webhooks.errors.updateFailed', 'Server error', { error: updErr.message });
        res.json({ message: 'Webhook updated', id });
      }
    );
  });
});

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     summary: Delete a webhook
 *     tags: [Webhooks]
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
 *         description: Webhook deleted
 */
router.delete('/:id', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM webhooks WHERE id = ?', [id], function(err) {
    if (err) return res.sendError(500, 'WEBHOOKS_DELETE_FAILED', 'webhooks.errors.deleteFailed', 'Server error', { error: err.message });
    if (this.changes === 0) return sendDomainError(res, 'WEBHOOKS_NOT_FOUND');
    res.json({ message: 'Webhook deleted' });
  });
});

/**
 * @swagger
 * /webhooks/{id}/test:
 *   post:
 *     summary: Test a webhook
 *     tags: [Webhooks]
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
 *         description: Test triggered
 */
router.post('/:id/test', authenticateToken, requirePermission('SYSTEM_SETTINGS'), async (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM webhooks WHERE id = ?', [id], async (err, row) => {
    if (err || !row) return sendDomainError(res, 'WEBHOOKS_NOT_FOUND');
    
    // Manually trigger
    triggerWebhooks('webhook.test', { 
      message: 'This is a test event', 
      user: req.user.username,
      webhook_id: id 
    });
    
    res.json({ message: 'Test webhook triggered. Check logs for delivery status.' });
  });
});

/**
 * @swagger
 * /webhooks/logs:
 *   get:
 *     summary: Get webhook delivery logs
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of logs
 */
router.get('/logs', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  db.all('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.sendError(500, 'WEBHOOKS_LOGS_FETCH_FAILED', 'webhooks.errors.logsFetchFailed', 'Server error', { error: err.message });
    res.json(rows);
  });
});

module.exports = router;
