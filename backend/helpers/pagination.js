/**
 * Helper to handle pagination parameters and response formatting
 */

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Express request query object
 * @param {number} defaultLimit - Default limit (default: 10)
 * @returns {Object} - { page, limit, offset }
 */
const getPaginationParams = (query, defaultLimit = 10) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const raw = parseInt(query.limit);
  let limit = defaultLimit;
  if (!isNaN(raw)) {
    limit = raw < 1 ? defaultLimit : raw;
  }
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Format paginated response
 * @param {Array} data - Array of data for current page
 * @param {number} total - Total count of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Formatted response object
 */
const formatPaginatedResponse = (data, total, page, limit) => {
  return {
    data: data || [],
    total: total || 0,
    page,
    limit,
    totalPages: Math.ceil((total || 0) / limit)
  };
};

/**
 * Build ORDER BY clause safely from allowed mappings
 * @param {string} sortBy - incoming sort field key
 * @param {string} sortDir - 'asc' or 'desc'
 * @param {Object} allowedMap - map of allowed keys to SQL columns
 * @param {string} defaultColumn - fallback column
 * @param {Object} options - { useCollateNocase: boolean }
 * @returns {string} ORDER BY clause
 */
const buildOrderClause = (sortBy, sortDir, allowedMap = {}, defaultColumn = 'id', options = {}) => {
  const key = typeof sortBy === 'string' ? sortBy.trim() : '';
  const col = allowedMap[key] || defaultColumn;
  const dir = String(sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const collate = options && options.useCollateNocase ? ' COLLATE NOCASE' : '';
  return `ORDER BY ${col}${collate} ${dir}`;
};

/**
 * Build WHERE clauses and params from filters using mapping
 * @param {Object} filters - incoming filters
 * @param {Object} mapping - key -> column mapping
 * @returns {{clauses:string[], params:any[]}}
 */
const buildWhereClause = (filters = {}, mapping = {}) => {
  const clauses = [];
  const params = [];
  for (const key of Object.keys(mapping)) {
    const column = mapping[key];
    const value = filters[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      const clean = value.filter(v => v !== undefined && v !== null && v !== '');
      if (clean.length === 0) continue;
      const placeholders = clean.map(() => '?').join(',');
      clauses.push(`${column} IN (${placeholders})`);
      params.push(...clean);
    } else {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }
  return { clauses, params };
};

module.exports = {
  getPaginationParams,
  formatPaginatedResponse,
  buildOrderClause,
  buildWhereClause
};
