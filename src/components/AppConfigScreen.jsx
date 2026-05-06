import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  BellIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CheckIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  Cog8ToothIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  LanguageIcon,
  LinkIcon,
  QrCodeIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  TagIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import { notifyError } from '../utils/notify.jsx';
import { 
  validateEmailConfig, 
  validateGeneralConfig, 
  validateSecurityConfig, 
  validateDatabaseConfig, 
  validateBackupConfig 
} from '../utils/validators';

// Lazy load configuration components
const DepartmentManagementScreen = React.lazy(() => import('./config/DepartmentManagementScreen'));
const PositionManagementScreen = React.lazy(() => import('./config/PositionManagementScreen'));
const DatabaseTab = React.lazy(() => import('./config/DatabaseTab'));
const FeaturesTab = React.lazy(() => import('./config/FeaturesTab'));
const CategoriesTab = React.lazy(() => import('./config/CategoriesTab'));
const UserManagementTab = React.lazy(() => import('./config/UserManagementTab'));
const RolesPermissionsTab = React.lazy(() => import('./config/RolesPermissionsTab'));
const NotificationsTab = React.lazy(() => import('./config/NotificationsTab'));
const SecurityTab = React.lazy(() => import('./config/SecurityTab'));
const EmailTab = React.lazy(() => import('./config/EmailTab'));
const CodesTab = React.lazy(() => import('./config/CodesTab'));
const TranslationsTab = React.lazy(() => import('./config/TranslationsTab'));
const BackupTab = React.lazy(() => import('./config/BackupTab'));
const ServerTab = React.lazy(() => import('./config/ServerTab'));
const GeneralTab = React.lazy(() => import('./config/GeneralTab'));
const WebhooksTab = React.lazy(() => import('./config/WebhooksTab'));
const DangerZoneTab = React.lazy(() => import('./config/DangerZoneTab'));

