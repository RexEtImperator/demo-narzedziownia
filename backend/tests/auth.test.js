const {
  validateEmail,
  stripDiacriticsLocal,
  normalizeRoleKeyLocal,
  roleAliasesForLocal,
  getImpliedPermissions,
  validatePasswordStrength,
  sanitizeNamePart,
  randomFromAlphabet,
  generateRandomPassword
} = require('../helpers/auth');

describe('Auth Helpers', () => {
  
  describe('validateEmail', () => {
    test('should return true for valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
    });

    test('should return false for invalid emails', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('stripDiacriticsLocal', () => {
    test('should remove diacritics', () => {
      expect(stripDiacriticsLocal('ąęćłńóśźż')).toBe('aeclnoszz');
      expect(stripDiacriticsLocal('ÁÉÍÓÚ')).toBe('AEIOU');
    });

    test('should handle empty strings', () => {
      expect(stripDiacriticsLocal(null)).toBe('');
      expect(stripDiacriticsLocal(undefined)).toBe('');
    });
  });

  describe('normalizeRoleKeyLocal', () => {
    test('should normalize role names', () => {
      expect(normalizeRoleKeyLocal('Admin')).toBe('administrator');
      expect(normalizeRoleKeyLocal('kierownik')).toBe('manager');
      expect(normalizeRoleKeyLocal('narzędziowiec')).toBe('toolsmaster');
    });

    test('should return original if no mapping found', () => {
      expect(normalizeRoleKeyLocal('unknown')).toBe('unknown');
    });
  });

  describe('roleAliasesForLocal', () => {
    test('should return aliases for known roles', () => {
      const aliases = roleAliasesForLocal('administrator');
      expect(aliases).toContain('administrator');
      expect(aliases).toContain('admin');
    });

    test('should handle diacritics in aliases', () => {
      const aliases = roleAliasesForLocal('engineer');
      expect(aliases).toContain('inzynier');
    });
  });

  describe('getImpliedPermissions', () => {
    test('should return implied permissions', () => {
      const perms = getImpliedPermissions('VIEW_TOOLS');
      expect(perms).toContain('VIEW_TOOLS');
      expect(perms).toContain('VIEW_ALL_TOOLS');
      expect(perms).toContain('MANAGE_TOOLS');
    });

    test('should return self if no implications', () => {
      const perms = getImpliedPermissions('UNKNOWN_PERM');
      expect(perms).toEqual(['UNKNOWN_PERM']);
    });
  });

  describe('validatePasswordStrength', () => {
    const policy = {
      passwordMinLength: 8,
      requireSpecialChars: true,
      requireNumbers: true,
      requireUppercase: true,
      requireLowercase: true
    };

    test('should validate strong password', () => {
      expect(validatePasswordStrength('StrongPass1!', policy).ok).toBe(true);
    });

    test('should fail short password', () => {
      expect(validatePasswordStrength('Short1!', policy).ok).toBe(false);
    });

    test('should fail missing number', () => {
      expect(validatePasswordStrength('NoNumber!', policy).ok).toBe(false);
    });
  });

  describe('sanitizeNamePart', () => {
    test('should sanitize and truncate', () => {
      expect(sanitizeNamePart('Józef', 3)).toBe('joz');
      expect(sanitizeNamePart('Smith', 3)).toBe('smi');
    });
  });

  describe('randomFromAlphabet', () => {
    test('should return string of correct length', () => {
      expect(randomFromAlphabet(10, 'abc').length).toBe(10);
    });
  });

  describe('generateRandomPassword', () => {
    test('should generate password of default length', () => {
      expect(generateRandomPassword().length).toBe(10);
    });
  });

});
