const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { cacheMiddleware, clearCache } = require('../middleware/cache');
const { requireBodyFields } = require('../middleware/validation');
const { sendDomainError } = require('../helpers/errorHelper');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');
const { buildOrderClause } = require('../helpers/queryBuilder');

// Get all positions (z opcjonalną paginacją, sortowaniem, wyszukiwaniem)
router.get('/', authenticateToken, cacheMiddleware(300), (req, res) => {
  const search = (req.query.search || '').trim();
  const { page, limit, offset } = getPaginationParams(req.query);

  const allowedSort = {
    name: 'name',
    status: 'status',
    department_id: 'department_id',
    updated_at: 'updated_at'
  };
  const orderClause = buildOrderClause(req.query.sortBy, req.query.sortDir, allowedSort, 'name', { useCollateNocase: true });

  let baseSql = 'SELECT * FROM positions';
  let countSql = 'SELECT COUNT(*) as total FROM positions';
  const params = [];
  const whereClauses = [];

  if (search) {
    whereClauses.push('(name LIKE ? OR description LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term);
  }

  if (whereClauses.length > 0) {
    const where = ' WHERE ' + whereClauses.join(' AND ');
    baseSql += where;
    countSql += where;
  }

  if (!req.query.page && !req.query.limit) {
    return db.all(`${baseSql} ${orderClause}`, params, (err, rows) => {
      if (err) {
        logger.error('Error fetching positions', { error: err.message });
        return res.status(500).json({ error: 'Server error' });
      }
      res.status(200).json(rows);
    });
  }

  baseSql += ` ${orderClause} LIMIT ? OFFSET ?`;

  db.get(countSql, params, (err, row) => {
    if (err) {
      logger.error('Error counting positions', { error: err.message });
      return res.status(500).json({ error: 'Server error' });
    }
    const total = row?.total || 0;

    db.all(baseSql, [...params, limit, offset], (err2, rows) => {
      if (err2) {
        logger.error('Error fetching positions', { error: err2.message });
        return res.status(500).json({ error: 'Server error' });
      }
      res.json(formatPaginatedResponse(rows, total, page, limit));
    });
  });
});

// Create position
router.post('/', authenticateToken, requirePermission('MANAGE_POSITIONS'), requireBodyFields(['name']), (req, res) => {
  clearCache('/api/positions');
  const { name, description, department_id, requirements, status } = req.body;
  
  if (!name || name.trim() === '') {
    return res.sendError(400, 'POSITION_NAME_REQUIRED', 'positions.modal.errors.nameRequired', 'Position name is required');
  }
  const insertPosition = () => {
    db.run(
      'INSERT INTO positions (name, description, department_id, requirements, status) VALUES (?, ?, ?, ?, COALESCE(?, "active"))',
      [name.trim(), description || null, department_id || null, requirements || null, status || null],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.sendError(400, 'POSITION_ALREADY_EXISTS', 'positions.errors.nameExists', 'A position with this name already exists');
          }
          logger.error('Error adding position', { error: err.message, name });
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
        } else {
          db.get('SELECT * FROM positions WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
              return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Error fetching position data', err.message);
            }
            res.status(201).json(row);
          });
        }
      }
    );
  };

  if (department_id) {
    db.get('SELECT id FROM departments WHERE id = ?', [department_id], (err, dept) => {
      if (err) {
        logger.error('Error verifying department_id', { error: err.message, department_id });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
      }
      if (!dept) {
        return res.sendError(400, 'INVALID_DEPARTMENT_ID', 'positions.toastr.errors.invalidDepartment', 'Invalid department_id: department does not exist');
      }
      insertPosition();
    });
  } else {
    insertPosition();
  }
});

/**
 * @swagger
 * /positions/{id}:
 *   put:
 *     summary: Update a position
 *     tags: [Positions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Position ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               department_id:
 *                 type: integer
 *               requirements:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Position updated successfully
 *       400:
 *         description: Invalid input or duplicate name
 *       404:
 *         description: Position not found
 *       500:
 *         description: Server error
 */
