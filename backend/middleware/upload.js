const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ROOT_DIR } = require('../config/constants');
const logger = require('../logger');

// Directories
const LOGO_DIR = path.join(ROOT_DIR, 'public', 'logos');
const REPORT_ATTACHMENTS_DIR = path.join(ROOT_DIR, 'public', 'report_attachments');

// Ensure directories exist
function ensureLogoDir() {
  try {
    if (!fs.existsSync(LOGO_DIR)) {
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      logger.info('Utworzono katalog wersji logo', { path: LOGO_DIR });
    }
  } catch (err) {
    logger.error('Nie udało się utworzyć katalogu logo', { error: err.message });
  }
}

function ensureReportAttachmentsDir() {
  try {
    if (!fs.existsSync(REPORT_ATTACHMENTS_DIR)) {
      fs.mkdirSync(REPORT_ATTACHMENTS_DIR, { recursive: true });
      logger.info('Utworzono katalog załączników zgłoszeń', { path: REPORT_ATTACHMENTS_DIR });
    }
  } catch (err) {
    logger.error('Nie udało się utworzyć katalogu załączników', { error: err.message });
  }
}

// Initialize directories
ensureLogoDir();
ensureReportAttachmentsDir();

// 1. Import Upload (Memory Storage)
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 2. Logo Upload
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOGO_DIR);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    cb(null, `logo-${ts}.png`);
  }
});

const logoFileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('ONLY_PNG'));
  }
};

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: logoFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// 3. Report Attachments Upload
const reportStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, REPORT_ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safeName = (file.originalname || 'att').replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${ts}-${safeName}`);
  }
});

const reportFileFilter = (req, file, cb) => {
  if (String(file.mimetype || '').startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('ONLY_IMAGES'));
  }
};

const reportUpload = multer({
  storage: reportStorage,
  fileFilter: reportFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});

module.exports = {
  importUpload,
  logoUpload,
  reportUpload,
  LOGO_DIR,
  REPORT_ATTACHMENTS_DIR
};
