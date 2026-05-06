import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';
import { notifySuccess, notifyError } from '../../utils/notify';
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, PencilIcon, XMarkIcon, CheckIcon, QrCodeIcon, PrinterIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import ToolsSlingsEditor from './ToolsSlingsEditor';
import { useNavigate } from 'react-router-dom';

const ToolsSlingsItemsTable = ({ toolId, category, t, canManage, onPrintQr, onPrintBatch, highlightSku, autoAction, onDownloadLabel, hideDelete = false, hideEdit = false, onPrintLabel }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Adding New Items State
  const [isAdding, setIsAdding] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [savingNew, setSavingNew] = useState(false);

  // Inline Editing State
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Issue Modal State
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchEmployee, setSearchEmployee] = useState('');

  const goToEmployeeSearch = useCallback((fullName) => {
    const q = String(fullName || '').trim();
    if (!q) return;
    navigate(`/employees?q=${encodeURIComponent(q)}`);
  }, [navigate]);

  const fetchItems = useCallback(async () => {
    if (!toolId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/slings/by-tool/${toolId}`);
      setItems(Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []));
      setSelectedIds([]); // Reset selection on refresh
      setEditingId(null);
    } catch (err) {
      console.error(err);
      notifyError(t('tools.notifications.slingsFetchError') || 'Failed to fetch items');
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
      
      const loadedEmployees = Array.isArray(data) ? data : [];
      setEmployees(loadedEmployees);
      
      if (loadedEmployees.length === 0) {
        console.warn('No employees found via API');
      }
    } catch (_err) {
      console.error('Error fetching employees:', _err);
      notifyError('Failed to fetch employees');
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => { fetchItems(); });
  }, [fetchItems]);

  useEffect(() => {
    const sku = String(highlightSku || '').trim();
    if (!sku) return;
    const match = (items || []).find(i => String(i?.sku || '').trim() === sku);
    if (!match) return;
    const el = document.getElementById(`slings-highlight-${toolId}-${match.id}`);
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
      Promise.resolve().then(() => {
        setSelectedIds([match.id]);
        setIssueModalOpen(true);
        fetchEmployees();
        setSelectedEmployeeId('');
        setSearchEmployee('');
      });
      return;
    }

    const confirmText = t?.('slings.return.confirm', { count: 1 }) || 'Czy na pewno chcesz zwrócić zaznaczone pozycje (1)?';
    if (!window.confirm(confirmText)) return;
    Promise.resolve()
      .then(async () => {
        await api.post('/api/slings/return', { item_ids: [match.id] });
        notifySuccess(t?.('slings.return.success') || t?.('common.saved') || 'Zapisano');
        fetchItems();
        window.dispatchEvent(new CustomEvent('tools:list:changed'));
      })
      .catch((err) => {
        notifyError(err?.response?.data?.message || err?.message || 'Failed to return items');
      });
  }, [autoAction, highlightSku, items, toolId, t, fetchEmployees, fetchItems]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(items.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleEditClick = (item) => {
    setEditingId(item.id);
    setEditValues({
      kind: item.kind,
      serial_number: item.serial_number || '',
      sku: item.sku,
      production_year: item.production_year,
      production_month: item.production_month,
      notes: item.notes || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/api/slings/items/${id}`, editValues);
      notifySuccess(t('common.saved'));
      setEditingId(null);
      fetchItems();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to update item');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('common.confirmDelete') || 'Usunąć pozycję?')) return;
    try {
      await api.delete(`/api/slings/items/${id}`);
      notifySuccess(t('common.deleted') || t('common.delete') || 'Usunięto');
      fetchItems();
    } catch (err) {
      notifyError(err.response?.data?.message || err?.message || t('common.error'));
    }
  };

  const handleSaveNewItems = async () => {
    if (newItems.length === 0) {
      setIsAdding(false);
      return;
    }
    
    setSavingNew(true);
    try {
      // Clean up items before sending
      const cleanItems = newItems.map(item => ({
        ...item,
        production_year: Number(item.production_year),
        production_month: Number(item.production_month),
        // Ensure serial_number is null if empty string (optional, depends on backend)
        serial_number: item.serial_number || null,
        sku: item.sku // Backend handles SKU validation
      }));

      await api.post(`/api/slings/by-tool/${toolId}`, cleanItems);
      notifySuccess(t('slings.add.success') || 'Items added successfully');
      setNewItems([]);
      setIsAdding(false);
      fetchItems();
    } catch (err) {
      console.error(err);
      // Handle both API response errors and plain JS errors (from supabaseMapping)
      const msg = err.response?.data?.message || err.message || 'Failed to add items';
      notifyError(msg);
    } finally {
      setSavingNew(false);
    }
  };

  const openIssueModal = () => {
    if (selectedIds.length === 0) return;
    setIssueModalOpen(true);
    fetchEmployees();
    setSelectedEmployeeId('');
    setSearchEmployee('');
  };

  const handleIssue = async () => {
    if (!selectedEmployeeId) {
      notifyError(t('tools.validation.employeeRequired') || 'Employee is required');
      return;
    }
    try {
      await api.post('/api/slings/issue', {
        item_ids: selectedIds,
        employee_id: selectedEmployeeId
      });
      notifySuccess(t('slings.issue.success'));
      setIssueModalOpen(false);
      fetchItems();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to issue items');
    }
  };

  const handleReturn = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t('slings.return.confirm', { count: selectedIds.length }))) return;
    
    try {
      await api.post('/api/slings/return', {
        item_ids: selectedIds
      });
      notifySuccess(t('slings.return.success'));
      fetchItems();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to return items');
    }
  };

  const downloadQr = async (item) => {
    try {
      const url = await QRCode.toDataURL(item.sku, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      const link = document.createElement('a');
      link.download = `qr-${item.sku}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error(error);
      notifyError('Failed to generate QR code');
    }
  };

  const handlePrintSelected = () => {
    if (selectedIds.length === 0 || !onPrintBatch) return;
    const selectedItems = items.filter(i => selectedIds.includes(i.id));
    onPrintBatch(selectedItems);
  };

  const filteredEmployees = employees.filter(e => {
    if (!e) return false;
    const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
    const brand = (e.brand_number || '').toLowerCase();
    const search = (searchEmployee || '').toLowerCase();
    return fullName.includes(search) || brand.includes(search);
  }).slice(0, 50); // Limit to 50 for performance

  if (loading && items.length === 0) {
    return <div className="p-4 text-center text-slate-500">{t('common.loading')}</div>;
  }

  // Add Items Mode (Empty State or Explicit Add)
  if (isAdding) {
    const existingEditorItems = items.map((item) => ({
      kind: item?.kind || '',
      serial_number: item?.serial_number || '',
      sku: item?.sku || '',
      production_year: Number(item?.production_year) || new Date().getFullYear(),
      production_month: Number(item?.production_month) || (new Date().getMonth() + 1),
      notes: item?.notes || ''
    }));

    const editorItems = [...existingEditorItems, ...newItems];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                {t('slings.editor.addTitle')}
            </h3>
            <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
            >
                {t('common.cancel')}
            </button>
        </div>
        
        <ToolsSlingsEditor 
            items={editorItems}
            onChange={(updatedItems) => setNewItems(updatedItems.slice(existingEditorItems.length))}
            category={category}
            t={t}
            readOnlyCount={existingEditorItems.length}
        />
        
        <div className="flex justify-end gap-2 mt-4">
            <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1 text-sm border rounded text-slate-600 hover:bg-slate-50"
            >
                {t('common.cancel')}
            </button>
            <button
                type="button"
                onClick={handleSaveNewItems}
                disabled={savingNew || newItems.length === 0}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
                {savingNew && <ArrowPathIcon className="w-3 h-3 animate-spin" />}
                {t('common.save')}
            </button>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-slate-50 dark:bg-slate-800/50 border-dashed border-slate-300 dark:border-slate-700">
        <div className="text-slate-500 italic mb-4">
          {t('slings.errors.noItems') || 'No sub-items found.'}
        </div>
        {canManage && (
            <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
            >
                <PlusIcon className="w-4 h-4" />
                {t('slings.actions.addItems')}
            </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div className="text-sm text-slate-500">
              {t('slings.foundItems', { count: items.length })}
            </div>
            <button 
              type="button"
              onClick={fetchItems} 
              className="p-1 text-slate-500 hover:text-blue-600 transition-colors"
              title={t('common.refresh')}
            >
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
                    {t('common.add')}
                </button>
            )}
            {selectedIds.length > 0 && (
                <>
                   {onPrintBatch && (
                      <button
                        type="button"
                        onClick={handlePrintSelected}
                        className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                        title={t('common.printSelected')}
                      >
                        <PrinterIcon className="w-3 h-3" />
                        {t('common.print')}
                      </button>
                   )}
                   {(() => {
                      const selectedItems = items.filter(i => selectedIds.includes(i.id));
                      const allAvailable = selectedItems.length > 0 && selectedItems.every(i => i.status === 'available');
                      const allIssued = selectedItems.length > 0 && selectedItems.every(i => i.status === 'issued');
                      
                      return (
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
                            title={!allAvailable ? (t('slings.issue.onlyAvailable') || 'Only available items can be issued') : ''}
                          >
                            <ArrowUturnRightIcon className="w-3 h-3" />
                            {t('slings.issue.title')}
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
                            title={!allIssued ? (t('slings.return.onlyIssued') || 'Only issued items can be returned') : ''}
                          >
                            <ArrowUturnLeftIcon className="w-3 h-3" />
                            {t('slings.return.title')}
                          </button>
                        </>
                      );
                   })()}
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
                  id="select-all-items"
                  name="select-all-items"
                  aria-label={t('common.selectAll') || 'Select all'}
                  onChange={handleSelectAll}
                  checked={items.length > 0 && selectedIds.length === items.length}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="p-3 w-10">#</th>
              <th className="p-3">{t('slings.table.sku')}</th>
              <th className="p-3">{t('slings.table.kind')}</th>
              <th className="p-3">{t('slings.table.serialNumber')}</th>
              <th className="p-3">{t('slings.table.production')}</th>
              <th className="p-3">{t('slings.table.status')}</th>
              <th className="p-3">{t('slings.table.employee')}</th>
              {canManage && <th className="p-3 w-20">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map((item, index) => {
              const isHighlighted = String(highlightSku || '').trim() !== '' && String(item?.sku || '').trim() === String(highlightSku || '').trim();
              return (
              <tr
                key={item.id}
                id={isHighlighted ? `slings-highlight-${toolId}-${item.id}` : undefined}
                className={`bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 ${isHighlighted ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
              >
                <td className="p-3">
                  <input 
                    type="checkbox" 
                    id={`select-item-${item.id}`}
                    name={`select-item-${item.id}`}
                    aria-label={`Select item ${item.sku}`}
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
                                id={`edit-sku-${item.id}`}
                                name={`edit-sku-${item.id}`}
                                autoComplete="off"
                                aria-label={t('slings.table.sku')}
                                value={editValues.sku} 
                                onChange={e => setEditValues({...editValues, sku: e.target.value})}
                                className="w-24 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                            />
                        </td>
                        <td className="p-3">
                            <input 
                                id={`edit-kind-${item.id}`}
                                name={`edit-kind-${item.id}`}
                                autoComplete="off"
                                aria-label={t('slings.table.kind')}
                                value={editValues.kind} 
                                onChange={e => setEditValues({...editValues, kind: e.target.value})}
                                className="w-24 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                            />
                        </td>
                        <td className="p-3">
                            <input 
                                id={`edit-serial-${item.id}`}
                                name={`edit-serial-${item.id}`}
                                autoComplete="off"
                                aria-label={t('slings.table.serialNumber')}
                                value={editValues.serial_number} 
                                onChange={e => setEditValues({...editValues, serial_number: e.target.value})}
                                className="w-24 px-1 py-0.5 border rounded text-xs dark:bg-slate-700"
                            />
                        </td>
                        <td className="p-3">
                            <div className="flex gap-1">
                                <select 
                                    id={`edit-month-${item.id}`}
                                    name={`edit-month-${item.id}`}
                                    aria-label={t('slings.editor.productionMonth')}
                                    value={editValues.production_month}
                                    onChange={e => setEditValues({...editValues, production_month: parseInt(e.target.value)})}
                                    className="px-1 py-0.5 border rounded text-xs dark:bg-slate-700"
                                >
                                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <input 
                                    type="number"
                                    id={`edit-year-${item.id}`}
                                    name={`edit-year-${item.id}`}
                                    autoComplete="off"
                                    aria-label={t('slings.editor.productionYear')}
                                    value={editValues.production_year}
                                    onChange={e => setEditValues({...editValues, production_year: parseInt(e.target.value)})}
                                    className="w-16 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                                />
                            </div>
                        </td>
                    </>
                ) : (
                    <>
                        <td className="p-3 font-mono">
                            <span 
                                className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title={t('common.copy')}
                                onClick={() => {
                                    const textToCopy = item.sku;
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                        navigator.clipboard.writeText(textToCopy)
                                            .then(() => notifySuccess(t('common.copied')))
                                            .catch(() => notifyError(t('tools.errors.copyFailed')));
                                    } else {
                                        // Fallback
                                        try {
                                            const textArea = document.createElement("textarea");
                                            textArea.value = textToCopy;
                                            textArea.style.position = "fixed";
                                            textArea.style.left = "-9999px";
                                            document.body.appendChild(textArea);
                                            textArea.focus();
                                            textArea.select();
                                            document.execCommand('copy');
                                            document.body.removeChild(textArea);
                                            notifySuccess(t('common.copied'));
                                        } catch (_err) {
                                            notifyError(t('tools.errors.copyFailed'));
                                        }
                                    }
                                }}
                            >
                                {item.sku}
                            </span>
                        </td>
                        <td className="p-3">{item.kind}</td>
                        <td className="p-3 font-mono">{item.serial_number || '-'}</td>
                        <td className="p-3">{item.production_month && item.production_year ? `${String(item.production_month).padStart(2,'0')}.${item.production_year}` : '-'}</td>
                    </>
                )}

                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    item.status === 'available' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 
                    item.status === 'issued' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100' : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {t(`common.status.${item.status}`) || item.status}
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
                            <button type="button" onClick={() => handleSaveEdit(item.id)} className="p-1 text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300" title={t('common.save')}>
                              <CheckIcon className="w-5 h-5" />
                            </button>
                            <button type="button" onClick={handleCancelEdit} className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300" title={t('common.cancel')}>
                              <XMarkIcon className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {!hideEdit ? (
                              <button type="button" onClick={() => handleEditClick(item)} className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" title={t('common.edit')}>
                                <PencilIcon className="w-5 h-5" />
                              </button>
                            ) : null}
                            <button type="button" onClick={() => downloadQr(item)} className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300" title={t('tools.qr.downloadLabel')}>
                              <QrCodeIcon className="w-5 h-5" />
                            </button>
                            {!hideDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                title={t('common.delete')}
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            ) : null}
                            {onDownloadLabel ? (
                              <button
                                type="button"
                                onClick={() => onDownloadLabel(item)}
                                className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
                                title={t('common.download')}
                              >
                                <ArrowDownTrayIcon className="w-5 h-5" />
                              </button>
                            ) : hideDelete ? (
                              <button
                                type="button"
                                onClick={() => downloadQr(item)}
                                className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
                                title={t('common.download')}
                              >
                                <ArrowDownTrayIcon className="w-5 h-5" />
                              </button>
                            ) : null}
                            {onPrintLabel ? (
                              <button
                                type="button"
                                onClick={() => onPrintLabel(item)}
                                className="p-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                                title={t('common.print')}
                              >
                                <PrinterIcon className="w-5 h-5" />
                              </button>
                            ) : onPrintQr ? (
                              <button type="button" onClick={() => onPrintQr(item)} className="p-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300" title={t('common.print')}>
                                <PrinterIcon className="w-5 h-5" />
                              </button>
                            ) : null}
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

      {/* Issue Modal */}
      {issueModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-slate-100">
              {t('slings.issue.title') || 'Wydaj zaznaczone'} ({selectedIds.length})
            </h3>
            
            <div className="mb-4">
              <label htmlFor="search-employee" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('tools.labels.employee') || 'Pracownik'}
              </label>
              <input
                type="text"
                id="search-employee"
                name="search-employee"
                autoComplete="off"
                placeholder={t('common.searchEmployee')}
                value={searchEmployee}
                onChange={(e) => setSearchEmployee(e.target.value)}
                className="w-full mb-2 p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
              />
              {loadingEmployees ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Loading...</div>
              ) : (
                <div className="max-h-40 overflow-y-auto border rounded dark:border-slate-600">
                  {filteredEmployees.map(emp => (
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
                {t('common.cancel') || 'Anuluj'}
              </button>
              <button
                type="button"
                onClick={handleIssue}
                disabled={!selectedEmployeeId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t('common.issue') || 'Wydaj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsSlingsItemsTable;
