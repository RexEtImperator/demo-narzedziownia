import React, { useState } from 'react';
import { ArrowPathIcon, ClipboardDocumentListIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../api';

const ToolsImpactSocketsEditor = ({ items = [], onChange, category, t, readOnlyCount = 0 }) => {
  const [loadingSku, setLoadingSku] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState(null);

  const handleAddRow = () => {
    const newRow = {
      sku: '',
      kind: '',
      size: '',
      quantity: 1,
    };
    onChange([...items, newRow]);
  };

  const handleRemoveRow = (index) => {
    if (index < readOnlyCount) return;
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  const handleUpdateRow = (index, field, value) => {
    if (index < readOnlyCount) return;
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  const handleOpenJsonModal = () => {
    const editable = (items || []).slice(readOnlyCount);
    setJsonInput(JSON.stringify(editable, null, 2));
    setJsonError(null);
    setShowJsonModal(true);
  };

  const handleJsonSubmit = () => {
    try {
      let parsed;
      try {
        parsed = JSON.parse(jsonInput);
      } catch (_e) {
        throw new Error('Nieprawidłowy format JSON');
      }

      let newItems = [];
      if (Array.isArray(parsed)) {
        newItems = parsed;
      } else if (parsed && Array.isArray(parsed.items)) {
        newItems = parsed.items;
      } else {
        throw new Error('JSON musi być tablicą lub obiektem z polem "items"');
      }

      const normalized = newItems.map((row) => ({
        sku: String(row?.sku || '').trim(),
        kind: String(row?.kind || '').trim(),
        size: String(row?.size || '').trim(),
        quantity: Math.max(1, parseInt(row?.quantity || 1, 10))
      }));

      const existing = (items || []).slice(0, readOnlyCount);
      onChange([...existing, ...normalized]);
      setShowJsonModal(false);
      setJsonError(null);
    } catch (e) {
      setJsonError(e?.message || 'Błąd przetwarzania JSON');
    }
  };

  const handleGenerateAllSkus = async () => {
    if (!category) return;
    setLoadingSku(true);
    try {
      const response = await api.get('/api/impact-sockets/next-sku', { params: { category } });
      const nextSku = response.nextSku || (response.data && response.data.nextSku);
      if (!nextSku) return;

      const parts = String(nextSku).split('-');
      const baseNum = parseInt(parts.pop(), 10);
      const prefix = parts.join('-') + '-';

      let maxLocalNum = 0;
      items.forEach((item) => {
        if (item.sku && String(item.sku).startsWith(prefix)) {
          const numPart = parseInt(String(item.sku).replace(prefix, ''), 10);
          if (!isNaN(numPart) && numPart > maxLocalNum) maxLocalNum = numPart;
        }
      });

      let currentNum = Math.max(baseNum || 1, maxLocalNum + 1);
      const newItems = items.map((item) => {
        if (!item.sku || String(item.sku).startsWith('OSSA-UNKNOWN-')) {
          const sku = `${prefix}${String(currentNum).padStart(4, '0')}`;
          currentNum++;
          return { ...item, sku };
        }
        return item;
      });

      const merged = newItems.map((row, idx) => (idx < readOnlyCount ? (items[idx] || row) : row));
      onChange(merged);
    } catch (_e) {
      void 0;
    } finally {
      setLoadingSku(false);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">
          {t('sockets.editor.title')}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleOpenJsonModal}
            className="text-md px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1 dark:bg-green-900/30 dark:text-green-200 dark:hover:bg-green-900/50"
          >
            <ClipboardDocumentListIcon className="w-5 h-5" />
            {t('common.pasteJson')}
          </button>
          <button
            type="button"
            onClick={handleGenerateAllSkus}
            disabled={!category || loadingSku || items.length === 0}
            className="text-md px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loadingSku ? 'animate-spin' : ''}`} />
            {t('sockets.editor.generateSkuAll')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
            <tr>
              <th className="px-2 py-2 w-10">#</th>
              <th className="px-2 py-2 w-44">{t('sockets.editor.sku')}</th>
              <th className="px-2 py-2">{t('sockets.editor.kind')}</th>
              <th className="px-2 py-2 w-40">{t('sockets.editor.size')}</th>
              <th className="px-2 py-2 w-28">{t('sockets.editor.quantity')}</th>
              <th className="px-2 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map((item, index) => (
              <tr key={index} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                <td className="px-2 py-2 text-center text-slate-500">{index + 1}</td>
                {index < readOnlyCount ? (
                  <>
                    <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200">{item.sku || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item.kind || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item.size || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item.quantity ?? '-'}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`socket-sku-${index}`}
                        name={`socket-sku-${index}`}
                        autoComplete="off"
                        aria-label={t('sockets.editor.sku')}
                        value={item.sku || ''}
                        onChange={(e) => handleUpdateRow(index, 'sku', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 font-mono"
                        placeholder="OSSA-N1-0001"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`socket-kind-${index}`}
                        name={`socket-kind-${index}`}
                        autoComplete="off"
                        aria-label={t('sockets.editor.kind')}
                        value={item.kind || ''}
                        onChange={(e) => handleUpdateRow(index, 'kind', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        placeholder={t('sockets.editor.kindPlaceholder')}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`socket-size-${index}`}
                        name={`socket-size-${index}`}
                        autoComplete="off"
                        aria-label={t('sockets.editor.size')}
                        value={item.size || ''}
                        onChange={(e) => handleUpdateRow(index, 'size', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        placeholder={t('sockets.editor.sizePlaceholder')}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={1}
                        id={`socket-qty-${index}`}
                        name={`socket-qty-${index}`}
                        aria-label={t('sockets.editor.quantity')}
                        value={item.quantity ?? 1}
                        onChange={(e) => handleUpdateRow(index, 'quantity', Number(e.target.value))}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                      />
                    </td>
                  </>
                )}
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(index)}
                    disabled={index < readOnlyCount}
                    className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('common.remove')}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500 italic">
                  {t('sockets.editor.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleAddRow}
        className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        <PlusIcon className="w-4 h-4" />
        {t('sockets.editor.add')}
      </button>

      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('sockets.editor.jsonModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                {t('sockets.editor.jsonModalHint')}
              </p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="w-full h-64 p-3 font-mono text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                spellCheck={false}
                placeholder='{"items":[{"sku":"OSSA-N1-0001","kind":"...","size":"...","quantity":1}]}'
              />
              {jsonError && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {t('sockets.editor.jsonModalError')}: {jsonError}
                </div>
              )}
            </div>

            <div className="p-4 border-t dark:border-slate-700 flex justify-end items-center gap-2">
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-600"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleJsonSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800"
              >
                {t('common.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsImpactSocketsEditor;
