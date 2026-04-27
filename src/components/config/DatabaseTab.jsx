import React from 'react';

const DatabaseTab = ({ config, updateConfig, t, errors = {} }) => {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <div className="bg-white dark:bg-slate-700 p-6 rounded-lg border border-slate-200 dark:border-slate-600">
        <div className="space-y-6">
          <div>
            <label htmlFor="dbSource" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appConfig.database.source')}
            </label>
            <select
              id="dbSource"
              name="dbSource"
              value={config.database.dbSource}
              onChange={(e) => updateConfig('database', 'dbSource', e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-slate-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white dark:bg-slate-600 text-gray-900 dark:text-white"
            >
              <option value="local">{t('appConfig.database.sources.local')}</option>
              <option value="supabase">{t('appConfig.database.sources.supabase')}</option>
            </select>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('appConfig.database.connectionInfo')}
            </p>
          </div>

          <div className={`space-y-4 ${config.database.dbSource === 'local' ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label htmlFor="supabaseUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('appConfig.database.supabaseUrl')}
              </label>
              <input
                type="text"
                name="supabaseUrl"
                id="supabaseUrl"
                autoComplete="url"
                value={config.database.supabaseUrl}
                onChange={(e) => updateConfig('database', 'supabaseUrl', e.target.value)}
                className="mt-1 block w-full border border-gray-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-slate-600 text-gray-900 dark:text-white"
                placeholder="https://your-project.supabase.co"
              />
            </div>

            <div>
              <label htmlFor="supabaseKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('appConfig.database.supabaseKey')}
              </label>
              <input
                type="password"
                name="supabaseKey"
                id="supabaseKey"
                autoComplete="new-password"
                value={config.database.supabaseKey}
                onChange={(e) => updateConfig('database', 'supabaseKey', e.target.value)}
                className={`mt-1 block w-full border ${errors?.supabaseKey ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-slate-600 text-gray-900 dark:text-white`}
              />
              {errors?.supabaseKey && <p className="mt-1 text-sm text-red-600">{errors.supabaseKey}</p>}
            </div>

            <div>
              <label htmlFor="supabaseServiceKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('appConfig.database.supabaseServiceKey')}
              </label>
              <input
                type="password"
                name="supabaseServiceKey"
                id="supabaseServiceKey"
                autoComplete="new-password"
                value={config.database.supabaseServiceKey}
                onChange={(e) => updateConfig('database', 'supabaseServiceKey', e.target.value)}
                className={`mt-1 block w-full border ${errors?.supabaseServiceKey ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-slate-600 text-gray-900 dark:text-white`}
              />
              {errors?.supabaseServiceKey && <p className="mt-1 text-sm text-red-600">{errors.supabaseServiceKey}</p>}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};

export default DatabaseTab;
