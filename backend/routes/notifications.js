const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sendDomainError } = require('../helpers/errorHelper');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');
const { sendEmail } = require('../helpers/notifications');
const webpush = require('web-push');
const { decrypt } = require('../helpers/crypto');

let webpushReady = false;
const initWebPush = async () => {
  if (webpushReady) return true;
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT vapid_public_key, vapid_private_key, vapid_subject FROM app_config WHERE id = 1', [], (err, r) => {
        if (err) reject(err);
        else resolve(r);
      });
    });

    let publicKey = row?.vapid_public_key || process.env.VAPID_PUBLIC_KEY;
    let privateKey = row?.vapid_private_key || process.env.VAPID_PRIVATE_KEY;
    const subject = row?.vapid_subject || process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    if (privateKey && typeof privateKey === 'string' && privateKey.includes(':')) {
      try {
        const decrypted = decrypt(privateKey);
        if (decrypted && decrypted !== privateKey) privateKey = decrypted;
      } catch (_) { void 0; }
    }

    if (!publicKey || !privateKey) return false;

    publicKey = String(publicKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    privateKey = String(privateKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    webpush.setVapidDetails(subject, publicKey, privateKey);
    webpushReady = true;
    return true;
  } catch (e) {
    logger.error('Error initializing webpush', { error: e.message });
    return false;
  }
};

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

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: User notifications and email testing
 */

/**
 * @swagger
 * /notifications/test-email:
 *   post:
 *     summary: Send a test email
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       500:
 *         description: Failed to send email
 */
router.post('/test-email', authenticateToken, requirePermission('SYSTEM_SETTINGS'), async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ message: 'Email address is required' });

  try {
    const sent = await sendEmail(to, 'Test Email', 'This is a test email from the Tool Management System.', '<p>This is a <strong>test email</strong> from the Tool Management System.</p>');
    if (sent) {
      res.json({ message: 'Email sent successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send email. Check logs.' });
    }
  } catch (error) {
    logger.error('Error sending test email', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user-specific notifications (e.g., return requests)
/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 */
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT 
      n.id,
      n.type,
      n.item_type,
      n.item_id,
      n.employee_id,
      n.subject,
      n.target_url,
      n.message,
      n.read,
      n.created_at,
      -- inspection date
      CASE WHEN n.item_type = 'bhp' THEN (
        SELECT b.inspection_date FROM bhp b WHERE b.id = n.item_id
      ) ELSE (
        SELECT t.inspection_date FROM tools t WHERE t.id = n.item_id
      ) END AS inspection_date,
      -- inventory number
      CASE WHEN n.item_type = 'bhp' THEN (
        SELECT b.inventory_number FROM bhp b WHERE b.id = n.item_id
      ) ELSE (
        SELECT t.inventory_number FROM tools t WHERE t.id = n.item_id
      ) END AS inventory_number,
      -- manufacturer
      CASE WHEN n.item_type = 'bhp' THEN (
        SELECT b.manufacturer FROM bhp b WHERE b.id = n.item_id
      ) ELSE (
        SELECT t.manufacturer FROM tools t WHERE t.id = n.item_id
      ) END AS manufacturer,
      -- model or tool name
      CASE WHEN n.item_type = 'bhp' THEN (
        SELECT b.model FROM bhp b WHERE b.id = n.item_id
      ) ELSE (
        SELECT t.name FROM tools t WHERE t.id = n.item_id
      ) END AS model,
      -- employee brand number
      (SELECT e.brand_number FROM employees e WHERE e.id = n.employee_id) AS employee_brand_number
    FROM notifications n
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) {
      logger.error('Error fetching notifications', { error: err.message });
      return res.sendError(500, 'NOTIFICATIONS_FETCH_FAILED', 'notifications.errors.fetchFailed', 'Server error');
    }
    const result = (rows || []).map(r => ({
      id: r.id,
      type: r.type || 'return_request',
      itemType: r.item_type,
      inventory_number: r.inventory_number || '-',
      manufacturer: r.manufacturer || '',
      model: r.model || '',
      inspection_date: r.inspection_date || null,
      subject: r.subject || '',
      url: r.target_url || '',
      message: r.message || '',
      read: !!r.read,
      employee_id: r.employee_id || null,
      employee_brand_number: r.employee_brand_number || null,
      created_at: r.created_at
    }));
    res.json(result);
  });
});

