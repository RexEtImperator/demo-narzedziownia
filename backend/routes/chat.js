const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sanitizeInput } = require('../helpers/sanitize');
const { sendDomainError } = require('../helpers/errorHelper');
const db = require('../database/db');
const logger = require('../logger');
const { ROOT_DIR } = require('../config/constants');

// Chat Attachments Setup
const CHAT_ATTACH_DIR = path.join(ROOT_DIR, 'public', 'chat_attachments');
function ensureChatAttachmentsDir() {
  try { if (!fs.existsSync(CHAT_ATTACH_DIR)) fs.mkdirSync(CHAT_ATTACH_DIR, { recursive: true }); } catch (_) { /* noop */ }
}
ensureChatAttachmentsDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, CHAT_ATTACH_DIR); },
  filename: (req, file, cb) => {
    try {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const name = crypto.randomBytes(16).toString('hex') + (ext || '');
      cb(null, name);
    } catch (_) { cb(null, Date.now() + '-' + (file.originalname || 'file')); }
  }
});

const chatUpload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Rate Limiter
const chatMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = req.user?.id || 'anonymous';
    const cid = req.params?.id || 'unknown';
    return `${uid}:${cid}`;
  },
  skip: (req) => req.user?.role === 'administrator',
  message: { error: 'Too many messages in this conversation. Please slow down.' }
});

// Helper for broadcasting
const broadcastToChat = (req, convId, payload, senderName) => {
    try {
        const broadcast = req.app.get('chat:broadcast');
        if (typeof broadcast === 'function') {
            broadcast(convId, payload, senderName);
        }
    } catch (e) {
        logger.error('Error broadcasting chat message', { error: e.message });
    }
};

// Routes

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Chat and messaging
 */

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: Get user conversations
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 *       500:
 *         description: Server error
 */
// Get conversations
router.get('/conversations', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  db.all('SELECT c.id FROM chat_conversations c JOIN chat_participants p ON p.conversation_id = c.id WHERE p.user_id = ? ORDER BY c.updated_at DESC', [uid], (err, rows) => {
    if (err) {
      logger.error('Error fetching conversations', { error: err.message, userId: uid });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    }
    const convIds = (rows || []).map(r => r.id);
    if (convIds.length === 0) return res.json([]);
    const placeholders = convIds.map(() => '?').join(',');
    db.all(`SELECT m.conversation_id, m.id, m.content, m.created_at, m.sender_id AS sender_id, u.full_name AS sender_name, u.username AS sender_username
            FROM chat_messages m
            LEFT JOIN users u ON u.id = m.sender_id
            WHERE m.id IN (
              SELECT MAX(id) FROM chat_messages WHERE conversation_id IN (${placeholders}) GROUP BY conversation_id
            )`, convIds, (mErr, lastMsgs) => {
      if (mErr) {
        logger.error('Error fetching last messages', { error: mErr.message, userId: uid });
      }
      const lastMap = new Map((lastMsgs || []).map(m => [m.conversation_id, m]));
      const fetchTitles = (idx, acc) => {
        if (idx >= convIds.length) return res.json(acc);
        const id = convIds[idx];
        db.all('SELECT u.id, u.full_name, u.username FROM users u JOIN chat_participants p ON p.user_id = u.id WHERE p.conversation_id = ?', [id], (pErr, parts) => {
          const others = (parts || []).filter(p => Number(p.id) !== uid);
          const title = others.length ? others.map(p => p.full_name || p.username || `#${p.id}`).join(', ') : `#${id}`;
          const last = lastMap.get(id) || null;
          const preview = (last?.content || '').slice(0, 140);
          const sqlUnread = `
            SELECT COUNT(*) AS unread
            FROM chat_messages m
            WHERE m.conversation_id = ?
              AND m.sender_id != ?
              AND NOT EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = m.id AND r.user_id = ?)
          `;
          db.get(sqlUnread, [id, uid, uid], (cErr, cRow) => {
            const unread = cErr ? 0 : Number(cRow?.unread || 0);
            acc.push({
              id,
              title,
              last_message_preview: preview,
              last_message_at: last?.created_at || null,
              last_sender_name: (last?.sender_name || last?.sender_username || null),
              last_sender_id: (last?.sender_id || null),
              unread_count: unread
            });
            fetchTitles(idx + 1, acc);
          });
        });
      };
      fetchTitles(0, []);
    });
  });
});

