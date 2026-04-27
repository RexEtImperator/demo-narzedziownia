import React, { useState } from 'react';
import { ArrowPathIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../../api';

const ToolsDetectorsEditor = ({ items = [], onChange, category, t, readOnlyCount = 0 }) => {
  const [loadingSku, setLoadingSku] = useState(false);

  const handleAddRow = () => {
    const newRow = {
      sku: '',
      type: '',
      inventory_number: '',
      serial_number: '',
      calibration_date: '',
      next_calibration_date: ''
    };
    onChange([...(items || []), newRow]);
  };

  const fetchNextSku = async (index) => {
    setLoadingSku(true);
    try {
      const response = await api.get('/api/detectors/next-sku', { params: { category } });
      const nextSku = response.nextSku || (response.data && response.data.nextSku);
      if (!nextSku) return;

      let sku = String(nextSku);
      let counter = 0;
      while ((items || []).some((it, i) => i !== index && String(it?.sku || '') === sku) && counter < 100) {
        const parts = sku.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!Number.isNaN(num)) {
          sku = parts.slice(0, -1).join('-') + '-' + String(num + 1).padStart(4, '0');
        }
        counter++;
      }

      handleUpdateRow(index, 'sku', sku);
    } catch (_e) {
      void 0;
    } finally {
      setLoadingSku(false);
    }
  };

  const handleGenerateAllSkus = async () => {
    setLoadingSku(true);
    try {
      const response = await api.get('/api/detectors/next-sku', { params: { category } });
      const nextSku = response.nextSku || (response.data && response.data.nextSku);
      if (!nextSku) return;

      const parts = String(nextSku).split('-');
      const baseNum = parseInt(parts.pop(), 10);
      const prefix = parts.join('-') + '-';

      let maxLocalNum = 0;
      (items || []).forEach((it) => {
        if (it?.sku && String(it.sku).startsWith(prefix)) {
          const numPart = parseInt(String(it.sku).replace(prefix, ''), 10);
          if (!Number.isNaN(numPart) && numPart > maxLocalNum) maxLocalNum = numPart;
        }
      });

      let currentNum = Math.max(baseNum || 1, maxLocalNum + 1);
      const newItems = (items || []).map((it) => {
        const curSku = String(it?.sku || '');
        if (!curSku) {
          const sku = `${prefix}${String(currentNum).padStart(4, '0')}`;
          currentNum++;
          return { ...it, sku };
        }
        return it;
      });

      onChange(newItems);
    } catch (_e) {
      void 0;
    } finally {
      setLoadingSku(false);
    }
  };

  const handleRemoveRow = (index) => {
    if (index < readOnlyCount) return;
    const newItems = (items || []).filter((_, i) => i !== index);
    onChange(newItems);
  };

  const handleUpdateRow = (index, field, value) => {
    if (index < readOnlyCount) return;
    const newItems = [...(items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">
          {t?.('detectors.editor.title') || 'Podpozycje (detektory)'}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleGenerateAllSkus}
            disabled={loadingSku || (items || []).length === 0}
            className="text-md px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loadingSku ? 'animate-spin' : ''}`} />
            {t?.('detectors.editor.generateSkuAll') || 'Generuj SKU dla wszystkich'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
            <tr>
              <th className="px-2 py-2 w-10">#</th>
              <th className="px-2 py-2 w-44">{t?.('detectors.editor.sku') || 'SKU'}</th>
              <th className="px-2 py-2 w-56">{t?.('detectors.editor.type') || 'Typ'}</th>
              <th className="px-2 py-2 w-56">{t?.('detectors.editor.inventoryNumber') || 'Nr ewidencyjny'}</th>
              <th className="px-2 py-2 w-56">{t?.('detectors.editor.serialNumber') || 'Nr fabryczny'}</th>
              <th className="px-2 py-2 w-48">{t?.('detectors.editor.calibrationDate') || 'Data kalibracji'}</th>
              <th className="px-2 py-2 w-56">{t?.('detectors.editor.nextCalibrationDate') || 'Data następnej kalibracji'}</th>
              <th className="px-2 py-2 w-12">{t?.('common.actions') || 'Akcje'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {(items || []).map((item, index) => (
              <tr key={index} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                <td className="px-2 py-2 text-center text-slate-500">{index + 1}</td>

                {index < readOnlyCount ? (
                  <>
                    <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200">{item?.sku || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item?.type || '-'}</td>
                    <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200">{item?.inventory_number || '-'}</td>
                    <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200">{item?.serial_number || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item?.calibration_date || '-'}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item?.next_calibration_date || '-'}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          id={`detector-sku-${index}`}
                          name={`detector-sku-${index}`}
                          autoComplete="off"
                          aria-label={t?.('detectors.editor.sku') || 'SKU'}
                          value={item?.sku || ''}
                          onChange={(e) => handleUpdateRow(index, 'sku', e.target.value)}
                          className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 font-mono"
                          placeholder="OSSA-DET-0001"
                        />
                        <button
                          type="button"
                          onClick={() => fetchNextSku(index)}
                          disabled={loadingSku}
                          className="p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t?.('detectors.editor.generateSku') || 'Generuj SKU'}
                        >
                          <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingSku ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`detector-type-${index}`}
                        name={`detector-type-${index}`}
                        autoComplete="off"
                        aria-label={t?.('detectors.editor.type') || 'Typ'}
                        value={item?.type || ''}
                        onChange={(e) => handleUpdateRow(index, 'type', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`detector-inv-${index}`}
                        name={`detector-inv-${index}`}
                        autoComplete="off"
                        aria-label={t?.('detectors.editor.inventoryNumber') || 'Nr ewidencyjny'}
                        value={item?.inventory_number || ''}
                        onChange={(e) => handleUpdateRow(index, 'inventory_number', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        id={`detector-serial-${index}`}
                        name={`detector-serial-${index}`}
                        autoComplete="off"
                        aria-label={t?.('detectors.editor.serialNumber') || 'Nr fabryczny'}
                        value={item?.serial_number || ''}
                        onChange={(e) => handleUpdateRow(index, 'serial_number', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        id={`detector-cal-${index}`}
                        name={`detector-cal-${index}`}
                        aria-label={t?.('detectors.editor.calibrationDate') || 'Data kalibracji'}
                        value={item?.calibration_date || ''}
                        onChange={(e) => handleUpdateRow(index, 'calibration_date', e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        id={`detector-next-cal-${index}`}
                        name={`detector-next-cal-${index}`}
                        aria-label={t?.('detectors.editor.nextCalibrationDate') || 'Data następnej kalibracji'}
                        value={item?.next_calibration_date || ''}
                        onChange={(e) => handleUpdateRow(index, 'next_calibration_date', e.target.value)}
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
                    title={t?.('common.remove') || 'Usuń'}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}

            {(items || []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-500 italic">
                  {t?.('detectors.editor.empty') || 'Brak podpozycji'}
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
        <PlusIcon className="w-5 h-5" />
        {t?.('detectors.editor.add') || (t?.('common.add') || 'Dodaj')}
      </button>
    </div>
  );
};

export default ToolsDetectorsEditor;
