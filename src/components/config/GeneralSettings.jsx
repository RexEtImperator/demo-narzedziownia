import React from 'react';

const GeneralSettings = ({ config, updateConfig, t, errors }) => {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="appName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('appConfig.general.appName')}
        </label>
        <input
          id="appName"
          name="appName"
          type="text"
          value={config.general.appName}
          onChange={(e) => updateConfig('general', 'appName', e.target.value)}
          className={`mt-1 w-full px-3 py-2 border ${errors?.appName ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500`}
        />
        {errors?.appName && <p className="mt-1 text-sm text-red-600">{errors.appName}</p>}
      </div>

      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('appConfig.general.companyName')}
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          value={config.general.companyName}
          onChange={(e) => updateConfig('general', 'companyName', e.target.value)}
          className={`mt-1 w-full px-3 py-2 border ${errors?.companyName ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500`}
        />
        {errors?.companyName && <p className="mt-1 text-sm text-red-600">{errors.companyName}</p>}
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('appConfig.general.timezone')}
        </label>
        <select
          id="timezone"
          name="timezone"
          value={config.general.timezone}
          onChange={(e) => {
            updateConfig('general', 'timezone', e.target.value);
            try {
              localStorage.setItem('timezone', e.target.value);
              window.dispatchEvent(new CustomEvent('timezone:changed', { detail: { timezone: e.target.value } }));
            } catch (_) { void 0; }
          }}
          className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
        >
          <option value="Europe/Warsaw">{t('appConfig.general.timezones.warsaw')}</option>
          <option value="Europe/London">{t('appConfig.general.timezones.london')}</option>
          <option value="America/New_York">{t('appConfig.general.timezones.newYork')}</option>
          <option value="Asia/Tokyo">{t('appConfig.general.timezones.tokyo')}</option>
        </select>
      </div>

      <div>
        <label htmlFor="language" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('appConfig.general.language')}
        </label>
        <select
          id="language"
          name="language"
          value={config.general.language}
          onChange={(e) => {
            updateConfig('general', 'language', e.target.value);
            try {
              localStorage.setItem('language', e.target.value);
              window.dispatchEvent(new CustomEvent('language:changed', { detail: { language: e.target.value } }));
            } catch (_) { void 0; }
          }}
          className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
        >
          <option value="pl">{t('appConfig.general.language_pl')}</option>
          <option value="en">{t('appConfig.general.language_en')}</option>
          <option value="cz">{t('appConfig.general.language_cz')}</option>
          <option value="de">{t('appConfig.general.language_de')}</option>
        </select>
      </div>

      <div>
        <label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('appConfig.general.dateFormat')}
        </label>
        <select
          id="dateFormat"
          name="dateFormat"
          value={config.general.dateFormat}
          onChange={(e) => {
            updateConfig('general', 'dateFormat', e.target.value);
            try {
              localStorage.setItem('dateFormat', e.target.value);
              window.dispatchEvent(new CustomEvent('dateFormat:changed', { detail: { dateFormat: e.target.value } }));
            } catch (_) { void 0; }
          }}
          className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
        >
          <option value="DD/MM/YYYY HH:mm:ss">DD/MM/YYYY HH:mm:ss</option>
          <option value="DD.MM.YYYY HH:mm:ss">DD.MM.YYYY HH:mm:ss</option>
          <option value="YYYY-MM-DD HH:mm:ss">YYYY-MM-DD HH:mm:ss</option>
          <option value="DD-MM-YYYY HH:mm:ss">DD-MM-YYYY HH:mm:ss</option>
        </select>
      </div>
    </div>
  );
};

export default GeneralSettings;
