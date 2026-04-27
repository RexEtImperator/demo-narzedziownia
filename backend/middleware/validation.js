const Joi = require('joi');
const logger = require('../logger');

/**
 * Middleware walidacji Joi
 * @param {Joi.Schema} schema - Schemat Joi
 * @param {string} property - Część requestu do walidacji (body, query, params)
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true, // Usuwa pola niezdefiniowane w schemacie (sanityzacja)
      allowUnknown: false
    });

    if (error) {
      const details = error.details.map(d => d.message.replace(/"/g, ''));
      logger.warn('Validation error', { path: req.path, ip: req.ip, details });
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: details 
      });
    }

    // Nadpisz zwalidowanymi i przekonwertowanymi danymi
    req[property] = value;
    next();
  };
};

// Eksportujemy też Joi, żeby nie importować go osobno w każdym pliku
const requireBodyFields = (fields) => {
  return (req, res, next) => {
    const required = Array.isArray(fields) ? fields : [fields];
    const missing = required.filter((f) => {
      const v = req.body ? req.body[f] : undefined;
      if (v === null || v === undefined) return true;
      if (typeof v === 'string' && v.trim() === '') return true;
      return false;
    });
    if (missing.length > 0) {
      const details = `Missing fields: ${missing.join(', ')}`;
      if (typeof res.sendError === 'function') {
        return res.sendError(400, 'VALIDATION_ERROR', 'errors.validation', 'Validation error', details);
      }
      return res.status(400).json({ message: 'Validation error', errors: details });
    }
    next();
  };
};

module.exports = { validate, Joi, requireBodyFields };
