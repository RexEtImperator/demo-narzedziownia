import { describe, it, expect } from 'vitest';
import { validateEmailConfig } from './validators';

describe('validateEmailConfig', () => {
  it('should return valid for correct config', () => {
    const config = {
      host: 'smtp.example.com',
      port: '587',
      from: 'test@example.com'
    };
    const result = validateEmailConfig(config);
    expect(result.isValid).toBe(true);
    expect(result.errors.host).toBeFalsy();
    expect(result.errors.port).toBeFalsy();
    expect(result.errors.from).toBeFalsy();
  });

  it('should validate host requirement', () => {
    const config = { host: '', port: '587', from: 'test@example.com' };
    const result = validateEmailConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.errors.host).toBeTruthy();
  });

  it('should validate port range', () => {
    const config = { host: 'smtp.example.com', port: '70000', from: 'test@example.com' };
    const result = validateEmailConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.errors.port).toBeTruthy();
  });

  it('should validate email format', () => {
    const config = { host: 'smtp.example.com', port: '587', from: 'invalid-email' };
    const result = validateEmailConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.errors.from).toBeTruthy();
  });

  it('should use translation function if provided', () => {
    const t = (key) => `translated_${key}`;
    const config = { host: '', port: '', from: '' };
    const result = validateEmailConfig(config, t);
    expect(result.errors.host).toBe('translated_appConfig.email.validation.hostRequired');
  });
});
