const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const sanitizeInput = (str) => {
  if (!str) return '';
  if (typeof str !== 'string') return String(str);
  return DOMPurify.sanitize(str);
};

module.exports = {
  sanitizeInput
};
