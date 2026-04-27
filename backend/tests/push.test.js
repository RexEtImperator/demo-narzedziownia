const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Constants
const JWT_SECRET = 'test-secret-key-123';
const TEST_DB_PATH = path.join(__dirname, `test_push_${Date.now()}.db`);

// Mock constants module
vi.mock('../config/constants', () => ({
  JWT_SECRET: 'test-secret-key-123'
}));

// Mock web-push to avoid actual network requests
vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({})
}));

describe('Push Notifications API (Integration)', () => {
  let app;
  let token;
  let validPublicKey;
  let validAuth;
  let db;

  beforeAll(() => {
    // Ensure clean start
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
  });

  afterAll(() => {
    if (db) {
      try { db.close(() => {}); } catch (e) {}
    }
    // Cleanup
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    const wal = `${TEST_DB_PATH}-wal`;
    const shm = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch (e) {}
    if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch (e) {}
  });

  beforeEach(async () => {
    vi.resetModules();
    
    // Set env vars
    process.env.DB_PATH = TEST_DB_PATH;
    process.env.JWT_SECRET = JWT_SECRET;
    
    // Generate valid VAPID keys
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    validPublicKey = ecdh.getPublicKey('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const validPrivateKey = ecdh.getPrivateKey('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    validAuth = crypto.randomBytes(16).toString('base64');
    process.env.VAPID_PUBLIC_KEY = validPublicKey;
    process.env.VAPID_PRIVATE_KEY = validPrivateKey;
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';

    // Initialize DB
    const dbModule = require('../database/db');
    db = dbModule; // db module exports the db instance directly

    // Create tables or clean them
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('PRAGMA foreign_keys = OFF'); 
        // Create tables if not exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT,
          role TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now')),
          UNIQUE(user_id, endpoint),
          FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
        
        // Clean tables
        db.run('DELETE FROM push_subscriptions');
        db.run('DELETE FROM users');
        
        // Insert test user
        db.run(`INSERT INTO users (id, username, role) VALUES (1, 'testuser', 'admin')`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // Create token
    token = jwt.sign({ id: 1, username: 'testuser', role: 'admin' }, JWT_SECRET);

    // Import router
    const pushRouter = require('../routes/push');
    
    app = express();
    app.use(express.json());
    app.use('/api/push', pushRouter);
  });

  afterEach(() => {});

  test('GET /config returns VAPID public key', async () => {
    const res = await request(app)
      .get('/api/push/config')
      .set('Authorization', `Bearer ${token}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);
  });

  test('POST /subscribe saves subscription to DB', async () => {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-1',
      keys: {
        p256dh: validPublicKey,
        auth: validAuth
      }
    };

    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send(subscription);

    expect(res.statusCode).toBe(201);

    // Verify DB
    // We need to re-open the db if we closed it, but here we are in the same test scope.
    // But wait, afterEach closes it? No, afterEach runs after the test.
    // So db should be open.
    
    // However, since db.close() is async, we need to be careful.
    
    const row = await new Promise((resolve, reject) => {
      // Re-query using the existing db connection
      db.get('SELECT * FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    expect(row).toBeTruthy();
    expect(row.user_id).toBe(1);
    expect(row.p256dh).toBe(validPublicKey);
  });

  test('DELETE /subscribe removes subscription from DB', async () => {
    // Setup: Insert subscription first
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-delete';
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [1, endpoint, 'key', 'auth'], (err) => {
          if (err) reject(err);
          else resolve();
        });
    });

    const res = await request(app)
      .delete('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint });

    expect(res.statusCode).toBe(200);

    // Verify DB
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM push_subscriptions WHERE endpoint = ?', [endpoint], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    expect(row).toBeFalsy();
  });

  test('POST /test sends notification (mock integration)', async () => {
    // Setup: Insert subscription
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-real';
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [1, endpoint, validPublicKey, validAuth], (err) => {
          if (err) reject(err);
          else resolve();
        });
    });

    const res = await request(app)
      .post('/api/push/test')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body?.message).toMatch(/Sent to \d+ devices/);
  });
});
