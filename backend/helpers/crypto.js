const crypto = require('crypto');
const { JWT_SECRET } = require('../config/constants');

// Use JWT_SECRET as the basis for the encryption key, or a dedicated env var
// Ensure key is 32 bytes
const algorithm = 'aes-256-gcm';
const secretKey = crypto.createHash('sha256').update(String(process.env.ENCRYPTION_KEY || JWT_SECRET || 'fallback_secret_key_change_me')).digest();
const IV_LENGTH = 16;

const encrypt = (text) => {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Return original if fail (or throw)
  }
};

const decrypt = (text) => {
  if (!text) return text;
  if (!text.includes(':')) return text; // Not encrypted or legacy
  try {
    const parts = text.split(':');
    if (parts.length !== 3) return text;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // console.error('Decryption error:', error.message);
    return text; // Return original if fail (legacy support)
  }
};

module.exports = {
  encrypt,
  decrypt
};
