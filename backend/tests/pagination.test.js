const { getPaginationParams, formatPaginatedResponse } = require('../helpers/pagination');

describe('Pagination Helpers', () => {
  describe('getPaginationParams', () => {
    test('should return default values when no params provided', () => {
      const { page, limit, offset } = getPaginationParams({});
      expect(page).toBe(1);
      expect(limit).toBe(10);
      expect(offset).toBe(0);
    });

    test('should parse valid page and limit', () => {
      const { page, limit, offset } = getPaginationParams({ page: '2', limit: '20' });
      expect(page).toBe(2);
      expect(limit).toBe(20);
      expect(offset).toBe(20);
    });

    test('should handle invalid page (less than 1)', () => {
      const { page, limit, offset } = getPaginationParams({ page: '0' });
      expect(page).toBe(1);
      expect(offset).toBe(0);
    });

    test('should handle invalid limit (less than 1)', () => {
      const { limit } = getPaginationParams({ limit: '-5' });
      expect(limit).toBe(10);
    });

    test('should clamp limit to max (100)', () => {
      const { limit } = getPaginationParams({ limit: '1000' });
      expect(limit).toBe(100);
    });
  });

  describe('formatPaginatedResponse', () => {
    test('should format response correctly', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const total = 50;
      const page = 2;
      const limit = 10;
      
      const response = formatPaginatedResponse(data, total, page, limit);
      
      expect(response).toEqual({
        data,
        total,
        page,
        limit,
        totalPages: 5
      });
    });

    test('should calculate totalPages correctly', () => {
      expect(formatPaginatedResponse([], 0, 1, 10).totalPages).toBe(0);
      expect(formatPaginatedResponse([], 10, 1, 10).totalPages).toBe(1);
      expect(formatPaginatedResponse([], 11, 1, 10).totalPages).toBe(2);
    });
  });
});
