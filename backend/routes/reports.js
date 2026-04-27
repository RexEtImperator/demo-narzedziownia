const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { sendDomainError } = require('../helpers/errorHelper');
const { reportUpload } = require('../middleware/upload');
const { ROOT_DIR } = require('../config/constants');

const REPORT_ATTACHMENTS_DIR = path.join(ROOT_DIR, 'public', 'report_attachments');

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Issue reporting and management
 */

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: Create a new report
 *     description: Submit a new issue report with optional attachments.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - description
 *               - severity
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [employee, tool, bhpIssued, bhp, other]
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               subject:
 *                 type: string
 *               employeeId:
 *                 type: integer
 *               toolId:
 *                 type: integer
 *               bhpCategory:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Report created successfully
 *       400:
 *         description: Invalid input or missing required fields
 *       500:
 *         description: Server error
 */
// Create a report (multipart, optional attachments)
router.post('/', authenticateToken, (req, res) => {
  if (!reportUpload) {
    return sendDomainError(res, 'REPORT_UPLOAD_NOT_AVAILABLE');
  }
  reportUpload.array('attachments', 8)(req, res, (err) => {
    if (err) {
      if (err.message === 'ONLY_IMAGES') {
        return sendDomainError(res, 'REPORT_ONLY_IMAGES');
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendDomainError(res, 'REPORT_FILE_TOO_LARGE');
      }
      return res.sendError(500, 'REPORT_UPLOAD_ERROR', 'reports.errors.uploadError', 'Upload error', { error: err.message });
    }

    const body = req.body || {};
    const type = String(body.type || '').trim();
    const description = String(body.description || '').trim();
    const severity = String(body.severity || '').trim();
    if (!type || !description || !severity) {
      return sendDomainError(res, 'REPORT_REQUIRED_FIELDS');
    }
    const allowedTypes = ['employee', 'tool', 'bhpIssued', 'bhp', 'other'];
    if (!allowedTypes.includes(type)) {
      return sendDomainError(res, 'REPORT_INVALID_TYPE');
    }

    const employeeId = type === 'employee' ? (parseInt(body.employeeId) || null) : null;
    const employeeNameManual = (type === 'employee' && req.user.role === 'employee')
      ? String(body.employeeName || '').trim()
      : null;
    const toolId = type === 'tool' ? (parseInt(body.toolId) || null) : null;
    const bhpCategory = type === 'bhp' ? String(body.bhpCategory || '').trim() : String(body.bhpCategory || '').trim();
    const subject = String(body.subject || '').trim();

    if (type === 'employee' && req.user.role === 'employee') {
      if (!employeeNameManual) {
        return sendDomainError(res, 'REPORT_EMPLOYEE_NAME_REQUIRED');
      }
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const attachments = files.map(f => ({
      filename: path.basename(f.filename),
      originalName: f.originalname,
      size: f.size,
      url: `/attachments/${path.basename(f.filename)}`
    }));

    const sql = `INSERT INTO reports (created_by_user_id, created_by_username, type, employee_id, employee_name_manual, tool_id, bhp_category, subject, description, severity, status, attachments, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
    const params = [
      req.user.id || null,
      req.user.username || null,
      type,
      employeeId,
      employeeNameManual || null,
      toolId,
      bhpCategory || null,
      subject || null,
      description,
      severity,
      'Przyjęto',
      JSON.stringify(attachments)
    ];
    db.run(sql, params, function (insErr) {
      if (insErr) {
        logger.error('Error creating report', { error: insErr.message, type, createdBy: req.user.username });
        return sendDomainError(res, 'REPORT_CREATE_FAILED', { error: insErr.message });
      }
      return res.json({ message: 'Report created', id: this.lastID });
    });
  });
});

// List reports (admin only) with filters
router.get('/', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return sendDomainError(res, 'PERMISSION_DENIED');
  }
  const { type, severity, status } = req.query || {};
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(String(type)); }
  if (severity) { where.push('severity = ?'); params.push(String(severity)); }
  if (status) { where.push('status = ?'); params.push(String(status)); }
  const sql = `SELECT r.*, 
    (e.first_name || ' ' || e.last_name) AS employee_name,
    t.name AS tool_name
    FROM reports r 
    LEFT JOIN employees e ON r.employee_id = e.id
    LEFT JOIN tools t ON r.tool_id = t.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('Error fetching reports', { error: err.message });
      return sendDomainError(res, 'REPORT_LIST_FAILED', { error: err.message });
    }
    const items = (rows || []).map(r => {
      let atts = [];
      try { atts = r.attachments ? JSON.parse(r.attachments) : []; } catch (_) { atts = []; }
      return { ...r, attachments: atts };
    });
    return res.json({ items });
  });
});

