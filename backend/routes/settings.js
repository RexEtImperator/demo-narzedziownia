const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { cacheMiddleware } = require('../middleware/cache');
const { logoUpload, LOGO_DIR } = require('../middleware/upload');
const { getPngSizeAsync, copyFileAsync } = require('../helpers/fileops');
const { encrypt, decrypt } = require('../helpers/crypto');
const { ROOT_DIR } = require('../config/constants');
const { asyncHandler } = require('../middleware/asyncHandler');
const nodemailer = require('nodemailer');

const CURRENT_LOGO_PATH = path.join(ROOT_DIR, 'public', 'logo.png');

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: System configuration and settings
 */

// Constants for Logo Validation
const MIN_LOGO_WIDTH = 64;
const MIN_LOGO_HEIGHT = 64;
const MAX_LOGO_WIDTH = 1024;
const MAX_LOGO_HEIGHT = 1024;

// Global Cache Variables
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60 * 1000;

// =============================================================================
// GENERAL SETTINGS
// =============================================================================

/**
 * @swagger
 * /settings/config/general:
 *   get:
 *     summary: Get general system settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: General settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appName:
 *                   type: string
 *                 companyName:
 *                   type: string
 *                 timezone:
 *                   type: string
 *                 language:
 *                   type: string
 *                 dateFormat:
 *                   type: string
 *                 backupFrequency:
 *                   type: string
 *                 backupRetentionDays:
 *                   type: integer
 *                 lastBackupAt:
 *                   type: string
 *                 toolsCodePrefix:
 *                   type: string
 *                 bhpCodePrefix:
 *                   type: string
 *                 enableRealtimeChat:
 *                   type: boolean
 *       500:
 *         description: Server error
 */
// Fetch general settings (public)
router.get('/config/general', (req, res) => {
  const now = Date.now();
  if (configCache && (now - configCacheTime < CONFIG_CACHE_TTL)) {
    return res.json(configCache);
  }

  db.get('SELECT app_name, company_name, timezone, language, date_format, backup_frequency, backup_retention_days, last_backup_at, tools_code_prefix, bhp_code_prefix, tool_category_prefixes, enable_realtime_chat, kiosk, help, map FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) {
      logger.error('Error fetching general settings', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: 'Settings not found' });
    }
    let toolCategoryPrefixes = {};
    try {
      toolCategoryPrefixes = row.tool_category_prefixes ? JSON.parse(row.tool_category_prefixes) : {};
    } catch (_) {
      toolCategoryPrefixes = {};
    }
    const result = {
      appName: row.app_name,
      companyName: row.company_name,
      timezone: row.timezone,
      language: row.language,
      dateFormat: row.date_format,
      backupFrequency: row.backup_frequency || 'daily',
      backupRetentionDays: row.backup_retention_days || 30,
      lastBackupAt: row.last_backup_at || null,
      toolsCodePrefix: row.tools_code_prefix || '',
      bhpCodePrefix: row.bhp_code_prefix || '',
      toolCategoryPrefixes,
      enableRealtimeChat: !!row.enable_realtime_chat,
      enableKiosk: row.kiosk === 0 ? false : true,
      enableHelp: row.help === 1 ? true : false,
      enableMap: row.map === 1 ? true : false
    };
    
    // Update cache
    configCache = result;
    configCacheTime = now;
    
    res.json(result);
  });
});

