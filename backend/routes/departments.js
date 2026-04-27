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

/**
 * @swagger
 * tags:
 *   name: Departments
 *   description: Department management
 */

// Helper function: ensure departments table has required columns
function ensureDepartmentColumns(callback) {
  db.all("PRAGMA table_info(departments)", (err, columns) => {
    if (err) {
      logger.error('Error checking departments table structure:', { error: err.message });
      return callback && callback(err);
    }
    const columnNames = columns.map(col => col.name);
    const tasks = [];
    if (!columnNames.includes('manager_id')) {
      tasks.push({ sql: 'ALTER TABLE departments ADD COLUMN manager_id INTEGER', name: 'manager_id' });
    }
    if (!columnNames.includes('description')) {
      tasks.push({ sql: 'ALTER TABLE departments ADD COLUMN description TEXT', name: 'description' });
    }
    if (!columnNames.includes('status')) {
      tasks.push({ sql: 'ALTER TABLE departments ADD COLUMN status TEXT DEFAULT "active"', name: 'status' });
    }
    if (!columnNames.includes('updated_at')) {
      tasks.push({ sql: 'ALTER TABLE departments ADD COLUMN updated_at DATETIME', name: 'updated_at' });
    }

    const runNext = () => {
      if (tasks.length === 0) {
        return callback && callback();
      }
      const task = tasks.shift();
      db.run(task.sql, (alterErr) => {
        if (alterErr && !String(alterErr.message).toLowerCase().includes('duplicate column')) {
          logger.error(`Error adding column ${task.name}:`, { error: alterErr.message });
        }
        runNext();
      });
    };
    runNext();
  });
}

/**
 * @swagger
 * /departments:
 *   get:
 *     summary: Get all departments
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of departments
 *       500:
 *         description: Server error
 */
// Get all departments (with optional paginacja, sortowanie, wyszukiwanie)
router.get('/', authenticateToken, cacheMiddleware(300), (req, res) => {
  const search = (req.query.search || '').trim();
  const { page, limit, offset } = getPaginationParams(req.query);

  const allowedSort = {
    name: 'name',
    status: 'status',
    updated_at: 'updated_at'
  };
  const orderClause = buildOrderClause(req.query.sortBy, req.query.sortDir, allowedSort, 'name', { useCollateNocase: true });

  let baseSql = 'SELECT * FROM departments';
  let countSql = 'SELECT COUNT(*) as total FROM departments';
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

  // Jeśli brak paginacji w zapytaniu, zwróć całość z sortowaniem
  if (!req.query.page && !req.query.limit) {
    return db.all(`${baseSql} ${orderClause}`, params, (err, rows) => {
      if (err) {
        logger.error('Error fetching departments', { error: err.message });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
      }
      res.status(200).json(rows);
    });
  }

  baseSql += ` ${orderClause} LIMIT ? OFFSET ?`;

  db.get(countSql, params, (err, row) => {
    if (err) {
      logger.error('Error counting departments', { error: err.message });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    }
    const total = row?.total || 0;

    db.all(baseSql, [...params, limit, offset], (err2, rows) => {
      if (err2) {
        logger.error('Error fetching departments', { error: err2.message });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err2.message);
      }
      res.json(formatPaginatedResponse(rows, total, page, limit));
    });
  });
});

/**
 * @swagger
 * /departments:
 *   post:
 *     summary: Create department
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
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
 *               manager_id:
 *                 type: integer
 *               status:
 *                 type: string
 *     responses:
 *       201:
 *         description: Department created
 *       400:
 *         description: Invalid input or exists
 *       500:
 *         description: Server error
 */
// Create department
router.post('/', authenticateToken, requirePermission('MANAGE_DEPARTMENTS'), requireBodyFields(['name']), (req, res) => {
  clearCache('/api/departments');
  const { name, description, manager_id, status } = req.body;
  
  if (!name || name.trim() === '') {
    return sendDomainError(res, 'DEPARTMENT_NAME_REQUIRED');
  }
  // Validation: if manager_id provided, verify employee with that ID exists
  const insertDepartment = () => {
    db.run(
      'INSERT INTO departments (name, description, manager_id, status) VALUES (?, ?, ?, COALESCE(?, "active"))',
      [name.trim(), description || null, manager_id || null, status || null],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.sendError(400, 'DEPARTMENT_ALREADY_EXISTS', 'departments.errors.nameExists', 'A department with this name already exists');
          }
          logger.error('Error adding department', { error: err.message, name });
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
        } else {
          db.get('SELECT * FROM departments WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
              return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Error fetching department data', err.message);
            }
            res.status(201).json(row);
          });
        }
      }
    );
  };
  ensureDepartmentColumns(() => {
    if (manager_id) {
      db.get('SELECT id FROM employees WHERE id = ?', [manager_id], (err, emp) => {
        if (err) {
          logger.error('Error verifying manager_id', { error: err.message, manager_id });
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
        }
        if (!emp) {
          return sendDomainError(res, 'INVALID_MANAGER_ID');
        }
        insertDepartment();
      });
    } else {
      insertDepartment();
    }
  });
});

