import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api';
import { notifyError, notifySuccess } from '../../utils/notify';
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, CheckIcon, PencilIcon, PlusIcon, PrinterIcon, QrCodeIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import ToolsImpactSocketsEditor from './ToolsImpactSocketsEditor';
import { useNavigate } from 'react-router-dom';

const ToolsImpactSocketsItemsTable = ({ toolId, category, t, canManage, onPrintLabel, onPrintBatch, onDownloadLabel, hideDelete = false, hideEdit = false, highlightSku, autoAction }) => {
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
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [qtyMap, setQtyMap] = useState({});
  const [savingIssue, setSavingIssue] = useState(false);

  const goToEmployeeSearch = useCallback((fullName) => {
    const q = String(fullName || '').trim();
    if (!q) return;
    navigate(`/employees?q=${encodeURIComponent(q)}`);
  }, [navigate]);

  const fetchItems = useCallback(async () => {
    if (!toolId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/impact-sockets/by-tool/${toolId}`);
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setItems(rows);
      setSelectedIds([]);
      setEditingId(null);
      setEditValues({});
    } catch (err) {
      notifyError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [toolId, t]);

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await api.get('/api/employees');
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setEmployees(rows);
    } catch (err) {
      notifyError(err?.message || t('common.error'));
    } finally {
      setLoadingEmployees(false);
    }
  }, [t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const sku = String(highlightSku || '').trim();
    if (!sku) return;
    const match = (items || []).find(i => String(i?.sku || '').trim() === sku);
    if (!match) return;
    const el = document.getElementById(`sockets-highlight-${toolId}-${match.id}`);
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
    setSelectedIds([match.id]);
    setSelectedEmployeeId('');
    setSearchEmployee('');
    setQtyMap({ [match.id]: 1 });
    if (action === 'issue') {
      setIssueModalOpen(true);
      setReturnModalOpen(false);
      Promise.resolve(fetchEmployees()).catch(() => {});
    } else {
      setReturnModalOpen(true);
      setIssueModalOpen(false);
      Promise.resolve(fetchEmployees()).catch(() => {});
    }
  }, [autoAction, highlightSku, items, toolId, fetchEmployees]);

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(items.map(i => i.id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const openIssueModal = async () => {
    if (selectedIds.length === 0) return;
    setIssueModalOpen(true);
    setReturnModalOpen(false);
    setSelectedEmployeeId('');
    setSearchEmployee('');
    setQtyMap(Object.fromEntries(selectedIds.map(id => [id, 1])));
    await fetchEmployees();
  };

  const handlePrintSelected = () => {
    if (selectedIds.length === 0 || !onPrintBatch) return;
    const selectedItems = items.filter(i => selectedIds.includes(i.id));
    onPrintBatch(selectedItems);
  };

  const openReturnModal = async () => {
    if (selectedIds.length === 0) return;
    setReturnModalOpen(true);
    setIssueModalOpen(false);
    setSelectedEmployeeId('');
    setSearchEmployee('');
    setQtyMap(Object.fromEntries(selectedIds.map(id => [id, 1])));
    await fetchEmployees();
  };

  const filteredEmployees = useMemo(() => {
    const s = String(searchEmployee || '').toLowerCase();
    return (employees || []).filter(e => {
      const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
      const brand = String(e.brand_number || '').toLowerCase();
      return fullName.includes(s) || brand.includes(s);
    }).slice(0, 50);
  }, [employees, searchEmployee]);

  const handleSaveNewItems = async () => {
    if (!toolId) return;
    if (newItems.length === 0) {
      setIsAdding(false);
      return;
    }
    setSavingNew(true);
    try {
      const cleanItems = newItems.map(row => ({
        sku: String(row.sku || '').trim(),
        kind: String(row.kind || '').trim(),
        size: String(row.size || '').trim(),
        quantity: Math.max(1, parseInt(row.quantity || 1, 10))
      }));
      await api.post(`/api/impact-sockets/by-tool/${toolId}`, cleanItems);
      notifySuccess(t('common.saved') || t('common.save'));
      setNewItems([]);
      setIsAdding(false);
      fetchItems();
    } catch (err) {
      notifyError(err?.message || t('common.error'));
    } finally {
      setSavingNew(false);
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditValues({
      sku: item.sku || '',
      kind: item.kind || '',
      size: item.size || '',
      quantity: item.quantity ?? 1
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/api/impact-sockets/items/${id}`, {
        tool_id: toolId,
        sku: String(editValues.sku || '').trim(),
        kind: String(editValues.kind || '').trim(),
        size: String(editValues.size || '').trim(),
        quantity: Math.max(1, parseInt(editValues.quantity || 1, 10))
      });
      notifySuccess(t('common.saved') || t('common.save'));
      setEditingId(null);
      setEditValues({});
      fetchItems();
    } catch (err) {
      notifyError(err?.message || t('common.error'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('common.confirmDelete') || 'Usunąć pozycję?')) return;
    try {
      await api.delete(`/api/impact-sockets/items/${id}`, { body: { tool_id: toolId } });
      notifySuccess(t('common.deleted') || t('common.delete'));
      fetchItems();
    } catch (err) {
      notifyError(err?.message || t('common.error'));
    }
  };

  const downloadQr = async (item) => {
    const sku = String(item?.sku || '').trim();
    if (!sku) return;
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
      notifyError(t('tools.qr.generateError') || t('common.error'));
    }
  };

  const handleIssueOrReturn = async (type) => {
    if (!toolId) return;
    if (!selectedEmployeeId) {
      notifyError(t('tools.validation.employeeRequired') || t('common.selectEmployee'));
      return;
    }
    const payloadItems = selectedIds.map(id => ({
      item_id: id,
      quantity: Math.max(1, parseInt(qtyMap[id] || 1, 10))
    }));
    setSavingIssue(true);
    try {
      const endpoint = type === 'issue' ? '/api/impact-sockets/issue' : '/api/impact-sockets/return';
      await api.post(endpoint, { tool_id: toolId, employee_id: selectedEmployeeId, items: payloadItems });
      notifySuccess(t('common.saved') || t('common.save'));
      setIssueModalOpen(false);
      setReturnModalOpen(false);
      fetchItems();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (err) {
      notifyError(err?.message || t('common.error'));
    } finally {
      setSavingIssue(false);
    }
  };

  if (loading && items.length === 0) {
    return <div className="p-4 text-center text-slate-500">{t('common.loading')}</div>;
  }

  if (!loading && items.length === 0 && !isAdding) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-slate-50 dark:bg-slate-800/50 border-dashed border-slate-300 dark:border-slate-700">
        <div className="text-slate-500 italic mb-4">
          {t('sockets.errors.noItems')}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            {t('sockets.actions.addItems')}
          </button>
        )}
      </div>
    );
  }

  if (isAdding) {
    const existingEditorItems = items.map((item) => ({
      sku: item?.sku || '',
      kind: item?.kind || '',
      size: item?.size || '',
      quantity: Math.max(1, parseInt(item?.quantity || 1, 10))
    }));
    const editorItems = [...existingEditorItems, ...newItems];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            {t('sockets.add.title')}
          </h3>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            {t('common.cancel')}
          </button>
        </div>

        <ToolsImpactSocketsEditor
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-500">
            {t('sockets.foundItems', { count: items.length })}
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
          {selectedIds.length > 0 && onPrintBatch && (
            <button
              type="button"
              onClick={handlePrintSelected}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              title={t('common.print')}
            >
              <PrinterIcon className="w-3 h-3" />
              {t('common.print')}
            </button>
          )}
          {canManage && selectedIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={openIssueModal}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100"
              >
                <ArrowUturnRightIcon className="w-3 h-3" />
                {t('sockets.issue.title')}
              </button>
              <button
                type="button"
                onClick={openReturnModal}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100"
              >
                <ArrowUturnLeftIcon className="w-3 h-3" />
                {t('sockets.return.title')}
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
                  id="select-all-items"
                  name="select-all-items"
                  aria-label={t('common.selectAll') || 'Select all'}
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="p-3 w-10">#</th>
              <th className="p-3">{t('sockets.table.sku')}</th>
              <th className="p-3">{t('sockets.table.kind')}</th>
              <th className="p-3">{t('sockets.table.size')}</th>
              <th className="p-3">{t('sockets.table.quantity')}</th>
              <th className="p-3">{t('sockets.table.issued')}</th>
              <th className="p-3">{t('sockets.table.available')}</th>
              <th className="p-3">{t('sockets.table.employee')}</th>
              {canManage && <th className="p-3 w-20">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map((item, index) => {
              const isEditing = editingId === item.id;
              const isHighlighted = String(highlightSku || '').trim() !== '' && String(item?.sku || '').trim() === String(highlightSku || '').trim();
              return (
                <tr
                  key={item.id}
                  id={isHighlighted ? `sockets-highlight-${toolId}-${item.id}` : undefined}
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
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.sku || ''}
                        onChange={(e) => setEditValues(v => ({ ...v, sku: e.target.value }))}
                        className="w-40 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 font-mono"
                      />
                    ) : (
                      <span className="font-mono">{item.sku}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.kind || ''}
                        onChange={(e) => setEditValues(v => ({ ...v, kind: e.target.value }))}
                        className="w-40 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                      />
                    ) : (
                      <span className="sharp-text">{item.kind}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.size || ''}
                        onChange={(e) => setEditValues(v => ({ ...v, size: e.target.value }))}
                        className="w-24 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                      />
                    ) : (
                      <span className="sharp-text">{item.size}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="number"
                        min={1}
                        value={editValues.quantity ?? 1}
                        onChange={(e) => setEditValues(v => ({ ...v, quantity: Number(e.target.value) }))}
                        className="w-20 px-1 py-0.5 border rounded text-xs dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                      />
                    ) : (
                      <span className="sharp-text">{item.quantity}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="sharp-text">{item.issued_quantity ?? 0}</span>
                  </td>
                  <td className="p-3">
                    <span className="sharp-text">{item.available_quantity ?? item.quantity}</span>
                  </td>
                  <td className="p-3">
                    {Array.isArray(item.issued_to) && item.issued_to.length > 0 ? (
                      <div className="space-y-1">
                        {item.issued_to.map((h) => {
                          const fullName = `${h.employee_first_name || ''} ${h.employee_last_name || ''}`.trim();
                          const brandValue = h.employee_brand_number;
                          const hasBrand = brandValue !== null && brandValue !== undefined && String(brandValue).trim() !== '';
                          const qty = Number(h.quantity || 0) || 0;

                          return (
                            <div key={`${item.id}-${h.employee_id || ''}-${h.employee_brand_number || ''}-${fullName || 'unknown'}`} className="flex items-center justify-between gap-3">
                              {fullName ? (
                                <button
                                  type="button"
                                  onClick={() => goToEmployeeSearch(fullName)}
                                  className="text-left inline-flex items-center gap-2 text-base font-medium text-slate-900 dark:text-slate-100 font-mono sharp-text cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  title={t('employees.navigateToEmployeeIndex') || 'Przejdź do kartoteki pracownika'}
                                >
                                  {hasBrand ? (
                                    <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white dark:bg-indigo-500">
                                      {String(brandValue).trim()}
                                    </span>
                                  ) : null}
                                  <span>{fullName}</span>
                                </button>
                              ) : (
                                <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">{h.employee_id || '-'}</span>
                              )}
                              <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">{qty}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  {canManage && (
                    <td className="p-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            className="p-1 text-green-700 hover:text-green-800"
                            title={t('common.save')}
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-1 text-slate-500 hover:text-slate-700"
                            title={t('common.cancel')}
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {!hideEdit ? (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title={t('common.edit')}
                            >
                              <PencilIcon className="w-5 h-5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => downloadQr(item)}
                            className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
                            title={t('tools.qr.downloadLabel')}
                            disabled={!item?.sku}
                          >
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
                          {onDownloadLabel && (
                            <button
                              type="button"
                              onClick={() => onDownloadLabel(item)}
                              className="p-1 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
                              title={t('common.download')}
                            >
                              <ArrowDownTrayIcon className="w-5 h-5" />
                            </button>
                          )}
                          {onPrintLabel && (
                            <button
                              type="button"
                              onClick={() => onPrintLabel(item)}
                              className="p-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                              title={t('common.print')}
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

      {(issueModalOpen || returnModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {issueModalOpen ? t('sockets.issue.title') : t('sockets.return.title')}
              </div>
              <button
                  type="button"
                  onClick={() => {
                  setIssueModalOpen(false);
                  setReturnModalOpen(false);
                }}
                className="p-1 text-slate-500 hover:text-slate-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-slate-500 mb-1">{t('common.searchEmployee')}</div>
              <input
                type="text"
                id="search-employee"
                name="search-employee"
                autoComplete="off"
                value={searchEmployee}
                onChange={(e) => {
                  setSearchEmployee(e.target.value);
                  setSelectedEmployeeId('');
                }}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                placeholder={t('common.searchEmployee')}
              />
              {loadingEmployees ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</div>
              ) : (
                <div className="max-h-40 overflow-y-auto border rounded dark:border-slate-600">
                  {filteredEmployees.map(emp => (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployeeId(emp.id);
                        setSearchEmployee(`${emp.brand_number ? `[${emp.brand_number}]` : ''} ${emp.first_name || ''} ${emp.last_name || ''} `.trim());
                      }}
                      className={`p-2 cursor-pointer text-sm text-slate-900 dark:text-slate-100 ${
                        selectedEmployeeId === emp.id
                          ? 'bg-blue-100 dark:bg-blue-900 dark:text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {emp.brand_number ? `[${emp.brand_number}]` : ''} {emp.first_name} {emp.last_name}
                    </div>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <div className="p-2 text-slate-500 dark:text-slate-400 text-sm">{t('common.noResults')}</div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">{t('sockets.table.kind')}</th>
                    <th className="px-3 py-2 w-28">{t('sockets.table.size')}</th>
                    <th className="px-3 py-2 w-28">{t('sockets.modal.qty')}</th>
                    <th className="px-3 py-2 w-24">{t('sockets.table.available')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {items.filter(i => selectedIds.includes(i.id)).map(i => (
                    <tr key={i.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{i.kind}</td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{i.size}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={qtyMap[i.id] ?? 1}
                          onChange={(e) => setQtyMap(m => ({ ...m, [i.id]: e.target.value }))}
                          className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{i.available_quantity ?? i.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setIssueModalOpen(false);
                  setReturnModalOpen(false);
                }}
                className="px-3 py-1.5 text-sm border rounded text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleIssueOrReturn(issueModalOpen ? 'issue' : 'return')}
                disabled={savingIssue}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsImpactSocketsItemsTable;
