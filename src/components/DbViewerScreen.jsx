import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'react-toastify';
import api from '../api';
import ConfirmationModal from './ConfirmationModal';

const DbViewerScreen = ({ user }) => {
  const { t } = useLanguage();
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingData, setLoadingData] = useState(false);
  const [primaryKey, setPrimaryKey] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showEditRowModal, setShowEditRowModal] = useState(false);
  const [editRowSaving, setEditRowSaving] = useState(false);
  const [showDeleteRowModal, setShowDeleteRowModal] = useState(false);
  const [deleteRowTarget, setDeleteRowTarget] = useState(null);
  const [deleteRowLoading, setDeleteRowLoading] = useState(false);
  const [showDeleteTableModal, setShowDeleteTableModal] = useState(false);
  const [deleteTableLoading, setDeleteTableLoading] = useState(false);
  const [columnTypes, setColumnTypes] = useState({});
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRowValues, setNewRowValues] = useState({});
  const [addRowLoading, setAddRowLoading] = useState(false);
  const [addRowErrors, setAddRowErrors] = useState({});
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableColumns, setNewTableColumns] = useState([]);
  const [newTablePrimaryKey, setNewTablePrimaryKey] = useState('');
  const [createTableLoading, setCreateTableLoading] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState(() => new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTab, setExportTab] = useState('json');

  const isAdmin = user?.role === 'administrator';

  const fetchTables = useCallback(async () => {
    try {
      setLoadingTables(true);
      const data = await api.get('/api/db/tables');
      setTables(data || []);
      if (!selectedTable && (data || []).length > 0) {
        setSelectedTable(data[0]);
      }
    } catch (_error) {
      toast.error(t('common.toastr.db.tablesFetchError'));
    } finally {
      setLoadingTables(false);
    }
  }, [selectedTable, t]);

  const fetchTableData = useCallback(async (table, lim, off) => {
    try {
      setLoadingData(true);
      const data = await api.get(`/api/db/table/${encodeURIComponent(table)}?limit=${lim}&offset=${off}`);
      setRows(data.rows || []);
      setColumns(data.columns || []);
      setTotal(data.total || 0);
      const pk = Array.isArray(data.primaryKey) ? data.primaryKey[0] : null;
      setPrimaryKey(pk || null);
      setEditingId(null);
      setEditValues({});
      setShowEditRowModal(false);
      setEditRowSaving(false);
      setColumnTypes(data.columnTypes || {});
      setNewRowValues({});
      setSelectedRowIds(new Set());
    } catch (_error) {
      toast.error(t('common.toastr.db.tableDataFetchError'));
    } finally {
      setLoadingData(false);
    }
  }, [t]);

  useEffect(() => {
    Promise.resolve().then(() => { fetchTables(); });
  }, [fetchTables]);

  useEffect(() => {
    if (selectedTable) {
      Promise.resolve().then(() => { fetchTableData(selectedTable, limit, offset); });
    }
  }, [selectedTable, limit, offset, fetchTableData]);

  const handlePrev = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    const next = offset + limit;
    if (next < total) setOffset(next);
  };

  const handleSelectTable = (t) => {
    setSelectedTable(t);
    setOffset(0);
  };

  const startEditRow = (row) => {
    if (!primaryKey) {
      toast.warn(t('common.toastr.db.noPrimaryKeyWarn'));
      return;
    }
    setEditingId(row[primaryKey]);
    const initial = {};
    columns.forEach(c => { initial[c] = row[c]; });
    setEditValues(initial);
    setShowEditRowModal(true);
  };

  const cancelEditRow = () => {
    setEditingId(null);
    setEditValues({});
    setShowEditRowModal(false);
    setEditRowSaving(false);
  };

  const inputTypeFor = (col) => {
    const t = String(columnTypes[col] || '').toUpperCase();
    if (t.includes('INT') || t.includes('REAL') || t.includes('DOUBLE') || t.includes('FLOAT')) return 'number';
    return 'text';
  };

  const handleEditChange = (col, value) => {
    setEditValues(prev => ({ ...prev, [col]: value }));
  };

  const saveEditRow = async () => {
    if (!selectedTable || !primaryKey) return;
    setEditRowSaving(true);
    try {
      const pkValue = editingId;
      const updates = { ...editValues };
      delete updates[primaryKey];
      await api.put(`/api/db/table/${encodeURIComponent(selectedTable)}/row`, {
        pk: primaryKey,
        id: pkValue,
        updates
      });
      toast.success(t('common.toastr.db.rowUpdatedSuccess'));
      cancelEditRow();
      fetchTableData(selectedTable, limit, offset);
    } catch (error) {
      toast.error(error?.message || t('common.toastr.db.rowSaveError'));
    } finally {
      setEditRowSaving(false);
    }
  };

  // Dodawanie wiersza
  const openAddRowModal = () => {
    if (!selectedTable) return;
    const initial = {};
    columns.forEach(c => { initial[c] = ''; });
    setNewRowValues(initial);
    setAddRowErrors({});
    setShowAddRowModal(true);
  };

  const handleNewRowChange = (col, value) => {
    setNewRowValues(prev => ({ ...prev, [col]: value }));
  };

  const validateNewRow = () => {
    const errs = {};
    columns.forEach(c => {
      const t = String(columnTypes[c] || '').toUpperCase();
      const val = newRowValues[c];
      if (val !== '' && val !== null && typeof val !== 'undefined') {
        if (t.includes('INT')) {
          if (isNaN(parseInt(val, 10))) errs[c] = 'Wymagana liczba całkowita';
        } else if (t.includes('REAL') || t.includes('DOUBLE') || t.includes('FLOAT')) {
          if (isNaN(parseFloat(val))) errs[c] = 'Wymagana liczba zmiennoprzecinkowa';
        }
      }
    });
    return errs;
  };

  const confirmAddRow = async () => {
    setAddRowLoading(true);
    const errs = validateNewRow();
    setAddRowErrors(errs);
    if (Object.keys(errs).length) {
      setAddRowLoading(false);
      return;
    }
    try {
      const values = { ...newRowValues };
      await api.post(`/api/db/table/${encodeURIComponent(selectedTable)}/row`, { values });
      toast.success(t('common.toastr.db.rowAddedSuccess'));
      setShowAddRowModal(false);
      fetchTableData(selectedTable, limit, offset);
    } catch (error) {
      toast.error(error?.message || t('common.toastr.db.rowAddError'));
    } finally {
      setAddRowLoading(false);
    }
  };

  // Tworzenie tabeli
  const openCreateTableModal = () => {
    setNewTableName('');
    setNewTableColumns([{ name: '', type: 'TEXT', notNull: false }]);
    setNewTablePrimaryKey('');
    setCreateTableLoading(false);
    setShowCreateTableModal(true);
  };

  const addNewTableColumn = () => {
    setNewTableColumns(prev => [...prev, { name: '', type: 'TEXT', notNull: false }]);
  };

  const updateNewTableColumn = (idx, field, value) => {
    setNewTableColumns(prev => prev.map((c, i) => i === idx ? { ...c, [field]: field === 'notNull' ? !!value : value } : c));
  };

  const removeNewTableColumn = (idx) => {
    setNewTableColumns(prev => prev.filter((_, i) => i !== idx));
  };

  const confirmCreateTable = async () => {
    setCreateTableLoading(true);
    const invalid = !newTableName || newTableColumns.length === 0 || newTableColumns.some(c => !c.name || !/^[A-Za-z0-9_]+$/.test(c.name));
    if (invalid) {
      toast.error(t('common.toastr.db.tableCreateInvalid'));
      setCreateTableLoading(false);
      return;
    }
    try {
      await api.post('/api/db/table', {
        name: newTableName,
        columns: newTableColumns,
        primaryKey: newTablePrimaryKey
      });
      toast.success(t('common.toastr.db.tableCreateSuccess', { table: newTableName }));
      setShowCreateTableModal(false);
      fetchTables();
      setSelectedTable(newTableName);
      setOffset(0);
    } catch (error) {
      toast.error(error?.message || t('common.toastr.db.tableCreateError'));
    } finally {
      setCreateTableLoading(false);
    }
  };

  const requestDeleteRow = (row) => {
    if (!primaryKey) {
      toast.warn(t('common.toastr.db.noPrimaryKeyDeleteWarn'));
      return;
    }
    setDeleteRowTarget(row);
    setShowDeleteRowModal(true);
  };

  const confirmDeleteRow = async () => {
    if (!selectedTable || !primaryKey || !deleteRowTarget) return;
    setDeleteRowLoading(true);
    try {
      const pkValue = deleteRowTarget[primaryKey];
      await api.delete(`/api/db/table/${encodeURIComponent(selectedTable)}/row?pk=${encodeURIComponent(primaryKey)}&id=${encodeURIComponent(pkValue)}`);
      toast.success(t('common.toastr.db.rowDeletedSuccess'));
      setShowDeleteRowModal(false);
      setDeleteRowTarget(null);
      fetchTableData(selectedTable, limit, offset);
    } catch (error) {
      toast.error(error?.message || t('common.toastr.db.rowDeleteError'));
    } finally {
      setDeleteRowLoading(false);
    }
  };

  const requestDeleteTable = () => {
    if (!selectedTable) return;
    setShowDeleteTableModal(true);
  };

  const confirmDeleteTable = async () => {
    if (!selectedTable) return;
    setDeleteTableLoading(true);
    try {
      await api.delete(`/api/db/table/${encodeURIComponent(selectedTable)}`);
      toast.success(t('common.toastr.db.tableDeletedSuccess', { table: selectedTable }));
      setShowDeleteTableModal(false);
      // odśwież listę tabel
      await fetchTables();
      setSelectedTable(null);
      setRows([]);
      setColumns([]);
      setTotal(0);
      setPrimaryKey(null);
    } catch (error) {
      toast.error(error?.message || t('common.toastr.db.tableDeleteError'));
    } finally {
      setDeleteTableLoading(false);
    }
  };

  const renderCell = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return trimmed;
      }
    }
    return String(value);
  };

  const makeFieldId = (prefix, key) => {
    const safeKey = String(key ?? '')
      .replaceAll(' ', '_')
      .replaceAll('/', '_')
      .replaceAll('\\', '_')
      .replaceAll('"', '')
      .replaceAll("'", '')
      .replaceAll(':', '_');
    return `dbv-${prefix}-${safeKey}`.toLowerCase();
  };

  const getRowId = useCallback((row, idx) => {
    if (primaryKey) return row?.[primaryKey];
    return `${offset + idx}`;
  }, [primaryKey, offset]);

  const toggleRowSelected = useCallback((rowId) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const areAllVisibleSelected = useMemo(() => {
    if (!rows.length) return false;
    return rows.every((row, idx) => selectedRowIds.has(getRowId(row, idx)));
  }, [rows, selectedRowIds, getRowId]);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (!rows.length) return next;
      const allSelected = rows.every((row, idx) => next.has(getRowId(row, idx)));
      if (allSelected) {
        rows.forEach((row, idx) => next.delete(getRowId(row, idx)));
      } else {
        rows.forEach((row, idx) => next.add(getRowId(row, idx)));
      }
      return next;
    });
  }, [rows, getRowId]);

  const selectedRows = useMemo(() => {
    if (!rows.length || selectedRowIds.size === 0) return [];
    return rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => selectedRowIds.has(getRowId(row, idx)))
      .map(({ row }) => {
        const out = {};
        columns.forEach(col => { out[col] = row[col]; });
        return out;
      });
  }, [rows, selectedRowIds, getRowId, columns]);

  const quoteIdent = useCallback((name) => `"${String(name).replaceAll('"', '""')}"`, []);

  const sqlValueFor = useCallback((col, value) => {
    if (value === null || typeof value === 'undefined') return 'NULL';
    const colType = String(columnTypes[col] || '').toUpperCase();
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (colType.includes('INT') || colType.includes('REAL') || colType.includes('DOUBLE') || colType.includes('FLOAT')) {
      const n = Number(value);
      if (Number.isFinite(n)) return String(n);
    }
    const str = typeof value === 'string' ? value : (() => {
      try { return JSON.stringify(value); } catch { return String(value); }
    })();
    return `'${str.replaceAll("'", "''")}'`;
  }, [columnTypes]);

  const exportJsonText = useMemo(() => JSON.stringify(selectedRows, null, 2), [selectedRows]);

  const exportCsvText = useMemo(() => {
    const escape = (v) => {
      if (v === null || typeof v === 'undefined') return '';
      const str = typeof v === 'string' ? v : (() => {
        try { return JSON.stringify(v); } catch { return String(v); }
      })();
      const needsQuotes = /[",\r\n]/.test(str);
      const escaped = str.replaceAll('"', '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };
    const header = columns.join(',');
    const lines = selectedRows.map(r => columns.map(c => escape(r[c])).join(','));
    return [header, ...lines].join('\n');
  }, [selectedRows, columns]);

  const exportSqlText = useMemo(() => {
    if (!selectedTable) return '';
    if (!selectedRows.length) return '';
    const cols = columns.map(quoteIdent).join(', ');
    const values = selectedRows
      .map(r => `(${columns.map(c => sqlValueFor(c, r[c])).join(', ')})`)
      .join(',\n');
    return `INSERT INTO ${quoteIdent(selectedTable)} (${cols}) VALUES\n${values};`;
  }, [selectedRows, columns, selectedTable, quoteIdent, sqlValueFor]);

  const copyToClipboard = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success('Skopiowano do schowka');
        return;
      }
    } catch (_) { void 0; }

    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      toast.success('Skopiowano do schowka');
    } catch (_) {
      toast.error('Nie udało się skopiować');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="flex h-full">
      {/* Lista tabel */}
      <div className="w-64 border-r border-gray-200 dark:border-slate-700 p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Tabele</h2>
          {isAdmin && (
            <button onClick={openCreateTableModal} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">Utwórz tabelę</button>
          )}
          {loadingTables && <span className="text-xs text-gray-500 dark:text-slate-400">{t('loading.tables')}</span>}
        </div>
        <ul className="space-y-1">
          {tables.map(t => (
            <li key={t}>
              <button
                onClick={() => handleSelectTable(t)}
                className={`w-full text-left px-2 py-1 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 ${selectedTable === t ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200' : 'text-gray-700 dark:text-slate-200'}`}
              >
                {t}
              </button>
            </li>
          ))}
          {tables.length === 0 && !loadingTables && (
            <li className="text-sm text-gray-500 dark:text-slate-400">{t('noData.tables')}</li>
          )}
        </ul>
      </div>

      {/* Dane tabeli */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-start gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">{selectedTable || 'Wybierz tabelę'}</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Rekordy: {total}</p>
              {primaryKey && <p className="text-xs text-gray-500 dark:text-slate-400">Klucz główny: {primaryKey}</p>}
            </div>
              {selectedRowIds.size > 0 && (
                <button
                  onClick={() => { setExportTab('json'); setShowExportModal(true); }}
                  className="mt-2 text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Eksport ({selectedRowIds.size})
                </button>
              )}
          </div>
          <div className="flex items-center space-x-2">
            <label htmlFor="dbv-limit" className="text-xs text-gray-600 dark:text-slate-300">Na stronę</label>
            <select
              id="dbv-limit"
              name="limit"
              className="text-sm text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            >
              {[25,50,100,200,500].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={handlePrev} className="text-sm px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200">Poprzednia</button>
            <button onClick={handleNext} className="text-sm px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200">Następna</button>
            <span className="text-xs text-gray-600 dark:text-slate-300">Strona {currentPage}/{totalPages}</span>
            {isAdmin && selectedTable && (
              <button
                onClick={openAddRowModal}
                className="ml-2 text-sm px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
              >
                Dodaj wiersz
              </button>
            )}
            {isAdmin && selectedTable && (
              <button
                onClick={requestDeleteTable}
                className="ml-2 text-sm px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Usuń tabelę
              </button>
            )}
          </div>
        </div>

        <div className="border border-gray-200 dark:border-slate-700 rounded overflow-auto">
          {loadingData ? (
            <div className="p-4 text-sm text-gray-600 dark:text-slate-300">{t('loading.data')}</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-gray-600 dark:text-slate-300">{t('common.noData')}</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700 w-10">
                    <input
                      id="dbv-select-all-visible"
                      name="select_all_visible"
                      type="checkbox"
                      checked={areAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 accent-slate-900 dark:accent-slate-200"
                      aria-label="Zaznacz wszystkie widoczne"
                    />
                  </th>
                  {columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700">{col}</th>
                  ))}
                  {isAdmin && <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700">Akcje</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`odd:bg-white even:bg-gray-50 dark:odd:bg-slate-900 dark:even:bg-slate-800 ${selectedRowIds.has(getRowId(row, idx)) ? 'bg-orange-50 dark:bg-orange-900/20' : ''}`}
                  >
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700">
                      <input
                        id={`dbv-select-row-${getRowId(row, idx)}`}
                        name={`select_row_${getRowId(row, idx)}`}
                        type="checkbox"
                        checked={selectedRowIds.has(getRowId(row, idx))}
                        onChange={() => toggleRowSelected(getRowId(row, idx))}
                        className="h-4 w-4 accent-slate-900 dark:accent-slate-200"
                        aria-label="Zaznacz wiersz"
                      />
                    </td>
                    {columns.map(col => (
                      <td key={col} className="px-3 py-2 text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700 whitespace-pre-wrap break-words">
                        {renderCell(row[col])}
                      </td>
                    ))}
                    {isAdmin && (
                      <td className="px-3 py-2 text-gray-700 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700 whitespace-nowrap">
                        <button onClick={() => startEditRow(row)} className="text-sm px-2 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600 mr-2" disabled={!primaryKey}>Edytuj</button>
                        <button onClick={() => requestDeleteRow(row)} className="text-sm px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700" disabled={!primaryKey}>Usuń</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal potwierdzenia usunięcia wiersza */}
      <ConfirmationModal
        isOpen={showDeleteRowModal}
        onClose={() => { if (!deleteRowLoading) { setShowDeleteRowModal(false); setDeleteRowTarget(null); } }}
        onConfirm={confirmDeleteRow}
        title="Usuń wiersz"
        message={deleteRowTarget && primaryKey ? `Czy na pewno chcesz usunąć wiersz ${primaryKey}=${deleteRowTarget[primaryKey]}?` : 'Czy na pewno chcesz usunąć ten wiersz?'}
        confirmText="Usuń"
        cancelText={t('common.cancel')}
        type="danger"
        loading={deleteRowLoading}
      />

      {/* Modal potwierdzenia usunięcia tabeli */}
      <ConfirmationModal
        isOpen={showDeleteTableModal}
        onClose={() => { if (!deleteTableLoading) { setShowDeleteTableModal(false); } }}
        onConfirm={confirmDeleteTable}
        title="Usuń tabelę"
        message={selectedTable ? `Czy na pewno chcesz usunąć tabelę "${selectedTable}"?` : 'Czy na pewno chcesz usunąć tę tabelę?'}
        confirmText="Usuń"
        cancelText={t('common.cancel')}
        type="danger"
        loading={deleteTableLoading}
      />

      {/* Modal edycji wiersza */}
      {showEditRowModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded shadow-lg w-full max-w-4xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Edytuj wiersz</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Tabela: {selectedTable || '-'} {primaryKey ? `• ${primaryKey}=${String(editingId ?? '')}` : ''}
                </p>
              </div>
              <button
                onClick={() => { if (!editRowSaving) cancelEditRow(); }}
                className="text-sm px-2 py-1 rounded text-gray-900 dark:text-slate-100 bg-gray-200 dark:bg-slate-700"
              >
                Zamknij
              </button>
            </div>

            <div className="mt-3 space-y-3 max-h-[55vh] overflow-auto pr-1">
              {columns.map((col) => {
                const val = editValues[col] ?? '';
                const isPk = primaryKey && col === primaryKey;
                const isLongText = inputTypeFor(col) === 'text' && String(val ?? '').length > 80;
                return (
                  <div key={col} className="grid grid-cols-12 gap-3 items-start">
                    <label htmlFor={makeFieldId('editrow', col)} className="col-span-4 text-xs text-gray-700 dark:text-slate-300 pt-2 break-words">
                      {col}
                    </label>
                    <div className="col-span-8">
                      {isLongText ? (
                        <textarea
                          id={makeFieldId('editrow', col)}
                          name={`editrow_${String(col)}`}
                          className={`w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 font-mono text-xs text-gray-900 dark:text-slate-100 h-28 ${isPk ? 'opacity-70' : ''}`}
                          value={val}
                          onChange={(e) => handleEditChange(col, e.target.value)}
                          disabled={isPk}
                        />
                      ) : (
                        <input
                          id={makeFieldId('editrow', col)}
                          name={`editrow_${String(col)}`}
                          type={inputTypeFor(col)}
                          className={`w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 text-sm text-gray-900 dark:text-slate-100 ${isPk ? 'font-mono opacity-70' : ''}`}
                          value={val}
                          onChange={(e) => handleEditChange(col, e.target.value)}
                          step={String(columnTypes[col] || '').toUpperCase().includes('INT') ? '1' : undefined}
                          disabled={isPk}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => cancelEditRow()}
                disabled={editRowSaving}
                className="text-sm px-2 py-1 rounded bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-slate-100 disabled:opacity-60"
              >
                Anuluj
              </button>
              <button
                onClick={saveEditRow}
                disabled={editRowSaving}
                className="text-sm px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {editRowSaving ? 'Zapisywanie…' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eksportu zaznaczonych wierszy */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded shadow-lg w-full max-w-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Eksport zaznaczonych</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Tabela: {selectedTable || '-'} • Wiersze: {selectedRows.length}
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-sm px-2 py-1 rounded text-gray-900 dark:text-slate-100 bg-gray-200 dark:bg-slate-700"
              >
                Zamknij
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setExportTab('json')}
                className={`text-xs px-2 py-1 rounded border ${exportTab === 'json' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700'}`}
              >
                JSON
              </button>
              <button
                onClick={() => setExportTab('sql')}
                className={`text-xs px-2 py-1 rounded border ${exportTab === 'sql' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700'}`}
              >
                SQL
              </button>
              <button
                onClick={() => setExportTab('csv')}
                className={`text-xs px-2 py-1 rounded border ${exportTab === 'csv' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700'}`}
              >
                CSV
              </button>

              <div className="flex-1" />

              <button
                onClick={() => {
                  const text = exportTab === 'json' ? exportJsonText : exportTab === 'sql' ? exportSqlText : exportCsvText;
                  copyToClipboard(text);
                }}
                className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Kopiuj
              </button>
            </div>

            <div className="mt-3">
              <textarea
                id="dbv-export-text"
                name="export_text"
                readOnly
                className="w-full h-[50vh] font-mono text-xs text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded px-2 py-2"
                value={exportTab === 'json' ? exportJsonText : exportTab === 'sql' ? exportSqlText : exportCsvText}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal dodawania wiersza */}
      {showAddRowModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded shadow-lg w-full max-w-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Dodaj wiersz do: {selectedTable}</h3>
            <div className="space-y-3 max-h-[50vh] overflow-auto">
              {columns.map((col) => (
                <div key={col}>
                  <label htmlFor={makeFieldId('newrow', col)} className="block text-xs text-gray-700 dark:text-slate-300 mb-1">{col}</label>
                  <input
                    id={makeFieldId('newrow', col)}
                    name={`newrow_${String(col)}`}
                    type={inputTypeFor(col)}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1"
                    value={newRowValues[col] ?? ''}
                    onChange={(e) => handleNewRowChange(col, e.target.value)}
                    step={String(columnTypes[col] || '').toUpperCase().includes('INT') ? '1' : undefined}
                  />
                  {addRowErrors[col] && (
                    <p className="text-xs text-red-600 mt-1">{addRowErrors[col]}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button onClick={() => setShowAddRowModal(false)} className="text-sm px-2 py-1 rounded bg-gray-200 dark:bg-slate-700">Anuluj</button>
              <button onClick={confirmAddRow} disabled={addRowLoading} className="text-sm px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700">
                {addRowLoading ? 'Dodawanie…' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tworzenia tabeli */}
      {showCreateTableModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded shadow-lg w-full max-w-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Utwórz nową tabelę</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="dbv-new-table-name" className="block text-xs text-gray-700 dark:text-slate-300 mb-1">Nazwa tabeli</label>
                <input
                  id="dbv-new-table-name"
                  name="new_table_name"
                  type="text"
                  className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-700 dark:text-slate-300">Kolumny</span>
                  <button onClick={addNewTableColumn} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">Dodaj kolumnę</button>
                </div>
                <div className="space-y-3 max-h-[40vh] overflow-auto">
                  {newTableColumns.map((c, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <label htmlFor={`dbv-newcol-name-${idx}`} className="block text-xs text-gray-700 dark:text-slate-300 mb-1">Nazwa</label>
                        <input
                          id={`dbv-newcol-name-${idx}`}
                          name={`newcol_name_${idx}`}
                          type="text"
                          className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1"
                          value={c.name}
                          onChange={(e) => updateNewTableColumn(idx, 'name', e.target.value)}
                        />
                      </div>
                      <div className="col-span-4">
                        <label htmlFor={`dbv-newcol-type-${idx}`} className="block text-xs text-gray-700 dark:text-slate-300 mb-1">Typ</label>
                        <select
                          id={`dbv-newcol-type-${idx}`}
                          name={`newcol_type_${idx}`}
                          className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1"
                          value={c.type}
                          onChange={(e) => updateNewTableColumn(idx, 'type', e.target.value)}
                        >
                          {['TEXT','INTEGER','REAL','BLOB'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label htmlFor={`dbv-newcol-notnull-${idx}`} className="block text-xs text-gray-700 dark:text-slate-300 mb-1">NOT NULL</label>
                        <input
                          id={`dbv-newcol-notnull-${idx}`}
                          name={`newcol_notnull_${idx}`}
                          type="checkbox"
                          checked={!!c.notNull}
                          onChange={(e) => updateNewTableColumn(idx, 'notNull', e.target.checked)}
                        />
                      </div>
                      <div className="col-span-1">
                        <button onClick={() => removeNewTableColumn(idx)} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Usuń</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="dbv-new-table-pk" className="block text-xs text-gray-700 dark:text-slate-300 mb-1">Klucz główny</label>
                <select
                  id="dbv-new-table-pk"
                  name="new_table_primary_key"
                  className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1"
                  value={newTablePrimaryKey}
                  onChange={(e) => setNewTablePrimaryKey(e.target.value)}
                >
                  <option value="">(brak)</option>
                  {newTableColumns.map((c, idx) => (
                    <option key={`${c.name}-${idx}`} value={c.name}>{c.name || `(kolumna ${idx+1})`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button onClick={() => setShowCreateTableModal(false)} className="text-sm px-2 py-1 rounded bg-gray-200 dark:bg-slate-700">Anuluj</button>
              <button onClick={confirmCreateTable} disabled={createTableLoading} className="text-sm px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">
                {createTableLoading ? 'Tworzenie…' : 'Utwórz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DbViewerScreen;
