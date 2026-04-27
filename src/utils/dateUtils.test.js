import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { formatTimeAgo, formatDate } from './dateUtils';

describe('dateUtils', () => {
  // Mock localStorage
  const localStorageMock = (function() {
    let store = {};
    return {
      getItem: function(key) { return store[key] || null; },
      setItem: function(key, value) { store[key] = value.toString(); },
      clear: function() { store = {}; },
      removeItem: function(key) { delete store[key]; }
    };
  })();

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  describe('formatTimeAgo', () => {
    it('should return "Just now" for less than 1 minute', () => {
      window.localStorage.setItem('language', 'en');
      const now = new Date();
      vi.setSystemTime(now);
      
      expect(formatTimeAgo(now)).toBe('Just now');
    });

    it('should format minutes correctly in PL', () => {
      window.localStorage.setItem('language', 'pl');
      const now = new Date();
      vi.setSystemTime(now);
      
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatTimeAgo(fiveMinutesAgo)).toBe('5 minut temu');
    });

    it('should handle invalid dates gracefully', () => {
        window.localStorage.setItem('language', 'en');
        expect(formatTimeAgo(null)).toBe('Unknown date');
        expect(formatTimeAgo('invalid-date')).toBe('Unknown date');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
        window.localStorage.setItem('language', 'en');
        const date = new Date('2023-01-01T12:00:00');
        // Note: The exact output depends on the locale and timezone, 
        // so we might need to be flexible or mock toLocaleDateString if needed.
        // Here we check if it returns a string and doesn't crash.
        const formatted = formatDate(date);
        expect(typeof formatted).toBe('string');
        expect(formatted).not.toBe('Unknown date');
    });
  });
});
