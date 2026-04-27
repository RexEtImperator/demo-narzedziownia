import React from 'react';

const LogoSection = ({
  logoPreview,
  logoTs,
  logoFile,
  handleLogoChange,
  handleLogoUpload,
  setLogoFile,
  setLogoPreview,
  logoHistory,
  handleLogoRollback,
  setLogoDeleteFilename,
  setShowLogoDeleteModal,
  loading,
  t,
  MIN_LOGO_WIDTH,
  MIN_LOGO_HEIGHT,
  MAX_LOGO_WIDTH,
  MAX_LOGO_HEIGHT
}) => {
  return (
    <>
      <div className="mt-6">
        <h4 className="text-md font-medium text-gray-900 dark:text-gray-200 mb-3">{t('appConfig.logo.title')}</h4>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 items-start">
          <div>
            <div className="border rounded-lg bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 p-4 flex items-center justify-center">
              <img
                src={(logoPreview || `/logo.png?ts=${logoTs}`)}
                alt={t('appConfig.logo.currentAlt')}
                className="h-24 object-contain"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('appConfig.logo.dimensionsHint').replace('{minW}', MIN_LOGO_WIDTH).replace('{minH}', MIN_LOGO_HEIGHT).replace('{maxW}', MAX_LOGO_WIDTH).replace('{maxH}', MAX_LOGO_HEIGHT)}</p>
          </div>
          <div>
            <label htmlFor="logoFile" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.logo.uploadLabel')}</label>
            <input
              id="logoFile"
              name="logoFile"
              type="file"
              accept="image/png"
              onChange={handleLogoChange}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleLogoUpload}
                disabled={loading || !logoFile}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {t('appConfig.logo.saveNew')}
              </button>
              {logoFile && (
                <button
                  type="button"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                  className="inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border-slate-300 dark:border-slate-600"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Historia wersji logo */}
      <div className="mt-6">
        <h5 className="text-sm font-medium text-gray-900 dark:text-gray-200 mb-2">{t('appConfig.logo.historyTitle')}</h5>
        {logoHistory.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('appConfig.logo.historyEmpty')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {logoHistory.map(v => (
              <div key={v.filename} className="border rounded-lg p-2 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600">
                <img src={`${v.url}`} alt={v.filename} className="h-16 object-contain mx-auto" />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{v.filename}</span>
                  <button
                    type="button"
                    onClick={() => handleLogoRollback(v.filename)}
                    className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-600 text-gray-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-slate-500"
                  >
                    {t('appConfig.logo.apply')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLogoDeleteFilename(v.filename); setShowLogoDeleteModal(true); }}
                    className="ml-2 text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default LogoSection;
