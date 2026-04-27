/**
 * Helper to build SQL queries and clauses
 */

/**
 * Build full text search query string for SQLite FTS5
 * @param {string} search - Raw search string
 * @returns {string|null} - Formatted FTS query string or null
 */
const buildFtsSearchPattern = (search) => {
  if (!search) return null;
  const terms = search.replace(/"/g, '').split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  return terms.map(t => `"${t}"*`).join(' ');
};

/**
 * Build ORDER BY clause safely
 * @param {string} sortBy - Column to sort by
 * @param {string} sortDir - Direction (ASC/DESC)
 * @param {Object} allowedColumns - Map of allowed sort keys to DB columns
 * @param {string} defaultColumn - Default sort column
 * @param {Object} options - Optional settings
 * @param {boolean} options.useCollateNocase - Whether to add COLLATE NOCASE
 * @returns {string} - SQL ORDER BY clause
 */
const buildOrderClause = (sortBy, sortDir, allowedColumns, defaultColumn, options = {}) => {
  const rawSort = String(sortBy || '').trim().toLowerCase();
  const rawDir = String(sortDir || 'asc').trim().toUpperCase();
  const dir = rawDir === 'DESC' ? 'DESC' : 'ASC';
  
  const column = allowedColumns[rawSort] || defaultColumn;
  
  if (!column) return '';

  let sql = `ORDER BY ${column}`;
  
  // Add COLLATE NOCASE if enabled and it looks like a text column (simple heuristic)
  if (options.useCollateNocase) {
    // Check if column is likely text based on name or if explicitly requested
    const isText = /name|sku|category|status|location|description|title|subject|model|manufacturer/i.test(column);
    if (isText) {
      sql += ' COLLATE NOCASE';
    }
  }
  
  return `${sql} ${dir}`;
};

/**
 * Build WHERE clause from simple equality filters
 * @param {Object} filters - Key-value pairs (field: value)
 * @param {Object} mappings - Map filter keys to DB columns (e.g. { category: 't.category' })
 * @returns {Object} - { clauses: [], params: [] }
 */
const buildWhereClause = (filters, mappings) => {
  const clauses = [];
  const params = [];

  Object.keys(filters).forEach(key => {
    const value = filters[key];
    const column = mappings[key];
    
    if (value && column) {
      if (Array.isArray(value)) {
        const cleaned = value.map(v => String(v).trim()).filter(Boolean);
        if (cleaned.length > 0) {
          clauses.push(`LOWER(${column}) IN (${cleaned.map(() => 'LOWER(?)').join(', ')})`);
          params.push(...cleaned);
        }
      } else {
        clauses.push(`LOWER(${column}) = LOWER(?)`);
        params.push(String(value).trim());
      }
    }
  });

  return { clauses, params };
};

module.exports = {
  buildFtsSearchPattern,
  buildOrderClause,
  buildWhereClause
};
