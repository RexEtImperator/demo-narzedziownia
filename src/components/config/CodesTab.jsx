import React, { useState, useEffect } from 'react';

const CodesTab = ({ config, updateConfig, apiClient, t }) => {
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true);
        const data = await apiClient.get('/api/categories/stats');
        const list = Array.isArray(data) ? data.map(c => ({ id: c.id, name: c.name, tool_count: c.tool_count ?? 0 })) : [];
        setCategories(list);
      } catch (err) {
        console.warn('Failed to load categories for prefixes:', err);
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, [apiClient]);

  const handlePrefixChange = (catName, value) => {
    const currentPrefixes = config.general.toolCategoryPrefixes || {};
    const newPrefixes = { ...currentPrefixes, [catName]: value };
    updateConfig('general', 'toolCategoryPrefixes', newPrefixes);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="toolsCodePrefix" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.codes.toolsPrefix')}</label>
            <input
              id="toolsCodePrefix"
              name="toolsCodePrefix"
              type="text"
              placeholder={t('appConfig.codes.toolsPrefixPlaceholder')}
              value={config.general.toolsCodePrefix}
              onChange={(e) => updateConfig('general', 'toolsCodePrefix', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
            />
          </div>
          <div>
            <label htmlFor="bhpCodePrefix" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.codes.bhpPrefix')}</label>
            <input
              id="bhpCodePrefix"
              name="bhpCodePrefix"
              type="text"
              placeholder={t('appConfig.codes.bhpPrefixPlaceholder')}
              value={config.general.bhpCodePrefix}
              onChange={(e) => updateConfig('general', 'bhpCodePrefix', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
            />
          </div>
        </div>
      </div>
      <div className="pt-2">
        <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3">{t('appConfig.codes.categoryPrefixesTitle')}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{t('appConfig.codes.categoryPrefixesDesc')}</p>
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          {categoriesLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('loading.categories')}</div>
          ) : (categories || []).length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('noData.categories')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map(cat => (
                <div key={cat.id} className="space-y-1">
                  <label htmlFor={`cat-prefix-${cat.id}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{cat.name}</label>
                  <input
                    id={`cat-prefix-${cat.id}`}
                    name={`cat-prefix-${cat.id}`}
                    type="text"
                    placeholder={t('appConfig.codes.categoryPrefixPlaceholder')}
                    value={(config.general.toolCategoryPrefixes?.[cat.name]) || ''}
                    onChange={(e) => handlePrefixChange(cat.name, e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cat.tool_count ? `${cat.tool_count} ${t('appConfig.codes.toolsCountSuffix')}` : '—'}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('appConfig.codes.categoryPrefixNote')}</div>
        </div>
      </div>
    </div>
  );
};

export default CodesTab;