// Update report status (admin)
router.put('/:id/status', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return sendDomainError(res, 'PERMISSION_DENIED');
  }
  const id = parseInt(req.params.id);
  const status = String((req.body || {}).status || '').trim();
  const allowed = ['accepted', 'checking', 'resolved'];
  if (!allowed.includes(status)) {
    return sendDomainError(res, 'REPORT_INVALID_STATUS');
  }
  db.run('UPDATE reports SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id], function (updErr) {
    if (updErr) {
      logger.error('Error updating report status', { error: updErr.message, id, status });
      return sendDomainError(res, 'REPORT_UPDATE_FAILED', { error: updErr.message });
    }
    if ((this.changes || 0) === 0) {
      return sendDomainError(res, 'REPORT_NOT_FOUND');
    }
    return res.json({ message: 'Report status updated' });
  });
});

/**
 * @swagger
 * /reports/{id}:
 *   delete:
 *     summary: Delete a report
 *     description: Deletes a report and its attachments.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Report ID
 *     responses:
 *       200:
 *         description: Report deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Report not found
 *       500:
 *         description: Server error
 */
// Delete report (admin) along with attachments
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'administrator') {
    return sendDomainError(res, 'PERMISSION_DENIED');
  }
  const id = parseInt(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    return sendDomainError(res, 'REPORT_NOT_FOUND');
  }

  db.get('SELECT id, type, subject, severity, status, created_at, attachments FROM reports WHERE id = ?', [id], (findErr, row) => {
    if (findErr) {
      logger.error('Error fetching report for deletion', { error: findErr.message, id });
      return sendDomainError(res, 'REPORT_LIST_FAILED', { error: findErr.message });
    }
    if (!row) {
      return sendDomainError(res, 'REPORT_NOT_FOUND');
    }

    let attachments = [];
    try {
      attachments = row.attachments ? JSON.parse(row.attachments) : [];
    } catch (_) {
      attachments = [];
    }

    // Delete attachment files from disk
    if (Array.isArray(attachments) && attachments.length > 0) {
      attachments.forEach(att => {
        const filename = att && att.filename ? String(att.filename) : null;
        if (filename) {
          const target = path.join(REPORT_ATTACHMENTS_DIR, path.basename(filename));
          fs.unlink(target, (err) => {
            if (err && err.code !== 'ENOENT') {
              logger.warn('Error deleting attachment', { error: err.message, filename });
            }
          });
        }
      });
    }

    // Delete report record
    db.run('DELETE FROM reports WHERE id = ?', [id], function(delErr) {
      if (delErr) {
        logger.error('Error deleting report', { error: delErr.message, id });
        return sendDomainError(res, 'REPORT_DELETE_FAILED', { error: delErr.message });
      }
      if ((this.changes || 0) === 0) {
        return sendDomainError(res, 'REPORT_NOT_FOUND');
      }
      // Audit log: record who deleted what
      const details = `report_id:${id}; type:${row.type}; severity:${row.severity}; status:${row.status}; subject:${row.subject || ''}; attachments_deleted:${Array.isArray(attachments) ? attachments.length : 0}`;
      db.run(
        "INSERT INTO audit_logs (user_id, username, action, target_type, target_id, details, timestamp) VALUES (?, ?, 'report_delete', 'report', ?, ?, datetime('now'))",
        [req.user.id, req.user.username, String(id), details],
        (logErr) => {
          if (logErr) {
            logger.error('Error writing to audit_logs (report delete)', { error: logErr.message });
          }
          return res.json({ message: 'Report deleted', id });
        }
      );
    });
  });
});

module.exports = router;