/**
 * @swagger
 * /settings/config/general:
 *   put:
 *     summary: Update general system settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appName
 *               - timezone
 *               - language
 *               - dateFormat
 *             properties:
 *               appName:
 *                 type: string
 *               companyName:
 *                 type: string
 *               timezone:
 *                 type: string
 *               language:
 *                 type: string
 *               dateFormat:
 *                 type: string
 *               backupFrequency:
 *                 type: string
 *               backupRetentionDays:
 *                 type: integer
 *               toolsCodePrefix:
 *                 type: string
 *               bhpCodePrefix:
 *                 type: string
 *               enableRealtimeChat:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// Update general settings (admin only)
router.put('/config/general', authenticateToken, (req, res) => {
  // Invalidate cache on update
  configCache = null;
  configCacheTime = 0;
  
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to update settings' });
  }

  const { appName, companyName, timezone, language, dateFormat, backupFrequency, backupRetentionDays, toolsCodePrefix, bhpCodePrefix, toolCategoryPrefixes, enableRealtimeChat, enableKiosk, enableHelp, enableMap } = req.body || {};

  // Parse enableRealtimeChat to ensure it's handled correctly (0/1)
  let enableRealtimeChatVal = null;
  if (enableRealtimeChat !== undefined) {
    // Handle boolean, string 'true'/'false', and 1/0
    if (enableRealtimeChat === true || enableRealtimeChat === 'true' || enableRealtimeChat === 1 || enableRealtimeChat === '1') {
      enableRealtimeChatVal = 1;
    } else {
      enableRealtimeChatVal = 0;
    }
  }

  let enableKioskVal = null;
  if (enableKiosk !== undefined) {
    if (enableKiosk === true || enableKiosk === 'true' || enableKiosk === 1 || enableKiosk === '1') {
      enableKioskVal = 1;
    } else {
      enableKioskVal = 0;
    }
  }

  let enableHelpVal = null;
  if (enableHelp !== undefined) {
    if (enableHelp === true || enableHelp === 'true' || enableHelp === 1 || enableHelp === '1') {
      enableHelpVal = 1;
    } else {
      enableHelpVal = 0;
    }
  }

  let enableMapVal = null;
  if (enableMap !== undefined) {
    if (enableMap === true || enableMap === 'true' || enableMap === 1 || enableMap === '1') {
      enableMapVal = 1;
    } else {
      enableMapVal = 0;
    }
  }

  if (!appName || !timezone || !language || !dateFormat) {
    return res.status(400).json({ message: 'Missing required fields: appName, timezone, language, dateFormat' });
  }

  const query = `
    UPDATE app_config 
    SET app_name = ?, company_name = ?, timezone = ?, language = ?, date_format = ?, backup_frequency = COALESCE(?, backup_frequency), backup_retention_days = COALESCE(?, backup_retention_days), tools_code_prefix = COALESCE(?, tools_code_prefix), bhp_code_prefix = COALESCE(?, bhp_code_prefix), tool_category_prefixes = COALESCE(?, tool_category_prefixes), enable_realtime_chat = COALESCE(?, enable_realtime_chat), kiosk = COALESCE(?, kiosk), help = COALESCE(?, help), map = COALESCE(?, map), updated_at = datetime('now')
    WHERE id = 1
  `;
 
  let tcpJson = null;
  try {
    if (toolCategoryPrefixes && typeof toolCategoryPrefixes === 'object') {
      tcpJson = JSON.stringify(toolCategoryPrefixes);
    }
  } catch (_) {
    tcpJson = null;
  }

  db.run(query, [appName, companyName || null, timezone, language, dateFormat, backupFrequency || null, backupRetentionDays || 30, toolsCodePrefix || null, bhpCodePrefix || null, tcpJson || null, enableRealtimeChatVal, enableKioskVal, enableHelpVal, enableMapVal], function(err) {
    if (err) {
      logger.error('Error updating general settings', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }

    // Return updated settings
    db.get('SELECT app_name, company_name, timezone, language, date_format, backup_frequency, backup_retention_days, last_backup_at, tools_code_prefix, bhp_code_prefix, tool_category_prefixes, enable_realtime_chat, kiosk, help, map FROM app_config WHERE id = 1', [], (err, row) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      let toolCategoryPrefixes = {};
      try {
        toolCategoryPrefixes = row.tool_category_prefixes ? JSON.parse(row.tool_category_prefixes) : {};
      } catch (_) {
        toolCategoryPrefixes = {};
      }
      res.json({
        appName: row.app_name,
        companyName: row.company_name,
        timezone: row.timezone,
        language: row.language,
        dateFormat: row.date_format,
        backupFrequency: row.backup_frequency || 'daily',
        backupRetentionDays: row.backup_retention_days || 30,
        lastBackupAt: row.last_backup_at || null,
        toolsCodePrefix: row.tools_code_prefix || '',
        bhpCodePrefix: row.bhp_code_prefix || '',
        toolCategoryPrefixes,
        enableRealtimeChat: !!row.enable_realtime_chat,
        enableKiosk: row.kiosk === 0 ? false : true,
        enableHelp: row.help === 1 ? true : false,
        enableMap: row.map === 1 ? true : false
      });
    });
  });
});

// =============================================================================
// KIOSK FEATURE TOGGLE
// =============================================================================

router.put('/config/kiosk', authenticateToken, (req, res) => {
  configCache = null;
  configCacheTime = 0;

  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to update settings' });
  }

  const { enableKiosk } = req.body || {};

  let enableKioskVal = null;
  if (enableKiosk !== undefined) {
    if (enableKiosk === true || enableKiosk === 'true' || enableKiosk === 1 || enableKiosk === '1') {
      enableKioskVal = 1;
    } else {
      enableKioskVal = 0;
    }
  }

  if (enableKioskVal === null) {
    return res.status(400).json({ message: 'Missing required field: enableKiosk' });
  }

  db.run(
    'UPDATE app_config SET kiosk = ?, updated_at = datetime(\'now\') WHERE id = 1',
    [enableKioskVal],
    function (err) {
      if (err) {
        logger.error('Error updating kiosk setting', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.json({ enableKiosk: enableKioskVal === 1 });
    }
  );
});

// =============================================================================
// HELP FEATURE TOGGLE
// =============================================================================

router.put('/config/help', authenticateToken, (req, res) => {
  configCache = null;
  configCacheTime = 0;

  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to update settings' });
  }

  const { enableHelp } = req.body || {};

  let enableHelpVal = null;
  if (enableHelp !== undefined) {
    if (enableHelp === true || enableHelp === 'true' || enableHelp === 1 || enableHelp === '1') {
      enableHelpVal = 1;
    } else {
      enableHelpVal = 0;
    }
  }

  if (enableHelpVal === null) {
    return res.status(400).json({ message: 'Missing required field: enableHelp' });
  }

  db.run(
    'UPDATE app_config SET help = ?, updated_at = datetime(\'now\') WHERE id = 1',
    [enableHelpVal],
    function (err) {
      if (err) {
        logger.error('Error updating help setting', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.json({ enableHelp: enableHelpVal === 1 });
    }
  );
});

router.put('/config/map', authenticateToken, (req, res) => {
  configCache = null;
  configCacheTime = 0;

  if (req.user.role !== 'administrator') {
    return res.status(403).json({ message: 'Insufficient permissions to update settings' });
  }

  const { enableMap } = req.body || {};

  let enableMapVal = null;
  if (enableMap !== undefined) {
    if (enableMap === true || enableMap === 'true' || enableMap === 1 || enableMap === '1') {
      enableMapVal = 1;
    } else {
      enableMapVal = 0;
    }
  }

  if (enableMapVal === null) {
    return res.status(400).json({ message: 'Missing required field: enableMap' });
  }

  db.run(
    'UPDATE app_config SET map = ?, updated_at = datetime(\'now\') WHERE id = 1',
    [enableMapVal],
    function (err) {
      if (err) {
        logger.error('Error updating map setting', { error: err.message });
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.json({ enableMap: enableMapVal === 1 });
    }
  );
});

// =============================================================================
// SECURITY SETTINGS
// =============================================================================

/**
 * @swagger
 * /settings/config/security:
 *   get:
 *     summary: Get security settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionTimeout:
 *                   type: integer
 *                 maxLoginAttempts:
 *                   type: integer
 *                 lockoutDuration:
 *                   type: integer
 *                 passwordPolicy:
 *                   type: object
 *                   properties:
 *                     minLength:
 *                       type: integer
 *                     requireSpecialChars:
 *                       type: boolean
 *                     requireNumbers:
 *                       type: boolean
 *                     requireUppercase:
 *                       type: boolean
 *                     requireLowercase:
 *                       type: boolean
 *                     blacklist:
 *                       type: array
 *                       items:
 *                         type: string
 *       500:
 *         description: Server error
 */
