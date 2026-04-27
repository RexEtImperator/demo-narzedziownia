import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { notifyError } from '../../utils/notify.jsx';

const TranslationsTab = ({ apiClient, t }) => {
  const [translationsLoading, setTranslationsLoading] = useState(false);
  const [translationsSearch, setTranslationsSearch] = useState('');
  const [translations, setTranslations] = useState({}); // { key: { pl, en, de, cz } }
  const [changedPairs, setChangedPairs] = useState(new Set()); // set of `${key}|${lang}` changed
  const [selectedLang, setSelectedLang] = useState('pl');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newPL, setNewPL] = useState('');
  const [newEN, setNewEN] = useState('');
  const [newDE, setNewDE] = useState('');
  const [newCZ, setNewCZ] = useState('');
  const [adding, setAdding] = useState(false);
  const addModalRef = useRef(null);

  const notifySuccess = (message) => toast.success(message, { autoClose: 2500, hideProgressBar: true });

  const loadTranslations = useCallback(async () => {
    try {
      setTranslationsLoading(true);
      const [plRes, enRes, deRes, czRes] = await Promise.all([
        apiClient.get('/api/translations/pl'),
        apiClient.get('/api/translations/en'),
        apiClient.get('/api/translations/de'),
        apiClient.get('/api/translations/cz')
      ]);
      const plMap = plRes?.translations || {};
      const enMap = enRes?.translations || {};
      const deMap = deRes?.translations || {};
      const czMap = czRes?.translations || {};
      const allKeys = Array.from(new Set([...Object.keys(plMap), ...Object.keys(enMap), ...Object.keys(deMap), ...Object.keys(czMap)])).sort();
      const merged = {};
      for (const k of allKeys) {
        merged[k] = { pl: plMap[k] ?? '', en: enMap[k] ?? '', de: deMap[k] ?? '', cz: czMap[k] ?? '' };
      }
      setTranslations(merged);
      setChangedPairs(new Set());
    } catch (_) {
      notifyError(t('appConfig.translations.loadError'));
    } finally {
      setTranslationsLoading(false);
    }
  }, [apiClient, t]);

  useEffect(() => {
    loadTranslations();
  }, [loadTranslations]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (showAddModal) setShowAddModal(false);
      }
      if (e.key === 'Tab') {
        const el = addModalRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        const focusables = Array.from(nodes).filter(n => !n.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    if (showAddModal) {
      document.addEventListener('keydown', handler);
      setTimeout(() => {
        const el = addModalRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        const focusables = Array.from(nodes).filter(n => !n.hasAttribute('disabled'));
        if (focusables[0]) focusables[0].focus();
      }, 0);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [showAddModal]);

  const setValue = (key, lang, value) => {
    setTranslations(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [lang]: value }
    }));
    setChangedPairs(prev => {
      const next = new Set(prev);
      next.add(`${key}|${lang}`);
      return next;
    });
  };

  const saveTranslations = async () => {
    try {
      const updates = [];
      for (const pair of Array.from(changedPairs)) {
        const [key, lang] = pair.split('|');
        const row = translations[key];
        if (!row) continue;
        updates.push({ lang, key, value: row[lang] ?? '' });
      }
      if (updates.length === 0) {
        notifyError('Brak zmian do zapisania');
        return;
      }
      await apiClient.put('/api/translate/bulk', { updates });
      notifySuccess(t('appConfig.translations.saved'));
      setChangedPairs(new Set());
    } catch (_) {
      notifyError(t('appConfig.translations.saveError'));
    }
  };

  const keys = Object.keys(translations || {}).filter(k => !translationsSearch || k.toLowerCase().includes(translationsSearch.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-1">
            {['pl','en','de','cz'].map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setSelectedLang(lng)}
                className={`px-3 py-1 rounded ${selectedLang === lng ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowAddModal(true); setNewKey(''); setNewPL(''); setNewEN(''); setNewDE(''); setNewCZ(''); }}
            className="px-4 py-2 rounded-md bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-800">
            {t('appConfig.translations.addTranslation')}
          </button>
          <input
            id="translationsSearch"
            name="translationsSearch"
            type="text"
            placeholder={t('appConfig.translations.searchPlaceholder')}
            value={translationsSearch}
            onChange={(e) => setTranslationsSearch(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
          />
          <button
            type="button"
            onClick={saveTranslations}
            className="px-4 py-2 rounded-md bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 dark:hover:bg-indigo-800 disabled:opacity-60"
            disabled={translationsLoading}
          >
            {t('common.saveChanges')}
          </button>
        </div>
      </div>

      <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
        {translationsLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('appConfig.translations.loading')}</div>
        ) : keys.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('appConfig.translations.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{t('appConfig.translations.key')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{selectedLang.toUpperCase()}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {keys.map((k) => (
                  <tr key={k}>
                    <td className="px-3 py-2 align-top text-xs text-gray-600 dark:text-gray-300 w-64">{k}</td>
                    <td className="px-3 py-2">
                      <textarea
                        id={`translation-${selectedLang}-${k}`}
                        name={`translation-${selectedLang}-${k}`}
                        rows={2}
                        value={translations[k]?.[selectedLang] ?? ''}
                        onChange={(e) => setValue(k, selectedLang, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !adding && setShowAddModal(false)} />
          <div ref={addModalRef} role="dialog" aria-modal="true" aria-labelledby="add-translation-title" aria-describedby="add-translation-desc" className="relative z-10 w-full max-w-2xl rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 id="add-translation-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('appConfig.translations.addTranslation')}</h4>
              <button type="button" onClick={() => !adding && setShowAddModal(false)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">✖</button>
            </div>
            <div id="add-translation-desc" className="text-sm text-slate-700 dark:text-slate-300 mb-4">
              {t('appConfig.translations.addDescription')}
            </div>
              <div className="space-y-4">
              <div>
                <label htmlFor="new-translation-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('appConfig.translations.key')}</label>
                {(() => {
                  const trimmedKey = newKey.trim();
                  const keyExists = !!trimmedKey && Object.prototype.hasOwnProperty.call(translations, trimmedKey);
                  const base = "w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ";
                  const border = keyExists ? "border-red-400 dark:border-red-500" : "border-slate-300 dark:border-slate-600";
                  return (
                    <>
                      <input
                        id="new-translation-key"
                        name="newTranslationKey"
                        type="text"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className={base + border}
                        placeholder={t('appConfig.translations.keyPlaceholder')}
                      />
                      {keyExists && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{t('appConfig.translations.keyExists')}</p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="new-translation-pl" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PL</label>
                  <textarea id="new-translation-pl" name="newTranslationPL" rows={3} value={newPL} onChange={(e) => setNewPL(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label htmlFor="new-translation-en" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">EN</label>
                  <textarea id="new-translation-en" name="newTranslationEN" rows={3} value={newEN} onChange={(e) => setNewEN(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label htmlFor="new-translation-de" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">DE</label>
                  <textarea id="new-translation-de" name="newTranslationDE" rows={3} value={newDE} onChange={(e) => setNewDE(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label htmlFor="new-translation-cz" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CZ</label>
                  <textarea id="new-translation-cz" name="newTranslationCZ" rows={3} value={newCZ} onChange={(e) => setNewCZ(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={() => !adding && setShowAddModal(false)} className="px-4 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400">{t('common.cancel')}</button>
              <button
                type="button"
                disabled={!newKey.trim() || adding || Object.prototype.hasOwnProperty.call(translations, newKey.trim())}
                onClick={async () => {
                  try {
                    setAdding(true);
                    const trimmedKey = newKey.trim();
                    const updates = [
                      { lang: 'pl', key: trimmedKey, value: newPL ?? '' },
                      { lang: 'en', key: trimmedKey, value: newEN ?? '' },
                      { lang: 'de', key: trimmedKey, value: newDE ?? '' },
                      { lang: 'cz', key: trimmedKey, value: newCZ ?? '' }
                    ];
                    await apiClient.put('/api/translate/bulk', { updates });
                    setShowAddModal(false);
                    setNewKey(''); setNewPL(''); setNewEN(''); setNewDE(''); setNewCZ('');
                    await loadTranslations();
                    notifySuccess(t('appConfig.translations.added'));
                  } catch (_e) {
                    notifyError(t('appConfig.translations.addError'));
                  } finally {
                    setAdding(false);
                  }
                }}
                className="px-4 py-2 rounded-md bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                {t('common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationsTab;
