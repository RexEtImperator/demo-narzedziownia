const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { requireBodyFields } = require('../middleware/validation');

// GET /api/categories - Get all distinct categories
router.get('/', authenticateToken, (req, res) => {
  const query = `
    SELECT DISTINCT name
    FROM tool_categories
    ORDER BY name ASC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      logger.error('Error fetching categories:', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    // If we have categories in tool_categories table, return them
    // Otherwise fallback to tools table distinct values for backward compatibility if needed, 
    // but user requested tools_categories specifically.
    // The previous implementation returned [{name: 'Cat1'}, {name: 'Cat2'}] structure.
    // tool_categories has 'name' column.
    res.json(rows || []);
  });
});

// POST /api/categories - Create a new category
router.post('/', authenticateToken, requirePermission('SYSTEM_SETTINGS'), requireBodyFields(['name']), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  const insertSql = `INSERT INTO tool_categories (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))`;
  db.run(insertSql, [name], function (err) {
    if (err) {
      if (String(err.message || '').includes('UNIQUE constraint failed')) {
        return res.status(400).json({ message: 'Category already exists' });
      }
      logger.error('Error creating category', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    const id = this.lastID;
    db.get('SELECT id, name FROM tool_categories WHERE id = ?', [id], (err2, row) => {
      if (err2) {
        logger.error('Error fetching created category', { error: err2.message, id });
        return res.status(500).json({ message: 'Server error' });
      }
      return res.status(201).json(row || { id, name });
    });
  });
});

// PUT /api/categories/:id - Rename category (also updates tools.category)
router.put('/:id', authenticateToken, requirePermission('SYSTEM_SETTINGS'), requireBodyFields(['name']), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const name = String(req.body?.name || '').trim();
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid category id' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
      if (beginErr) return res.status(500).json({ message: 'Transaction error' });

      db.get('SELECT id, name FROM tool_categories WHERE id = ?', [id], (getErr, existing) => {
        if (getErr) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Server error' }); }
        if (!existing) { db.run('ROLLBACK'); return res.status(404).json({ message: 'Category not found' }); }

        db.run(
          `UPDATE tool_categories SET name = ?, updated_at = datetime('now') WHERE id = ?`,
          [name, id],
          function (updErr) {
            if (updErr) {
              if (String(updErr.message || '').includes('UNIQUE constraint failed')) {
                db.run('ROLLBACK');
                return res.status(400).json({ message: 'Category already exists' });
              }
              logger.error('Error updating category', { error: updErr.message, id });
              db.run('ROLLBACK');
              return res.status(500).json({ message: 'Server error' });
            }

            db.run('UPDATE tools SET category = ? WHERE category = ?', [name, existing.name], (toolsUpdErr) => {
              if (toolsUpdErr) {
                logger.error('Error updating tools.category for renamed category', { error: toolsUpdErr.message, from: existing.name, to: name });
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Server error' });
              }
              db.run('COMMIT', (commitErr) => {
                if (commitErr) { db.run('ROLLBACK'); return res.status(500).json({ message: 'Transaction commit failed' }); }
                return res.json({ id, name });
              });
            });
          }
        );
      });
    });
  });
});

// DELETE /api/categories/:id - Delete category (blocked if tools exist)
router.delete('/:id', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid category id' });
  }

  db.get('SELECT id, name FROM tool_categories WHERE id = ?', [id], (getErr, existing) => {
    if (getErr) {
      logger.error('Error fetching category for delete', { error: getErr.message, id });
      return res.status(500).json({ message: 'Server error' });
    }
    if (!existing) {
      return res.status(404).json({ message: 'Category not found' });
    }

    db.get('SELECT COUNT(*) as cnt FROM tools WHERE category = ?', [existing.name], (cntErr, row) => {
      if (cntErr) {
        logger.error('Error counting tools for category delete', { error: cntErr.message, id });
        return res.status(500).json({ message: 'Server error' });
      }
      const cnt = Number(row?.cnt || 0) || 0;
      if (cnt > 0) {
        return res.status(400).json({ message: 'Cannot delete category with existing tools' });
      }

      db.run('DELETE FROM tool_categories WHERE id = ?', [id], function (delErr) {
        if (delErr) {
          logger.error('Error deleting category', { error: delErr.message, id });
          return res.status(500).json({ message: 'Server error' });
        }
        return res.json({ success: true });
      });
    });
  });
});

/**
 * @swagger
 * /categories/stats:
 *   get:
 *     summary: Get category statistics
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Category statistics with tool counts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   tool_count:
 *                     type: integer
 *       500:
 *         description: Server error
 */
// GET /api/categories/stats - Get categories with tool counts
router.get('/stats', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      c.id, 
      c.name, 
      COUNT(t.id) as tool_count
    FROM tool_categories c
    LEFT JOIN tools t ON t.category = c.name
    GROUP BY c.id, c.name
    ORDER BY c.name ASC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      logger.error('Error fetching category stats:', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json(rows || []);
  });
});

module.exports = router;