// Fetch security settings (admin only)
router.get('/config/security', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  db.get('SELECT session_timeout_minutes, max_login_attempts, lockout_duration_minutes, password_min_length, require_special_chars, require_numbers, require_uppercase, require_lowercase, password_blacklist FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) {
      logger.error('Error fetching security settings', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Config not found' });
    }
    const defaultBlacklist = ['password', '123456', 'qwerty', 'admin'];
    let blacklist = defaultBlacklist;
    try {
      const parsed = row.password_blacklist ? JSON.parse(row.password_blacklist) : null;
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map(v => String(v || '').trim())
          .filter(Boolean);
        const unique = [...new Set(cleaned)];
        blacklist = unique.length ? unique : defaultBlacklist;
      }
    } catch (_) {}

    res.json({
      sessionTimeout: row.session_timeout_minutes || 30,
      maxLoginAttempts: row.max_login_attempts || 5,
      lockoutDuration: row.lockout_duration_minutes || 15,
      passwordPolicy: {
        minLength: row.password_min_length || 8,
        requireSpecialChars: !!row.require_special_chars,
        requireNumbers: !!row.require_numbers,
        requireUppercase: !!row.require_uppercase,
        requireLowercase: !!row.require_lowercase,
        blacklist
      }
    });
  });
});

/**
 * @swagger
 * /settings/config/security:
 *   put:
 *     summary: Update security settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - passwordPolicy
 *             properties:
 *               sessionTimeout:
 *                 type: integer
 *               maxLoginAttempts:
 *                 type: integer
 *               lockoutDuration:
 *                 type: integer
 *               passwordPolicy:
 *                 type: object
 *                 properties:
 *                   minLength:
 *                     type: integer
 *                   requireSpecialChars:
 *                     type: boolean
 *                   requireNumbers:
 *                     type: boolean
 *                   requireUppercase:
 *                     type: boolean
 *                   requireLowercase:
 *                     type: boolean
 *                   blacklist:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Security settings updated
 *       400:
 *         description: Missing password policy
 *       500:
 *         description: Server error
 */