// Admin: delete all chat conversations and related data
router.delete('/conversations/all', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const counts = { attachments: 0, reads: 0, messages: 0, participants: 0, typing: 0, blocks: 0, conversations: 0 };
  // Delete attachment files first
  db.all('SELECT filename FROM chat_attachments', [], (aErr, files) => {
    if (!aErr) {
      (files || []).forEach(f => {
        const p = path.join(CHAT_ATTACH_DIR, String(f.filename || ''));
        fs.unlink(p, () => {});
      });
    }
    // Cleanup tables and collect counts of deleted rows
    db.run('DELETE FROM chat_attachments', [], function () {
      counts.attachments = Number(this?.changes || 0);
      db.run('DELETE FROM chat_message_reads', [], function () {
        counts.reads = Number(this?.changes || 0);
        db.run('DELETE FROM chat_messages', [], function () {
          counts.messages = Number(this?.changes || 0);
          db.run('DELETE FROM chat_participants', [], function () {
            counts.participants = Number(this?.changes || 0);
            db.run('DELETE FROM chat_typing_events', [], function () {
              counts.typing = Number(this?.changes || 0);
              db.run('DELETE FROM chat_blocks', [], function () {
                counts.blocks = Number(this?.changes || 0);
                db.run('DELETE FROM chat_conversations', [], function (delErr) {
                  if (delErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', delErr.message);
                  counts.conversations = Number(this?.changes || 0);
                  res.json({ removed: true, counts });
                });
              });
            });
          });
        });
      });
    });
  });
});

// Create conversation
router.post('/conversations', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const { recipient_id, recipient_ids } = req.body || {};
  
  if (!Array.isArray(recipient_ids) && !recipient_id) {
    return res.status(400).json({ message: 'Missing recipient_id or recipient_ids array' });
  }

  const ids = [];
  if (Array.isArray(recipient_ids)) {
    for (const n of recipient_ids) {
      const num = Number(n);
      if (Number.isNaN(num) || num <= 0) {
        return res.status(400).json({ message: `Invalid recipient ID: ${n}` });
      }
      ids.push(num);
    }
  }

  if (recipient_id) {
    const rid = Number(recipient_id);
    if (Number.isNaN(rid) || rid <= 0) {
      return res.status(400).json({ message: 'Invalid recipient_id format' });
    }
    ids.push(rid);
  }

  const uniqueIds = Array.from(new Set(ids.filter(n => n && n !== uid)));
  if (uniqueIds.length === 0) return res.sendError(400, 'EMPLOYEE_INVALID_ID', 'employees.errors.invalidId', 'Invalid recipients');
  // For 1:1, reuse existing conversation; for groups, always create new
  if (uniqueIds.length === 1) {
    const rid = uniqueIds[0];
    db.all('SELECT c.id FROM chat_conversations c WHERE EXISTS (SELECT 1 FROM chat_participants p WHERE p.conversation_id=c.id AND p.user_id=?) AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.conversation_id=c.id AND p.user_id=?)', [uid, rid], (err, rows) => {
      if (err) {
        logger.error('Error finding conversation', { error: err.message, userId: uid, recipientId: rid });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
      }
      const existing = (rows || []).map(r => r.id);
      const next = () => {
        db.run('INSERT INTO chat_conversations (created_at, updated_at) VALUES (datetime("now"), datetime("now"))', [], function (cErr) {
          if (cErr) {
            logger.error('Error creating conversation', { error: cErr.message, userId: uid });
            return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', cErr.message);
          }
          const convId = this.lastID;
          db.run('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)', [convId, uid], (pErr1) => {
            if (pErr1) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', pErr1.message);
            db.run('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)', [convId, rid], (pErr2) => {
              if (pErr2) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', pErr2.message);
              res.status(201).json({ id: convId });
            });
          });
        });
      };
      if (existing.length) {
        return res.json({ id: existing[0] });
      } else {
        next();
      }
    });
    return;
  }
  db.run('INSERT INTO chat_conversations (created_at, updated_at) VALUES (datetime("now"), datetime("now"))', [], function (cErr) {
    if (cErr) {
      logger.error('Error creating conversation', { error: cErr.message, userId: uid });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', cErr.message);
    }
    const convId = this.lastID;
    db.run('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)', [convId, uid], (pErr1) => {
      if (pErr1) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', pErr1.message);
      const stmt = db.prepare('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)');
      uniqueIds.forEach((rid) => stmt.run([convId, rid]));
      stmt.finalize((pErr2) => {
        if (pErr2) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', pErr2.message);
        res.status(201).json({ id: convId });
      });
    });
  });
});

