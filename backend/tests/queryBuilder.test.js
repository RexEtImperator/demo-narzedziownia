const { buildWhereClause, buildOrderClause } = require('../helpers/queryBuilder');

describe('Query Builder Helpers', () => {
  describe('buildWhereClause', () => {
    test('should return empty clauses when no filters match', () => {
      const { clauses, params } = buildWhereClause({}, {});
      expect(clauses).toEqual([]);
      expect(params).toEqual([]);
    });

    test('should map filters correctly', () => {
      const filters = { status: 'active', type: 'tool' };
      const mapping = { status: 't.status', type: 't.type' };
      
      const { clauses, params } = buildWhereClause(filters, mapping);
      
      expect(clauses).toContain('LOWER(t.status) = LOWER(?)');
      expect(clauses).toContain('LOWER(t.type) = LOWER(?)');
      expect(params).toContain('active');
      expect(params).toContain('tool');
    });

    test('should ignore undefined or null filters', () => {
      const filters = { status: null, type: undefined };
      const mapping = { status: 'status', type: 'type' };
      
      const { clauses } = buildWhereClause(filters, mapping);
      expect(clauses.length).toBe(0);
    });

    test('should ignore filters not in mapping', () => {
      const filters = { unknown: 'value' };
      const mapping = { status: 'status' };
      
      const { clauses } = buildWhereClause(filters, mapping);
      expect(clauses.length).toBe(0);
    });
  });

  describe('buildOrderClause', () => {
    const allowedSort = { name: 'name', date: 'created_at' };

    test('should return default sort when no params provided', () => {
      const clause = buildOrderClause(undefined, undefined, allowedSort, 'name');
      expect(clause).toBe('ORDER BY name ASC');
    });

    test('should use provided sort field', () => {
      const clause = buildOrderClause('date', 'DESC', allowedSort, 'name');
      expect(clause).toBe('ORDER BY created_at DESC');
    });

    test('should fallback to default if sort field invalid', () => {
      const clause = buildOrderClause('invalid', 'ASC', allowedSort, 'name');
      expect(clause).toBe('ORDER BY name ASC');
    });

    test('should normalize sort direction', () => {
      expect(buildOrderClause('name', 'desc', allowedSort, 'name')).toBe('ORDER BY name DESC');
      expect(buildOrderClause('name', 'INVALID', allowedSort, 'name')).toBe('ORDER BY name ASC');
    });
  });
});
