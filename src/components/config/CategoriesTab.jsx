import React, { useState, useEffect, useCallback } from 'react';
import { notifyError, notifySuccess } from '../../utils/notify.jsx';

const CategoriesTab = ({ apiClient, t }) => {
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [catNewName, setCatNewName] = useState('');
  const [catEditingId, setCatEditingId] = useState(null);
  const [catEditingName, setCatEditingName] = useState('');

  // Kategorie – ładowanie i operacje
  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const data = await apiClient.get('/api/categories/stats');
      const list = Array.isArray(data) ? data.map(c => ({ id: c.id, name: c.name, tool_count: c.tool_count ?? 0 })) : [];
      setCategories(list);
    } catch (_err) {
      notifyError(t('appConfig.toolsCategories.fetchError'));
      // Fallback: empty or default
      setCategories([
        { id: 1, name: 'Ręczne', tool_count: 0 },
        { id: 2, name: 'Elektronarzędzia', tool_count: 0 },
        { id: 3, name: 'Spawalnicze', tool_count: 0 },
        { id: 4, name: 'Pneumatyczne', tool_count: 0 },
        { id: 5, name: 'Akumulatorowe', tool_count: 0 }
      ]);
    } finally {
      setCategoriesLoading(false);
    }
  }, [apiClient, t]);

  useEffect(() => {
    Promise.resolve().then(() => { loadCategories(); });
  }, [t, loadCategories]);

  const addCategory = async () => {
    const name = (catNewName || '').trim();
    if (!name) {
      notifyError(t('appConfig.toolsCategories.addNameError'));
      return;
    }
    try {
      const created = await apiClient.post('/api/categories', { name });
      setCategories(prev => [...prev, { id: created.id, name: created.name }]);
      setCatNewName('');
      notifySuccess(t('appConfig.toolsCategories.addSuccess'));
    } catch (err) {
      const msg = err?.message || t('appConfig.toolsCategories.addError');
      notifyError(msg);
    }
  };

  const startEditCategory = (cat) => {
    setCatEditingId(cat.id);
    setCatEditingName(cat.name);
  };

  const cancelEditCategory = () => {
    setCatEditingId(null);
    setCatEditingName('');
  };

  const saveEditCategory = async () => {
    const id = catEditingId;
    const name = (catEditingName || '').trim();
    if (!id) return;
    if (!name) {
      notifyError('Nazwa nie może być pusta');
      return;
    }
    try {
      const updated = await apiClient.put(`/api/categories/${id}`, { name });
      setCategories(prev => prev.map(c => c.id === id ? { id, name: updated.name || name } : c));
      cancelEditCategory();
      notifySuccess('Zaktualizowano kategorię');
    } catch (err) {
      const msg = err?.message || t('appConfig.toolsCategories.updateError');
      notifyError(msg);
    }
  };

  const deleteCategory = async (cat) => {
    if (!cat?.id) return;
    if (!window.confirm(`Usunąć kategorię „${cat.name}”?`)) return;
    try {
      await apiClient.delete(`/api/categories/${cat.id}`);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      notifySuccess('Usunięto kategorię');
    } catch (err) {
      const msg = err?.message || t('appConfig.toolsCategories.deleteError');
      notifyError(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          <div className="flex items-end gap-2 mb-4">
            <div className="flex-1">
              <label htmlFor="catNewName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.categories.newCategory')}</label>
              <input
                id="catNewName"
                name="catNewName"
                type="text"
                value={catNewName}
                onChange={(e) => setCatNewName(e.target.value)}
                placeholder={t('appConfig.categories.newCategoryPlaceholder')}
                className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={addCategory}
              className="px-4 py-2 rounded-md bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 dark:hover:bg-indigo-800"
            >
              {t('appConfig.categories.add')}
            </button>
          </div>

          {categoriesLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('loading.categories')}</div>
          ) : categories.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('noData.categories')}</div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {categories.map(cat => (
                <li key={cat.id} className="py-3 flex items-center justify-between">
                  <div className="flex-1">
                    {catEditingId === cat.id ? (
                      <input
                        type="text"
                        value={catEditingName}
                        onChange={(e) => setCatEditingName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 dark:text-white">{cat.name} <span className="text-gray-500 dark:text-gray-400">({cat.tool_count ?? 0})</span></span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {catEditingId === cat.id ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEditCategory}
                          className="px-3 py-1 rounded bg-green-600 dark:bg-green-700 text-white"
                        >{t('common.saveChanges')}</button>
                        <button
                          type="button"
                          onClick={cancelEditCategory}
                          className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                        >{t('common.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditCategory(cat)}
                          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm font-medium"
                        >{t('appConfig.categories.edit')}</button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(cat)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                        >{t('common.remove')}</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoriesTab;