// Update security settings (admin only)
router.put('/config/security', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const { sessionTimeout, maxLoginAttempts, lockoutDuration, passwordPolicy } = req.body;
  
  if (!passwordPolicy) {
    return res.status(400).json({ message: 'Missing password policy settings' });
  }

  const query = `
    UPDATE app_config
    SET session_timeout_minutes = ?, max_login_attempts = ?, lockout_duration_minutes = ?,
        password_min_length = ?, require_special_chars = ?, require_numbers = ?, 
        require_uppercase = ?, require_lowercase = ?, password_blacklist = ?,
        updated_at = datetime('now')
    WHERE id = 1
  `;

  const blacklistJson = JSON.stringify(passwordPolicy.blacklist || []);
  const params = [
    sessionTimeout || 30,
    maxLoginAttempts || 5,
    lockoutDuration || 15,
    passwordPolicy.minLength || 8,
    passwordPolicy.requireSpecialChars ? 1 : 0,
    passwordPolicy.requireNumbers ? 1 : 0,
    passwordPolicy.requireUppercase ? 1 : 0,
    passwordPolicy.requireLowercase ? 1 : 0,
    blacklistJson
  ];

  db.run(query, params, (err) => {
    if (err) {
      logger.error('Error updating security settings', { error: err.message });
      return res.status(500).json({ message: 'Server error' });
    }
    res.json({ message: 'Security settings updated' });
  });
});

// =============================================================================
// TRANSLATIONS
// =============================================================================

/**
 * @swagger
 * /settings/translations/{lang}:
 *   get:
 *     summary: Get translations for a language
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: lang
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pl, en, de]
 *         description: Language code
 *     responses:
 *       200:
 *         description: Translations map
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lang:
 *                   type: string
 *                 translations:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *       400:
 *         description: Invalid language
 *       500:
 *         description: Server error
 */
// Public: fetch translations for the given language (DB overrides)
router.get('/translations/:lang', cacheMiddleware(3600), (req, res) => {
  const lang = String(req.params.lang || '').trim();
  if (!['pl', 'en', 'de', 'cz'].includes(lang)) {
    return res.status(400).json({ message: 'Invalid language' });
  }
  db.all('SELECT key, value FROM translate WHERE lang = ? ORDER BY key', [lang], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    const map = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    res.json({ lang, translations: map });
  });
});

/**
 * @swagger
 * /settings/translate:
 *   get:
 *     summary: Manage translations (Admin)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lang
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pl, en, de]
 *         description: Language code
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search key
 *     responses:
 *       200:
 *         description: List of translation entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   key:
 *                     type: string
 *                   value:
 *                     type: string
 *       400:
 *         description: Invalid language
 *       500:
 *         description: Server error
 */
// Admin: fetch translations with filtering options
router.get('/translate', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const lang = String(req.query.lang || '').trim();
  const search = String(req.query.search || '').trim();
  if (!['pl', 'en', 'de', 'cz'].includes(lang)) {
    return res.status(400).json({ message: 'Invalid language' });
  }
  let sql = 'SELECT key, value FROM translate WHERE lang = ?';
  const params = [lang];
  if (search) {
    sql += ' AND key LIKE ?';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY key';
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json(rows);
  });
});

/**
 * @swagger
 * /settings/translate/bulk:
 *   put:
 *     summary: Bulk update translations
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lang:
 *                       type: string
 *                       enum: [pl, en, de]
 *                     key:
 *                       type: string
 *                     value:
 *                       type: string
 *     responses:
 *       200:
 *         description: Translations updated
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
// Admin: bulk update translations
router.put('/translate/bulk', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (updates.length === 0) {
    return res.status(400).json({ message: 'No updates provided' });
  }
  const validLang = (l) => ['pl', 'en', 'de', 'cz'].includes(String(l || '').trim());
  const stmtSql = `INSERT INTO translate(lang, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lang, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`;

  const stmt = db.prepare(stmtSql);
  let count = 0;
  db.serialize(() => {
    for (const u of updates) {
      const lang = String(u.lang || '').trim();
      const key = String(u.key || '').trim();
      const value = String(u.value ?? '');
      if (!validLang(lang) || !key) continue;
      stmt.run(lang, key, value);
      count++;
    }
    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ message: 'Error saving translations', error: err.message });
      }
      res.json({ updated: count });
    });
  });
});

// =============================================================================
// EMAIL / SMTP
// =============================================================================

// Fetch SMTP configuration (administrator only)
router.get('/config/email', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  db.get('SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) {
      logger.error('Error fetching SMTP configuration', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: 'Configuration not found' });
    }
    res.json({
      host: row.smtp_host || '',
      port: row.smtp_port || 587,
      secure: !!row.smtp_secure,
      user: row.smtp_user || '',
      pass: row.smtp_pass ? decrypt(row.smtp_pass) : '',
      from: row.smtp_from || 'no-reply@example.com'
    });
  });
});

/**
 * @swagger
 * /settings/config/email:
 *   put:
 *     summary: Update SMTP configuration
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host:
 *                 type: string
 *               port:
 *                 type: integer
 *               secure:
 *                 type: boolean
 *               user:
 *                 type: string
 *               pass:
 *                 type: string
 *               from:
 *                 type: string
 *     responses:
 *       200:
 *         description: SMTP configuration updated
 *       500:
 *         description: Server error
 */
