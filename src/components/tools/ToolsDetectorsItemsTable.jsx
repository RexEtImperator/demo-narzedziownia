import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api';
import { notifyError, notifySuccess } from '../../utils/notify';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  QrCodeIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import ToolsDetectorsEditor from './ToolsDetectorsEditor';
import { formatDateOnly } from '../../utils/dateUtils';

const toDateOnly = (d) => {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(`${d}T00:00:00`) : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const formatPlDate = (dateStr) => {
  if (!dateStr) return '-';
  const s = String(dateStr).trim();
  const isoOnly = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  return formatDateOnly(isoOnly);
};

const daysToDate = (dateStr) => {
  const dt = toDateOnly(dateStr);
  if (!dt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = dt.getTime() - today.getTime();
  return Math.ceil(diffMs / 86400000);
};

const ToolsDetectorsItemsTable = ({ toolId, t, canManage, highlightSku, autoAction, onPrintLabel, onPrintBatch, onDownloadLabel, hideDelete = false, hideEdit = false }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const [isAdding, setIsAdding] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [savingNew, setSavingNew] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [searchEmployee, setSearchEmployee] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const goToEmployeeSearch = useCallback((fullName) => {
    const q = String(fullName || '').trim();
    if (!q) return;
    navigate(`/employees?q=${encodeURIComponent(q)}`);
  }, [navigate]);

  const fetchItems = useCallback(async () => {
    if (!toolId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/detectors/by-tool/${toolId}`);
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setItems(rows);
      setSelectedIds([]);
      setEditingId(null);
      setEditValues({});
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || t?.('common.error') || 'Błąd');
    } finally {
      setLoading(false);
    }
  }, [toolId, t]);

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await api.get('/api/employees');
      let data = res;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (Array.isArray(data.data)) data = data.data;
        else if (Array.isArray(data.items)) data = data.items;
        else if (Array.isArray(data.rows)) data = data.rows;
      }
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      notifyError(err?.message || 'Nie udało się pobrać pracowników');
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const sku = String(highlightSku || '').trim();
    if (!sku) return;
    const match = (items || []).find(i => String(i?.sku || '').trim() === sku);
    if (!match) return;
    const el = document.getElementById(`detectors-highlight-${toolId}-${match.id}`);
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'center' });
      } catch (_) { void 0; }
    }
  }, [items, highlightSku, toolId]);

  const autoActionRef = useRef(null);
  useEffect(() => {
    const action = String(autoAction || '').trim().toLowerCase();
    if (action !== 'issue' && action !== 'return') return;
    const sku = String(highlightSku || '').trim();
    if (!sku) return;
    const match = (items || []).find(i => String(i?.sku || '').trim() === sku);
    if (!match) return;
    const key = `${toolId}|${action}|${sku}`;
    if (autoActionRef.current === key) return;
    autoActionRef.current = key;
    if (action === 'issue') {
      setSelectedIds([match.id]);
      setIssueModalOpen(true);
      setSelectedEmployeeId('');
      setSearchEmployee('');
      fetchEmployees();
      return;
    }

    const confirmText = t?.('detectors.return.confirm', { count: 1 }) || 'Czy na pewno chcesz zwrócić zaznaczoną pozycję (1)?';
    if (!window.confirm(confirmText)) return;
    Promise.resolve()
      .then(async () => {
        await api.post('/api/detectors/return', { item_ids: [match.id] });
        notifySuccess(t?.('detectors.return.success') || t?.('common.saved') || 'Zapisano');
        fetchItems();
        window.dispatchEvent(new CustomEvent('tools:list:changed'));
      })
      .catch((err) => {
        notifyError(err?.response?.data?.message || err?.message || 'Nie udało się zwrócić');
      });
  }, [autoAction, highlightSku, items, toolId, t, fetchEmployees, fetchItems]);

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(items.map((i) => i.id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter((x) => x !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const handleEditClick = (item) => {
    setEditingId(item.id);
    setEditValues({
      sku: item.sku || '',
      type: item.type || '',
      inventory_number: item.inventory_number || '',
      serial_number: item.serial_number || '',
      calibration_date: item.calibration_date ? String(item.calibration_date).slice(0, 10) : '',
      next_calibration_date: item.next_calibration_date ? String(item.next_calibration_date).slice(0, 10) : ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/api/detectors/items/${id}`, editValues);
      notifySuccess(t?.('common.saved') || 'Zapisano');
      setEditingId(null);
      fetchItems();
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || 'Nie udało się zapisać');
    }
  };

  const handleDelete = async (id) => {
    const confirmText = t?.('common.confirmDelete') || 'Usunąć pozycję?';
    if (!window.confirm(confirmText)) return;
    try {
      await api.delete(`/api/detectors/items/${id}`);
      notifySuccess(t?.('common.deleted') || t?.('common.delete') || 'Usunięto');
      fetchItems();
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || t?.('common.error') || 'Błąd');
    }
  };

  const handleSaveNewItems = async () => {
    if (newItems.length === 0) {
      setIsAdding(false);
      return;
    }
    setSavingNew(true);
    try {
      const cleanItems = newItems.map((row) => ({
        sku: String(row?.sku || '').trim(),
        type: String(row?.type || '').trim(),
        inventory_number: String(row?.inventory_number || '').trim() || null,
        serial_number: String(row?.serial_number || '').trim() || null,
        calibration_date: row?.calibration_date || null,
        next_calibration_date: row?.next_calibration_date || null
      }));
      await api.post(`/api/detectors/by-tool/${toolId}`, cleanItems);
      notifySuccess(t?.('common.saved') || 'Zapisano');
      setNewItems([]);
      setIsAdding(false);
      fetchItems();
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || 'Nie udało się dodać podpozycji');
    } finally {
      setSavingNew(false);
    }
  };

  const openIssueModal = () => {
    if (selectedIds.length === 0) return;
    setIssueModalOpen(true);
    setSelectedEmployeeId('');
    setSearchEmployee('');
    fetchEmployees();
  };

  const handleIssue = async () => {
    if (!selectedEmployeeId) {
      notifyError(t?.('tools.validation.employeeRequired') || 'Wybierz pracownika');
      return;
    }
    try {
      await api.post('/api/detectors/issue', { item_ids: selectedIds, employee_id: selectedEmployeeId });
      notifySuccess(t?.('detectors.issue.success') || t?.('common.saved') || 'Zapisano');
      setIssueModalOpen(false);
      fetchItems();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || 'Nie udało się wydać');
    }
  };

  const handleReturn = async () => {
    if (selectedIds.length === 0) return;
    const confirmText = t?.('detectors.return.confirm', { count: selectedIds.length }) || `Czy na pewno chcesz zwrócić zaznaczone pozycje (${selectedIds.length})?`;
    if (!window.confirm(confirmText)) return;
    try {
      await api.post('/api/detectors/return', { item_ids: selectedIds });
      notifySuccess(t?.('detectors.return.success') || t?.('common.saved') || 'Zapisano');
      fetchItems();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || 'Nie udało się zwrócić');
    }
  };

  const handlePrintSelected = () => {
    if (selectedIds.length === 0 || !onPrintBatch) return;
    const selectedItemsLocal = items.filter((i) => selectedIds.includes(i.id));
    onPrintBatch(selectedItemsLocal);
  };

  const downloadQr = async (item) => {
    const sku = String(item?.sku || '').trim();
    if (!sku) {
      notifyError(t?.('common.error') || 'Błąd');
      return;
    }
    try {
      const url = await QRCode.toDataURL(sku, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      const link = document.createElement('a');
      link.download = `qr-${sku}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (_e) {
      notifyError(t?.('tools.qr.generateError') || 'Nie udało się wygenerować QR');
    }
  };

  const filteredEmployees = useMemo(() => {
    const search = String(searchEmployee || '').toLowerCase();
    return (employees || [])
      .filter((e) => {
        if (!e) return false;
        const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
        const brand = String(e.brand_number || '').toLowerCase();
        return fullName.includes(search) || brand.includes(search);
      })
      .slice(0, 50);
  }, [employees, searchEmployee]);

  const selectedItems = useMemo(() => items.filter((i) => selectedIds.includes(i.id)), [items, selectedIds]);
  const allAvailable = selectedItems.length > 0 && selectedItems.every((i) => i.status === 'available');
  const allIssued = selectedItems.length > 0 && selectedItems.every((i) => i.status === 'issued');

  if (loading && items.length === 0) {
    return <div className="p-4 text-center text-slate-500">{t?.('common.loading') || 'Ładowanie...'}</div>;
  }

  if (isAdding) {
    const existingEditorItems = items.map((it) => ({
      sku: it?.sku || '',
      type: it?.type || '',
      inventory_number: it?.inventory_number || '',
      serial_number: it?.serial_number || '',
      calibration_date: it?.calibration_date ? String(it.calibration_date).slice(0, 10) : '',
      next_calibration_date: it?.next_calibration_date ? String(it.next_calibration_date).slice(0, 10) : ''
    }));

    const editorItems = [...existingEditorItems, ...newItems];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            {t?.('detectors.editor.addTitle') || 'Dodaj podpozycje (detektory)'}
          </h3>
          <button onClick={() => setIsAdding(false)} className="text-sm text-slate-500 hover:text-slate-700">
            {t?.('common.cancel') || 'Anuluj'}
          </button>
        </div>

        <ToolsDetectorsEditor
          items={editorItems}
          onChange={(updatedItems) => setNewItems(updatedItems.slice(existingEditorItems.length))}
          category="Detektory"
          t={t}
          readOnlyCount={existingEditorItems.length}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setIsAdding(false)} className="px-3 py-1 text-sm border rounded text-slate-600 hover:bg-slate-50">
            {t?.('common.cancel') || 'Anuluj'}
          </button>
          <button
            type="button"
            onClick={handleSaveNewItems}
            disabled={savingNew || newItems.length === 0}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {savingNew && <ArrowPathIcon className="w-3 h-3 animate-spin" />}
            {t?.('common.save') || 'Zapisz'}
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-slate-50 dark:bg-slate-800/50 border-dashed border-slate-300 dark:border-slate-700">
        <div className="text-slate-500 italic mb-4">{t?.('detectors.errors.noItems') || 'Brak podpozycji'}</div>
        {canManage && (
          <button onClick={() => setIsAdding(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            {t?.('common.add') || 'Dodaj'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-500">{t?.('detectors.foundItems', { count: items.length }) || `Znaleziono: ${items.length} podpozycji`}</div>
          <button type="button" onClick={fetchItems} className="p-1 text-slate-500 hover:text-blue-600 transition-colors" title={t?.('common.refresh') || 'Odśwież'}>
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 shadow-sm"
            >
              <PlusIcon className="w-3 h-3" />
              {t?.('common.add') || 'Dodaj'}
            </button>
          )}
          {selectedIds.length > 0 && onPrintBatch && (
            <button
              type="button"
              onClick={handlePrintSelected}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              title={t?.('common.print') || 'Drukuj'}
            >
              <PrinterIcon className="w-3 h-3" />
              {t?.('common.print') || 'Drukuj'}
            </button>
          )}
          {selectedIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={openIssueModal}
                disabled={!allAvailable}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium ${
                  allAvailable
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                }`}
              >
                <ArrowUturnRightIcon className="w-3 h-3" />
                {t?.('detectors.issue.title') || 'Wydaj zaznaczone'}
              </button>
              <button
                type="button"
                onClick={handleReturn}
                disabled={!allIssued}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium ${
                  allIssued
                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                }`}
              >
                <ArrowUturnLeftIcon className="w-3 h-3" />
                {t?.('detectors.return.title') || 'Zwróć zaznaczone'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  id="select-all-detectors-items"
                  name="select-all-detectors-items"
                  aria-label={t?.('common.selectAll') || 'Zaznacz wszystko'}
                  onChange={handleSelectAll}
                  checked={items.length > 0 && selectedIds.length === items.length}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="p-3 w-10">#</th>
              <th className="p-3 w-44">{t?.('detectors.table.sku') || 'SKU'}</th>
              <th className="p-3">{t?.('detectors.table.type') || 'Typ'}</th>
              <th className="p-3">{t?.('detectors.table.inventoryNumber') || 'Nr ewidencyjny'}</th>
              <th className="p-3">{t?.('detectors.table.serialNumber') || 'Nr fabryczny'}</th>
              <th className="p-3">{t?.('detectors.table.calibrationDate') || 'Kalibracja'}</th>
              <th className="p-3">{t?.('detectors.table.nextCalibrationDate') || 'Następna kalibracja'}</th>
              <th className="p-3">{t?.('detectors.table.status') || (t?.('slings.table.status') || 'Status')}</th>
              <th className="p-3">{t?.('detectors.table.employee') || (t?.('slings.table.employee') || 'Pracownik')}</th>
              {canManage && <th className="p-3 w-20">{t?.('common.actions') || 'Akcje'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map((item, index) => {
              const days = daysToDate(item?.next_calibration_date);
              const nextText = item?.next_calibration_date ? `${formatPlDate(item.next_calibration_date)}${days === null ? '' : ` (${days} dni)`}` : '-';
              const isHighlighted = String(highlightSku || '').trim() !== '' && String(item?.sku || '').trim() === String(highlightSku || '').trim();
              return (
                <tr
                  key={item.id}
                  id={isHighlighted ? `detectors-highlight-${toolId}-${item.id}` : undefined}
                  className={` ${isHighlighted ? 'bg-white hover:bg-slate-50 dark:hover:bg-slate-700 bg-indigo-50 dark:bg-indigo-900/60' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      id={`select-detector-item-${item.id}`}
                      name={`select-detector-item-${item.id}`}
                      aria-label={`Select item ${item.id}`}
                      checked={selectedIds.includes(item.id)}
                      onChange={() => handleSelectOne(item.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-3 text-slate-500">{index + 1}</td>

                  {editingId === item.id ? (
                    <>
                      <td className="p-3">
                        <input
                          id={`edit-detector-sku-${item.id}`}
                          name={`edit-detector-sku-${item.id}`}
                          autoComplete="off"
                          value={editValues.sku || ''}
                          onChange={(e) => setEditValues({ ...editValues, sku: e.target.value })}
                          className="w-44 px-1 py-0.5 border rounded text-xs font-mono dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          id={`edit-detector-type-${item.id}`}
                          name={`edit-detector-type-${item.id}`}
                          autoComplete="off"
                          value={editValues.type || ''}
                          onChange={(e) => setEditValues({ ...editValues, type: e.target.value })}
                          className="w-48 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          id={`edit-detector-inv-${item.id}`}
                          name={`edit-detector-inv-${item.id}`}
                          autoComplete="off"
                          value={editValues.inventory_number || ''}
                          onChange={(e) => setEditValues({ ...editValues, inventory_number: e.target.value })}
                          className="w-44 px-1 py-0.5 border rounded text-xs font-mono dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          id={`edit-detector-serial-${item.id}`}
                          name={`edit-detector-serial-${item.id}`}
                          autoComplete="off"
                          value={editValues.serial_number || ''}
                          onChange={(e) => setEditValues({ ...editValues, serial_number: e.target.value })}
                          className="w-44 px-1 py-0.5 border rounded text-xs font-mono dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="date"
                          id={`edit-detector-cal-${item.id}`}
                          name={`edit-detector-cal-${item.id}`}
                          value={editValues.calibration_date || ''}
                          onChange={(e) => setEditValues({ ...editValues, calibration_date: e.target.value })}
                          className="w-40 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="date"
                          id={`edit-detector-next-cal-${item.id}`}
                          name={`edit-detector-next-cal-${item.id}`}
                          value={editValues.next_calibration_date || ''}
                          onChange={(e) => setEditValues({ ...editValues, next_calibration_date: e.target.value })}
                          className="w-40 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-mono">{item.sku || '-'}</td>
                      <td className="p-3">{item.type || '-'}</td>
                      <td className="p-3 font-mono">{item.inventory_number || '-'}</td>
                      <td className="p-3 font-mono">{item.serial_number || '-'}</td>
                      <td className="p-3">{item.calibration_date ? formatPlDate(item.calibration_date) : '-'}</td>
                      <td className="p-3">{nextText}</td>
                    </>
                  )}

                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === 'available'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                          : item.status === 'issued'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t?.(`common.status.${item.status}`) || item.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {item.employee_name ? (
                      <button
                        type="button"
                        onClick={() => goToEmployeeSearch(item.employee_name)}
                        className="text-left inline-flex items-center gap-2 text-base font-medium text-slate-900 dark:text-slate-100 font-mono sharp-text cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title={t('employees.navigateToEmployeeIndex') || 'Przejdź do kartoteki pracownika'}
                      >
                        {(item.employee_brand_number !== null && item.employee_brand_number !== undefined && String(item.employee_brand_number).trim() !== '') ? (
                          <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white dark:bg-indigo-500">
                            {String(item.employee_brand_number).trim()}
                          </span>
                        ) : null}
                        <span>{item.employee_name}</span>
                      </button>
                    ) : (item.employee_id || '-')}
                  </td>

                  {canManage && (
                    <td className="p-3">
                      {editingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => handleSaveEdit(item.id)} className="p-1 text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300" title={t?.('common.save') || 'Zapisz'}>
                            <CheckIcon className="w-5 h-5" />
                          </button>
                          <button type="button" onClick={handleCancelEdit} className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300" title={t?.('common.cancel') || 'Anuluj'}>
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {!hideEdit ? (
                            <button
                              type="button"
                              onClick={() => handleEditClick(item)}
                              className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title={t?.('common.edit') || 'Edytuj'}
                            >
                              <PencilIcon className="w-5 h-5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => downloadQr(item)}
                            className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
                            title={t?.('tools.qr.downloadLabel') || 'Pobierz etykietę QR'}
                            disabled={!item?.sku}
                          >
                            <QrCodeIcon className="w-5 h-5" />
                          </button>
                          {!hideDelete ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              title={t?.('common.delete') || t?.('common.remove') || 'Usuń'}
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          ) : null}
                          {onDownloadLabel && (
                            <button
                              type="button"
                              onClick={() => onDownloadLabel(item)}
                              className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
                              title={t?.('common.download') || 'Pobierz'}
                            >
                              <ArrowDownTrayIcon className="w-5 h-5" />
                            </button>
                          )}
                          {onPrintLabel && (
                            <button
                              type="button"
                              onClick={() => onPrintLabel(item)}
                              className="p-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                              title={t?.('common.print') || 'Drukuj'}
                            >
                              <PrinterIcon className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {issueModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-slate-100">
              {t?.('detectors.issue.title') || 'Wydaj zaznaczone'} ({selectedIds.length})
            </h3>

            <div className="mb-4">
              <label htmlFor="search-employee-detectors" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t?.('tools.labels.employee') || 'Pracownik'}
              </label>
              <input
                type="text"
                id="search-employee-detectors"
                name="search-employee-detectors"
                autoComplete="off"
                placeholder={t?.('common.searchEmployee') || 'Szukaj...'}
                value={searchEmployee}
                onChange={(e) => setSearchEmployee(e.target.value)}
                className="w-full mb-2 p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
              />
              {loadingEmployees ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">{t?.('common.loading') || 'Ładowanie...'}</div>
              ) : (
                <div className="max-h-40 overflow-y-auto border rounded dark:border-slate-600">
                  {filteredEmployees.map((emp) => (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className={`p-2 cursor-pointer text-sm text-slate-900 dark:text-slate-100 ${
                        selectedEmployeeId === emp.id ? 'bg-blue-100 dark:bg-blue-900 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {emp.brand_number ? `[${emp.brand_number}]` : ''} {emp.first_name} {emp.last_name} 
                    </div>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <div className="p-2 text-slate-500 dark:text-slate-400 text-sm">{t?.('common.noResults') || 'Brak wyników'}</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setIssueModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t?.('common.cancel') || 'Anuluj'}
              </button>
              <button
                type="button"
                onClick={handleIssue}
                disabled={!selectedEmployeeId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t?.('common.issue') || 'Wydaj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsDetectorsItemsTable;