// Update position
router.put('/:id', authenticateToken, requirePermission('MANAGE_POSITIONS'), requireBodyFields(['name']), (req, res) => {
  clearCache('/api/positions');
  const { id } = req.params;
  const { name, description, department_id, requirements, status } = req.body;
  
  if (!name || name.trim() === '') {
    return res.sendError(400, 'POSITION_NAME_REQUIRED', 'positions.modal.errors.nameRequired', 'Position name is required');
  }
  const updatePosition = () => {
    db.run(
      'UPDATE positions SET name = ?, description = ?, department_id = ?, requirements = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), description || null, department_id || null, requirements || null, status || null, id],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.sendError(400, 'POSITION_ALREADY_EXISTS', 'positions.errors.nameExists', 'A position with this name already exists');
          }
          logger.error('Error updating position', { error: err.message, id });
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
        } else if (this.changes === 0) {
          return res.sendError(404, 'POSITION_NOT_FOUND', 'positions.errors.notFound', 'Position not found');
        } else {
          db.get('SELECT * FROM positions WHERE id = ?', [id], (err, row) => {
            if (err) {
              return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Error fetching position data', err.message);
            }
            res.json(row);
          });
        }
      }
    );
  };

  if (department_id) {
    db.get('SELECT id FROM departments WHERE id = ?', [department_id], (err, dept) => {
      if (err) {
        logger.error('Error verifying department_id', { error: err.message, department_id });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
      }
      if (!dept) {
        return res.sendError(400, 'INVALID_DEPARTMENT_ID', 'positions.toastr.errors.invalidDepartment', 'Invalid department_id: department does not exist');
      }
      updatePosition();
    });
  } else {
    updatePosition();
  }
});

// Delete position
router.delete('/:id', authenticateToken, requirePermission('MANAGE_POSITIONS'), (req, res) => {
  clearCache('/api/positions');
  const { id } = req.params;
  // First fetch position name to detach associated employees
  db.get('SELECT id, name FROM positions WHERE id = ?', [id], (err, pos) => {
    if (err) {
      logger.error('Error finding position', { error: err.message, id });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    }
    if (!pos) {
      return res.sendError(404, 'POSITION_NOT_FOUND', 'positions.errors.notFound', 'Position not found');
    }

    // Set employees' position to '-' for those assigned to the deleted position
    db.run('UPDATE employees SET position = ? WHERE position = ?', ['-', pos.name], function(updateErr) {
      if (updateErr) {
        logger.error('Error detaching employees from position', { error: updateErr.message, positionName: pos.name });
        return res.sendError(500, 'POSITION_DETACH_FAILED', 'positions.errors.detachFailed', 'Server error while detaching employees', updateErr.message);
      }

      const detachedCount = this.changes || 0;

      // Then delete the position
      db.run('DELETE FROM positions WHERE id = ?', [id], function(deleteErr) {
        if (deleteErr) {
          logger.error('Error deleting position', { error: deleteErr.message, id });
          return res.sendError(500, 'POSITION_DELETE_FAILED', 'positions.toastr.errors.positionDeleteError', 'Failed to delete position', deleteErr.message);
        }
        res.json({ message: 'Position deleted successfully', detachedEmployees: detachedCount });
      });
    });
  });
});

/**
 * @swagger
 * /positions/by-name/{name}:
 *   delete:
 *     summary: Delete a position by name
 *     description: Deletes a position by its name and detaches all employees assigned to it.
 *     tags: [Positions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Position name
 *     responses:
 *       200:
 *         description: Position deleted successfully
 *       400:
 *         description: Invalid name
 *       500:
 *         description: Server error
 */
// Delete position by name
router.delete('/by-name/:name', authenticateToken, requirePermission('MANAGE_POSITIONS'), (req, res) => {
  clearCache('/api/positions');
  const { name } = req.params;
  const normalized = (name || '').trim();
  if (!normalized) {
    return res.sendError(400, 'POSITION_NAME_REQUIRED', 'positions.modal.errors.nameRequired', 'Position name is required');
  }

  // Detach employees assigned to this position (case-insensitive)
  db.run('UPDATE employees SET position = ? WHERE LOWER(position) = LOWER(?)', ['-', normalized], function(updateErr) {
    if (updateErr) {
      logger.error('Error detaching employees from position (by-name)', { error: updateErr.message, name: normalized });
      return res.status(500).json({ error: 'Server error while detaching employees' });
    }

    const detachedCount = this.changes || 0;

    // If a position record exists with this name, delete it too
    db.get('SELECT id FROM positions WHERE LOWER(name) = LOWER(?)', [normalized], (findErr, pos) => {
      if (findErr) {
        logger.error('Error finding position by name', { error: findErr.message, name: normalized });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', findErr.message);
      }
      if (!pos) {
        return res.json({ message: 'Detached employees from position (record does not exist)', detachedEmployees: detachedCount, deleted: false });
      }
      db.run('DELETE FROM positions WHERE id = ?', [pos.id], function(deleteErr) {
        if (deleteErr) {
          logger.error('Error deleting position by name', { error: deleteErr.message, id: pos.id });
          return res.sendError(500, 'POSITION_DELETE_FAILED', 'positions.toastr.errors.positionDeleteError', 'Failed to delete position', deleteErr.message);
        }
        res.json({ message: 'Position deleted successfully (by-name)', detachedEmployees: detachedCount, deleted: true });
      });
    });
  });
});

module.exports = router;
