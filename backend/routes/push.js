const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logger');
const { encrypt, decrypt } = require('../helpers/crypto');

// VAPID State
let vapidPublicKey = null;
let vapidPrivateKey = null;
let vapidSubject = 'mailto:admin@example.com';
let isVapidInitialized = false;

// Async initialization of VAPID keys
const initVapid = async () => {
  if (isVapidInitialized) return;

  try {
    // 1. Try loading from Database
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT vapid_public_key, vapid_private_key, vapid_subject FROM app_config WHERE id = 1', [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (row && row.vapid_public_key && row.vapid_private_key) {
      vapidPublicKey = row.vapid_public_key;
      let rawPrivateKey = row.vapid_private_key;
      vapidSubject = row.vapid_subject || vapidSubject;

      // Check if encrypted
      if (rawPrivateKey.includes(':')) {
        try {
          const decrypted = decrypt(rawPrivateKey);
          // Check if decryption actually worked (helper returns original text on error)
          if (decrypted === rawPrivateKey) {
             logger.error('Failed to decrypt VAPID private key from DB (decryption returned original text)');
             vapidPrivateKey = null;
          } else {
             vapidPrivateKey = decrypted;
          }
        } catch (decryptError) {
          logger.error('Failed to decrypt VAPID private key from DB', { error: decryptError.message });
          vapidPrivateKey = null;
        }
      } else {
        // Not encrypted - encrypt and save back
        logger.info('Migrating VAPID private key to encrypted format...');
        try {
          const encryptedKey = encrypt(rawPrivateKey);
          vapidPrivateKey = rawPrivateKey; // Use raw for now
          
          db.run('UPDATE app_config SET vapid_private_key = ? WHERE id = 1', [encryptedKey], (err) => {
            if (err) logger.error('Failed to save encrypted VAPID key', { error: err.message });
            else logger.info('VAPID private key encrypted successfully');
          });
        } catch (encryptError) {
           logger.error('Failed to encrypt VAPID private key', { error: encryptError.message });
           vapidPrivateKey = rawPrivateKey;
        }
      }

      // Ensure keys are URL-safe Base64 (remove padding and replace unsafe chars)
      // Web-push library is strict about no padding ("=") and URL-safe chars
      if (vapidPrivateKey && typeof vapidPrivateKey === 'string') {
        // First check if it looks like hex (sometimes happens if saved incorrectly)
        // If it's a valid hex string of correct length (e.g. 64 chars for 32 bytes), maybe convert to base64?
        // But usually VAPID keys are base64url encoded.
        
        // Just standard cleanup
        vapidPrivateKey = vapidPrivateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      if (vapidPublicKey && typeof vapidPublicKey === 'string') {
        vapidPublicKey = vapidPublicKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }

      // If keys are missing or invalid (e.g. decryption failed), don't initialize from DB
      if (!vapidPublicKey || !vapidPrivateKey) {
         logger.warn('VAPID keys from DB are invalid or incomplete, falling back to Environment variables');
         // Do not return here, let it fall through to Env fallback
      } else {
        logger.info('Initializing VAPID details', { 
            subject: vapidSubject,
            publicKeyLength: vapidPublicKey ? vapidPublicKey.length : 0,
            privateKeyLength: vapidPrivateKey ? vapidPrivateKey.length : 0
        });

        try {
          webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
          isVapidInitialized = true;
          logger.info('VAPID initialized from Database');
          return;
        } catch (e) {
          logger.error('Invalid VAPID keys from Database', { error: e.message });
        }
      }
    }
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('no such table: app_config')) {
      logger.error('Error loading VAPID from DB', { error: message });
    }
  }

  // 2. Fallback to Environment Variables
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  const envSubject = process.env.VAPID_SUBJECT;

  if (envPublic && envPrivate) {
    vapidPublicKey = envPublic;
    if (typeof envPrivate === 'string' && envPrivate.includes(':')) {
      const decrypted = decrypt(envPrivate);
      if (decrypted === envPrivate) {
        logger.warn('VAPID_PRIVATE_KEY from Env looks encrypted but could not be decrypted; push notifications will not work');
        vapidPrivateKey = null;
      } else {
        vapidPrivateKey = decrypted;
      }
    } else {
      vapidPrivateKey = envPrivate;
    }
    vapidSubject = envSubject || vapidSubject;

    // Ensure keys are URL-safe Base64 (remove padding and replace unsafe chars)
    if (vapidPrivateKey && typeof vapidPrivateKey === 'string') {
      vapidPrivateKey = vapidPrivateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    if (vapidPublicKey && typeof vapidPublicKey === 'string') {
      vapidPublicKey = vapidPublicKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    logger.info('Initializing VAPID details from Env', { 
        subject: vapidSubject,
        publicKeyLength: vapidPublicKey ? vapidPublicKey.length : 0,
        privateKeyLength: vapidPrivateKey ? vapidPrivateKey.length : 0
    });

    if (vapidPublicKey && vapidPrivateKey) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        isVapidInitialized = true;
        logger.info('VAPID initialized from Environment');
      } catch (e) {
        logger.error('Invalid VAPID keys from Env', { error: e.message });
        vapidPublicKey = null;
        vapidPrivateKey = null;
      }
    } else {
      logger.warn('VAPID keys are missing or invalid. Push notifications will not work.');
    }
  } else {
    logger.warn('VAPID keys are missing. Push notifications will not work.');
  }
};

