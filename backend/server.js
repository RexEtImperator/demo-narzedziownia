const path = require('path');
const fs = require('fs');
const https = require('https');

// Config & Database
const { PORT, JWT_SECRET, ROOT_DIR, START_DELAY_MS } = require('./config/constants');
const runMigrations = require('./database/migrate');
const { initBackupScheduler, initTokenCleanupScheduler } = require('./services/scheduler');
const { initFullTextSearch } = require('./services/search');
const logger = require('./logger');
const db = require('./database/db');

let wsOptional = null;
try {
  wsOptional = require('ws');
} catch (_) {
  wsOptional = null;
}

const { initializeWebSocket, broadcastMessage } = require('./services/websocket');

// Initialize App
const app = require('./app');

if (!JWT_SECRET) {
  logger.error('Missing required environment variable: JWT_SECRET');
  process.exit(1);
}

let httpServer = null;

function startServer() {
  if (httpServer) return;

  let httpsOptions = null;
  try {
    const keyFile = process.env.SSL_KEY_FILE;
    const crtFile = process.env.SSL_CRT_FILE;

    if (keyFile && crtFile) {
      const keyPath = path.isAbsolute(keyFile) ? keyFile : path.join(ROOT_DIR, keyFile);
      const certPath = path.isAbsolute(crtFile) ? crtFile : path.join(ROOT_DIR, crtFile);

      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        httpsOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath)
        };
        logger.info('SSL Certificates found. Starting server in HTTPS mode.');
      }
    }
  } catch (e) {
    logger.error('Error loading SSL certificates', { error: e.message });
  }

  const onListen = () => {
    let localIp = 'localhost';
    try {
      const { networkInterfaces } = require('os');
      const nets = networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIp = net.address;
            break;
          }
        }
        if (localIp !== 'localhost') break;
      }
    } catch (_) {}

    const protocol = httpsOptions ? 'https' : 'http';
    logger.info(`Server running on ${protocol}://${localIp}:${PORT}`);
  };

  if (httpsOptions) {
    httpServer = https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', onListen);
  } else {
    httpServer = app.listen(PORT, '0.0.0.0', onListen);
  }

  httpServer.on('error', (err) => {
    logger.error('Server listen error', { error: err?.message, code: err?.code });
    try { process.exit(1); } catch (_) {}
  });

  if (wsOptional) {
    initializeWebSocket(httpServer, wsOptional);
    app.set('chat:broadcast', broadcastMessage);
  }

}

function scheduleStartServer() {
  if (START_DELAY_MS > 0) {
    setTimeout(startServer, START_DELAY_MS);
  } else {
    startServer();
  }
}

function syncDbSourceFromEnv() {
  return new Promise((resolve) => {
    const raw = String(process.env.DB_SOURCE || process.env.VITE_DB_SOURCE || '').trim().toLowerCase();
    const dbSource = raw === 'local' || raw === 'supabase' ? raw : null;
    if (!dbSource) return resolve();
    db.run('UPDATE app_config SET db_source = ? WHERE id = 1', [dbSource], () => resolve());
  });
}

// Database migrations + schedulery
runMigrations()
  .then(async () => {
    await syncDbSourceFromEnv();
    initBackupScheduler();
    initTokenCleanupScheduler();
    try {
      initFullTextSearch();
    } catch (e) {
      logger.warn('FTS init failed', { error: e?.message });
    }
  })
  .catch((e) => {
    logger.error('Database migration failed', { error: e.message });
    try { process.exit(1); } catch (_) {}
  });

// === DEBUG: List registered routes at startup ===
setTimeout(() => {
  try {
    const routes = [];
    if (app && app._router && app._router.stack) {
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          const methods = Object.keys(middleware.route.methods)
            .filter((m) => middleware.route.methods[m])
            .map((m) => m.toUpperCase())
            .join(',');
          routes.push(`${methods} ${middleware.route.path}`);
        }
      });
    }
    logger.info('Registered routes', { routes });
  } catch (e) {
    logger.error('Error while listing routes', { error: e.message });
  }
}, 1000);

scheduleStartServer();
