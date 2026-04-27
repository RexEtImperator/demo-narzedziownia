import React, { useState } from 'react';
import { PlusIcon, TrashIcon, ArrowPathIcon, ClipboardDocumentListIcon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../api';

const ToolsSlingsEditor = ({ items = [], onChange, category, t, readOnlyCount = 0 }) => {
  const [loadingSku, setLoadingSku] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState(null);

  // Helper to add new row
  const handleAddRow = () => {
    const newRow = {
      kind: '',
      serial_number: '',
      sku: '',
      production_year: new Date().getFullYear(),
      production_month: new Date().getMonth() + 1,
      notes: ''
    };
    onChange([...items, newRow]);
  };

  // Helper to remove row
  const handleRemoveRow = (index) => {
    if (index < readOnlyCount) return;
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  // Helper to update row
  const handleUpdateRow = (index, field, value) => {
    if (index < readOnlyCount) return;
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  // Fetch next SKU
  const fetchNextSku = async (index) => {
    if (!category) return;
    setLoadingSku(true);
    try {
      const response = await api.get('/api/slings/next-sku', { params: { category } });
      const nextSku = response.nextSku || (response.data && response.data.nextSku);
      
      if (nextSku) {
        let sku = nextSku;
        // Simple client-side increment if duplicate found in current list
        let counter = 0;
        // Check both local items and ensure we don't conflict with what we just got
        while (items.some((item, i) => i !== index && item.sku === sku) && counter < 100) {
            // increment number part
            const parts = sku.split('-');
            const num = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(num)) {
                sku = parts.slice(0, -1).join('-') + '-' + String(num + 1).padStart(4, '0');
            }
            counter++;
        }
        
        handleUpdateRow(index, 'sku', sku);
      }
    } catch (error) {
      console.error('Error fetching SKU', error);
    } finally {
      setLoadingSku(false);
    }
  };
  
  // Auto-generate SKU for all empty rows
  const handleGenerateAllSkus = async () => {
      if (!category) return;
      setLoadingSku(true);
      try {
          const response = await api.get('/api/slings/next-sku', { params: { category } });
          const nextSku = response.nextSku || (response.data && response.data.nextSku);

          if (nextSku) {
              let baseSku = nextSku;
              
              // Extract prefix and number from backend suggestion
              const parts = baseSku.split('-');
              const baseNum = parseInt(parts.pop());
              const prefix = parts.join('-') + '-';
              
              // Find max number currently used in the editor with this prefix (to avoid collision with manual entries)
              let maxLocalNum = 0;
              items.forEach(item => {
                  if (item.sku && item.sku.startsWith(prefix)) {
                      const numPart = parseInt(item.sku.replace(prefix, ''), 10);
                      if (!isNaN(numPart) && numPart > maxLocalNum) {
                          maxLocalNum = numPart;
                      }
                  }
              });

              // Start from the greater of: backend suggestion OR (local max + 1)
              let currentNum = Math.max(baseNum, maxLocalNum + 1);
              
              const newItems = items.map(item => {
                  // Only generate for empty SKUs or placeholders
                  if (!item.sku || item.sku.startsWith('OSSA-UNKNOWN-')) {
                      const sku = `${prefix}${String(currentNum).padStart(4, '0')}`;
                      currentNum++;
                      return { ...item, sku };
                  }
                  return item;
              });
              
              onChange(newItems);
          }
      } catch (error) {
          console.error('Error generating SKUs', error);
      } finally {
          setLoadingSku(false);
      }
  };

  // JSON Modal Handlers
  const handleOpenJsonModal = () => {
    // Fill with current items
    setJsonInput(JSON.stringify(items, null, 2));
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
        throw new Error('Format musi być tablicą lub obiektem z polem "items"');
      }

      const mappedItems = newItems.map(item => ({
        kind: item.kind || '',
        serial_number: item.serial_number || '',
        sku: item.sku || '',
        production_year: Number(item.production_year) || new Date().getFullYear(),
        production_month: Number(item.production_month) || (new Date().getMonth() + 1),
        notes: item.notes || ''
      }));

      onChange([...items, ...mappedItems]);
      setShowJsonModal(false);
    } catch (err) {
      setJsonError(err.message);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">
          {t('slings.editor.title')}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleOpenJsonModal}
            className="text-md px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1"
          >
            <ClipboardDocumentListIcon className="w-5 h-5" />
            Wklej JSON
          </button>
          <button
              type="button"
              onClick={handleGenerateAllSkus}
              disabled={loadingSku}
              className="text-md px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1"
          >
              <ArrowPathIcon className={`w-5 h-5 ${loadingSku ? "animate-spin" : ""}`} />
              {t('slings.editor.generateSkuAll')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2 w-10">#</th>
              <th className="px-2 py-2 w-1/4">{t('slings.editor.kind')}</th>
              <th className="px-2 py-2 w-1/4">{t('slings.editor.serialNumber')}</th>
              <th className="px-2 py-2 w-1/4">{t('slings.editor.sku')}</th>
              <th className="px-2 py-2 w-1/6">{t('slings.editor.productionDate')}</th>
              <th className="px-2 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                <td className="px-2 py-2 text-center text-slate-500">{index + 1}</td>
                {index < readOnlyCount ? (
                  <>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item.kind || '-'}</td>
                    <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200">{item.serial_number || '-'}</td>
                    <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200">{item.sku || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">
                      {item.production_month && item.production_year ? `${String(item.production_month).padStart(2, '0')}.${item.production_year}` : '-'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`sling-kind-${index}`}
                        name={`sling-kind-${index}`}
                        autoComplete="off"
                        aria-label={t('slings.editor.kind')}
                        value={item.kind}
                        onChange={(e) => handleUpdateRow(index, 'kind', e.target.value)}
                        placeholder={t('slings.editor.kindPlaceholder')}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`sling-serial-${index}`}
                        name={`sling-serial-${index}`}
                        autoComplete="off"
                        aria-label={t('slings.editor.serialNumber')}
                        value={item.serial_number}
                        onChange={(e) => handleUpdateRow(index, 'serial_number', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          id={`sling-sku-${index}`}
                          name={`sling-sku-${index}`}
                          autoComplete="off"
                          aria-label={t('slings.editor.sku')}
                          value={item.sku}
                          onChange={(e) => handleUpdateRow(index, 'sku', e.target.value)}
                          className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => fetchNextSku(index)}
                          disabled={loadingSku}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title={t('slings.editor.generateSku')}
                        >
                          <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingSku ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <select
                          id={`sling-month-${index}`}
                          name={`sling-month-${index}`}
                          aria-label={t('slings.editor.productionMonth')}
                          value={item.production_month}
                          onChange={(e) => handleUpdateRow(index, 'production_month', parseInt(e.target.value))}
                          className="px-1 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 w-16"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          id={`sling-year-${index}`}
                          name={`sling-year-${index}`}
                          autoComplete="off"
                          aria-label={t('slings.editor.productionYear')}
                          value={item.production_year}
                          onChange={(e) => handleUpdateRow(index, 'production_year', parseInt(e.target.value))}
                          className="px-1 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 w-20"
                        />
                      </div>
                    </td>
                  </>
                )}
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(index)}
                    disabled={index < readOnlyCount}
                    className="p-1 text-red-600 hover:text-red-800"
                    title={t('slings.editor.remove')}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleAddRow}
        className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        <PlusIcon className="w-4 h-4" />
        {t('slings.editor.add')}
      </button>

      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Edycja / Kopiowanie JSON
              </h3>
              <button
                onClick={() => setShowJsonModal(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                Możesz skopiować poniższe dane lub wkleić nowy kod JSON (format tablicy lub obiektu z polem items).
              </p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="w-full h-64 p-3 font-mono text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                placeholder='{"items": [{"kind": "...", "sku": "..."}]}'
              />
              {jsonError && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Błąd: {jsonError}
                </div>
              )}
            </div>

            <div className="p-4 border-t dark:border-slate-700 flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={() => {
                   navigator.clipboard.writeText(jsonInput)
                     .then(() => alert('Skopiowano do schowka!'))
                     .catch(err => console.error('Błąd kopiowania', err));
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-600 flex items-center gap-1"
              >
                <ClipboardDocumentListIcon className="w-4 h-4" />
                Kopiuj
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowJsonModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-600"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleJsonSubmit}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800"
                >
                  Zatwierdź
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsSlingsEditor;