/**
 * @swagger
 * tags:
 *   name: Push
 *   description: Web Push Notifications
 */

/**
 * @swagger
 * /push/config:
 *   get:
 *     summary: Get VAPID public key
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: VAPID public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 */
// GET /api/push/config
// Returns public key for frontend to subscribe
router.get('/config', authenticateToken, async (req, res) => {
  // Ensure initialized
  if (!isVapidInitialized) {
    await initVapid();
  }

  if (!vapidPublicKey) {
    return res.status(500).json({ error: 'Push notifications not configured on server' });
  }
  res.json({ publicKey: vapidPublicKey });
});

/**
 * @swagger
 * /push/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - keys
 *             properties:
 *               endpoint:
 *                 type: string
 *               keys:
 *                 type: object
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *     responses:
 *       201:
 *         description: Subscription saved
 */
// POST /api/push/subscribe
// Save subscription to DB
router.post('/subscribe', authenticateToken, (req, res) => {
  const subscription = req.body;
  const userId = req.user.id;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const { endpoint, keys } = subscription;
  const p256dh = keys ? keys.p256dh : '';
  const auth = keys ? keys.auth : '';

  // Insert or ignore
  // We use ON CONFLICT to avoid duplicates for same user+endpoint
  // SQLite syntax for upsert:
  const query = `
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, endpoint) DO UPDATE SET
      p256dh=excluded.p256dh,
      auth=excluded.auth,
      updated_at=excluded.updated_at
  `;

  db.run(query, [userId, endpoint, p256dh, auth], function(err) {
    if (err) {
      logger.error('Error saving push subscription', { error: err.message });
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(201).json({ message: 'Subscription saved' });
  });
});

/**
 * @swagger
 * /push/subscribe:
 *   delete:
 *     summary: Unsubscribe from push notifications
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription removed
 */
// DELETE /api/push/subscribe
// Remove subscription from DB
router.delete('/subscribe', authenticateToken, (req, res) => {
  const { endpoint } = req.body;
  const userId = req.user.id;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }

  const query = 'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?';
  db.run(query, [userId, endpoint], function(err) {
    if (err) {
      logger.error('Error deleting push subscription', { error: err.message });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Subscription removed' });
  });
});

// POST /api/push/test (Optional, for debugging)
router.post('/test', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const payload = JSON.stringify({ title: 'Test', body: 'This is a test notification' });
  const isTestEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'test'
    || !!process.env.VITEST
    || !!process.env.VITEST_WORKER_ID
    || !!process.env.VITEST_POOL_ID;

  db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Db error' });
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'No subscription found' });

    let sent = 0;
    const promises = rows.map(sub => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      return webpush.sendNotification(pushSub, payload)
        .then(() => sent++)
        .catch(err => {
          if (err.statusCode === 410) {
            // Expired/Gone - delete
            db.run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
          }
          if (!isTestEnv) {
            logger.warn('Push send error', { error: err.message });
          }
        });
    });

    Promise.all(promises).then(() => {
      res.json({ message: `Sent to ${sent} devices` });
    });
  });
});

module.exports = router;