// Update department
router.put('/:id', authenticateToken, requirePermission('MANAGE_DEPARTMENTS'), requireBodyFields(['name']), (req, res) => {
  clearCache('/api/departments');
  const { id } = req.params;
  const { name, description, manager_id, status } = req.body;
  
  if (!name || name.trim() === '') {
    return sendDomainError(res, 'DEPARTMENT_NAME_REQUIRED');
  }
  const updateDepartment = () => {
    db.run(
      'UPDATE departments SET name = ?, description = ?, manager_id = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), description || null, manager_id || null, status || null, id],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.sendError(400, 'DEPARTMENT_ALREADY_EXISTS', 'departments.errors.nameExists', 'A department with this name already exists');
          }
          logger.error('Error updating department', { error: err.message, id });
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
        } else if (this.changes === 0) {
          return sendDomainError(res, 'DEPARTMENT_NOT_FOUND');
        } else {
          db.get('SELECT * FROM departments WHERE id = ?', [id], (err, row) => {
            if (err) {
              return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Error fetching department data', err.message);
            }
            res.json(row);
          });
        }
      }
    );
  };
  ensureDepartmentColumns(() => {
    if (manager_id) {
      db.get('SELECT id FROM employees WHERE id = ?', [manager_id], (err, emp) => {
        if (err) {
          logger.error('Error verifying manager_id', { error: err.message, manager_id });
          return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
        }
        if (!emp) {
          return sendDomainError(res, 'INVALID_MANAGER_ID');
        }
        updateDepartment();
      });
    } else {
      updateDepartment();
    }
  });
});

// Delete department
router.delete('/:id', authenticateToken, requirePermission('MANAGE_DEPARTMENTS'), (req, res) => {
  clearCache('/api/departments');
  const { id } = req.params;
  // First fetch the department name to detach employees
  db.get('SELECT id, name FROM departments WHERE id = ?', [id], (err, dept) => {
    if (err) {
      logger.error('Error finding department', { error: err.message, id });
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err.message);
    }
    if (!dept) {
      return sendDomainError(res, 'DEPARTMENT_NOT_FOUND');
    }

    // Set employees' department to '-' for those assigned to the deleted department
    db.run('UPDATE employees SET department = ? WHERE department = ?', ['-', dept.name], function(updateErr) {
      if (updateErr) {
        logger.error('Error detaching employees from department', { error: updateErr.message, departmentName: dept.name });
        return res.sendError(500, 'DEPARTMENT_DETACH_FAILED', 'departments.errors.detachFailed', 'Server error while detaching employees', updateErr.message);
      }

      const detachedCount = this.changes || 0;

      // Then delete the department
      db.run('DELETE FROM departments WHERE id = ?', [id], function(deleteErr) {
      if (deleteErr) {
        logger.error('Error deleting department', { error: deleteErr.message, id });
        return sendDomainError(res, 'DEPARTMENT_DELETE_FAILED', deleteErr.message);
      }
      res.json({ message: 'Department deleted successfully', detachedEmployees: detachedCount });
      });
    });
  });
});

/**
 * @swagger
 * /departments/by-name/{name}:
 *   delete:
 *     summary: Delete department by name
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department deleted
 *       400:
 *         description: Name required
 *       500:
 *         description: Server error
 */
// Delete department by name
router.delete('/by-name/:name', authenticateToken, requirePermission('MANAGE_DEPARTMENTS'), (req, res) => {
  const { name } = req.params;
  const normalized = (name || '').trim();
  if (!normalized) {
    return sendDomainError(res, 'DEPARTMENT_NAME_REQUIRED');
  }

  // Detach employees assigned to this department (case-insensitive)
  db.run('UPDATE employees SET department = ? WHERE LOWER(department) = LOWER(?)', ['-', normalized], function(updateErr) {
    if (updateErr) {
      logger.error('Error detaching employees from department (by-name)', { error: updateErr.message, name: normalized });
      return res.status(500).json({ error: 'Server error while detaching employees' });
    }

    const detachedCount = this.changes || 0;

    // If a department record exists with this name, delete it as well
    db.get('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)', [normalized], (findErr, dept) => {
      if (findErr) {
        logger.error('Error finding department by name', { error: findErr.message, name: normalized });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', findErr.message);
      }
      if (!dept) {
        return res.json({ message: 'Odczepiono pracowników od działu (rekord nie istnieje)', detachedEmployees: detachedCount, deleted: false });
      }
      db.run('DELETE FROM departments WHERE id = ?', [dept.id], function(deleteErr) {
        if (deleteErr) {
          logger.error('Error deleting department by name', { error: deleteErr.message, id: dept.id });
          return sendDomainError(res, 'DEPARTMENT_DELETE_FAILED', deleteErr.message);
        }
        res.json({ message: 'Department deleted successfully (by-name)', detachedEmployees: detachedCount, deleted: true });
      });
    });
  });
});

module.exports = router;
