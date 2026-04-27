const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { normalizeRoleKeyLocal, roleAliasesForLocal } = require('../helpers/auth');

// Endpoints for managing role permissions

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role and permission management
 */

/**
 * @swagger
 * /roles/role-permissions:
 *   get:
 *     summary: Get permissions for roles
 *     description: Returns permissions for all roles (if admin) or current user's role.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Role permissions map
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   type: string
 *       500:
 *         description: Server error
 */
// Fetch permissions for all roles
router.get('/role-permissions', authenticateToken, (req, res) => {
  const rawRole = String(req.user.role || '').trim().toLowerCase();
  const isAdmin = rawRole === 'administrator' || rawRole === 'admin';

  if (isAdmin) {
    const query = `
      SELECT role, permission 
      FROM role_permissions 
      ORDER BY role, permission
    `;
    return db.all(query, [], (err, rows) => {
      if (err) {
        logger.error('Error fetching role permissions', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      const rolePermissions = {};
      rows.forEach(row => {
        if (!rolePermissions[row.role]) {
          rolePermissions[row.role] = [];
        }
        rolePermissions[row.role].push(row.permission);
      });
      res.json(rolePermissions);
    });
  }

  const apiRole = normalizeRoleKeyLocal(rawRole); // expected: canonical key
  const aliases = roleAliasesForLocal(apiRole);
  const placeholders = aliases.map(() => '?').join(', ');
  const query = `
    SELECT permission FROM role_permissions WHERE role IN (${placeholders}) ORDER BY permission
  `;
  db.all(query, aliases, (err, rows) => {
    if (err) {
      logger.error('Error fetching role permissions', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    const out = {};
    out[apiRole] = Array.from(new Set((rows || []).map(r => r.permission)));
    res.json(out);
  });
});

/**
 * @swagger
 * /roles/role-permissions/{role}:
 *   put:
 *     summary: Update permissions for a role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: Role name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Role permissions updated
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// Update permissions for a specific role
router.put('/role-permissions/:role', authenticateToken, (req, res) => {
  // Check whether the user has administrator permissions
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to manage roles' });
  }

  const role = req.params.role;
  const { permissions } = req.body;

  if (!permissions || !Array.isArray(permissions)) {
    return res.status(400).json({ message: 'Invalid data — permissions array required' });
  }

  // Begin transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Remove all existing permissions for this role
    db.run('DELETE FROM role_permissions WHERE role = ?', [role], (err) => {
      if (err) {
        logger.error(`Error deleting role permissions for role ${role}`, { error: err.message });
        db.run('ROLLBACK');
        return res.status(500).json({ message: 'Server error', error: err.message });
      }

      // Add new permissions
      const stmt = db.prepare('INSERT INTO role_permissions (role, permission) VALUES (?, ?)');
      let errorOccurred = false;

      permissions.forEach(permission => {
        stmt.run([role, permission], (err) => {
          if (err && !errorOccurred) {
            logger.error(`Error adding permission ${permission} for role ${role}`, { error: err.message });
            errorOccurred = true;
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Server error', error: err.message });
          }
        });
      });

      stmt.finalize((err) => {
        if (err || errorOccurred) {
          if (!errorOccurred) {
            logger.error(`Error finalizing statement for role ${role}`, { error: err.message });
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Server error', error: err.message });
          }
        } else {
          db.run('COMMIT', (err) => {
            if (err) {
              logger.error('Error committing transaction', { error: err.message });
              return res.status(500).json({ message: 'Server error', error: err.message });
            }

            // Add an entry to the audit log
            const auditData = {
              user_id: req.user.id,
              action: 'UPDATE_ROLE_PERMISSIONS',
              target_type: 'role',
              target_id: role,
              details: JSON.stringify({ 
                role: role, 
                permissions: permissions,
                updated_by: req.user.username 
              })
            };

            db.run(`INSERT INTO audit_logs (user_id, username, action, target_type, target_id, details, timestamp) 
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
              [auditData.user_id, req.user.username, auditData.action, auditData.target_type, auditData.target_id, auditData.details],
              (err) => {
                if (err) {
                  logger.error('Error writing to audit log', { error: err.message });
                }
              }
            );

            logger.info(`Role permissions for ${role} updated successfully`);
            res.json({ 
              message: 'Role permissions updated successfully',
              role: role,
              permissions: permissions
            });
          });
        }
      });
    });
  });
});

/**
 * @swagger
 * /roles/permissions:
 *   get:
 *     summary: List all available permissions
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       403:
 *         description: Insufficient permissions
 */
// Fetch available permissions
router.get('/permissions', authenticateToken, (req, res) => {
  // Check whether the user has administrator permissions
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to manage roles' });
  }

  const availablePermissions = [
    'VIEW_USERS',
    'CREATE_USERS',
    'MANAGE_USERS',
    'EDIT_USERS',
    'DELETE_USERS',
    'VIEW_ANALYTICS',
    'VIEW_ALL_TOOLS',
    'VIEW_TOOLS',
    'MANAGE_TOOLS',
    'EXPORT_TOOLS',
    'VIEW_EMPLOYEES',
    'MANAGE_EMPLOYEES',
    'EXPORT_EMPLOYEES',
    'VIEW_LABELS',
    'MANAGE_DEPARTMENTS',
    'MANAGE_POSITIONS',
    'SYSTEM_SETTINGS',
    'VIEW_ADMIN',
    'VIEW_AUDIT_LOG',
    'VIEW_BHP',
    'EXPORT_BHP',
    'VIEW_TOOL_HISTORY',
    'VIEW_BHP_HISTORY',
    'MANAGE_BHP',
    'VIEW_QUICK_ACTIONS',
    'DELETE_ISSUE_HISTORY',
    'DELETE_RETURN_HISTORY',
    'DELETE_SERVICE_HISTORY',
    'VIEW_DATABASE',
    'MANAGE_DATABASE',
    'VIEW_INVENTORY',
    'INVENTORY_MANAGE_SESSIONS',
    'INVENTORY_SCAN',
    'INVENTORY_ACCEPT_CORRECTION',
    'INVENTORY_DELETE_CORRECTION',
    'INVENTORY_EXPORT_CSV',
    'NOTIFY'
  ];
  // Ensure duplicates are handled if any (legacy code had pushes)
  const uniquePermissions = [...new Set(availablePermissions)];
  res.json(uniquePermissions);
});

// Roles metadata management
router.get('/roles-meta', authenticateToken, (req, res) => {
  db.all('SELECT role, name, description, color, priority FROM roles_meta', [], (err, rows) => {
    if (err) {
      logger.error('Error fetching roles meta', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    const meta = {};
    (rows || []).forEach(r => {
      meta[r.role] = { name: r.name, description: r.description, color: r.color, priority: r.priority };
    });
    return res.json({ meta });
  });
});

router.put('/roles-meta/:role', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase();
  const { name, description, color, priority } = req.body || {};
  if (!role) return res.status(400).json({ message: 'Invalid role' });
  const pri = (priority === null || priority === undefined || priority === '') ? null : parseInt(priority, 10);
  if (pri !== null && isNaN(pri)) return res.status(400).json({ message: 'Priority must be an integer' });
  db.run(
    `INSERT INTO roles_meta (role, name, description, color, priority, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(role) DO UPDATE SET
       name=excluded.name,
       description=excluded.description,
       color=excluded.color,
       priority=excluded.priority,
       updated_at=datetime('now')`,
    [role, name || null, description || null, color || null, pri],
    function(err) {
      if (err) {
        logger.error('Error upserting role meta', { error: err.message });
        return res.status(500).json({ message: 'Server error' });
      }
      db.get('SELECT role, name, description, color, priority FROM roles_meta WHERE role = ?', [role], (selErr, row) => {
        if (selErr) {
          return res.status(500).json({ message: 'Server error' });
        }
        return res.json({ role: row });
      });
    }
  );
});

/**
 * @swagger
 * /roles/roles-meta/{role}:
 *   delete:
 *     summary: Delete role metadata and permissions
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: Role key
 *     responses:
 *       200:
 *         description: Role deleted
 *       400:
 *         description: Invalid role or cannot delete admin
 *       500:
 *         description: Server error
 */
// Delete role metadata (and its aliases) from roles_meta
router.delete('/roles-meta/:role', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const raw = String(req.params.role || '').trim();
  const strip = (s) => { try { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) { return String(s || ''); } };
  const k = strip(raw.toLowerCase());
  const canonicalMap = {
    admin: 'administrator',
    administrator: 'administrator',
    manager: 'manager',
    kierownik: 'manager',
    employee: 'employee',
    pracownik: 'employee',
    supervisor: 'supervisor',
    mistrz: 'supervisor',
    engineer: 'engineer',
    inzynier: 'engineer',
    toolsmaster: 'toolsmaster',
    narzedziowiec: 'toolsmaster',
    hr: 'hr'
  };
  const role = canonicalMap[k] || k;
  if (!role) return res.status(400).json({ message: 'Invalid role' });
  if (role === 'administrator') return res.status(400).json({ message: 'Cannot delete administrator role' });
  const aliasMap = {
    administrator: ['administrator', 'admin'],
    manager: ['manager', 'kierownik'],
    employee: ['employee', 'pracownik'],
    supervisor: ['supervisor', 'mistrz'],
    engineer: ['engineer', 'inżynier', 'inzynier'],
    toolsmaster: ['toolsmaster', 'narzędziowiec', 'narzedziowiec'],
    hr: ['hr']
  };
  const aliasesBase = aliasMap[role] || [role];
  const aliases = Array.from(new Set([...aliasesBase, ...aliasesBase.map(strip)]));
  const placeholders = aliases.map(() => '?').join(', ');
  const sqlMeta = `DELETE FROM roles_meta WHERE role IN (${placeholders})`;
  db.run(sqlMeta, aliases, function(err) {
    if (err) {
      return res.status(500).json({ message: 'Server error' });
    }
    const deletedMeta = this.changes || 0;
    const sqlPerms = `DELETE FROM role_permissions WHERE role IN (${placeholders})`;
    db.run(sqlPerms, aliases, function(err2) {
      if (err2) {
        return res.status(500).json({ message: 'Server error' });
      }
      const deletedPermissions = this.changes || 0;
      const response = {
        role,
        deleted_meta: deletedMeta,
        deleted_permissions: deletedPermissions,
        message: `Rola '${role}' i jej uprawnienia zostały usunięte`
      };
      return res.json(response);
    });
  });
});

module.exports = router;