// Get messages
router.get('/chat/conversations/:id/messages', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  const beforeRaw = String(req.query?.before || '').trim();
  let whereClause = 'm.conversation_id = ?';
  const params = [convId];
  let limitClause = '';
  if (beforeRaw) {
    const asNum = Number(beforeRaw);
    if (!Number.isNaN(asNum) && asNum > 0) {
      whereClause += ' AND m.id < ?';
      params.push(asNum);
      limitClause = ' LIMIT 50';
    } else {
      let ts = Date.parse(beforeRaw);
      if (!Number.isNaN(ts)) {
        const iso = new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
        whereClause += ' AND m.created_at < ?';
        params.push(iso);
        limitClause = ' LIMIT 50';
      }
    }
  }
  db.get('SELECT 1 FROM chat_conversations WHERE id = ?', [convId], (convErr, convRow) => {
    if (convErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', convErr.message);
    if (!convRow) return res.sendError(404, 'NOT_FOUND');
    db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
      if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
      if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    const sql = `SELECT m.id, m.sender_id, u.full_name AS sender_name, m.content, m.created_at, m.reply_to_id, pm.content AS reply_to_content, pu.full_name AS reply_to_sender_name
                 FROM chat_messages m 
                 LEFT JOIN users u ON u.id = m.sender_id
                 LEFT JOIN chat_messages pm ON pm.id = m.reply_to_id
                 LEFT JOIN users pu ON pu.id = pm.sender_id
                 WHERE ${whereClause}
                 ORDER BY m.created_at ASC, m.id ASC${limitClause}`;
      db.all(sql, params, (mErr, rows) => {
        if (mErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', mErr.message);
        const messages = rows || [];
        db.all('SELECT message_id FROM chat_message_reads WHERE user_id = ? AND message_id IN (SELECT id FROM chat_messages WHERE conversation_id = ?)', [uid, convId], (rErr, readRows) => {
          if (rErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', rErr.message);
          const readSet = new Set((readRows || []).map(r => r.message_id));
          db.all('SELECT id, message_id, filename, original_name, mime_type, size, url FROM chat_attachments WHERE conversation_id = ?', [convId], (aErr, atts) => {
            if (aErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', aErr.message);
            const attMap = new Map();
            (atts || []).forEach(a => { const list = attMap.get(a.message_id) || []; list.push(a); attMap.set(a.message_id, list); });
            db.all('SELECT r.message_id, r.user_id, r.read_at, u.full_name, u.username FROM chat_message_reads r JOIN users u ON u.id = r.user_id WHERE r.message_id IN (SELECT id FROM chat_messages WHERE conversation_id = ?) ORDER BY r.read_at ASC', [convId], (rbErr, rbRows) => {
              if (rbErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', rbErr.message);
              const rbMap = new Map();
              (rbRows || []).forEach(r => {
                const list = rbMap.get(r.message_id) || [];
                list.push({ user_id: r.user_id, name: r.full_name || r.username || String(r.user_id), read_at: r.read_at });
                rbMap.set(r.message_id, list);
              });
              const enriched = messages.map(m => ({
                ...m,
                read_by_me: readSet.has(m.id),
                read_by: rbMap.get(m.id) || [],
                read_by_names: (rbMap.get(m.id) || []).map(x => x.name),
                attachments: attMap.get(m.id) || []
              }));
              res.json(enriched);
            });
          });
        });
      });
    });
  });
});

// Send message
router.post('/conversations/:id/messages', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  const content = sanitizeInput(String((req.body?.content || '').trim()));
  const replyToId = req.body?.reply_to_id ? Number(req.body.reply_to_id) : null;

  if (!convId || !content) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid request');
  if (content.length > 5000) {
    return res.sendError(400, 'MESSAGE_TOO_LONG', 'chat.errors.messageTooLong', 'Message exceeds 5000 characters');
  }
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    db.get('SELECT 1 FROM chat_blocks WHERE conversation_id = ? AND blocked_user_id = ?', [convId, uid], (bErr, bRow) => {
      if (bErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', bErr.message);
      if (bRow) return sendDomainError(res, 'PERMISSION_DENIED');
    db.run('INSERT INTO chat_messages (conversation_id, sender_id, content, created_at, reply_to_id) VALUES (?, ?, ?, datetime("now"), ?)', [convId, uid, content, replyToId], function (insErr) {
      if (insErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', insErr.message);
      const id = this.lastID;
      const sql = `SELECT m.id, m.sender_id, u.full_name AS sender_name, m.content, m.created_at, m.reply_to_id, pm.content AS reply_to_content, pu.full_name AS reply_to_sender_name
                   FROM chat_messages m 
                   LEFT JOIN users u ON u.id = m.sender_id
                   LEFT JOIN chat_messages pm ON pm.id = m.reply_to_id
                   LEFT JOIN users pu ON pu.id = pm.sender_id
                   WHERE m.id = ?`;
      db.get(sql, [id], (selErr, row) => {
        if (selErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', selErr.message);
        db.run('UPDATE chat_conversations SET updated_at = datetime("now") WHERE id = ?', [convId]);
        broadcastToChat(req, convId, row, row?.sender_name || '');
        res.status(201).json(row);
      });
    });
    });
  });
});

// Update message
router.put('/messages/:id', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const msgId = Number(req.params.id || 0) || 0;
  const content = sanitizeInput(String((req.body?.content || '').trim()));
  if (!msgId || !content) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid request');
  if (content.length > 5000) {
    return res.sendError(400, 'MESSAGE_TOO_LONG', 'chat.errors.messageTooLong', 'Message exceeds 5000 characters');
  }

  db.get('SELECT conversation_id, sender_id FROM chat_messages WHERE id = ?', [msgId], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return res.sendError(404, 'NOT_FOUND', 'chat.errors.notFound', 'Message not found');
    if (Number(row.sender_id) !== uid) return sendDomainError(res, 'PERMISSION_DENIED');

    db.run('UPDATE chat_messages SET content = ? WHERE id = ?', [content, msgId], function(updErr) {
       if (updErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', updErr.message);
       
       // Return updated message
       const sql = `SELECT m.id, m.sender_id, u.full_name AS sender_name, m.content, m.created_at, m.reply_to_id, pm.content AS reply_to_content, pu.full_name AS reply_to_sender_name
                    FROM chat_messages m 
                    LEFT JOIN users u ON u.id = m.sender_id
                    LEFT JOIN chat_messages pm ON pm.id = m.reply_to_id
                    LEFT JOIN users pu ON pu.id = pm.sender_id
                    WHERE m.id = ?`;
       db.get(sql, [msgId], (selErr, updatedRow) => {
         if (selErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', selErr.message);
         broadcastToChat(req, row.conversation_id, { ...updatedRow, type: 'update' }, updatedRow?.sender_name || '');
         res.json(updatedRow);
       });
    });
  });
});

// Delete message
router.delete('/messages/:id', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const msgId = Number(req.params.id || 0) || 0;
  if (!msgId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid request');

  db.get('SELECT conversation_id, sender_id FROM chat_messages WHERE id = ?', [msgId], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return res.sendError(404, 'NOT_FOUND', 'chat.errors.notFound', 'Message not found');
    if (Number(row.sender_id) !== uid) return sendDomainError(res, 'PERMISSION_DENIED');
    
    const convId = row.conversation_id;

    // Delete attachments first
    db.all('SELECT filename FROM chat_attachments WHERE message_id = ?', [msgId], (aErr, files) => {
      if (!aErr) {
        (files || []).forEach(f => {
          try { const p = path.join(CHAT_ATTACH_DIR, String(f.filename || '')); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* noop */ }
        });
      }
      db.run('DELETE FROM chat_attachments WHERE message_id = ?', [msgId], () => {
        db.run('DELETE FROM chat_message_reads WHERE message_id = ?', [msgId], () => {
          db.run('DELETE FROM chat_messages WHERE id = ?', [msgId], (delErr) => {
             if (delErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', delErr.message);
             broadcastToChat(req, convId, { id: msgId, type: 'delete' }, '');
             res.json({ success: true });
          });
        });
      });
    });
  });
});

// Mark as read
router.post('/conversations/:id/read', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    db.all('SELECT id FROM chat_messages WHERE conversation_id = ? AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)', [convId, uid], (mErr, msgRows) => {
      if (mErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', mErr.message);
      const stmt = db.prepare('INSERT OR IGNORE INTO chat_message_reads (message_id, user_id, read_at) VALUES (?, ?, datetime("now"))');
      (msgRows || []).forEach(r => stmt.run([r.id, uid]));
      stmt.finalize(() => res.json({ marked: (msgRows || []).length }));
    });
  });
});