// Update SMTP configuration (administrator only)
router.put('/config/email', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const { host, port, secure, user, pass, from } = req.body || {};
  const query = `
    UPDATE app_config
    SET smtp_host = COALESCE(?, smtp_host),
        smtp_port = COALESCE(?, smtp_port),
        smtp_secure = COALESCE(?, smtp_secure),
        smtp_user = COALESCE(?, smtp_user),
        smtp_pass = COALESCE(?, smtp_pass),
        smtp_from = COALESCE(?, smtp_from),
        updated_at = datetime('now')
    WHERE id = 1
  `;
  db.run(query, [host || null, port || null, (secure ? 1 : 0), user || null, pass || null, from || null], function(err) {
    if (err) {
      logger.error('Error updating SMTP settings', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    db.get('SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from FROM app_config WHERE id = 1', [], (err2, row) => {
      if (err2) {
        return res.status(500).json({ message: 'Server error', error: err2.message });
      }
      res.json({
        host: row.smtp_host || '',
        port: row.smtp_port || 587,
        secure: !!row.smtp_secure,
        user: row.smtp_user || '',
        pass: row.smtp_pass || '',
        from: row.smtp_from || 'no-reply@example.com'
      });
    });
  });
});

// Send test email (admin only)
router.post('/config/email/test', authenticateToken, requirePermission('SYSTEM_SETTINGS'), asyncHandler(async (req, res) => {
  const { to } = req.body || {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || typeof to !== 'string' || !emailRegex.test(to)) {
    return res.status(400).json({ message: 'Provide a valid recipient address (to)' });
  }

  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from FROM app_config WHERE id = 1', [], (err, r) => {
        if (err) return reject(err);
        resolve(r);
      });
    });
    const host = row?.smtp_host || process.env.SMTP_HOST || '';
    const port = row?.smtp_port || parseInt(process.env.SMTP_PORT || '0', 10) || 587;
    const secure = !!(row?.smtp_secure || (process.env.SMTP_SECURE === 'true'));
    const user = row?.smtp_user || process.env.SMTP_USER || '';
    const pass = row?.smtp_pass ? decrypt(row.smtp_pass) : (process.env.SMTP_PASS || '');
    const from = row?.smtp_from || process.env.SMTP_FROM || '';

    if (!host || !port || !from || !emailRegex.test(String(from))) {
      return res.status(400).json({ message: 'Invalid SMTP configuration (host/port/from)' });
    }

    const effectiveSecure = port === 465 ? true : secure;
    const transporterOptions = {
      host,
      port,
      secure: effectiveSecure,
    };
    if (user && pass) {
      transporterOptions.auth = { user, pass };
    }
    const transporter = nodemailer.createTransport(transporterOptions);

    try { await transporter.verify(); } catch (_) {}

    await transporter.sendMail({
      from,
      to,
      subject: 'Test Email - Tool Management System',
      text: 'This is a test email from the Tool Management System to verify SMTP settings.'
    });

    res.json({ message: 'Test email sent successfully' });
  } catch (err) {
    logger.error('Test email failed', { error: err.message });
    res.status(500).json({ message: 'Failed to send test email', error: err.message });
  }
}));

// =============================================================================
// DATABASE SETTINGS
// =============================================================================

/**
 * @swagger
 * /settings/config/database:
 *   get:
 *     summary: Get database settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Database settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 supabaseUrl:
 *                   type: string
 *                 supabaseKey:
 *                   type: string
 *                 dbSource:
 *                   type: string
 *       500:
 *         description: Server error
 */
// Fetch database settings (admin only)
router.get('/config/database', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  db.get('SELECT supabase_url, supabase_key, supabase_service_key, db_source FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) {
      logger.error('Error fetching database settings', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: 'Configuration not found' });
    }
    res.json({
      supabaseUrl: row.supabase_url || '',
      supabaseKey: row.supabase_key ? decrypt(row.supabase_key) : '',
      supabaseServiceKey: row.supabase_service_key ? decrypt(row.supabase_service_key) : '',
      dbSource: row.db_source || 'local'
    });
  });
});

/**
 * @swagger
 * /settings/config/database:
 *   put:
 *     summary: Update database settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               supabaseUrl:
 *                 type: string
 *               supabaseKey:
 *                 type: string
 *               dbSource:
 *                 type: string
 *     responses:
 *       200:
 *         description: Database settings updated
 *       500:
 *         description: Server error
 */
// Update database settings (admin only)
router.put('/config/database', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const { supabaseUrl, supabaseKey, supabaseServiceKey, dbSource } = req.body || {};
  const encryptedKey = supabaseKey ? encrypt(supabaseKey) : null;
  const encryptedServiceKey = supabaseServiceKey ? encrypt(supabaseServiceKey) : null;
  const query = `
    UPDATE app_config
    SET supabase_url = COALESCE(?, supabase_url),
        supabase_key = COALESCE(?, supabase_key),
        supabase_service_key = COALESCE(?, supabase_service_key),
        db_source = COALESCE(?, db_source),
        updated_at = datetime('now')
    WHERE id = 1
  `;
  db.run(query, [supabaseUrl || null, encryptedKey, encryptedServiceKey, dbSource || 'local'], function(err) {
    if (err) {
      logger.error('Error updating database settings', { error: err.message });
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json({ message: 'Database settings updated' });
  });
});

