const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

function toIsoNow() {
  return new Date().toISOString();
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}

router.get('/plant-map', authenticateToken, requirePermission('VIEW_MAP'), (req, res) => {
  const type = String(req.query.type || '').trim().toLowerCase();
  const params = [];
  let sql = 'SELECT id, type, name, coords, created_at, updated_at FROM plant_map';
  if (type) {
    sql += ' WHERE LOWER(type) = ?';
    params.push(type);
  }
  sql += ' ORDER BY id ASC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('Error fetching plant_map', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    const out = (rows || []).map(r => ({
      ...r,
      coords: safeJsonParse(r.coords, [])
    }));
    res.json(out);
  });
});

router.put('/plant-map/bulk', authenticateToken, requirePermission('MANAGE_MAP'), (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const cleaned = items
    .map(it => ({
      id: it?.id ? Number(it.id) : null,
      type: String(it?.type || '').trim().toLowerCase(),
      name: String(it?.name || '').trim(),
      coords: it?.coords
    }))
    .filter(it => (it.type === 'area' || it.type === 'object') && it.name && Array.isArray(it.coords) && it.coords.length > 2);

  const now = toIsoNow();

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM plant_map', [], (delErr) => {
      if (delErr) {
        logger.error('Error clearing plant_map', { error: delErr.message });
        db.run('ROLLBACK');
        return res.status(500).json({ message: 'Server error' });
      }

      if (cleaned.length === 0) {
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            logger.error('Error committing plant_map bulk', { error: commitErr.message });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Server error' });
          }
          return res.json({ items: [] });
        });
        return;
      }

      const stmt = db.prepare('INSERT INTO plant_map (type, name, coords, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
      cleaned.forEach(it => {
        stmt.run([it.type, it.name, JSON.stringify(it.coords), now, now]);
      });
      stmt.finalize((finErr) => {
        if (finErr) {
          logger.error('Error inserting plant_map bulk', { error: finErr.message });
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Server error' });
        }
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            logger.error('Error committing plant_map bulk', { error: commitErr.message });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Server error' });
          }
          db.all('SELECT id, type, name, coords, created_at, updated_at FROM plant_map ORDER BY id ASC', [], (selErr, rows) => {
            if (selErr) {
              logger.error('Error reading plant_map after bulk', { error: selErr.message });
              return res.status(500).json({ message: 'Server error' });
            }
            const out = (rows || []).map(r => ({ ...r, coords: safeJsonParse(r.coords, []) }));
            return res.json({ items: out });
          });
        });
      });
    });
  });
});

router.get('/plant-map/reports', authenticateToken, requirePermission('VIEW_MAP'), (req, res) => {
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit || 1000)));
  db.all(
    'SELECT * FROM plant_map_reports ORDER BY created_at DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) {
        logger.error('Error fetching plant_map_reports', { error: err.message });
        return res.status(500).json({ message: 'Server error' });
      }
      res.json(rows || []);
    }
  );
});

router.post('/plant-map/reports', authenticateToken, requirePermission('MANAGE_MAP'), (req, res) => {
  const {
    lat,
    lng,
    obszar,
    obiekt,
    status,
    awaria,
    priorytet,
    data,
    pracownik,
    zlecajacy,
    opis
  } = req.body || {};

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const awariaStr = String(awaria || '').trim();
  const pracownikStr = String(pracownik || '').trim();
  const statusKey = String(status || 'aktywne').trim().toLowerCase();
  const normalizedStatus = statusKey === 'w trakcie' ? 'w_trakcie' : statusKey;

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ message: 'Invalid coordinates' });
  }
  if (!awariaStr) {
    return res.status(400).json({ message: 'Awaria is required' });
  }
  if (!pracownikStr) {
    return res.status(400).json({ message: 'Pracownik is required' });
  }
  if (!['aktywne', 'w_trakcie', 'ukonczono'].includes(normalizedStatus)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const now = toIsoNow();
  const sql = `INSERT INTO plant_map_reports (
      lat, lng, obszar, obiekt, status, awaria, priorytet, data, pracownik, zlecajacy, opis,
      created_by_user_id, created_by_username, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    latNum,
    lngNum,
    String(obszar || '').trim() || null,
    String(obiekt || '').trim() || null,
    normalizedStatus,
    awariaStr,
    String(priorytet || '').trim() || null,
    String(data || '').trim() || null,
    pracownikStr,
    String(zlecajacy || '').trim() || null,
    String(opis || '').trim() || null,
    req.user?.id && !isNaN(Number(req.user.id)) ? Number(req.user.id) : null,
    req.user?.username || null,
    now,
    now
  ];

  db.run(sql, params, function runCb(err) {
    if (err) {
      logger.error('Error creating plant_map_report', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    db.get('SELECT * FROM plant_map_reports WHERE id = ?', [this.lastID], (selErr, row) => {
      if (selErr) {
        logger.error('Error fetching created plant_map_report', { error: selErr.message });
        return res.status(500).json({ message: 'Server error' });
      }
      return res.json(row);
    });
  });
});

router.put('/plant-map/reports/:id', authenticateToken, requirePermission('MANAGE_MAP'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

  const patch = req.body || {};
  const allowed = ['obszar', 'obiekt', 'status', 'awaria', 'priorytet', 'data', 'pracownik', 'zlecajacy', 'opis', 'lat', 'lng'];
  const updates = {};
  allowed.forEach(k => {
    if (Object.prototype.hasOwnProperty.call(patch, k)) updates[k] = patch[k];
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'lat')) updates.lat = Number(updates.lat);
  if (Object.prototype.hasOwnProperty.call(updates, 'lng')) updates.lng = Number(updates.lng);

  if (Object.prototype.hasOwnProperty.call(updates, 'awaria')) updates.awaria = String(updates.awaria || '').trim();
  if (Object.prototype.hasOwnProperty.call(updates, 'pracownik')) updates.pracownik = String(updates.pracownik || '').trim();
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    const rawStatus = String(updates.status || '').trim().toLowerCase();
    updates.status = rawStatus === 'w trakcie' ? 'w_trakcie' : rawStatus;
    if (!['aktywne', 'w_trakcie', 'ukonczono'].includes(updates.status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
  }

  if (updates.awaria === '') return res.status(400).json({ message: 'Awaria is required' });
  if (updates.pracownik === '') return res.status(400).json({ message: 'Pracownik is required' });

  if (Number.isNaN(updates.lat) || Number.isNaN(updates.lng)) {
    if (Object.prototype.hasOwnProperty.call(updates, 'lat') || Object.prototype.hasOwnProperty.call(updates, 'lng')) {
      return res.status(400).json({ message: 'Invalid coordinates' });
    }
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ message: 'No updates' });

  updates.updated_at = toIsoNow();
  const setSql = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const params = [...Object.keys(updates).map(k => updates[k]), id];
  db.run(`UPDATE plant_map_reports SET ${setSql} WHERE id = ?`, params, (err) => {
    if (err) {
      logger.error('Error updating plant_map_report', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    db.get('SELECT * FROM plant_map_reports WHERE id = ?', [id], (selErr, row) => {
      if (selErr) {
        logger.error('Error fetching updated plant_map_report', { error: selErr.message });
        return res.status(500).json({ message: 'Server error' });
      }
      return res.json(row);
    });
  });
});

router.delete('/plant-map/reports/:id', authenticateToken, requirePermission('MANAGE_MAP'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
  db.run('DELETE FROM plant_map_reports WHERE id = ?', [id], (err) => {
    if (err) {
      logger.error('Error deleting plant_map_report', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    return res.json({ success: true });
  });
});

module.exports = router;