// Mark as unread
router.post('/conversations/:id/unread', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    db.all('SELECT r.message_id FROM chat_message_reads r WHERE r.user_id = ? AND r.message_id IN (SELECT id FROM chat_messages WHERE conversation_id = ?)', [uid, convId], (selErr, rows) => {
      if (selErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', selErr.message);
      const ids = (rows || []).map(r => r.message_id);
      if (!ids.length) return res.json({ cleared: 0 });
      const placeholders = ids.map(() => '?').join(',');
      db.run(`DELETE FROM chat_message_reads WHERE user_id = ? AND message_id IN (${placeholders})`, [uid, ...ids], (delErr) => {
        if (delErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', delErr.message);
        res.json({ cleared: ids.length });
      });
    });
  });
});

// Block user in conversation
router.post('/chat/conversations/:id/block', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    db.all('SELECT user_id FROM chat_participants WHERE conversation_id = ? AND user_id != ?', [convId, uid], (pErr, users) => {
      if (pErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', pErr.message);
      const ids = (users || []).map(r => Number(r.user_id || 0)).filter(Boolean);
      if (!ids.length) return res.json({ blocked: 0 });
      const stmt = db.prepare('INSERT OR IGNORE INTO chat_blocks (conversation_id, blocked_user_id, blocked_by, blocked_at) VALUES (?, ?, ?, datetime("now"))');
      ids.forEach(id => stmt.run([convId, id, uid]));
      stmt.finalize((iErr) => {
        if (iErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', iErr.message);
        res.json({ blocked: ids.length });
      });
    });
  });
});