// =============================================================================
// LOGO MANAGEMENT
// =============================================================================

// Upload application logo (administrator only)
router.post('/config/logo', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  if (!logoUpload) {
    return res.status(500).json({ message: 'Upload not available' });
  }
  logoUpload.single('logo')(req, res, async (err) => {
    if (err) {
      if (err.message === 'ONLY_PNG') {
        return res.status(400).json({ message: 'Only PNG files are allowed' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File is too large (max 2MB)' });
      }
      return res.status(500).json({ message: 'Upload error', error: err.message });
    }

    // If the file does not exist
    if (!req.file) {
      return res.status(400).json({ message: 'No logo file uploaded' });
    }

    // Validate PNG dimensions on the backend
    const size = await getPngSizeAsync(req.file.path);
    if (!size) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Invalid PNG file' });
    }
    const { width, height } = size;
    if (
      width < MIN_LOGO_WIDTH || height < MIN_LOGO_HEIGHT ||
      width > MAX_LOGO_WIDTH || height > MAX_LOGO_HEIGHT
    ) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        message: `Logo dimensions out of range: min ${MIN_LOGO_WIDTH}x${MIN_LOGO_HEIGHT}, max ${MAX_LOGO_WIDTH}x${MAX_LOGO_HEIGHT}. Received ${width}x${height}`
      });
    }

    // Set current logo
    try {
      await copyFileAsync(req.file.path, CURRENT_LOGO_PATH);
    } catch (copyErr) {
      return res.status(500).json({ message: 'Failed to save current logo', error: copyErr.message });
    }

    const timestamp = Date.now();
    return res.json({
      message: 'Logo updated',
      url: '/logo.png',
      timestamp,
      version: path.basename(req.file.path),
      size: { width, height }
    });
  });
});

/**
 * @swagger
 * /settings/config/logo/history:
 *   get:
 *     summary: Get logo version history
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logo history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentUrl:
 *                   type: string
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       url:
 *                         type: string
 *                       uploadedAt:
 *                         type: number
 *       500:
 *         description: Server error
 */
// Logo version history list (administrator only)
router.get('/config/logo/history', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  try {
    const files = fs.readdirSync(LOGO_DIR)
      .filter(name => name.startsWith('logo-') && name.endsWith('.png'))
      .map(name => {
        const full = path.join(LOGO_DIR, name);
        const stat = fs.statSync(full);
        return {
          filename: name,
          url: `/logos/${name}`,
          uploadedAt: stat.mtimeMs
        };
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
    res.json({ currentUrl: '/logo.png', versions: files });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching logo history', error: err.message });
  }
});

// Restore selected logo version (admin only)
router.post('/config/logo/rollback', authenticateToken, requirePermission('SYSTEM_SETTINGS'), async (req, res) => {
  const { filename } = req.body || {};
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ message: 'Invalid version filename' });
  }
  const target = path.join(LOGO_DIR, filename);
  try {
    if (!fs.existsSync(target)) {
      return res.status(404).json({ message: 'Selected version does not exist' });
    }
    const size = await getPngSizeAsync(target);
    if (!size) {
      return res.status(400).json({ message: 'Selected version has an invalid PNG file' });
    }
    const { width, height } = size;
    if (
      width < MIN_LOGO_WIDTH || height < MIN_LOGO_HEIGHT ||
      width > MAX_LOGO_WIDTH || height > MAX_LOGO_HEIGHT
    ) {
      return res.status(400).json({
        message: `Version dimensions out of range: min ${MIN_LOGO_WIDTH}x${MIN_LOGO_HEIGHT}, max ${MAX_LOGO_WIDTH}x${MAX_LOGO_HEIGHT}. Received ${width}x${height}`
      });
    }
    await copyFileAsync(target, CURRENT_LOGO_PATH);
    const timestamp = Date.now();
    res.json({ message: 'Selected logo version restored', url: '/logo.png', timestamp, size });
  } catch (err) {
    res.status(500).json({ message: 'Error restoring version', error: err.message });
  }
});

/**
 * @swagger
 * /settings/config/logo/{filename}:
 *   delete:
 *     summary: Delete logo version
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Logo filename
 *     responses:
 *       200:
 *         description: Logo version deleted
 *       400:
 *         description: Invalid filename
 *       404:
 *         description: Version not found
 *       500:
 *         description: Server error
 */
// Delete selected logo version (admin only)
router.delete('/config/logo/:filename', authenticateToken, requirePermission('SYSTEM_SETTINGS'), (req, res) => {
  const { filename } = req.params || {};
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ message: 'Invalid version filename' });
  }
  // Safety: only files matching logo-*.png pattern are allowed
  if (!/^logo-\d+\.png$/.test(filename)) {
    return res.status(400).json({ message: 'Invalid filename' });
  }
  const target = path.join(LOGO_DIR, filename);
  fs.unlink(target, (err) => {
    if (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ message: 'Selected version does not exist' });
      return res.status(500).json({ message: 'Error deleting logo version', error: err.message });
    }
    return res.json({ message: 'Logo version deleted', deleted: filename });
  });
});

// =============================================================================
// DATABASE EXPLORER
// =============================================================================

// Admin/permission-only: List of tables in the database
router.get('/db/tables', authenticateToken, requirePermission('VIEW_DATABASE'), (req, res) => {
  const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      logger.error('Error fetching table list', { error: err.message });
      return res.status(500).json({ message: 'Error fetching table list' });
    }
    const tables = rows.map(r => r.name);
    res.json(tables);
  });
});

/**
 * @swagger
 * /settings/db/table/{name}:
 *   get:
 *     summary: Preview table data
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Table name
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Table data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tableName:
 *                   type: string
 *                 columns:
 *                   type: array
 *                   items:
 *                     type: string
 *                 rows:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       400:
 *         description: Invalid table name
 *       500:
 *         description: Server error
 */
// Admin/permission-only: Preview selected table contents with pagination
router.get('/db/table/:name', authenticateToken, requirePermission('VIEW_DATABASE'), (req, res) => {
  const tableName = String(req.params.name || '').trim();
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  // Table name validation against SQL injection – only existing names from sqlite_master are allowed
  const validateSql = `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`;
  db.get(validateSql, [tableName], (err, row) => {
    if (err) {
      logger.error('Error validating table name', { error: err.message });
      return res.status(500).json({ message: 'Table name validation error' });
    }
    if (!row) {
      return res.status(400).json({ message: 'Invalid table name' });
    }

    // Download the diagram (columns)
    db.all(`PRAGMA table_info(${tableName})`, [], (errCols, cols) => {
      if (errCols) {
        logger.error('Error fetching table schema', { error: errCols.message });
        return res.status(500).json({ message: 'Error fetching table schema' });
      }

      const columnNames = (cols || []).map(c => c.name);
      const pkColumns = (cols || []).filter(c => c.pk).sort((a,b) => a.pk - b.pk).map(c => c.name);
      const columnTypes = (cols || []).reduce((acc, c) => {
        acc[c.name] = c.type;
        return acc;
      }, {});

      // Download the records with pagination
      const dataSql = `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`;
      db.all(dataSql, [limit, offset], (errData, rows) => {
        if (errData) {
          logger.error('Error fetching table data', { error: errData.message });
          return res.status(500).json({ message: 'Error fetching table data' });
        }

        // Count the total number of records
        const countSql = `SELECT COUNT(*) as count FROM ${tableName}`;
        db.get(countSql, [], (errCount, countRow) => {
          if (errCount) {
            logger.error('Error counting table records', { error: errCount.message });
            return res.status(500).json({ message: 'Error counting table records' });
          }

          res.json({
            tableName,
            columns: columnNames,
            primaryKey: pkColumns,
            columnTypes,
            rows: rows || [],
            total: countRow ? countRow.count : 0,
            limit,
            offset
          });
        });
      });
    });
  });
});

// Admin/permission-only: Create a new table
router.post('/db/table', authenticateToken, requirePermission('MANAGE_DATABASE'), (req, res) => {
  const { name, columns, primaryKey } = req.body;
  if (!name || !columns || !Array.isArray(columns) || columns.length === 0) {
    return res.status(400).json({ message: 'Invalid table definition' });
  }
  
  // Validate table name
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    return res.status(400).json({ message: 'Invalid table name' });
  }

  // Construct CREATE TABLE SQL
  let sql = `CREATE TABLE ${name} (`;
  const colDefs = [];
  
  for (const col of columns) {
    if (!col.name || !/^[A-Za-z0-9_]+$/.test(col.name)) {
      return res.status(400).json({ message: `Invalid column name: ${col.name}` });
    }
    let def = `${col.name} ${col.type || 'TEXT'}`;
    if (col.notNull) def += ' NOT NULL';
    colDefs.push(def);
  }
  
  if (primaryKey && /^[A-Za-z0-9_]+$/.test(primaryKey)) {
    // Check if primaryKey matches one of the columns
    if (!columns.some(c => c.name === primaryKey)) {
       return res.status(400).json({ message: `Primary key ${primaryKey} not found in columns` });
    }
    // Note: In SQLite, it's common to define PRIMARY KEY inline for single column, 
    // or at the end. Here we append it at the end if provided separately.
    // However, user might want AUTOINCREMENT which requires INTEGER PRIMARY KEY inline.
    // For simplicity, we just add PRIMARY KEY (pk) constraint.
    colDefs.push(`PRIMARY KEY (${primaryKey})`);
  }
  
  sql += colDefs.join(', ') + ')';
  
  db.run(sql, (err) => {
    if (err) {
      logger.error('Error creating table', { error: err.message, sql });
      return res.status(500).json({ message: 'Error creating table', error: err.message });
    }
    logger.info(`Table ${name} created by ${req.user.username}`);
    res.json({ message: `Table ${name} created successfully` });
  });
});