/**
 * @swagger
 * /notifications:
 *   delete:
 *     summary: Delete notifications by type
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [return_request, admin_message, broadcast, custom, overdue_inspection]
 *       - in: query
 *         name: item_type
 *         schema:
 *           type: string
 *           enum: [tool, bhp, admin]
 *     responses:
 *       200:
 *         description: Notifications deleted
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
// Admin: delete general notifications by type
router.delete('/', authenticateToken, requirePermission('NOTIFY'), (req, res) => {
  const type = String(req.query.type || '').trim();
  const itemType = String(req.query.item_type || '').trim();
  const allowedTypes = ['return_request', 'admin_message', 'broadcast', 'custom', 'overdue_inspection'];
  const allowedItemTypes = ['tool', 'bhp', 'admin'];
  if (type && !allowedTypes.includes(type)) {
    return sendDomainError(res, 'NOTIFICATIONS_INVALID_TYPE');
  }
  if (itemType && !allowedItemTypes.includes(itemType)) {
    return sendDomainError(res, 'NOTIFICATIONS_INVALID_ITEM_TYPE');
  }
  if (!type && !itemType) {
    return sendDomainError(res, 'NOTIFICATIONS_MISSING_FILTERS');
  }
  const where = [];
  const params = [];

  if (type) {
    where.push('type = ?');
    params.push(type);
  }
  if (itemType) {
    where.push('item_type = ?');
    params.push(itemType);
  }

  const sql = `DELETE FROM notifications WHERE ${where.join(' AND ')}`;
  db.run(sql, params, function(err) {
    if (err) {
      logger.error('Error deleting notifications', { error: err.message });
      return res.sendError(500, 'NOTIFICATIONS_DELETE_FAILED', 'notifications.errors.deleteFailed', 'Server error');
    }
    res.json({ message: 'Notifications deleted', deleted: this.changes, count: this.changes });
  });
});

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     tags: [Notifications]
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
 *         description: Notification marked as read
 *       500:
 *         description: Server error
 */
// Mark notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;
  db.run('UPDATE notifications SET read = 1, read_at = datetime("now") WHERE id = ? AND user_id = ?', [id, userId], function(err) {
    if (err) return res.sendError(500, 'NOTIFICATIONS_UPDATE_FAILED', 'notifications.errors.updateFailed', 'Server error');
    res.json({ message: 'Notification marked as read' });
  });
});

/**
 * @swagger
 * /notifications/{id}/unread:
 *   post:
 *     summary: Mark notification as unread
 *     tags: [Notifications]
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
 *         description: Notification marked as unread
 *       500:
 *         description: Server error
 */
// Mark notification as unread
router.post('/:id/unread', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;
  db.run('UPDATE notifications SET read = 0, read_at = NULL WHERE id = ? AND user_id = ?', [id, userId], function(err) {
    if (err) return res.sendError(500, 'NOTIFICATIONS_UPDATE_FAILED', 'notifications.errors.updateFailed', 'Server error');
    res.json({ message: 'Notification marked as unread' });
  });
});

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       500:
 *         description: Server error
 */
// Mark all notifications as read
router.post('/read-all', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.run('UPDATE notifications SET read = 1, read_at = datetime("now") WHERE user_id = ? AND read = 0', [userId], function(err) {
    if (err) return res.sendError(500, 'NOTIFICATIONS_UPDATE_FAILED', 'notifications.errors.updateFailed', 'Server error');
    res.json({ message: 'All notifications marked as read', count: this.changes });
  });
});

/**
 * @swagger
 * /notifications/unread-all:
 *   post:
 *     summary: Mark all notifications as unread
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as unread
 *       500:
 *         description: Server error
 */
// Mark all notifications as unread
router.post('/unread-all', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.run('UPDATE notifications SET read = 0, read_at = NULL WHERE user_id = ? AND read = 1', [userId], function(err) {
    if (err) return res.sendError(500, 'NOTIFICATIONS_UPDATE_FAILED', 'notifications.errors.updateFailed', 'Server error');
    res.json({ message: 'All notifications marked as unread', count: this.changes });
  });
});

// Delete single notification
router.delete('/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;
  db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId], function(err) {
    if (err) return res.sendError(500, 'NOTIFICATIONS_DELETE_FAILED', 'notifications.errors.deleteFailed', 'Server error');
    res.json({ message: 'Notification deleted' });
  });
});

