export const validateEmailConfig = (emailCfg, t) => {
  const errors = { host: '', port: '', from: '' };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // host
  if (!emailCfg.host || String(emailCfg.host).trim().length === 0) {
    errors.host = t ? t('appConfig.email.validation.hostRequired') : 'Host is required';
  }
  
  // port
  const portNum = parseInt(emailCfg.port, 10);
  if (!portNum || portNum <= 0 || portNum > 65535) {
    errors.port = t ? t('appConfig.email.validation.portInvalid') : 'Invalid port';
  }
  
  // from
  if (!emailCfg.from || !emailRegex.test(String(emailCfg.from))) {
    errors.from = t ? t('appConfig.email.validation.fromInvalid') : 'Invalid sender email';
  }
  
  const isValid = !errors.host && !errors.port && !errors.from;
  return { isValid, errors };
};

export const validateGeneralConfig = (generalCfg, t) => {
  const errors = { appName: '', companyName: '' };
  
  if (!generalCfg.appName || String(generalCfg.appName).trim().length === 0) {
    errors.appName = t ? t('appConfig.general.validation.appNameRequired') : 'Application name is required';
  }
  
  if (!generalCfg.companyName || String(generalCfg.companyName).trim().length === 0) {
    errors.companyName = t ? t('appConfig.general.validation.companyNameRequired') : 'Company name is required';
  }
  
  const isValid = !errors.appName && !errors.companyName;
  return { isValid, errors };
};

export const validateSecurityConfig = (securityCfg, t) => {
  const errors = { 
    sessionTimeout: '', 
    passwordMinLength: '', 
    maxLoginAttempts: '', 
    lockoutDuration: '',
    historyLength: ''
  };
  
  if (securityCfg.sessionTimeout < 1 || securityCfg.sessionTimeout > 1440) {
    errors.sessionTimeout = t ? t('appConfig.security.validation.sessionTimeout') : 'Session timeout must be between 1 and 1440 minutes';
  }
  
  if (securityCfg.passwordMinLength < 4 || securityCfg.passwordMinLength > 128) {
    errors.passwordMinLength = t ? t('appConfig.security.validation.passwordMinLength') : 'Password length must be between 4 and 128 characters';
  }
  
  if (securityCfg.maxLoginAttempts < 1 || securityCfg.maxLoginAttempts > 20) {
    errors.maxLoginAttempts = t ? t('appConfig.security.validation.maxLoginAttempts') : 'Max login attempts must be between 1 and 20';
  }
  
  if (securityCfg.lockoutDuration < 1 || securityCfg.lockoutDuration > 1440) {
    errors.lockoutDuration = t ? t('appConfig.security.validation.lockoutDuration') : 'Lockout duration must be between 1 and 1440 minutes';
  }

  if (securityCfg.historyLength < 0 || securityCfg.historyLength > 20) {
    errors.historyLength = t ? t('appConfig.security.validation.historyLength') : 'History length must be between 0 and 20';
  }
  
  const isValid = !Object.values(errors).some(Boolean);
  return { isValid, errors };
};

export const validateDatabaseConfig = (dbCfg, t) => {
  const errors = { supabaseUrl: '', supabaseKey: '', supabaseServiceKey: '' };
  
  if (dbCfg.dbSource === 'supabase') {
    if (!dbCfg.supabaseUrl || !dbCfg.supabaseUrl.startsWith('https://')) {
      errors.supabaseUrl = t ? t('appConfig.database.validation.urlInvalid') : 'Invalid Supabase URL (must start with https://)';
    }
    if (!dbCfg.supabaseKey || dbCfg.supabaseKey.length < 20) {
      errors.supabaseKey = t ? t('appConfig.database.validation.keyInvalid') : 'Invalid Supabase Key';
    }
    if (dbCfg.supabaseServiceKey && dbCfg.supabaseServiceKey.length < 20) {
      errors.supabaseServiceKey = t ? t('appConfig.database.validation.keyInvalid') : 'Invalid Supabase Service Key';
    }
  }
  
  const isValid = !errors.supabaseUrl && !errors.supabaseKey && !errors.supabaseServiceKey;
  return { isValid, errors };
};

export const validateBackupConfig = (backupCfg, t) => {
  const errors = { backupRetentionDays: '' };
  
  if (backupCfg.backupRetentionDays < 1 || backupCfg.backupRetentionDays > 365) {
    errors.backupRetentionDays = t ? t('appConfig.backup.validation.retentionDays') : 'Retention days must be between 1 and 365';
  }
  
  const isValid = !errors.backupRetentionDays;
  return { isValid, errors };
};
