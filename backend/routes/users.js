const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const bcrypt = require('bcrypt');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { validateEmail, validatePasswordStrength, checkPasswordNotInHistory } = require('../helpers/auth');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');
const { buildOrderClause } = require('../helpers/queryBuilder');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users
 *     description: Retrieve a list of users with pagination and sorting
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: List of users or paginated response
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: array
 *                   items:
 *                     type: object
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                     total:
 *                       type: integer
 *       500:
 *         description: Server error
 */
// Fetch all users
router.get('/', authenticateToken, requirePermission('VIEW_USERS'), (req, res) => {
  const { sortBy, sortOrder } = req.query;
  const allowedSortColumns = {
    username: 'username',
    full_name: 'full_name',
    role: 'role',
    email: 'email',
    created_at: 'created_at'
  };
  
  const orderClause = buildOrderClause(sortBy, sortOrder, allowedSortColumns, 'created_at', { useCollateNocase: true });
  const baseSql = 'SELECT id, username, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id, created_at, updated_at FROM users';
  
  // If no pagination requested, return all
  if (!req.query.page && !req.query.limit) {
    return db.all(`${baseSql} ${orderClause}`, (err, users) => {
      if (err) {
        logger.error('Error fetching users', { error: err.message });
        res.status(500).json({ error: 'Server error' });
      } else {
        res.json(users);
      }
    });
  }

  const { page, limit, offset } = getPaginationParams(req.query);
  const countSql = 'SELECT COUNT(*) as total FROM users';
  
  const dataQuery =(`${baseSql} ${orderClause} LIMIT ? OFFSET ?`);

  db.get(countSql, [], (err, row) => {
    if (err) {
      logger.error('Error counting users', { error: err.message });
      return res.status(500).json({ error: 'Server error' });
    }
    const total = row.total;
    
    db.all(dataQuery, [limit, offset], (err2, users) => {
      if (err2) {
        logger.error('Error fetching users', { error: err2.message });
        return res.status(500).json({ error: 'Server error' });
      }
      res.json(formatPaginatedResponse(users, total, page, limit));
    });
  });
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               full_name:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               department:
 *                 type: string
 *               position:
 *                 type: string
 *               brand_number:
 *                 type: string
 *               employee_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Invalid input or user exists
 *       500:
 *         description: Server error
 */
// Add new user
router.post('/', authenticateToken, requirePermission('MANAGE_USERS'), (req, res) => {
  const { username, password, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id } = req.body || {};
  if (!username || !password || !role || (!full_name && !(first_name && last_name))) {
    return res.status(400).json({ error: 'Username, role and name are required' });
  }

  if (email && !validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Check if user already exists
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, existingUser) => {
    if (err) {
      logger.error('Error checking user:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this username already exists' });
    }
    // Validate password against policy
    db.get('SELECT password_min_length, require_special_chars, require_numbers, require_uppercase, require_lowercase, password_blacklist FROM app_config WHERE id = 1', [], (cfgErr, cfg) => {
      if (cfgErr) {
        logger.error('Error loading security config:', cfgErr.message);
      }
      const defaultBlacklist = ['password', '123456', 'qwerty', 'admin'];
      const policy = {
        passwordMinLength: Number(cfg?.password_min_length || 8),
        requireSpecialChars: !!cfg?.require_special_chars,
        requireNumbers: !!cfg?.require_numbers,
        requireUppercase: !!cfg?.require_uppercase,
        requireLowercase: !!cfg?.require_lowercase,
        blacklist: (() => {
          try {
            const parsed = cfg?.password_blacklist ? JSON.parse(cfg.password_blacklist) : null;
            if (!Array.isArray(parsed)) return defaultBlacklist;
            const cleaned = parsed.map(v => String(v || '').trim()).filter(Boolean);
            const unique = [...new Set(cleaned)];
            return unique.length ? unique : defaultBlacklist;
          } catch (_) {
            return defaultBlacklist;
          }
        })()
      };
      const check = validatePasswordStrength(password, policy);
      if (!check.ok) {
        return res.status(400).json({ error: check.message });
      }
      const hashedPassword = bcrypt.hashSync(password, 10);

    // Normalize full_name from first/last if not provided
    const fullNameToInsert = full_name || `${String(first_name || '').trim()} ${String(last_name || '').trim()}`.trim();
    // Insert user
    db.run('INSERT INTO users (username, password, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))', 
      [username, hashedPassword, role, fullNameToInsert, first_name || null, last_name || null, email || null, phone || null, department || null, position || null, brand_number || null, employee_id || null], 
      function(err) {
        if (err) {
          logger.error('Error adding user:', err.message);
          res.status(500).json({ error: 'Error adding user' });
        } else {
          try { db.run('INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)', [this.lastID, hashedPassword]); } catch (_) {}
          // Fetch inserted user
          db.get('SELECT id, username, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id, created_at, updated_at FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
            if (err) {
              logger.error('Error fetching new user:', err.message);
              res.status(500).json({ error: 'Server error' });
            } else {
              res.status(201).json(newUser);
            }
          });
        }
      });
    });
  });
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               full_name:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               department:
 *                 type: string
 *               position:
 *                 type: string
 *               brand_number:
 *                 type: string
 *               employee_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: User updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// Update user
router.put('/:id', authenticateToken, requirePermission('MANAGE_USERS'), (req, res) => {
  const userId = req.params.id;
  const { username, password, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id } = req.body || {};

  if (!username || !role || (!full_name && !(first_name && last_name))) {
    return res.status(400).json({ error: 'Username, role, and name are required' });
  }

  if (email && !validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Check if user exists
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      logger.error('Error checking user:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Przygotuj zapytanie aktualizacji
    const fullNameToUpdate = full_name || `${String(first_name || '').trim()} ${String(last_name || '').trim()}`.trim();
    let updateQuery = 'UPDATE users SET role = ?, full_name = ?, first_name = ?, last_name = ?, email = ?, phone = ?, department = ?, position = ?, brand_number = ?, employee_id = ?, updated_at = datetime(\'now\')';
    let params = [role, fullNameToUpdate, first_name || null, last_name || null, email || null, phone || null, department || null, position || null, brand_number || null, employee_id || null];

  // If new password provided, include it in update
  if (password && password.trim() !== '') {
      db.get('SELECT password_min_length, require_special_chars, require_numbers, require_uppercase, require_lowercase, password_blacklist, password_history_length FROM app_config WHERE id = 1', [], (cfgErr, cfg) => {
        if (cfgErr) {
          logger.error('Error loading security config:', cfgErr.message);
        }
        const defaultBlacklist = ['password', '123456', 'qwerty', 'admin'];
        const policy = {
          passwordMinLength: Number(cfg?.password_min_length || 8),
          requireSpecialChars: !!cfg?.require_special_chars,
          requireNumbers: !!cfg?.require_numbers,
          requireUppercase: !!cfg?.require_uppercase,
          requireLowercase: !!cfg?.require_lowercase,
          blacklist: (() => {
            try {
              const parsed = cfg?.password_blacklist ? JSON.parse(cfg.password_blacklist) : null;
              if (!Array.isArray(parsed)) return defaultBlacklist;
              const cleaned = parsed.map(v => String(v || '').trim()).filter(Boolean);
              const unique = [...new Set(cleaned)];
              return unique.length ? unique : defaultBlacklist;
            } catch (_) {
              return defaultBlacklist;
            }
          })()
        };
        const check = validatePasswordStrength(password, policy);
        if (!check.ok) {
          return res.status(400).json({ error: check.message });
        }
        const historyLength = Number(cfg?.password_history_length || 3);
        checkPasswordNotInHistory(db, userId, password, historyLength, (histErr, ok) => {
          if (histErr) {
            logger.error('Error checking password history', { error: histErr.message });
          }
          if (ok === false) {
            return res.status(400).json({ error: 'Password cannot be the same as recent passwords' });
          }
          const hashedPassword = bcrypt.hashSync(password, 10);
          updateQuery += ', password = ?';
          params.push(hashedPassword);
          updateQuery += ' WHERE id = ?';
          params.push(userId);
          // Perform update
          db.run(updateQuery, params, function(err) {
            if (err) {
              logger.error('Error updating user', { error: err.message, userId, updateQuery });
              res.status(500).json({ error: 'Error updating user' });
            } else {
              try {
                db.run('INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)', [userId, hashedPassword], function(hErr) {
                  if (!hErr) {
                    db.all('SELECT id FROM user_password_history WHERE user_id = ? ORDER BY changed_at DESC', [userId], (listErr, rows) => {
                      if (!listErr) {
                        const ids = (rows || []).map(r => r.id);
                        const keep = ids.slice(0, historyLength);
                        const drop = ids.slice(historyLength);
                        if (drop.length) {
                          const placeholders = drop.map(() => '?').join(',');
                          db.run(`DELETE FROM user_password_history WHERE id IN (${placeholders})`, drop);
                        }
                      }
                    });
                  }
                });
              } catch (_) {}
          db.get('SELECT id, username, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id, created_at, updated_at FROM users WHERE id = ?', [userId], (err2, updatedUser) => {
            if (err2) {
              logger.error('Error fetching updated user', { error: err2.message, userId });
              res.status(500).json({ error: 'Server error' });
            } else {
              res.json(updatedUser);
            }
          });
            }
          });
        });
        return; // early return, update executed above
      });
  }

  // No password change path
  if (!(password && password.trim() !== '')) {
    updateQuery += ' WHERE id = ?';
    params.push(userId);
    db.run(updateQuery, params, function(err) {
      if (err) {
        logger.error('Error updating user', { error: err.message, userId, updateQuery });
        res.status(500).json({ error: 'Error updating user' });
      } else {
        db.get('SELECT id, username, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id, created_at, updated_at FROM users WHERE id = ?', [userId], (err3, updatedUser) => {
          if (err3) {
            logger.error('Error fetching updated user', { error: err3.message, userId });
            res.status(500).json({ error: 'Server error' });
          } else {
            res.json(updatedUser);
          }
        });
      }
    });
  }
  });
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// Delete user
router.delete('/:id', authenticateToken, requirePermission('MANAGE_USERS'), (req, res) => {
  const userId = req.params.id;

  // Check if user exists
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      logger.error('Error checking user', { error: err.message, userId });
      return res.status(500).json({ error: 'Server error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
      if (err) {
        logger.error('Error deleting user', { error: err.message, userId });
        res.status(500).json({ error: 'Error deleting user' });
      } else {
        res.json({ message: 'User deleted', deletedId: userId });
      }
    });
  });
});

/**
 * @swagger
 * /users/{id}/unlock:
 *   post:
 *     summary: Unlock a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User unlocked
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// Unlock user account (admin only)
router.post('/:id/unlock', authenticateToken, requirePermission('MANAGE_USERS'), (req, res) => {
  const userId = req.params.id;
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      logger.error('Error checking user', { error: err.message, userId });
      return res.status(500).json({ error: 'Server error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    db.run('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, updated_at = datetime("now") WHERE id = ?', [userId], function(uErr) {
      if (uErr) {
        logger.error('Error unlocking user', { error: uErr.message, userId });
        return res.status(500).json({ error: 'Server error' });
      }
      res.json({ message: 'User unlocked', id: userId });
    });
  });
});

module.exports = router;
