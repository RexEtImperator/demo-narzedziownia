const db = require('../database/db');
const { normalizeRoleKeyLocal, roleAliasesForLocal, getImpliedPermissions } = require('../helpers/auth');
const logger = require('../logger');

const createRequirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (req.user.role === 'administrator') {
      return next();
    }
    const canonical = normalizeRoleKeyLocal(req.user.role);
    const aliases = roleAliasesForLocal(canonical);
    const rolePlaceholders = aliases.map(() => '?').join(', ');
    const perms = getImpliedPermissions(permission);
    const permPlaceholders = perms.map(() => '?').join(', ');
    const sql = `SELECT 1 as ok FROM role_permissions WHERE role IN (${rolePlaceholders}) AND permission IN (${permPlaceholders}) LIMIT 1`;
    db.get(sql,
      [...aliases, ...perms],
      (err, row) => {
        if (err) {
          logger.error('Error while checking permissions', { error: err.message });
          return res.status(500).json({ message: 'Server error' });
        }
        if (row && row.ok) {
          return next();
        }
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
    );
  };
};

const requirePermission = createRequirePermission;

module.exports = { createRequirePermission, requirePermission };
