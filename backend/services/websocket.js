const jwt = require('jsonwebtoken');
const logger = require('../logger');
const db = require('../database/db');
const { JWT_SECRET } = require('../config/constants');

let wss = null;
let wsClients = new Map();
const typingThrottle = new Map();
const HEARTBEAT_TIMEOUT_MS = 45000;
const HEARTBEAT_CHECK_INTERVAL_MS = 60000;
let heartbeatInterval = null;

function initializeWebSocket(server, wsModule) {
  if (!wsModule) return null;
  
  const WebSocketServer = wsModule.Server;
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = String(request.url || '');
      if (!url.startsWith('/api/chat/ws')) return;

      const qs = url.includes('?') ? url.split('?')[1] : '';
      const params = new URLSearchParams(qs);
      const token = params.get('token') || '';

      let payload = null;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        logger.warn('WebSocket auth failed:', { error: err.message, ip: request.socket.remoteAddress });
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const userId = Number(payload?.id || payload?.user_id || payload?.uid || 0) || 0;
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = userId;
        if (!wsClients.has(userId)) wsClients.set(userId, new Set());
        wsClients.get(userId).add(ws);
        ws.lastHeartbeat = Date.now();

        ws.on('error', (err) => {
          logger.error(`WebSocket error for user ${userId}:`, { error: err.message });
          const set = wsClients.get(userId);
          if (set) {
            set.delete(ws);
            if (set.size === 0) wsClients.delete(userId);
          }
        });

        ws.on('message', (data) => {
          try {
            if (!data) return;
            let msg;
            try {
              msg = JSON.parse(String(data));
            } catch (e) {
              logger.error('Invalid JSON received over WS', { error: e.message });
              return;
            }

            if (!msg || typeof msg !== 'object') return;
            if (!msg.type) {
              logger.warn('WS message missing type');
              return;
            }

            if (msg.type === 'typing' && msg.conversationId) {
              const convId = Number(msg.conversationId || 0) || 0;
              const key = `${userId}:${convId}`;
              const now = Date.now();
              const last = typingThrottle.get(key) || 0;
              if (now - last < 1000) return;
              typingThrottle.set(key, now);

              db.all('SELECT u.full_name AS name FROM users u WHERE u.id = ?', [userId], (e, rows) => {
                const senderName = (rows && rows[0] && rows[0].name) || '';
                db.run('INSERT INTO chat_typing_events (conversation_id, user_id, created_at) VALUES (?, ?, datetime("now"))', [convId, userId]);
                db.all('SELECT user_id FROM chat_participants WHERE conversation_id = ?', [convId], (err2, rows2) => {
                  const wsPayload = JSON.stringify({ type: 'chat:typing', conversationId: convId, senderName });
                  (rows2 || []).forEach(r => {
                    const set = wsClients.get(Number(r.user_id));
                    if (set) {
                      for (const w of set) { try { w.send(wsPayload); } catch (_) {} }
                    }
                  });
                });
              });
            } else if (msg.type === 'heartbeat' || msg.type === 'chat:heartbeat') {
              ws.lastHeartbeat = Date.now();
              try {
                const wsPayload = JSON.stringify({ type: 'chat:heartbeat', ts: Date.now() });
                ws.send(wsPayload);
              } catch (_) {}
            }
          } catch (err) {
            logger.error('Error processing WS message', { error: err.message });
          }
        });

        ws.on('close', () => {
          const set = wsClients.get(userId);
          if (set) { set.delete(ws); if (set.size === 0) wsClients.delete(userId); }
        });
      });
    } catch (err) {
      logger.error('Error handling upgrade', { error: err.message });
      try { socket.destroy(); } catch (_) {}
    }
  });

  heartbeatInterval = setInterval(() => {
    try {
      const now = Date.now();
      for (const [uid, set] of wsClients.entries()) {
        for (const ws of set) {
          try {
            const last = Number(ws.lastHeartbeat || 0);
            if (now - last > HEARTBEAT_TIMEOUT_MS) {
              try { ws.terminate(); } catch (_) {}
              set.delete(ws);
            }
          } catch (_) {}
        }
        if (set.size === 0) wsClients.delete(uid);
      }
    } catch (_) {}
  }, HEARTBEAT_CHECK_INTERVAL_MS);

  return wss;
}

function broadcastMessage(conversationId, messageRow, senderName) {
  try {
    db.all('SELECT u.id, u.full_name, u.username FROM users u JOIN chat_participants p ON p.user_id = u.id WHERE p.conversation_id = ?', [conversationId], (pErr, parts) => {
      if (pErr) return;
      const userIds = (parts || []).map(r => Number(r.id));
      const senderId = Number(messageRow?.sender_id || 0) || 0;
      const title = (parts || [])
        .filter(p => Number(p.id) !== senderId)
        .map(p => p.full_name || p.username || `#${p.id}`)
        .join(', ') || `#${conversationId}`;
      const wsPayload = JSON.stringify({ type: 'chat:message', conversationId, message: messageRow, senderName, senderId, conversationTitle: title });
      userIds.forEach((uid) => {
        const set = wsClients.get(uid);
        if (set) {
          for (const ws of set) {
            try { ws.send(wsPayload); } catch (_) {}
          }
        }
      });
    });
  } catch (_) {}
}

function gracefulWsShutdown() {
  logger.info('Closing WebSocket server...');
  return new Promise((resolve) => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    wsClients.forEach((set) => {
      set.forEach((ws) => ws.terminate());
    });
    wsClients.clear();
    if (wss) {
      wss.close(() => {
        logger.info('WebSocket server closed.');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initializeWebSocket,
  broadcastMessage,
  gracefulWsShutdown
};