const AppConfigScreen = ({ apiClient, user }) => {
  const { t } = useLanguage();
  const { tab } = useParams();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'administrator';

  const [isLocalDb, setIsLocalDb] = useState(() => {
    try {
      const dbSource = localStorage.getItem('app_config_db_source');
      return dbSource === 'local';
    } catch (_e) {
      return false;
    }
  });

  const tabs = React.useMemo(() => {
    return [
      { id: 'general', name: t('appConfig.tabs.general'), icon: Cog8ToothIcon },
      ...(isAdmin ? [{ id: 'security', name: t('appConfig.tabs.security'), icon: ShieldCheckIcon }] : []),
      ...(isAdmin ? [{ id: 'email', name: t('appConfig.tabs.email'), icon: EnvelopeIcon }] : []),
      ...(isAdmin ? [{ id: 'users', name: t('appConfig.tabs.users'), icon: UsersIcon }] : []),
      ...(isAdmin ? [{ id: 'rolesPermissions', name: t('appConfig.tabs.rolesPermissions'), icon: KeyIcon }] : []),
      { id: 'features', name: t('appConfig.tabs.features'), icon: Cog6ToothIcon },
      { id: 'notifications', name: t('appConfig.tabs.notifications'), icon: BellIcon },
      { id: 'departments', name: t('appConfig.tabs.departments'), icon: BuildingOffice2Icon },
      { id: 'positions', name: t('appConfig.tabs.positions'), icon: BriefcaseIcon },
      { id: 'categories', name: t('appConfig.tabs.categories'), icon: TagIcon },
      { id: 'codes', name: t('appConfig.tabs.codes'), icon: QrCodeIcon },
      { id: 'translations', name: t('appConfig.tabs.translations'), icon: LanguageIcon },
      ...(isAdmin && isLocalDb ? [{ id: 'backup', name: t('appConfig.tabs.backup'), icon: ArrowDownTrayIcon }] : []),
      ...(isAdmin ? [{ id: 'database', name: t('appConfig.tabs.database'), icon: CircleStackIcon }] : []),
      ...(isAdmin ? [{ id: 'webhooks', name: t('appConfig.tabs.webhooks'), icon: LinkIcon }] : []),
      ...(isAdmin && isLocalDb ? [{ id: 'server', name: t('appConfig.tabs.server'), icon: ServerStackIcon }] : []),
      ...(isAdmin ? [{ id: 'danger-zone', name: t('appConfig.tabs.dangerZone'), icon: ExclamationTriangleIcon }] : [])
    ];
  }, [t, isAdmin, isLocalDb]);

  // Handle URL redirection and persistence
  useEffect(() => {
    if (!tab) {
      // No tab in URL, redirect to saved or general
      const saved = localStorage.getItem('appConfig.activeTab');
      const target = (saved && tabs.some(x => x.id === saved)) ? saved : 'general';
      navigate(`/settings/${target}`, { replace: true });
    } else if (!tabs.some(x => x.id === tab)) {
       // Invalid tab in URL, redirect to general
       navigate(`/settings/general`, { replace: true });
    } else {
       // Valid tab, save it
       localStorage.setItem('appConfig.activeTab', tab);
    }
  }, [tab, navigate, tabs]);

  const activeTab = (tab && tabs.some(x => x.id === tab)) ? tab : 'general';
  
  const [config, setConfig] = useState({
    general: {
      appName: 'equipr - System Zarządzania Narzędziownią',
      companyName: 'Moja Firma',
      timezone: 'Europe/Warsaw',
      language: 'pl',
      dateFormat: 'DD/MM/YYYY HH:mm:ss',
      toolsCodePrefix: '',
      bhpCodePrefix: '',
      toolCategoryPrefixes: {}
    },
    security: {
      sessionTimeout: 30,
      passwordMinLength: 8,
      requireSpecialChars: true,
      requireNumbers: true,
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      requireUppercase: true,
      requireLowercase: true,
      historyLength: 3,
      blacklist: []
    },
    email: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: 'no-reply@example.com'
    },
    notifications: {
      
    },
    features: {
      enableAuditLog: true,
      auditLogRetention: 90,
      enableReports: true,
      enableApiAccess: false,
      enableDataExport: true,
      enableRealtimeChat: false,
      enableKiosk: false,
      enableHelp: false,
      enableMap: false
    },
    backup: {
      backupFrequency: 'daily',
      backupRetentionDays: 30
    },
    database: {
      supabaseUrl: '',
      supabaseKey: '',
      supabaseServiceKey: '',
      dbSource: 'local'
    }
  });

  const [emailErrors, setEmailErrors] = useState({ host: '', port: '', from: '' });
  const [generalErrors, setGeneralErrors] = useState({});
  const [securityErrors, setSecurityErrors] = useState({});
  const [_databaseErrors, setDatabaseErrors] = useState({});
  const [_backupErrors, setBackupErrors] = useState({});
  
  const [loading, setLoading] = useState(false);
  const [, setSaved] = useState(false);
  
  const notifySuccess = (message) => toast.success(message, { autoClose: 2500, hideProgressBar: true });
  
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [general, security, database] = await Promise.all([
        apiClient.get('/api/config/general'),
        apiClient.get('/api/config/security').catch(() => null),
        apiClient.get('/api/config/database').catch(() => ({ supabaseUrl: '', supabaseKey: '', supabaseServiceKey: '', dbSource: 'local' }))
      ]);
      try {
        const src = database?.dbSource || 'local';
        localStorage.setItem('app_config_db_source', src);
        setIsLocalDb(src === 'local');
      } catch (_) { void 0; }
      setConfig(prev => ({
        ...prev,
        general: {
          appName: general.appName || prev.general.appName,
          companyName: general.companyName ?? prev.general.companyName,
          timezone: general.timezone || prev.general.timezone,
          language: general.language || prev.general.language,
          dateFormat: general.dateFormat || prev.general.dateFormat,
          toolsCodePrefix: general.toolsCodePrefix ?? prev.general.toolsCodePrefix,
          bhpCodePrefix: general.bhpCodePrefix ?? prev.general.bhpCodePrefix,
          toolCategoryPrefixes: general.toolCategoryPrefixes || {}
        },
        features: {
          ...prev.features,
          enableRealtimeChat: !!general.enableRealtimeChat,
          enableKiosk: general.enableKiosk === false ? false : true,
          enableHelp: general.enableHelp === true ? true : false,
          enableMap: general.enableMap === true ? true : false
        },
        database: {
          supabaseUrl: database.supabaseUrl || '',
          supabaseKey: database.supabaseKey || '',
          supabaseServiceKey: database.supabaseServiceKey || '',
          dbSource: database.dbSource || 'local'
        },
        security: security ? {
          sessionTimeout: Number(security.sessionTimeout ?? prev.security.sessionTimeout),
          passwordMinLength: Number(
            security.passwordMinLength ??
            security.passwordPolicy?.minLength ??
            prev.security.passwordMinLength
          ),
          requireSpecialChars: !!(security.requireSpecialChars ?? security.passwordPolicy?.requireSpecialChars),
          requireNumbers: !!(security.requireNumbers ?? security.passwordPolicy?.requireNumbers),
          maxLoginAttempts: Number(security.maxLoginAttempts ?? prev.security.maxLoginAttempts),
          lockoutDuration: Number(security.lockoutDuration ?? prev.security.lockoutDuration),
          requireUppercase: !!(security.requireUppercase ?? security.passwordPolicy?.requireUppercase),
          requireLowercase: !!(security.requireLowercase ?? security.passwordPolicy?.requireLowercase),
          historyLength: Number(security.historyLength ?? prev.security.historyLength),
          blacklist: Array.isArray(security.blacklist)
            ? security.blacklist
            : (Array.isArray(security.passwordPolicy?.blacklist) ? security.passwordPolicy.blacklist : prev.security.blacklist)
        } : prev.security,
        backup: {
          ...prev.backup,
          backupFrequency: general.backupFrequency || prev.backup.backupFrequency,
          backupRetentionDays: Number(general.backupRetentionDays ?? prev.backup.backupRetentionDays ?? 30) || 30
        }
      }));
    } catch (_) {
      toast.error(t('appConfig.load.error'));
    } finally {
      setLoading(false);
    }
  }, [apiClient, t]);

  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setLoading(true);
      if (activeTab === 'general' || activeTab === 'codes' || activeTab === 'backup') {
        const validGeneral = validateGeneralConfig(config.general, t);
        setGeneralErrors(validGeneral.errors);
        if (!validGeneral.isValid) {
          toast.error(t('appConfig.validation.errorsFound') || 'Znaleziono błędy w formularzu.');
          return;
        }

        if (activeTab === 'backup') {
          const validBackup = validateBackupConfig(config.backup, t);
          setBackupErrors(validBackup.errors);
          if (!validBackup.isValid) {
            toast.error(t('appConfig.validation.errorsFound') || 'Znaleziono błędy w formularzu.');
            return;
          }
        }

        await apiClient.put('/api/config/general', {
          appName: config.general.appName,
          companyName: config.general.companyName,
          timezone: config.general.timezone,
          language: config.general.language,
          dateFormat: config.general.dateFormat,
          backupFrequency: config.backup.backupFrequency,
          backupRetentionDays: config.backup.backupRetentionDays,
          toolsCodePrefix: config.general.toolsCodePrefix,
          bhpCodePrefix: config.general.bhpCodePrefix,
          toolCategoryPrefixes: config.general.toolCategoryPrefixes,
          enableRealtimeChat: !!config.features.enableRealtimeChat,
          enableKiosk: !!config.features.enableKiosk,
          enableHelp: !!config.features.enableHelp,
          enableMap: !!config.features.enableMap
        });

        try {
          localStorage.setItem('language', config.general.language);
          window.dispatchEvent(new CustomEvent('language:changed', { detail: { language: config.general.language } }));
          localStorage.setItem('dateFormat', config.general.dateFormat);
          window.dispatchEvent(new CustomEvent('dateFormat:changed', { detail: { dateFormat: config.general.dateFormat } }));
          localStorage.setItem('timezone', config.general.timezone);
          window.dispatchEvent(new CustomEvent('timezone:changed', { detail: { timezone: config.general.timezone } }));
        } catch (_) { void 0; }
      } else if (activeTab === 'security') {
        const validSecurity = validateSecurityConfig(config.security, t);
        setSecurityErrors(validSecurity.errors);
        if (!validSecurity.isValid) {
          toast.error(t('appConfig.validation.errorsFound') || 'Please fix validation errors');
          return;
        }
        await apiClient.put('/api/config/security', {
          sessionTimeout: config.security.sessionTimeout,
          maxLoginAttempts: config.security.maxLoginAttempts,
          lockoutDuration: config.security.lockoutDuration,
          passwordPolicy: {
            minLength: config.security.passwordMinLength,
            requireSpecialChars: !!config.security.requireSpecialChars,
            requireNumbers: !!config.security.requireNumbers,
            requireUppercase: !!config.security.requireUppercase,
            requireLowercase: !!config.security.requireLowercase,
            blacklist: Array.isArray(config.security.blacklist)
              ? config.security.blacklist
              : String(config.security.blacklist || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            }
        });
      } else if (activeTab === 'email') {
        const validEmail = validateEmailConfig(config.email, t);
        setEmailErrors(validEmail.errors);
        if (!validEmail.isValid) {
          toast.error(t('appConfig.validation.errorsFound') || 'Please fix validation errors');
          return;
        }
        await apiClient.put('/api/config/email', {
          host: config.email.host,
          port: config.email.port,
          secure: !!config.email.secure,
          user: config.email.user,
          pass: config.email.pass,
          from: config.email.from
        });
      } else if (activeTab === 'database') {
        const validDatabase = validateDatabaseConfig(config.database, t);
        setDatabaseErrors(validDatabase.errors);
        if (!validDatabase.isValid) {
          toast.error(t('appConfig.validation.errorsFound') || 'Please fix validation errors');
          return;
        }
        await apiClient.put('/api/config/database', {
          supabaseUrl: config.database.supabaseUrl,
          supabaseKey: config.database.supabaseKey,
          supabaseServiceKey: config.database.supabaseServiceKey,
          dbSource: config.database.dbSource
        });
        try {
          const src = config.database.dbSource || 'local';
          localStorage.setItem('app_config_db_source', src);
          setIsLocalDb(src === 'local');
        } catch (_) { void 0; }
      } else {
        return;
      }
      
      // Toastr
      toast.dismiss();
      notifySuccess(t('appConfig.save.success'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (_) {
      toast.dismiss();
      notifyError(t('appConfig.save.error'));
    } finally {
      setLoading(false);
      savingRef.current = false;
    }
  };

  const updateConfig = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const onEmailFieldChange = (field, value) => {
    updateConfig('email', field, value);
    const next = { ...config.email, [field]: value };
    const valid = validateEmailConfig(next, t);
    setEmailErrors(valid.errors);
  };

  const loadEmailConfig = useCallback(async () => {
    try {
      const emailCfg = await apiClient.get('/api/config/email');
      setConfig(prev => ({
        ...prev,
        email: {
          host: emailCfg.host ?? prev.email.host,
          port: emailCfg.port ?? prev.email.port,
          secure: !!emailCfg.secure,
          user: emailCfg.user ?? prev.email.user,
          pass: emailCfg.pass ?? prev.email.pass,
          from: emailCfg.from ?? prev.email.from
        }
      }));
    } catch (_) {
      notifyError(t('appConfig.email.loadError'));
    }
  }, [apiClient, t]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadConfig();
      if (isAdmin) loadEmailConfig();
      try {
        const rawChat = localStorage.getItem('feature.chat.enabled');
        const chatEnabled = rawChat == null ? false : (String(rawChat).trim().toLowerCase() === 'true' || String(rawChat).trim().toLowerCase() === '1');
        setConfig(prev => ({ ...prev, features: { ...prev.features, enableRealtimeChat: !!chatEnabled } }));
      } catch (_) { /* noop */ }
    });
  }, [loadConfig, loadEmailConfig, isAdmin]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralTab 
            config={config} 
            updateConfig={updateConfig} 
            apiClient={apiClient} 
            t={t} 
            notifySuccess={notifySuccess}
            notifyError={notifyError}
            errors={generalErrors}
            user={user}
          />
        );
      case 'security':
        return <SecurityTab config={config} updateConfig={updateConfig} t={t} errors={securityErrors} />;
      case 'email':
        return (
          <EmailTab 
            config={config} 
            onEmailFieldChange={onEmailFieldChange} 
            emailErrors={emailErrors} 
            setEmailErrors={setEmailErrors} 
            apiClient={apiClient} 
            t={t} 
          />
        );
      case 'users':
        return <UserManagementTab user={user} apiClient={apiClient} />;
      case 'rolesPermissions':
        return <RolesPermissionsTab user={user} apiClient={apiClient} />;
      case 'features':
        return (
          <FeaturesTab 
            config={config} 
            updateConfig={updateConfig} 
            t={t} 
            apiClient={apiClient} 
          />
        );
      case 'notifications':
        return <NotificationsTab apiClient={apiClient} t={t} user={user} />;
      case 'departments':
        return <DepartmentManagementScreen apiClient={apiClient} />;
      case 'positions':
        return <PositionManagementScreen apiClient={apiClient} />;
      case 'categories':
        return <CategoriesTab apiClient={apiClient} t={t} />;
      case 'codes':
        return <CodesTab config={config} updateConfig={updateConfig} apiClient={apiClient} t={t} />;
      case 'translations':
        return <TranslationsTab apiClient={apiClient} t={t} />;
      case 'backup':
        return (
          <BackupTab 
            config={config} 
            updateConfig={updateConfig} 
            apiClient={apiClient} 
            t={t} 
            notifySuccess={notifySuccess}
            notifyError={notifyError}
            errors={_backupErrors}
          />
        );
      case 'database':
        return (
          <DatabaseTab 
            config={config} 
            updateConfig={updateConfig} 
            t={t}
            errors={_databaseErrors}
          />
        );
      case 'webhooks':
        return <WebhooksTab />;
      case 'server':
        return (
          <ServerTab 
            t={t}
            user={user}
            apiClient={apiClient}
            notifySuccess={notifySuccess}
            notifyError={notifyError}
          />
        );
      case 'danger-zone':
        return (
          <DangerZoneTab 
            t={t}
            user={user}
            apiClient={apiClient}
          />
        );
      default:
        return (
          <GeneralTab 
            config={config} 
            updateConfig={updateConfig} 
            apiClient={apiClient} 
            t={t} 
            notifySuccess={notifySuccess}
            notifyError={notifyError}
            errors={generalErrors}
          />
        );
    }
  };

  const activeTabMeta = tabs.find((t) => t.id === activeTab) || tabs[0];
  const ActiveIcon = activeTabMeta?.icon;

  return (
    <div className="min-h-full space-y-6 px-6 pb-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('appConfig.header.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">{t('appConfig.header.subtitle')}</p>
        </div>
        {isAdmin && ['general', 'codes', 'backup', 'security', 'email', 'database'].includes(activeTab) ? (
          <button
            onClick={handleSave}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {t('common.saving')}
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('common.saveChanges')}
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Tabs - vertical left panel (sticky on tall screens), content on the right */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-100 dark:border-gray-700 transition-colors duration-200">
        {/* Right content area */}
        <main className="p-6">
          {/* Dynamic section header depending on the active tab */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                {ActiveIcon ? <ActiveIcon className="h-5 w-5" aria-hidden="true" /> : null}
              </span>
              <span>{activeTabMeta.name}</span>
            </h2>
          </div>
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          }>
            {renderTabContent()}
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AppConfigScreen;