// Delete conversation (or leave)
router.delete('/conversations/:id', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');

    // Remove only the requesting user from participants
    db.run('DELETE FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (rmErr) => {
      if (rmErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', rmErr.message);

      // Check if any participants remain; if none, cleanup the conversation fully
      db.get('SELECT COUNT(*) AS cnt FROM chat_participants WHERE conversation_id = ?', [convId], (cErr, cRow) => {
        if (cErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', cErr.message);
        const remaining = Number(cRow?.cnt || 0);
        if (remaining > 0) {
          return res.json({ removedForUser: true, remainingParticipants: remaining });
        }

        // No participants left — perform full cleanup
        db.all('SELECT filename FROM chat_attachments WHERE conversation_id = ?', [convId], (aErr, files) => {
          if (!aErr) {
            (files || []).forEach(f => {
              try { const p = path.join(CHAT_ATTACH_DIR, String(f.filename || '')); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* noop */ }
            });
          }
          db.run('DELETE FROM chat_attachments WHERE conversation_id = ?', [convId], () => {
            db.run('DELETE FROM chat_message_reads WHERE message_id IN (SELECT id FROM chat_messages WHERE conversation_id = ?)', [convId], () => {
              db.run('DELETE FROM chat_messages WHERE conversation_id = ?', [convId], () => {
                db.run('DELETE FROM chat_typing_events WHERE conversation_id = ?', [convId], () => {
                  db.run('DELETE FROM chat_blocks WHERE conversation_id = ?', [convId], () => {
                    db.run('DELETE FROM chat_conversations WHERE id = ?', [convId], (delErr) => {
                      if (delErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', delErr.message);
                      res.json({ removed: 1, removedForUser: true, remainingParticipants: 0 });
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
});

// Unread count
router.get('/chat/unread-count', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const sql = `
    SELECT COUNT(*) AS unread
    FROM chat_messages m
    WHERE m.conversation_id IN (SELECT conversation_id FROM chat_participants WHERE user_id = ?)
      AND m.sender_id != ?
      AND NOT EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = m.id AND r.user_id = ?)
  `;
  db.get(sql, [uid, uid, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    res.json({ unread: Number(row?.unread || 0) });
  });
});

// Upload attachments to message
router.post('/conversations/:id/attachments', authenticateToken, chatUpload.array('files', 6), (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  const content = String((req.body?.content || '').trim());
  if (content.length > 5000) {
    return res.sendError(400, 'MESSAGE_TOO_LONG', 'chat.errors.messageTooLong', 'Message exceeds 5000 characters');
  }
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    db.get('SELECT 1 FROM chat_blocks WHERE conversation_id = ? AND blocked_user_id = ?', [convId, uid], (bErr, bRow) => {
      if (bErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', bErr.message);
      if (bRow) return sendDomainError(res, 'PERMISSION_DENIED');
    db.run('INSERT INTO chat_messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, datetime("now"))', [convId, uid, content], function (insErr) {
      if (insErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', insErr.message);
      const msgId = this.lastID;
      const files = Array.isArray(req.files) ? req.files : [];
      const stmt = db.prepare('INSERT INTO chat_attachments (conversation_id, message_id, filename, original_name, mime_type, size, url) VALUES (?, ?, ?, ?, ?, ?, ?)');
      files.forEach(f => {
        const url = `/chat_attachments/${f.filename}`;
        stmt.run([convId, msgId, f.filename, f.originalname || '', f.mimetype || '', Number(f.size || 0), url]);
      });
      stmt.finalize(() => {
        db.get('SELECT m.id, m.sender_id, u.full_name AS sender_name, m.content, m.created_at FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?', [msgId], (selErr, row2) => {
          if (selErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', selErr.message);
          db.run('UPDATE chat_conversations SET updated_at = datetime("now") WHERE id = ?', [convId]);
          broadcastToChat(req, convId, row2, row2?.sender_name || '');
          res.status(201).json(row2);
        });
      });
    });
    });
  });
});

// Typing history
router.get('/conversations/:id/typing', authenticateToken, (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const convId = Number(req.params.id || 0) || 0;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  if (!convId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid conversation');
  db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (err, row) => {
    if (err) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    if (!row) return sendDomainError(res, 'PERMISSION_DENIED');
    db.all('SELECT e.user_id, u.full_name AS name, u.username, e.created_at FROM chat_typing_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.conversation_id = ? ORDER BY e.created_at DESC LIMIT ?', [convId, limit], (eErr, rows) => {
      if (eErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', eErr.message);
      res.json(rows || []);
    });
  });
});

// Attachments to existing message (rarely used but present)
router.post('/chat/messages/:id/attachments', authenticateToken, chatUpload.array('files', 10), (req, res) => {
  const uid = Number(req.user?.id || 0) || 0;
  const msgId = Number(req.params.id || 0) || 0;
  if (!msgId) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Invalid message');
  db.get('SELECT id, conversation_id, sender_id FROM chat_messages WHERE id = ?', [msgId], (mErr, msg) => {
    if (mErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', mErr.message);
    if (!msg) return res.sendError(404, 'NOT_FOUND');
    const convId = Number(msg.conversation_id || 0) || 0;
    db.get('SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid], (pErr, part) => {
      if (pErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', pErr.message);
      if (!part) return sendDomainError(res, 'PERMISSION_DENIED');
      if (Number(msg.sender_id) !== uid) return sendDomainError(res, 'PERMISSION_DENIED');
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) return res.sendError(400, 'INTERNAL_SERVER_ERROR', 'errors.server', 'No files');
      const stmt = db.prepare('INSERT INTO chat_attachments (conversation_id, message_id, filename, original_name, mime_type, size, url) VALUES (?, ?, ?, ?, ?, ?, ?)');
      files.forEach(f => {
        const url = `/chat_attachments/${f.filename}`;
        stmt.run([convId, msgId, f.filename, f.originalname || '', f.mimetype || '', Number(f.size || 0), url]);
      });
      stmt.finalize((finErr) => {
        if (finErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', finErr.message);
        db.all('SELECT id, message_id, filename, original_name, mime_type, size, url FROM chat_attachments WHERE message_id = ? ORDER BY id ASC', [msgId], (aErr, rows) => {
          if (aErr) return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', aErr.message);
          broadcastToChat(req, convId, { id: msg.id, sender_id: msg.sender_id }, '');
          res.status(201).json({ message_id: msgId, attachments: rows });
        });
      });
    });
  });
});

// Helper for validating URL
function validateUrl(value) {
    try {
        new URL(value);
        return true;
    } catch (_) {
        return false;
    }
}

// Open Graph
router.get('/og', authenticateToken, asyncHandler(async (req, res) => {
  const rawUrl = String(req.query?.url || '').trim();
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  // Walidacja URL'a
  if (!validateUrl(rawUrl)) {
    return res.status(400).json({ error: 'Invalid or unsafe URL' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => { try { controller.abort(); } catch (_) {} }, 5000);
  
  try {
    const resp = await fetch(rawUrl, { 
      signal: controller.signal, 
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeoutId);
    if (!resp || !resp.ok) return res.status(502).json({ error: 'Upstream fetch failed' });
    const html = await resp.text();
    const pick = (prop) => {
      const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
      const m = html.match(re);
      return m ? m[1] : null;
    };
    const title = pick('og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null);
    const description = pick('og:description') || null;
    let image = pick('og:image') || null;
    if (image && image.startsWith('/')) {
      try {
        const u = new URL(rawUrl);
        image = `${u.origin}${image}`;
      } catch (_) {}
    }
    return res.json({ title, description, image, url: rawUrl });
  } catch (err) {
    clearTimeout(timeoutId);
    return res.status(502).json({ error: 'Fetch error' });
  }
}));

module.exports = router;