// Admin/permission-only: Delete a table
router.delete('/db/table/:name', authenticateToken, requirePermission('MANAGE_DATABASE'), (req, res) => {
  const tableName = String(req.params.name || '').trim();
  
  // Validate table name against whitelist (existing tables)
  const validateSql = `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`;
  db.get(validateSql, [tableName], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ message: 'Invalid table name' });
    }
    
    // Prevent deleting system tables if any logic requires it (though permission MANAGE_DATABASE is high level)
    
    db.run(`DROP TABLE ${tableName}`, (errDrop) => {
      if (errDrop) {
        logger.error('Error dropping table', { error: errDrop.message, tableName });
        return res.status(500).json({ message: 'Error dropping table' });
      }
      logger.info(`Table ${tableName} dropped by ${req.user.username}`);
      res.json({ message: `Table ${tableName} dropped successfully` });
    });
  });
});

// Admin/permission-only: Add a row
router.post('/db/table/:name/row', authenticateToken, requirePermission('MANAGE_DATABASE'), (req, res) => {
  const tableName = String(req.params.name || '').trim();
  const { values } = req.body;
  
  if (!values || typeof values !== 'object') {
    return res.status(400).json({ message: 'Invalid row data' });
  }

  // Validate table
  const validateSql = `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`;
  db.get(validateSql, [tableName], (err, row) => {
    if (err || !row) return res.status(400).json({ message: 'Invalid table name' });

    // Build INSERT
    const cols = Object.keys(values);
    if (cols.length === 0) return res.status(400).json({ message: 'No data to insert' });

    // Validate column names (simple regex)
    if (cols.some(c => !/^[A-Za-z0-9_]+$/.test(c))) {
      return res.status(400).json({ message: 'Invalid column names' });
    }

    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`;
    const params = cols.map(c => values[c]);

    db.run(sql, params, function(errInsert) {
      if (errInsert) {
        logger.error('Error inserting row', { error: errInsert.message, tableName });
        return res.status(500).json({ message: 'Error inserting row', error: errInsert.message });
      }
      res.json({ message: 'Row added', id: this.lastID });
    });
  });
});

// Admin/permission-only: Update a row
router.put('/db/table/:name/row', authenticateToken, requirePermission('MANAGE_DATABASE'), (req, res) => {
  const tableName = String(req.params.name || '').trim();
  const { pk, id, updates } = req.body;
  
  if (!pk || id === undefined || !updates || typeof updates !== 'object') {
    return res.status(400).json({ message: 'Invalid update data (pk, id, updates required)' });
  }

  // Validate table
  const validateSql = `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`;
  db.get(validateSql, [tableName], (err, row) => {
    if (err || !row) return res.status(400).json({ message: 'Invalid table name' });
    
    // Validate PK column name
    if (!/^[A-Za-z0-9_]+$/.test(pk)) return res.status(400).json({ message: 'Invalid primary key column' });

    const cols = Object.keys(updates);
    if (cols.length === 0) return res.status(400).json({ message: 'No updates provided' });
    
    if (cols.some(c => !/^[A-Za-z0-9_]+$/.test(c))) {
      return res.status(400).json({ message: 'Invalid column names in updates' });
    }

    const setClause = cols.map(c => `${c} = ?`).join(', ');
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${pk} = ?`;
    const params = [...cols.map(c => updates[c]), id];

    db.run(sql, params, function(errUpdate) {
      if (errUpdate) {
        logger.error('Error updating row', { error: errUpdate.message, tableName });
        return res.status(500).json({ message: 'Error updating row', error: errUpdate.message });
      }
      res.json({ message: 'Row updated', changes: this.changes });
    });
  });
});

// Admin/permission-only: Delete a row
router.delete('/db/table/:name/row', authenticateToken, requirePermission('MANAGE_DATABASE'), (req, res) => {
  const tableName = String(req.params.name || '').trim();
  const { pk, id } = req.query;
  
  if (!pk || id === undefined) {
    return res.status(400).json({ message: 'pk and id query parameters required' });
  }

  // Validate table
  const validateSql = `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`;
  db.get(validateSql, [tableName], (err, row) => {
    if (err || !row) return res.status(400).json({ message: 'Invalid table name' });
    
    // Validate PK
    if (!/^[A-Za-z0-9_]+$/.test(pk)) return res.status(400).json({ message: 'Invalid primary key column' });

    const sql = `DELETE FROM ${tableName} WHERE ${pk} = ?`;
    db.run(sql, [id], function(errDelete) {
      if (errDelete) {
        logger.error('Error deleting row', { error: errDelete.message, tableName });
        return res.status(500).json({ message: 'Error deleting row', error: errDelete.message });
      }
      res.json({ message: 'Row deleted', changes: this.changes });
    });
  });
});

module.exports = router;
