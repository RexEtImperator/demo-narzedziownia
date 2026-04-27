import React from 'react';

const SecurityTab = ({ config, updateConfig, t, errors }) => {
  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="sessionTimeout" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.security.sessionTimeout')}
            </label>
            <input
              id="sessionTimeout"
              name="sessionTimeout"
              type="number"
              value={config.security.sessionTimeout}
              onChange={(e) => updateConfig('security', 'sessionTimeout', parseInt(e.target.value))}
              className={`mt-1 w-full px-3 py-2 border ${errors?.sessionTimeout ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100`}
            />
            {errors?.sessionTimeout && <p className="mt-1 text-sm text-red-600">{errors.sessionTimeout}</p>}
          </div>

          <div>
            <label htmlFor="passwordMinLength" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.security.passwordMinLength')}
            </label>
            <input
              id="passwordMinLength"
              name="passwordMinLength"
              type="number"
              value={config.security.passwordMinLength}
              onChange={(e) => updateConfig('security', 'passwordMinLength', parseInt(e.target.value))}
              className={`mt-1 w-full px-3 py-2 border ${errors?.passwordMinLength ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100`}
            />
            {errors?.passwordMinLength && <p className="mt-1 text-sm text-red-600">{errors.passwordMinLength}</p>}
          </div>

          <div>
            <label htmlFor="maxLoginAttempts" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.security.maxLoginAttempts')}
            </label>
            <input
              id="maxLoginAttempts"
              name="maxLoginAttempts"
              type="number"
              value={config.security.maxLoginAttempts}
              onChange={(e) => updateConfig('security', 'maxLoginAttempts', parseInt(e.target.value))}
              className={`mt-1 w-full px-3 py-2 border ${errors?.maxLoginAttempts ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100`}
            />
            {errors?.maxLoginAttempts && <p className="mt-1 text-sm text-red-600">{errors.maxLoginAttempts}</p>}
          </div>

          <div>
            <label htmlFor="lockoutDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.security.lockoutDuration')}
            </label>
            <input
              id="lockoutDuration"
              name="lockoutDuration"
              type="number"
              value={config.security.lockoutDuration}
              onChange={(e) => updateConfig('security', 'lockoutDuration', parseInt(e.target.value))}
              className={`mt-1 w-full px-3 py-2 border ${errors?.lockoutDuration ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100`}
            />
            {errors?.lockoutDuration && <p className="mt-1 text-sm text-red-600">{errors.lockoutDuration}</p>}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center">
            <input
              id="requireSpecialChars"
              type="checkbox"
              checked={config.security.requireSpecialChars}
              onChange={(e) => updateConfig('security', 'requireSpecialChars', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="requireSpecialChars" className="ml-2 block text-sm text-gray-900 dark:text-gray-200">
              {t('appConfig.security.requireSpecialChars')}
            </label>
          </div>

          <div className="flex items-center">
            <input
              id="requireNumbers"
              type="checkbox"
              checked={config.security.requireNumbers}
              onChange={(e) => updateConfig('security', 'requireNumbers', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="requireNumbers" className="ml-2 block text-sm text-gray-900 dark:text-gray-200">
              {t('appConfig.security.requireNumbers')}
            </label>
          </div>

          <div className="flex items-center">
            <input
              id="requireUppercase"
              type="checkbox"
              checked={config.security.requireUppercase}
              onChange={(e) => updateConfig('security', 'requireUppercase', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="requireUppercase" className="ml-2 block text-sm text-gray-900 dark:text-gray-200">
              {t('appConfig.security.requireUppercase')}
            </label>
          </div>

          <div className="flex items-center">
            <input
              id="requireLowercase"
              type="checkbox"
              checked={config.security.requireLowercase}
              onChange={(e) => updateConfig('security', 'requireLowercase', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="requireLowercase" className="ml-2 block text-sm text-gray-900 dark:text-gray-200">
              {t('appConfig.security.requireLowercase')}
            </label>
          </div>

          <div>
            <label htmlFor="historyLength" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.security.historyLength')}
            </label>
            <input
              id="historyLength"
              name="historyLength"
              type="number"
              min={0}
              value={config.security.historyLength}
              onChange={(e) => {
                const v = Math.max(0, parseInt(e.target.value) || 0);
                updateConfig('security', 'historyLength', v);
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="blacklist" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.security.blacklist.title')}
            </label>
            <textarea
              id="blacklist"
              name="blacklist"
              rows={3}
              value={Array.isArray(config.security.blacklist) ? config.security.blacklist.join(', ') : String(config.security.blacklist || '')}
              onChange={(e) => {
                const arr = String(e.target.value)
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);
                const dedup = Array.from(new Set(arr));
                updateConfig('security', 'blacklist', dedup);
              }}
              placeholder={t('appConfig.security.blacklist.placeholder')}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('appConfig.security.blacklist.hint')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityTab;
