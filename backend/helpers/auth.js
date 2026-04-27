
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const validateUrl = (str) => {
  if (!str || typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return /^https?:\/\//.test(url.toString());
  } catch (_) {
    return false;
  }
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function stripDiacriticsLocal(s) {
  try {
    return String(s || '')
      .replace(/ł/g, 'l').replace(/Ł/g, 'L')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (_) { return String(s || ''); }
}

function sanitizeNamePart(str, take = 3) {
  if (!str) return '';
  const noDiacritics = stripDiacriticsLocal(str);
  const lettersOnly = noDiacritics.replace(/[^a-zA-Z]/g, '');
  return lettersOnly.slice(0, take).toLowerCase();
}

function randomFromAlphabet(length, alphabet) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function normalizeRoleKeyLocal(raw) {
  const k = stripDiacriticsLocal(String(raw || '').trim().toLowerCase());
  const map = {
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
  return map[k] || k;
}

function roleAliasesForLocal(canonical) {
  const base = String(canonical || '').trim().toLowerCase();
  const aliases = {
    administrator: ['administrator', 'admin'],
    manager: ['manager', 'kierownik'],
    employee: ['employee', 'pracownik'],
    supervisor: ['supervisor', 'mistrz'],
    engineer: ['engineer', 'inżynier', 'inzynier'],
    toolsmaster: ['toolsmaster', 'narzędziowiec', 'narzedziowiec'],
    hr: ['hr']
  };
  const arr = aliases[base] || [base];
  const extras = Array.from(new Set(arr.map(stripDiacriticsLocal)));
  return Array.from(new Set([...arr, ...extras]));
}

function getImpliedPermissions(permission) {
  const p = String(permission || '').trim();
  const map = {
    VIEW_TOOLS: ['VIEW_ALL_TOOLS', 'MANAGE_TOOLS'],
    VIEW_USERS: ['MANAGE_USERS'],
    VIEW_BHP: ['MANAGE_BHP'],
    VIEW_DATABASE: ['MANAGE_DATABASE'],
    VIEW_INVENTORY: ['INVENTORY_MANAGE_SESSIONS']
  };
  const implied = map[p] || [];
  return Array.from(new Set([p, ...implied]));
}

function validatePasswordStrength(pass, policy) {
  try {
    const minLen = Number(policy.passwordMinLength || 8);
    const requireSpecial = !!policy.requireSpecialChars;
    const requireNum = !!policy.requireNumbers;
    const requireUpper = !!policy.requireUppercase;
    const requireLower = !!policy.requireLowercase;
    const blacklist = Array.isArray(policy.blacklist) ? policy.blacklist.map(s => String(s).toLowerCase()) : [];
    const s = String(pass || '');
    if (s.length < minLen) return { ok: false, message: `Password must be at least ${minLen} characters long` };
    if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>\-_=+\[\];'`~]/.test(s)) return { ok: false, message: 'Password must contain a special character' };
    if (requireNum && !/[0-9]/.test(s)) return { ok: false, message: 'Password must contain a number' };
    if (requireUpper && !/[A-Z]/.test(s)) return { ok: false, message: 'Password must contain an uppercase letter' };
    if (requireLower && !/[a-z]/.test(s)) return { ok: false, message: 'Password must contain a lowercase letter' };
    if (blacklist.includes(s.toLowerCase())) return { ok: false, message: 'Password is not allowed' };
    return { ok: true };
  } catch (_) {
    return { ok: true };
  }
}

function generateRandomPassword(length = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return randomFromAlphabet(length, alphabet);
}

function generateEmployeeLogin(db, firstName, lastName, cb) {
  const base = sanitizeNamePart(firstName, 3) + sanitizeNamePart(lastName, 3);
  const alphabet = '0123456789';
  const tryGenerate = () => {
    const candidate = base + randomFromAlphabet(4, alphabet);
    db.get('SELECT id FROM users WHERE username = ?', [candidate], (err, row) => {
      if (err) return cb(err);
      if (row) return tryGenerate();
      cb(null, candidate);
    });
  };
  tryGenerate();
}

function checkPasswordNotInHistory(db, userId, plainPassword, historyLength, cb) {
  const n = Math.max(1, Number(historyLength || 0));
  if (n <= 0) return cb && cb(null, true);
  db.all('SELECT password_hash FROM user_password_history WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?', [userId, n], (err, rows) => {
    if (err) return cb && cb(err);
    const reused = (rows || []).some(r => {
      try { return bcrypt.compareSync(plainPassword, r.password_hash); } catch (_) { return false; }
    });
    cb && cb(null, !reused);
  });
}

function sendCredentialsEmail(context, email, username, password, fullName, callback) {
  const { db, nodemailer, rootDir } = context;
  if (!email) return callback && callback(null);
  if (!nodemailer) {
    logger.warn('Email not sent: nodemailer is not installed.');
    const e = new Error('Email sender is not available (nodemailer missing)');
    e.code = 'EMAIL_SENDER_UNAVAILABLE';
    e.messageKey = 'employees.toast.sendError';
    e.userMessage = 'Błąd wysyłania e-mail. Brak modułu nodemailer.';
    return callback && callback(e);
  }
  db.get('SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from FROM app_config WHERE id = 1', [], (err, row) => {
    if (err) {
      logger.warn('Email not sent: cannot read SMTP config from DB, using env.');
    }
    const host = (row && row.smtp_host) || process.env.SMTP_HOST;
    const port = parseInt((row && row.smtp_port) || process.env.SMTP_PORT || '587', 10);
    const configuredSecure = !!((row && row.smtp_secure) || ((process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'));
    const secure = port === 465 ? true : configuredSecure;
    const user = (row && row.smtp_user) || process.env.SMTP_USER;
    const pass = (row && row.smtp_pass) || process.env.SMTP_PASS;
    const from = (row && row.smtp_from) || process.env.SMTP_FROM || 'toolroom';
    if (!host || !user || !pass) {
      logger.warn('Email not sent: SMTP configuration missing.');
      const e = new Error('SMTP configuration missing');
      e.code = 'SMTP_NOT_CONFIGURED';
      e.messageKey = 'employees.toast.smtpNotConfigured';
      e.userMessage = 'Błąd wysyłania e-mail. Nie skonfigurowano SMTP.';
      return callback && callback(e);
    }
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

    const legalNotice = 'Treść niniejszej wiadomości jest poufna i objęta zakazem jej ujawniania. Jeśli odbiorca tej wiadomości nie jest jej zamierzonym adresatem, pracownikiem lub pośrednikiem upoważnionym do jej przekazania adresatowi, informujemy że wszelkie rozpowszechnianie, powielanie lub jakiekolwiek inne wykorzystywanie niniejszej wiadomości jest zabronione. Jeżeli zatem wiadomość ta została otrzymana omyłkowo, prosimy o bezzwłoczne zawiadomienie nadawcy w trybie odpowiedzi na niniejszą wiadomość oraz o usunięcie wszystkich jej kopii.';
    const logoPath = path.join(rootDir, 'public', 'logo.png');
    
    fs.access(logoPath, fs.constants.F_OK, (accessErr) => {
      const hasLogo = !accessErr;
    
      function escapeHtml(str) {
        if (typeof str !== 'string') return String(str || '');
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      }

      const html = `
        <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f7f7f8;padding:24px;color:#111;">
          <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;">
            <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:12px;">
              ${hasLogo ? '<img src="cid:app_logo" alt="Logo" style="height:40px;">' : ''}
              <div style="font-size:18px;font-weight:600;">Dane do logowania</div>
            </div>
            <div style="padding:24px;">
              <p style="margin:0 0 12px;">Witaj <strong>${escapeHtml(fullName)}</strong>,</p>
              <p style="margin:0 0 16px;">Twoje konto zostało utworzone. Poniżej znajdują się twoje dane logowania:</p>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0 16px;">
                <div style="flex:1;min-width:220px;border:1px solid #e5e7eb;border-radius:6px;padding:12px;">
                  <div style="font-size:12px;color:#6b7280;">Login</div>
                  <div style="font-size:16px;font-weight:600;color:#111;">${escapeHtml(username)}</div>
                </div>
                <div style="flex:1;min-width:220px;border:1px solid #e5e7eb;border-radius:6px;padding:12px;">
                  <div style="font-size:12px;color:#6b7280;">Hasło</div>
                  <div style="font-size:16px;font-weight:600;color:#111;">${escapeHtml(password)}</div>
                </div>
              </div>
              <p style="margin:0 0 12px;color:#374151;">Ze względów bezpieczeństwa prosimy o zmianę hasła po pierwszym logowaniu.</p>
            </div>
            <div style="padding:16px 24px;border-top:1px solid #eee;">
              <small style="display:block;font-size:12px;color:#6b7280;font-style:italic;line-height:1.5;">${escapeHtml(legalNotice)}</small>
            </div>
          </div>
        </div>`;

      const mailOptions = {
        from,
        to: email,
        subject: 'Dane do logowania — equipr - System Zarządzania Narzędziownią',
        text: `Witaj ${fullName},\n\nTwoje konto zostało utworzone.\nLogin: ${username}\nHasło: ${password}\n\nZalecamy zmianę hasła po pierwszym logowaniu.\n\n${legalNotice}`,
        html,
        attachments: hasLogo ? [{ filename: 'logo.png', path: logoPath, cid: 'app_logo' }] : []
      };

      transporter.sendMail(mailOptions, (sendErr, info) => {
        if (sendErr) {
          logger.error('Error sending email with login credentials', { error: sendErr.message });
          return callback && callback(sendErr);
        }
        logger.info('Sent email with login credentials', { response: info && info.response });
        callback && callback(null);
      });
    });
  });
}

module.exports = {
  validateUrl,
  validateEmail,
  stripDiacriticsLocal,
  normalizeRoleKeyLocal,
  roleAliasesForLocal,
  getImpliedPermissions,
  validatePasswordStrength,
  sanitizeNamePart,
  randomFromAlphabet,
  generateRandomPassword,
  generateEmployeeLogin,
  checkPasswordNotInHistory,
  sendCredentialsEmail
};
