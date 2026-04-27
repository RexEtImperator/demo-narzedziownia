const nodemailer = require('nodemailer');
const logger = require('../logger');
const db = require('../database/db');
const { decrypt } = require('./crypto');
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = require('../config/constants');

const getSmtpConfig = () => {
  return new Promise((resolve) => {
    db.get('SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from FROM app_config WHERE id = 1', [], (err, row) => {
      if (err || !row) {
        resolve(null);
      } else {
        resolve(row);
      }
    });
  });
};

const sendEmail = async (to, subject, text, html) => {
  try {
    const dbConfig = await getSmtpConfig();
    
    let host = SMTP_HOST;
    let port = SMTP_PORT;
    let user = SMTP_USER;
    let pass = SMTP_PASS;
    let from = SMTP_FROM;
    let secure = port === 465;

    if (dbConfig) {
       if (dbConfig.smtp_host) host = dbConfig.smtp_host;
       if (dbConfig.smtp_port) port = dbConfig.smtp_port;
       if (dbConfig.smtp_user) user = dbConfig.smtp_user;
       if (dbConfig.smtp_pass) pass = decrypt(dbConfig.smtp_pass);
       if (dbConfig.smtp_from) from = dbConfig.smtp_from;
       if (dbConfig.smtp_secure !== null) secure = !!dbConfig.smtp_secure;
       if (port === 465) secure = true;
    }

    if (!user || !pass) {
      logger.warn('SMTP not configured. Skipping email sending.', { to, subject });
      return false;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    logger.info('Email sent', { messageId: info.messageId, to });
    return true;
  } catch (error) {
    logger.error('Error sending email', { error: error.message, to });
    return false;
  }
};

const checkDuplicateNotification = (db, userId, type, itemType, itemId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id FROM notifications 
      WHERE user_id = ? 
      AND type = ? 
      AND item_type = ? 
      AND item_id = ? 
      AND DATE(created_at) = DATE('now')
      LIMIT 1
    `;
    db.get(sql, [userId, type, itemType, itemId], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
};

module.exports = { checkDuplicateNotification, sendEmail };
