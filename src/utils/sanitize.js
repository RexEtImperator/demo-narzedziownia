/* eslint-disable no-undef */
import DOMPurify from 'dompurify';

export const sanitizeHTML = (dirty) => {
  if (!dirty) return '';
  // Sanitize and return safe HTML
  return DOMPurify.sanitize(dirty, { 
    ALLOWED_TAGS: [], // No HTML tags allowed by default, strips everything
    ALLOWED_ATTR: [] 
  });
};

export const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  // Handle special objects (Date, FormData, File, Blob, etc.) - return as is
  if (obj instanceof Date || 
      (typeof FormData !== 'undefined' && obj instanceof FormData) ||
      (typeof File !== 'undefined' && obj instanceof File) ||
      (typeof Blob !== 'undefined' && obj instanceof Blob)) {
    return obj;
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeHTML(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};
