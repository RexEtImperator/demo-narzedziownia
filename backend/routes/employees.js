const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sendDomainError } = require('../helpers/errorHelper');
const { importUpload } = require('../middleware/upload');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const { ROOT_DIR } = require('../config/constants');
const { importLimiter } = require('../middleware/rateLimiters');
const { 
  validateEmail, 
  generateEmployeeLogin, 
  generateRandomPassword, 
  sendCredentialsEmail 
} = require('../helpers/auth');
const { sanitizeInput } = require('../helpers/sanitize');
const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');
const { cacheMiddleware } = require('../middleware/cache');

let nodemailerOptional = null;
try {
  nodemailerOptional = require('nodemailer');
} catch (_) {
  nodemailerOptional = null;
}

// Helper to check for nodemailer
const getNodemailer = () => nodemailerOptional;

/**
 * @swagger
 * tags:
 *   name: Employees
 *   description: Employee management
 */

/**
 * @swagger
 * /employees:
 *   get:
 *     summary: List employees
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of employees
 *       500:
 *         description: Server error
 */
// Employees fetch endpoint
router.get('/', authenticateToken, cacheMiddleware(30), (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const search = (req.query.search || '').trim();

  let baseSql = 'SELECT * FROM employees';
  let countSql = 'SELECT COUNT(*) as total FROM employees';
  const params = [];
  const whereClauses = [];

  if (search) {
    whereClauses.push('(first_name LIKE ? OR last_name LIKE ? OR position LIKE ? OR department LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (whereClauses.length > 0) {
    const where = ' WHERE ' + whereClauses.join(' AND ');
    baseSql += where;
    countSql += where;
  }
  
  if (!req.query.page) {
    return db.all(baseSql, params, (err, employees) => {
      if (err) {
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
      }
      res.status(200).json(employees);
    });
  }

  baseSql += ' LIMIT ? OFFSET ?';
  
  db.get(countSql, params, (err, row) => {
    if (err) {
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    const total = row.total;

    db.all(baseSql, [...params, limit, offset], (err2, rows) => {
      if (err2) {
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err2?.message);
      }
      res.json(formatPaginatedResponse(rows, total, page, limit));
    });
  });
});

/**
 * @swagger
 * /employees/import:
 *   post:
 *     summary: Import employees from Excel/CSV
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import successful
 *       400:
 *         description: Invalid file or data
 *       500:
 *         description: Server error
 */
// Import employees
router.post('/import', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), importLimiter, importUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ message: 'File is empty or invalid' });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const runInsert = (params) => new Promise((resolve, reject) => {
      db.run(`INSERT INTO employees (
        first_name, last_name, login, email, phone, position, department, 
        brand_number, rfid_uid, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

    const genLogin = (f, l) => new Promise((resolve, reject) => {
      generateEmployeeLogin(db, f, l, (err, login) => {
        if (err) reject(err);
        else resolve(login);
      });
    });

    const getVal = (row, keys) => {
      if (!Array.isArray(keys)) keys = [keys];
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (found) return row[found];
      }
      return null;
    };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowIndex = i + 2;

      const firstName = getVal(row, ['first_name', 'imie', 'imię']);
      const lastName = getVal(row, ['last_name', 'nazwisko']);
      
      if (!firstName || !lastName) {
        errorCount++;
        errors.push({ row: rowIndex, message: 'Missing First Name or Last Name' });
        continue;
      }

      let login = getVal(row, ['login', 'username', 'użytkownik']);
      const email = getVal(row, ['email', 'e-mail']);
      const phone = getVal(row, ['phone', 'telefon', 'nr telefonu']);
      const position = getVal(row, ['position', 'stanowisko']);
      const department = getVal(row, ['department', 'dział', 'wydział']);
      const brandNumber = getVal(row, ['brand_number', 'brand', 'numer marki', 'nr pracownika']);
      const rfid = getVal(row, ['rfid', 'rfid_uid', 'karta']);
      const status = (getVal(row, ['status']) || 'active').toLowerCase();

      try {
        if (!login) {
          login = await genLogin(firstName, lastName);
        }
        
        await runInsert([
          firstName, lastName, login, email, phone, position, department,
          brandNumber, rfid, status
        ]);
        successCount++;
      } catch (err) {
        errorCount++;
        let msg = err.message;
        if (msg.includes('UNIQUE constraint failed')) {
           if (msg.includes('login')) msg = `Login '${login}' already exists`;
           else if (msg.includes('email')) msg = `Email '${email}' already exists`;
           else if (msg.includes('rfid_uid')) msg = `RFID '${rfid}' already exists`;
        }
        errors.push({ row: rowIndex, message: msg, login });
      }
    }

    res.json({
      message: 'Import processed',
      total: rawData.length,
      success: successCount,
      failed: errorCount,
      errors: errors
    });

  } catch (e) {
    logger.error('Import employees error', { error: e.message });
    res.status(500).json({ message: 'Server error during import', error: e.message });
  }
});

// Delete all employees
router.delete('/all', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  logger.info('Starting deletion of all employees');

  db.run('DELETE FROM employees', function(err) {
    if (err) {
      logger.error('Error while deleting employees', { error: err });
      return res.status(500).json({ message: 'Server error while deleting employees' });
    }
    
    logger.info(`Deleted ${this.changes} employees`);
    
    // Add entry to audit log
    const auditQuery = `
      INSERT INTO audit_logs (user_id, username, action, details, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `;

    db.run(auditQuery, [
      req.user.id,
      req.user.username,
      'DELETE_ALL_EMPLOYEES',
      `Usunięto wszystkich pracowników (${this.changes} rekordów)`
    ], (auditErr) => {
      if (auditErr) {
        logger.error('Error while adding entry to audit log', { error: auditErr });
      }
    });
    
    res.status(200).json({ 
      message: 'All employees have been deleted',
      deletedCount: this.changes
    });
  });
});

/**
 * @swagger
 * /employees/generate-logins:
 *   post:
 *     summary: Generate logins for employees without one
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logins generated
 *       500:
 *         description: Server error
 */
// Generate logins for employees without a login
router.post('/generate-logins', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  db.all('SELECT * FROM employees WHERE login IS NULL OR login = ""', [], (err, employees) => {
    if (err) {
      return res.status(500).json({ message: 'Server error while fetching employees' });
    }
    if (!employees || employees.length === 0) {
      return res.status(200).json({ message: 'No employees without a login', created: 0, results: [] });
    }

    const results = [];
    let processed = 0;

    const processNext = () => {
      if (processed >= employees.length) {
        return res.status(200).json({ message: 'Generation completed', created: results.filter(r => r.success).length, results });
      }

      const emp = employees[processed++];
      const first_name = emp.first_name || '';
      const last_name = emp.last_name || '';
      const fullName = `${first_name} ${last_name}`.trim();

      generateEmployeeLogin(db, first_name, last_name, (loginErr, username) => {
        if (loginErr || !username) {
          results.push({ employee_id: emp.id, success: false, error: `Login generation error: ${loginErr?.message || 'unknown'}` });
          return processNext();
        }

        const rawPassword = generateRandomPassword(10);
        const hashedPassword = bcrypt.hashSync(rawPassword, 10);

        db.run(
          'INSERT INTO users (username, password, role, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
          [username, hashedPassword, 'employee', fullName],
          function(userErr) {
            if (userErr) {
              results.push({ employee_id: emp.id, success: false, username, error: `Error adding user: ${userErr.message}` });
              return processNext();
            }

            db.run('UPDATE employees SET login = ? WHERE id = ?', [username, emp.id], (updErr) => {
              if (updErr) {
                results.push({ employee_id: emp.id, success: false, username, error: `Error updating employee: ${updErr.message}` });
                return processNext();
              }

              // Attempt to send login credentials email if an address is provided
              sendCredentialsEmail({ db, nodemailer: getNodemailer(), rootDir: ROOT_DIR }, emp.email, username, rawPassword, fullName, (mailErr) => {
                results.push({ employee_id: emp.id, success: true, username, emailSent: !mailErr && !!emp.email });
                return processNext();
              });
            });
          }
        );
      });
    };

    processNext();
  });
});

/**
 * @swagger
 * /employees/{id}:
 *   get:
 *     summary: Get employee by ID
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Employee details
 *       404:
 *         description: Employee not found
 *       500:
 *         description: Server error
 */
// Fetch single employee by ID
router.get('/:id', authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return sendDomainError(res, 'EMPLOYEE_INVALID_ID');
  }
  db.get('SELECT * FROM employees WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    if (!row) {
      return sendDomainError(res, 'EMPLOYEE_NOT_FOUND');
    }
    return res.json(row);
  });
});

/**
 * @swagger
 * /employees:
 *   post:
 *     summary: Add new employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - position
 *               - department
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               position:
 *                 type: string
 *               department:
 *                 type: string
 *               brand_number:
 *                 type: string
 *               email:
 *                 type: string
 *               rfid_uid:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *     responses:
 *       201:
 *         description: Employee created
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
// Add employee
router.post('/', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  let { first_name, last_name, phone, position, department, brand_number, email, rfid_uid, status } = req.body;

  // Input Sanitization
  first_name = sanitizeInput(first_name);
  last_name = sanitizeInput(last_name);
  phone = sanitizeInput(phone);
  position = sanitizeInput(position);
  department = sanitizeInput(department);
  brand_number = sanitizeInput(brand_number);
  email = sanitizeInput(email);
  rfid_uid = sanitizeInput(rfid_uid);
  status = sanitizeInput(status);

  if (!first_name || !last_name || !position || !department) {
    return res.sendError(400, 'EMPLOYEE_FIELDS_REQUIRED', 'employees.modal.errors.submitFailed', 'First name, last name, position, and department are required');
  }

  if (email && !validateEmail(email)) {
    return res.sendError(400, 'INVALID_EMAIL', 'errors.invalid_email', 'Invalid email address');
  }

  const statusVal = ['active', 'inactive', 'suspended'].includes(String(status || '').trim()) ? String(status).trim() : 'active';

  db.run(
    'INSERT INTO employees (first_name, last_name, phone, position, department, brand_number, email, rfid_uid, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [first_name, last_name, phone, position, department, brand_number, email || null, rfid_uid || null, statusVal],
    function(err) {
      if (err) {
        logger.error('Error adding employee', { error: err.message });
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
      }
      const employeeId = this.lastID;
      const fullName = `${first_name} ${last_name}`;
      generateEmployeeLogin(db, first_name, last_name, (loginErr, username) => {
        if (loginErr || !username) {
          logger.error('Error generating login:', { error: loginErr?.message || 'unknown', employeeId });
          // Despite login generation error, return the employee
          return res.status(201).json({ message: 'Employee added', id: employeeId });
        }

        const rawPassword = generateRandomPassword(10);
        const hashedPassword = bcrypt.hashSync(rawPassword, 10);

        // Insert into users
        db.run(
          'INSERT INTO users (username, password, role, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
          [username, hashedPassword, 'employee', fullName],
          function(userErr) {
            if (userErr) {
              logger.error('Error adding user for employee:', { error: userErr.message, employeeId });
              // Continue despite user creation error
            }

            // Update employee with login
            db.run('UPDATE employees SET login = ? WHERE id = ?', [username, employeeId], (updErr) => {
              if (updErr) {
                logger.error('Error updating employee login:', { error: updErr.message, employeeId });
              }

              // Attempt email sending
              sendCredentialsEmail({ db, nodemailer: getNodemailer(), rootDir: ROOT_DIR }, email, username, rawPassword, fullName, (mailErr) => {
                if (mailErr) {
                  logger.warn('Failed to send credentials email', { error: mailErr });
                }
                // Return full employee record after login update
                db.get('SELECT * FROM employees WHERE id = ?', [employeeId], (selErr, row) => {
                  if (selErr || !row) {
                    // Fallback: return basic info
                    return res.status(201).json({ 
                      message: 'Employee added',
                      id: employeeId,
                      login: username
                    });
                  }
                  return res.status(201).json(row);
                });
              });
            });
          }
        );
      });
    }
  );
});

// Update employee
/**
 * @swagger
 * /employees/{id}:
 *   put:
 *     summary: Update employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Employee ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               position:
 *                 type: string
 *               department:
 *                 type: string
 *               brand_number:
 *                 type: string
 *               email:
 *                 type: string
 *               rfid_uid:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *     responses:
 *       200:
 *         description: Employee updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Employee not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  let { first_name, last_name, phone, position, department, brand_number, email, rfid_uid, status } = req.body;
  const id = req.params.id;

  // Input Sanitization
  first_name = sanitizeInput(first_name);
  last_name = sanitizeInput(last_name);
  phone = sanitizeInput(phone);
  position = sanitizeInput(position);
  department = sanitizeInput(department);
  brand_number = sanitizeInput(brand_number);
  email = sanitizeInput(email);
  rfid_uid = sanitizeInput(rfid_uid);
  status = sanitizeInput(status);

  if (!first_name || !last_name || !position || !department) {
    return res.sendError(400, 'EMPLOYEE_FIELDS_REQUIRED', 'employees.modal.errors.submitFailed', 'First name, last name, position, and department are required');
  }

  if (email && !validateEmail(email)) {
    return res.sendError(400, 'INVALID_EMAIL', 'errors.invalid_email', 'Invalid email address');
  }

  const statusVal = ['active', 'inactive', 'suspended'].includes(String(status || '').trim()) ? String(status).trim() : undefined;

  const sql = statusVal ?
    'UPDATE employees SET first_name = ?, last_name = ?, phone = ?, position = ?, department = ?, brand_number = ?, email = ?, rfid_uid = ?, status = ? WHERE id = ?' :
    'UPDATE employees SET first_name = ?, last_name = ?, phone = ?, position = ?, department = ?, brand_number = ?, email = ?, rfid_uid = ? WHERE id = ?';

  const params = statusVal ?
    [first_name, last_name, phone, position, department, brand_number, email || null, rfid_uid || null, statusVal, id] :
    [first_name, last_name, phone, position, department, brand_number, email || null, rfid_uid || null, id];

  db.run(
    sql,
    params,
    function(err) {
      if (err) {
        return res.sendDomainError ? res.sendDomainError('EMPLOYEE_UPDATE_FAILED', err?.message) : res.sendError(500, 'EMPLOYEE_UPDATE_FAILED', 'employees.updateError', 'Failed to update employee', err?.message);
      }
      if (this.changes === 0) {
        return sendDomainError(res, 'EMPLOYEE_NOT_FOUND');
      }
      db.get('SELECT * FROM employees WHERE id = ?', [id], (selErr, row) => {
        if (selErr || !row) {
          return res.status(200).json({ message: 'Employee updated' });
        }
        const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
        db.run(
          'UPDATE users SET first_name = ?, last_name = ?, full_name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), department = COALESCE(?, department), position = COALESCE(?, position), brand_number = COALESCE(?, brand_number), updated_at = datetime("now") WHERE employee_id = ?',
          [row.first_name || null, row.last_name || null, fullName || null, row.email || null, row.phone || null, row.department || null, row.position || null, row.brand_number || null, row.id],
          function(updUsersErr) {
            if (updUsersErr) {
              logger.error('Error syncing user by employee_id:', { error: updUsersErr.message, employeeId: row.id });
            }
            if (this.changes === 0) {
              const loginVal = String(row.login || '').trim();
              if (loginVal) {
                db.run(
                  'UPDATE users SET first_name = ?, last_name = ?, full_name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), department = COALESCE(?, department), position = COALESCE(?, position), brand_number = COALESCE(?, brand_number), employee_id = COALESCE(employee_id, ?), updated_at = datetime("now") WHERE username = ?',
                  [row.first_name || null, row.last_name || null, fullName || null, row.email || null, row.phone || null, row.department || null, row.position || null, row.brand_number || null, row.id, loginVal]
                );
              }
            }
            res.status(200).json(row);
          }
        );
      });
    }
  );
});

// Regenerate employee login
/**
 * @swagger
 * /employees/{id}/regenerate-login:
 *   post:
 *     summary: Regenerate employee login
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Employee ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login regenerated
 *       404:
 *         description: Employee not found
 *       500:
 *         description: Server error
 */
router.post('/:id/regenerate-login', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  if (!employeeId) {
    return sendDomainError(res, 'EMPLOYEE_INVALID_ID');
  }
  const bodyFirst = String(req.body?.first_name || '').trim();
  const bodyLast = String(req.body?.last_name || '').trim();

  db.get('SELECT id, first_name, last_name, login, email, phone, department, position, brand_number FROM employees WHERE id = ?', [employeeId], (err, emp) => {
    if (err) {
      return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
    }
    if (!emp) {
      return sendDomainError(res, 'EMPLOYEE_NOT_FOUND');
    }
    const firstName = bodyFirst || emp.first_name || '';
    const lastName = bodyLast || emp.last_name || '';
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First and last name are required to generate login' });
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const oldLogin = String(emp.login || '');

    generateEmployeeLogin(db, firstName, lastName, (genErr, username) => {
      if (genErr || !username) {
        return res.status(500).json({ message: 'Failed to generate login' });
      }

      const updateEmployee = (cb) => {
        db.run('UPDATE employees SET login = ? WHERE id = ?', [username, employeeId], function(updErr) {
          return cb(updErr);
        });
      };

      const updateOrInsertUser = (cb) => {
        // Prefer match by employee_id; fallback to old login; final fallback: new login
        db.get('SELECT id FROM users WHERE employee_id = ? OR username = ? OR username = ? LIMIT 1', [employeeId, oldLogin, username], (uErrAny, uFound) => {
          if (uErrAny) return cb(uErrAny);
          if (uFound) {
            db.run(
              'UPDATE users SET username = ?, full_name = ?, first_name = ?, last_name = ?, employee_id = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), department = COALESCE(?, department), position = COALESCE(?, position), brand_number = COALESCE(?, brand_number), updated_at = datetime("now") WHERE id = ?',
              [username, fullName, firstName, lastName, employeeId, emp.email || null, emp.phone || null, emp.department || null, emp.position || null, emp.brand_number || null, uFound.id],
              function (updErr) { return cb(updErr); }
            );
          } else {
            const rawPassword = generateRandomPassword(10);
            const hashedPassword = bcrypt.hashSync(rawPassword, 10);
            db.run(
              'INSERT INTO users (username, password, role, full_name, first_name, last_name, email, phone, department, position, brand_number, employee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))',
              [username, hashedPassword, 'employee', fullName, firstName, lastName, emp.email || null, emp.phone || null, emp.department || null, emp.position || null, emp.brand_number || null, employeeId],
              function (insErr) { return cb(insErr); }
            );
          }
        });
      };

      updateOrInsertUser((userErr) => {
        if (userErr) {
          return res.status(500).json({ message: 'Failed to update user record' });
        }
        updateEmployee((empErr) => {
          if (empErr) {
            return res.status(500).json({ message: 'Failed to update employee record' });
          }

          // Audit log
          const details = `Regenerated login for employeeId=${employeeId}, oldLogin=${oldLogin || '-'}, newLogin=${username}`;
          db.run(
            'INSERT INTO audit_logs (user_id, username, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, datetime("now"))',
            [req.user.id, req.user.username, 'EMPLOYEE_REGENERATE_LOGIN', details, req.ip || 'localhost']
          );

          db.get('SELECT * FROM employees WHERE id = ?', [employeeId], (selErr, row) => {
            if (selErr || !row) {
              return res.json({ login: username });
            }
            return res.json({ login: username, employee: row });
          });
        });
      });
    });
  });
});

// Get by RFID
router.get('/by-rfid/:uid', authenticateToken, (req, res) => {
  const uid = String(req.params.uid || '').trim();
  if (!uid) {
    return res.sendError(400, 'EMPLOYEE_INVALID_RFID', 'employees.errors.invalidRfid', 'Invalid RFID UID');
  }
  db.get(
    'SELECT id, first_name, last_name, department, position, brand_number, email, phone, login FROM employees WHERE rfid_uid = ?',
    [uid],
    (err, row) => {
      if (err) {
        return res.sendError(500, 'INTERNAL_SERVER_ERROR', 'errors.server', 'Server error', err?.message);
      }
      if (!row) {
        return sendDomainError(res, 'EMPLOYEE_NOT_FOUND');
      }
      return res.json(row);
    }
  );
});

// Delete employee
router.delete('/:id', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  const id = req.params.id;

  db.run('DELETE FROM employees WHERE id = ?', [id], function(err) {
    if (err) {
      return sendDomainError(res, 'EMPLOYEE_DELETE_FAILED', err?.message);
    }
    if (this.changes === 0) {
      return sendDomainError(res, 'EMPLOYEE_NOT_FOUND');
    }
    res.status(200).json({ message: 'Employee deleted' });
  });
});

// Send credentials
/**
 * @swagger
 * /employees/{id}/send-credentials:
 *   post:
 *     summary: Send credentials to employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Credentials sent
 *       400:
 *         description: Employee has no email or invalid ID
 *       404:
 *         description: Employee not found
 *       500:
 *         description: Server error
 */
router.post('/:id/send-credentials', authenticateToken, requirePermission('MANAGE_EMPLOYEES'), (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  if (!employeeId) {
    return res.status(400).json({ message: 'Invalid employee ID' });
  }
  db.get('SELECT id, first_name, last_name, email, login FROM employees WHERE id = ?', [employeeId], (err, emp) => {
    if (err) {
      logger.error('Error fetching employee', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    if (!emp) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    if (!emp.email) {
      const auditQuery = `INSERT INTO audit_logs (user_id, username, action, details, ip_address, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))`;
      db.run(auditQuery, [
        req.user.id,
        req.user.username,
        'EMPLOYEE_SEND_CREDENTIALS',
        `Attempted to send credentials for employee ID=${employeeId} without an email address`,
        req.ip || 'localhost'
      ], (auditErr) => {
        if (auditErr) {
          logger.error('Audit error (no email)', { error: auditErr });
        }
      });
      return res.sendError(400, 'EMPLOYEE_NO_EMAIL', 'employees.toast.noEmail', 'Employee has no email address');
    }
    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();

    const proceed = (username, rawPassword, createdLogin) => {
      try {
        sendCredentialsEmail({ db, nodemailer: getNodemailer(), rootDir: ROOT_DIR }, emp.email, username, rawPassword, fullName, (mailErr) => {
          if (mailErr) {
            logger.error('Error sending credentials', { error: mailErr.message || mailErr });
          }
          
          db.get('SELECT * FROM employees WHERE id = ?', [employeeId], (err2, updated) => {
            if (err2) {
              logger.error('Error fetching updated employee', { error: err2.message });
            }

            const auditQuery = `INSERT INTO audit_logs (user_id, username, action, details, ip_address, timestamp)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`;
            const details = `Sent credentials: employeeId=${employeeId}, login=${username}, emailSent=${!mailErr}, createdLogin=${createdLogin}`;
            
            db.run(auditQuery, [req.user.id, req.user.username, 'EMPLOYEE_SEND_CREDENTIALS', details, req.ip || 'localhost'], (auditErr) => {
              if (auditErr) logger.error('Audit error (send-credentials)', { error: auditErr });
            });

            return res.json({ 
              ok: true, 
              emailSent: !mailErr,
              createdLogin, 
              login: username, 
              employee: updated || emp,
              ...(mailErr ? {
                error: mailErr.userMessage || mailErr.message || 'Email not sent',
                code: mailErr.code || 'EMAIL_NOT_SENT',
                messageKey: mailErr.messageKey || 'employees.toast.sendError'
              } : {})
            });
          });
        });
      } catch (e) {
        logger.error('Exception in sendCredentialsEmail', { error: e.message });
        return res.status(500).json({ message: 'Error sending email' });
      }
    };

    if (!emp.login) {
      generateEmployeeLogin(db, emp.first_name || '', emp.last_name || '', (genErr, username) => {
        if (genErr || !username) {
          logger.error('Login generation error', { error: genErr?.message || genErr });
          return res.status(500).json({ message: 'Failed to generate login' });
        }
        const rawPassword = generateRandomPassword(10);
        const hashedPassword = bcrypt.hashSync(rawPassword, 10);
        
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          
          db.run(
            'INSERT INTO users (username, password, role, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
            [username, hashedPassword, 'employee', fullName],
            function (insErr) {
              if (insErr) {
                db.run('ROLLBACK');
                logger.error('Error creating user', { error: insErr.message });
                return res.status(500).json({ message: 'Failed to create user' });
              }
              
              db.run('UPDATE employees SET login = ? WHERE id = ?', [username, employeeId], function (updErr) {
                if (updErr) {
                  db.run('ROLLBACK');
                  logger.error('Error updating employee login', { error: updErr.message });
                  return res.status(500).json({ message: 'Failed to update employee' });
                }
                
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: 'Transaction commit failed' });
                  }
                  proceed(username, rawPassword, true);
                });
              });
            }
          );
        });
      });
      return;
    }

    const username = String(emp.login);
    const rawPassword = generateRandomPassword(10);
    const hashedPassword = bcrypt.hashSync(rawPassword, 10);
    
    db.get('SELECT id FROM users WHERE username = ?', [username], (uErr, userRow) => {
      if (uErr) {
        logger.error('Error finding user', { error: uErr.message });
        return res.status(500).json({ message: 'Server error' });
      }
      
      const upsert = (cb) => {
        if (!userRow) {
          db.run(
            'INSERT INTO users (username, password, role, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
            [username, hashedPassword, 'employee', fullName],
            function (insErr) { return cb(insErr); }
          );
        } else {
          db.run(
            'UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE username = ?',
            [hashedPassword, username],
            function (updErr) { return cb(updErr); }
          );
        }
      };
      
      upsert((saveErr) => {
        if (saveErr) {
          logger.error('Error saving password', { error: saveErr.message });
          return res.status(500).json({ message: 'Failed to save password' });
        }
        proceed(username, rawPassword, false);
      });
    });
  });
});

module.exports = router;