// Admin: get all notifications with pagination
router.get('/admin', authenticateToken, requirePermission('NOTIFY'), (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);

  const countQuery = 'SELECT COUNT(*) as count FROM notifications';
  const dataQuery = `
    SELECT 
      n.id, n.type, n.item_type, n.item_id, n.subject, n.message, n.read, n.created_at,
      u.username as user_name,
      e.first_name || ' ' || e.last_name as employee_name
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    LEFT JOIN employees e ON n.employee_id = e.id
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, [], (err, countRow) => {
    if (err) {
      logger.error('Error counting notifications', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    
    db.all(dataQuery, [limit, offset], (err, rows) => {
      if (err) {
        logger.error('Error fetching admin notifications', { error: err.message });
        return res.status(500).json({ message: 'Server error' });
      }
      
      const total = Number(countRow?.count || 0) || 0;
      res.json({
        rows: rows || [],
        data: rows || [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      });
    });
  });
});

/**
 * @swagger
 * /notifications/history:
 *   get:
 *     summary: Get notification history
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Notification history
 *       500:
 *         description: Server error
 */
// Admin: get notification history
router.get('/history', authenticateToken, requirePermission('NOTIFY'), (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const type = req.query.type;
  const search = req.query.q;

  let whereClause = '';
  const params = [];

  if (type) {
    whereClause += ' WHERE type = ?';
    params.push(type);
  }

  if (search) {
    whereClause += (whereClause ? ' AND' : ' WHERE') + ' (subject LIKE ? OR message LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as count FROM notifications ${whereClause}`;
  const dataQuery = `
    SELECT 
      n.id, n.type, n.item_type, n.item_id, n.subject, n.message, n.read, n.created_at,
      u.username as user_name,
      e.first_name || ' ' || e.last_name as employee_name
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    LEFT JOIN employees e ON n.employee_id = e.id
    ${whereClause}
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, params, (err, countRow) => {
    if (err) {
      logger.error('Error counting notification history', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    
    db.all(dataQuery, [...params, limit, offset], (err, rows) => {
      if (err) {
        logger.error('Error fetching notification history', { error: err.message });
        return res.status(500).json({ message: 'Server error' });
      }
      
      const total = Number(countRow?.count || 0) || 0;
      res.json({
        rows: rows || [],
        data: rows || [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      });
    });
  });
});

router.post('/bulk-delete', authenticateToken, requirePermission('NOTIFY'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => parseInt(v, 10)).filter(v => Number.isInteger(v) && v > 0) : [];
    if (ids.length === 0) return res.status(400).json({ message: 'Missing IDs' });

    const placeholders = ids.map(() => '?').join(',');
    const result = await run(`DELETE FROM notifications WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Notifications deleted', deleted: result.changes });
  } catch (err) {
    logger.error('Error bulk deleting notifications', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.delete('/history', authenticateToken, requirePermission('NOTIFY'), async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    if (type !== 'broadcast' && type !== 'custom') {
      return res.status(400).json({ message: 'Invalid type' });
    }

    const historyRows = await all('SELECT id FROM notification_history WHERE type = ?', [type]);
    const historyIds = (historyRows || []).map(r => r.id);

    if (historyIds.length > 0) {
      const placeholders = historyIds.map(() => '?').join(',');
      await run(`DELETE FROM notification_history_recipients WHERE history_id IN (${placeholders})`, historyIds);
    }

    const historyResult = await run('DELETE FROM notification_history WHERE type = ?', [type]);

    const typesToDel = type === 'broadcast' ? ['broadcast', 'admin_message'] : ['custom', 'admin_message'];
    const notifsResult = await run(
      `DELETE FROM notifications WHERE item_type = 'admin' AND type IN (${typesToDel.map(() => '?').join(',')})`,
      typesToDel
    );

    res.json({
      message: 'History deleted',
      deleted_history: historyResult.changes,
      deleted_notifications: notifsResult.changes
    });
  } catch (err) {
    logger.error('Error deleting notification history', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/broadcast', authenticateToken, requirePermission('NOTIFY'), async (req, res) => {
  try {
    const { sender, subject, message, push, fanout, url } = req.body || {};
    const s = String(sender || '').trim();
    const subj = String(subject || '').trim();
    const m = String(message || '').trim();
    const targetUrl = String(url || '').trim();
    if (!s || !subj || !m) return res.status(400).json({ message: 'Missing sender, subject or message' });

    const historyResult = await run(
      'INSERT INTO notification_history (type, sender, subject, message, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
      ['broadcast', s, subj, m]
    );
    const historyId = historyResult.lastID;

    let pushCount = 0;
    let fanoutCount = 0;

    if (fanout) {
      const users = await all('SELECT id, employee_id FROM users', []);
      if (users && users.length > 0) {
        await run('BEGIN TRANSACTION');
        try {
          for (const u of users) {
            await run(
              `INSERT INTO notifications (user_id, employee_id, type, item_type, item_id, subject, target_url, message, read, created_at)
               VALUES (?, ?, 'broadcast', 'admin', 0, ?, ?, ?, 0, datetime('now'))`,
              [u.id, u.employee_id || null, subj, targetUrl || '/', s ? `od: ${s} — ${m}` : m]
            );
          }
          await run('COMMIT');
          fanoutCount = users.length;
        } catch (e) {
          await run('ROLLBACK');
          throw e;
        }
      }
    }

    if (push) {
      const ok = await initWebPush();
      if (ok) {
        const subs = await all('SELECT id, endpoint, p256dh, auth FROM push_subscriptions', []);
        const payload = JSON.stringify({
          title: subj || 'Powiadomienie',
          body: s ? `od: ${s} — ${m}` : m,
          tag: 'broadcast',
          data: { url: targetUrl || '/', type: 'broadcast', itemType: 'admin' }
        });
        let sent = 0;
        await Promise.all((subs || []).map(async (sub) => {
          const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
          try {
            await webpush.sendNotification(pushSub, payload);
            sent += 1;
          } catch (e) {
            if (e?.statusCode === 410) {
              try { await run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]); } catch (_) { void 0; }
            }
          }
        }));
        pushCount = sent;
      }
    }

    res.json({ id: historyId, message: 'Powiadomienie wysłane', pushCount, fanoutCount });
  } catch (err) {
    logger.error('Error sending broadcast notification', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/custom', authenticateToken, requirePermission('NOTIFY'), async (req, res) => {
  try {
    const { sender, subject, message, userIds, fanout, push, url } = req.body || {};
    const s = String(sender || '').trim();
    const subj = String(subject || '').trim();
    const m = String(message || '').trim();
    const targetUrl = String(url || '').trim();
    const ids = Array.isArray(userIds) ? userIds.map((v) => parseInt(v, 10)).filter((v) => Number.isInteger(v) && v > 0) : [];

    if (!s || !subj || !m || ids.length === 0) {
      return res.status(400).json({ message: 'Missing sender, subject, message or userIds' });
    }

    const historyResult = await run(
      'INSERT INTO notification_history (type, sender, subject, message, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
      ['custom', s, subj, m]
    );
    const historyId = historyResult.lastID;

    const placeholders = ids.map(() => '?').join(',');
    const recipients = await all(
      `SELECT id, full_name, username, employee_id FROM users WHERE id IN (${placeholders})`,
      ids
    );

    if (recipients && recipients.length > 0) {
      await run('BEGIN TRANSACTION');
      try {
        for (const r of recipients) {
          await run(
            `INSERT INTO notification_history_recipients (history_id, user_id, name)
             VALUES (?, ?, ?)`,
            [historyId, r.id, r.full_name || r.username || '']
          );
        }
        await run('COMMIT');
      } catch (e) {
        await run('ROLLBACK');
        throw e;
      }
    }

    let pushCount = 0;
    let fanoutCount = 0;

    if (fanout) {
      if (recipients && recipients.length > 0) {
        await run('BEGIN TRANSACTION');
        try {
          for (const r of recipients) {
            await run(
              `INSERT INTO notifications (user_id, employee_id, type, item_type, item_id, subject, target_url, message, read, created_at)
               VALUES (?, ?, 'custom', 'admin', 0, ?, ?, ?, 0, datetime('now'))`,
              [r.id, r.employee_id || null, subj, targetUrl || '/', s ? `od: ${s} — ${m}` : m]
            );
          }
          await run('COMMIT');
          fanoutCount = recipients.length;
        } catch (e) {
          await run('ROLLBACK');
          throw e;
        }
      }
    }

    if (push) {
      const ok = await initWebPush();
      if (ok) {
        const subs = await all(
          `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
          ids
        );
        const payload = JSON.stringify({
          title: subj || 'Powiadomienie',
          body: s ? `od: ${s} — ${m}` : m,
          tag: 'custom',
          data: { url: targetUrl || '/', type: 'custom', itemType: 'admin' }
        });
        let sent = 0;
        await Promise.all((subs || []).map(async (sub) => {
          const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
          try {
            await webpush.sendNotification(pushSub, payload);
            sent += 1;
          } catch (e) {
            if (e?.statusCode === 410) {
              try { await run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]); } catch (_) { void 0; }
            }
          }
        }));
        pushCount = sent;
      }
    }

    res.json({ id: historyId, message: 'Powiadomienie wysłane', recipientsCount: ids.length, pushCount, fanoutCount });
  } catch (err) {
    logger.error('Error sending custom notification', { error: err.message });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
