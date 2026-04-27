const fs = require('fs');
const path = require('path');

const getPngSizeAsync = (filePath) => {
  return new Promise((resolve) => {
    fs.readFile(filePath, (err, buf) => {
      if (err || !buf || buf.length < 24) return resolve(null);
      
      const sig = buf.slice(0, 8);
      const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      
      if (!sig.equals(pngSig)) return resolve(null);
      
      try {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        resolve({ width, height });
      } catch (_) {
        resolve(null);
      }
    });
  });
};

const copyFileAsync = (src, dest) => {
  return new Promise((resolve, reject) => {
    fs.copyFile(src, dest, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const readFileAsync = (filePath, encoding = 'utf8') => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, encoding, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
};

module.exports = {
  getPngSizeAsync,
  copyFileAsync,
  readFileAsync
};
