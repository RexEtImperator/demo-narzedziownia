import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import BarcodeScanner from './BarcodeScanner';
import { PERMISSIONS, hasPermission } from '../constants';
import { toast } from 'react-toastify';
import { CheckIcon, TrashIcon } from '@heroicons/react/24/solid';
import { CursorArrowRaysIcon, PauseIcon, PlayIcon, QrCodeIcon, StopIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';
import SkeletonList from './SkeletonList';
import InventoryReports from './inventory/InventoryReports';
import { formatDate } from '../utils/dateUtils';

function InventoryScreen({ tools = [], user }) {
  const { t } = useLanguage();
  // Local fetch tools to reduce startup cost (fallback to props if available)
  const [localTools, setLocalTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  // Existing stock filters
  const [search, setSearch] = useState('');
  const [onlyConsumables, setOnlyConsumables] = useState(true);
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [viewMode, setViewMode] = useState('sessions');

  const sourceTools = useMemo(() => (Array.isArray(tools) && tools.length > 0 ? tools : localTools), [tools, localTools]);
  const filtered = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    return (sourceTools || [])
      .filter(t => {
        const isCons = !!t.is_consumable;
        if (onlyConsumables && !isCons) return false;
        const min = t.min_stock;
        const qty = t.quantity || 0;
        const belowMin = typeof min === 'number' && min >= 0 ? qty < min : false;
        if (onlyBelowMin && !belowMin) return false;
        if (!term) return true;
        const name = String(t.name || '').toLowerCase();
        const sku = String(t.sku || '').toLowerCase();
        const inv = String(t.inventory_number || '').toLowerCase();
        return name.includes(term) || sku.includes(term) || inv.includes(term);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [sourceTools, search, onlyConsumables, onlyBelowMin]);

  // Inventory sessions
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Creating a session
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionNotes, setNewSessionNotes] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  // Scanning
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanQty, setScanQty] = useState(1);
  const [scanStatus, setScanStatus] = useState('');
  const [scanError, setScanError] = useState('');
  const [lastScanTool, setLastScanTool] = useState(null);
  const lastScanTimerRef = useRef(null);

  // Scanner for search field
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const [searchScanError, setSearchScanError] = useState('');

  // Differences and exports
  const [differences, setDifferences] = useState([]);
  const [diffsLoading, setDiffsLoading] = useState(false);
  const [diffsError, setDiffsError] = useState('');
  const [diffSearch, setDiffSearch] = useState('');
  const [diffMinAbs, setDiffMinAbs] = useState(0);
  const [csvExporting, setCsvExporting] = useState(false);

  const filteredDiffs = useMemo(() => {
    let rows = differences || [];
    const term = (diffSearch || '').trim().toLowerCase();
    const minAbs = Math.max(0, parseInt(diffMinAbs || 0, 10));
    if (minAbs > 0) {
      rows = rows.filter(r => Math.abs(r.difference || 0) >= minAbs);
    }
    if (term) {
      rows = rows.filter(r => String(r.name || '').toLowerCase().includes(term) || String(r.sku || '').toLowerCase().includes(term));
    }
    return rows;
  }, [differences, diffSearch, diffMinAbs]);

  // Historia korekt
  const [corrections, setCorrections] = useState([]);
  const [corrLoading, setCorrLoading] = useState(false);
  const [corrError, setCorrError] = useState('');
  const [corrShowPendingOnly, setCorrShowPendingOnly] = useState(false);

  // Recently corrected items (to the short label "Corrected")
  const [recentCorrections, setRecentCorrections] = useState([]);

  // Correction modal
  const [corrModalOpen, setCorrModalOpen] = useState(false);
  const [corrToolId, setCorrToolId] = useState(null);
  const [corrToolName, setCorrToolName] = useState('');
  const [corrSku, setCorrSku] = useState('');
  const [corrDifferenceQty, setCorrDifferenceQty] = useState(0);
  const [corrReason, setCorrReason] = useState('');
  const [corrSubmitting, setCorrSubmitting] = useState(false);
  const [corrSystemQty, setCorrSystemQty] = useState(0);
  const [corrCountedQty, setCorrCountedQty] = useState(0);
  
  // Correction deletion confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Option: Do not automatically approve corrections (administrator only)
  const [autoAcceptDisabled, setAutoAcceptDisabled] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      setSessionsError('');
      const data = await api.get('/api/inventory/sessions');
      setSessions(Array.isArray(data) ? data : []);
      if (!selectedSessionId && Array.isArray(data) && data.length > 0) {
        // Try to restore the selected session from localStorage if it exists
        let storedId = null;
        try { storedId = localStorage.getItem('inventorySelectedSessionId'); } catch (_) { void 0; }
        if (storedId && data.some(s => String(s.id) === String(storedId))) {
          const match = data.find(s => String(s.id) === String(storedId));
          setSelectedSessionId(match.id);
        } else {
          // Select the latest active session automatically
          const active = data.find(s => s.status === 'active');
          setSelectedSessionId(active ? active.id : data[0].id);
        }
      }
    } catch (err) {
      setSessionsError(err?.message || t('inventory.sessions.errors.fetchFailed'));
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [selectedSessionId, t]);

  // Pre-restore the selected session from localStorage before we fetch the session list
  useEffect(() => {
    try {
      const sid = localStorage.getItem('inventorySelectedSessionId');
      if (sid) {
        const parsed = Number(sid);
        setSelectedSessionId(Number.isNaN(parsed) ? sid : parsed);
      }
    } catch (_) { void 0; }
  }, []);

  // Reading auto-commit setting from localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem('inventoryAutoAcceptDisabled');
      setAutoAcceptDisabled(v === '1' || v === 'true');
    } catch (_) { void 0; }
  }, []);
  const canViewInventory = hasPermission(user, PERMISSIONS.VIEW_INVENTORY);

  useEffect(() => {
    if (!canViewInventory) {
      setSessions([]);
      setSelectedSessionId(null);
      return;
    }
    fetchSessions();
  }, [canViewInventory, fetchSessions]);

  // Download tools on demand when screen active
  useEffect(() => {
    if (!canViewInventory) return;
    // Only load tools if they didn't come in props
    if (Array.isArray(tools) && tools.length > 0) return;
    let cancelled = false;
    const loadTools = async () => {
      try {
        setToolsLoading(true);
        const data = await api.get('/api/tools?sortBy=inventory_number&sortDir=asc');
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        if (!cancelled) setLocalTools(list);
      } catch (err) {
        toast.error(err?.message || t('inventory.toastr.toolsFetchError'));
        if (!cancelled) setLocalTools([]);
      } finally {
        if (!cancelled) setToolsLoading(false);
      }
    };
    loadTools();
    return () => { cancelled = true; };
  }, [canViewInventory, tools, t]);

  // Remember/Restore selected session in localStorage
  useEffect(() => {
    try {
      if (selectedSessionId) {
        localStorage.setItem('inventorySelectedSessionId', String(selectedSessionId));
      } else {
        localStorage.removeItem('inventorySelectedSessionId');
      }
    } catch (_) { void 0; }
  }, [selectedSessionId]);

  // Save auto-add setting to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('inventoryAutoAcceptDisabled', autoAcceptDisabled ? '1' : '0');
    } catch (_) { void 0; }
  }, [autoAcceptDisabled]);
  // Clear old "freshly corrected" entries every 10s (60s retention)
  useEffect(() => {
    const interval = setInterval(() => {
      setRecentCorrections(prev => prev.filter(rc => Date.now() - rc.at < 60000));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Download differences after changing the selected session
  useEffect(() => {
    const fetchDiffs = async () => {
      if (!canViewInventory) {
        setDifferences([]);
        return;
      }
      if (!selectedSessionId) {
        setDifferences([]);
        return;
      }
      try {
        setDiffsLoading(true);
        setDiffsError('');
        const data = await api.get(`/api/inventory/sessions/${selectedSessionId}/differences?t=${Date.now()}`);
        setDifferences(Array.isArray(data) ? data : []);
      } catch (err) {
        setDiffsError(err?.message || t('inventory.diffs.errors.fetchFailed'));
        setDifferences([]);
      } finally {
        setDiffsLoading(false);
      }
    };

    const fetchHistory = async () => {
      if (!canViewInventory) {
        setCorrections([]);
        return;
      }
      if (!selectedSessionId) {
        setCorrections([]);
        return;
      }
      try {
        setCorrLoading(true);
        setCorrError('');
        const data = await api.get(`/api/inventory/sessions/${selectedSessionId}/history`);
        const corr = Array.isArray(data?.corrections) ? data.corrections : Array.isArray(data) ? data : [];
        setCorrections(corr);
      } catch (err) {
        setCorrError(err?.message || t('inventory.history.errors.fetchFailed'));
        setCorrections([]);
      } finally {
        setCorrLoading(false);
      }
    };

    fetchDiffs();
    fetchHistory();
  }, [selectedSessionId, canViewInventory, t]);

  if (!canViewInventory) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('inventory.permissions.title')}</h3>
          <p className="text-slate-600 dark:text-slate-400">{t('inventory.permissions.viewInventoryDenied')}</p>
        </div>
      </div>
    );
  }

  const openCorrectionModal = (row) => {
    // Determine tool ID from possible fields or match by SKU/name
    let toolId = row?.tool_id ?? row?.toolId ?? row?.id ?? null;
    if (!toolId && row?.sku && Array.isArray(tools)) {
      const matchSku = tools.find(t => String(t.sku || '').toLowerCase() === String(row.sku || '').toLowerCase());
      toolId = matchSku?.id ?? matchSku?.tool_id ?? toolId;
    }
    if (!toolId && row?.name && Array.isArray(tools)) {
      const matchName = tools.find(t => String(t.name || '').toLowerCase() === String(row.name || '').toLowerCase());
      toolId = matchName?.id ?? matchName?.tool_id ?? toolId;
    }

    setCorrToolId(toolId);
    setCorrToolName(row.name || '');
    setCorrSku(row.sku || '');
    setCorrSystemQty(Number(row.system_qty || 0));
    setCorrCountedQty(Number(row.counted_qty || 0));
    setCorrDifferenceQty(Number(row.difference || (Number(row.counted_qty || 0) - Number(row.system_qty || 0)) || 0));
    setCorrReason('');
    setCorrModalOpen(true);

    if (!toolId) {
      toast.error(t('inventory.correction.errors.noToolId'));
    }
  };

  const submitCorrection = async () => {
    if (!selectedSessionId) {
      toast.error(t('inventory.correction.errors.noSession'));
      return;
    }
    if (!corrToolId) {
      toast.error(t('inventory.correction.errors.noToolForCorrection'));
      return;
    }
    try {
      setCorrSubmitting(true);
      const systemQty = Number(corrSystemQty || 0);
      const countedQty = Number(corrCountedQty || 0);
      const difference_qty = countedQty - systemQty;
      // First, update counted_qty for this item in the current session
      await api.put(`/api/inventory/sessions/${selectedSessionId}/counts/${corrToolId}`, { counted_qty: countedQty });
      // Then save the correction difference
      const saved = await api.post(`/api/inventory/sessions/${selectedSessionId}/corrections`, {
        tool_id: corrToolId,
        difference_qty,
        reason: corrReason || ''
      });
      // Automatically accept correction if user has ADMIN permissions and auto-accept is enabled
      const corrId = saved?.id || saved?.correction?.id;
      if (isAdmin && corrId && !autoAcceptDisabled) {
        try {
          await api.post(`/api/inventory/corrections/${corrId}/accept`, {});
        } catch (accErr) {
          toast.error(accErr?.message || t('inventory.correction.errors.acceptFailed'));
        }
      }
      try {
        const diffs = await api.get(`/api/inventory/sessions/${selectedSessionId}/differences?t=${Date.now()}`);
        setDifferences(Array.isArray(diffs) ? diffs : []);
      } catch (_) { void 0; }
      try {
        const hist = await api.get(`/api/inventory/sessions/${selectedSessionId}/history?t=${Date.now()}`);
        const corr = Array.isArray(hist?.corrections) ? hist.corrections : Array.isArray(hist) ? hist : [];
        setCorrections(corr);
      } catch (_) { void 0; }
      if (canAcceptCorrection && !autoAcceptDisabled) {
        setRecentCorrections(prev => [
          { toolId: corrToolId, sku: corrSku, at: Date.now() },
          ...prev
        ].filter(rc => Date.now() - rc.at < 60000));
      }
      const successMsg = (canAcceptCorrection && !autoAcceptDisabled)
        ? t('inventory.correction.success.savedAndAccepted')
        : t('inventory.correction.success.savedPending');
      toast.success(successMsg);
      closeCorrectionModal();
    } catch (err) {
      toast.error(err?.message || t('inventory.correction.errors.addFailed'));
    } finally {
      setCorrSubmitting(false);
    }
  };

  const closeCorrectionModal = () => {
    setCorrModalOpen(false);
    setCorrToolId(null);
    setCorrToolName('');
    setCorrSku('');
    setCorrDifferenceQty(0);
    setCorrReason('');
  };

  const handleCreateSession = async () => {
    if (!hasPermission(user, PERMISSIONS.ADMIN)) {
      toast.error(t('inventory.sessions.errors.onlyAdminCreate'));
      return;
    }
    const name = String(newSessionName || '').trim();
    if (!name) {
      toast.error(t('inventory.sessions.errors.nameRequired'));
      return;
    }
    try {
      setCreatingSession(true);
      const created = await api.post('/api/inventory/sessions', { name, notes: newSessionNotes || '' });
      setNewSessionName('');
      setNewSessionNotes('');
      await fetchSessions();
      setSelectedSessionId(created?.id || null);
    } catch (err) {
      toast.error(err?.message || t('inventory.sessions.errors.createFailed'));
    } finally {
      setCreatingSession(false);
    }
  };

  const handleSessionStatus = async (action) => {
    if (!selectedSessionId) return;
    if (!hasPermission(user, PERMISSIONS.ADMIN)) {
      toast.error(t('inventory.sessions.errors.onlyAdminStatus'));
      return;
    }
    try {
      await api.put(`/api/inventory/sessions/${selectedSessionId}/status`, { action });
      await fetchSessions();
    } catch (err) {
      toast.error(err?.message || t('inventory.sessions.errors.statusFailed'));
    }
  };

  const handleDeleteSession = async (session) => {
    if (!session?.id) return;
    if (!hasPermission(user, PERMISSIONS.ADMIN)) {
      toast.error(t('inventory.sessions.errors.onlyAdminDelete'));
      return;
    }
    if (session.status !== 'ended') {
      toast.error(t('inventory.sessions.errors.onlyEndedDelete'));
      return;
    }
    if (!window.confirm(t('inventory.sessions.delete.confirm', { name: session.name }))) {
      return;
    }
    try {
      // If we are deleting the currently selected session, clear the selection for auto-selection to work
      if (selectedSessionId === session.id) {
        setSelectedSessionId(null);
      }
      await api.delete(`/api/inventory/sessions/${session.id}`);
      await fetchSessions();
      toast.success(t('inventory.sessions.delete.success'));
    } catch (err) {
      toast.error(err?.message || t('inventory.sessions.delete.failed'));
    }
  };

  const handleOpenScanner = () => {
    setScanStatus('');
    setScanError('');
    setScannerOpen(true);
  };

  const handleCloseScanner = () => {
    setScannerOpen(false);
  };

  const handleScan = async (text) => {
    if (!selectedSessionId) {
      setScanError(t('inventory.scan.errors.noSession'));
      return;
    }
    try {
      setScanError('');
      const payload = { code: text, quantity: Math.max(1, parseInt(scanQty || 1, 10)) };
      const resp = await api.post(`/api/inventory/sessions/${selectedSessionId}/scan`, payload);
      setScanStatus(resp?.message || t('inventory.scan.success.counted'));
      setLastScanTool(resp?.tool || null);
      fetchSessions();
      // Clear status after 4s
      if (lastScanTimerRef.current) clearTimeout(lastScanTimerRef.current);
      lastScanTimerRef.current = setTimeout(() => {
        setScanStatus('');
        setLastScanTool(null);
      }, 4000);
    } catch (err) {
      setScanError(err?.message || t('inventory.scan.errors.failed'));
    }
  };

  // Scanner support for search
  const openSearchScanner = () => {
    setSearchScanError('');
    setSearchScannerOpen(true);
  };
  const closeSearchScanner = () => {
    setSearchScannerOpen(false);
  };
  const handleSearchScan = (text) => {
    setSearch(text || '');
    setSearchScannerOpen(false);
  };


  const exportDiffsToCSV = async () => {
    if (!hasPermission(user, PERMISSIONS.INVENTORY_EXPORT_CSV)) {
      toast.error(t('inventory.export.errors.noPermission'));
      return;
    }
    try {
      setCsvExporting(true);
      const session = sessions.find(s => s.id === selectedSessionId);
      const now = new Date().toISOString();
      const header = [
        t('inventory.diffs.headers.name'),
        t('inventory.diffs.headers.sku'),
        t('inventory.diffs.headers.systemQty'),
        t('inventory.diffs.headers.countedQty'),
        t('inventory.diffs.headers.difference'),
        t('inventory.sessions.title'),
        t('inventory.diffs.headers.exportDate'),
        t('inventory.diffs.headers.responsible')
      ];
      const lines = [header.join(';')];
      for (const r of filteredDiffs) {
        const row = [
          (r.name || '').replace(/;/g, ','),
          (r.sku || '').replace(/;/g, ','),
          Number(r.system_qty ?? 0),
          Number(r.counted_qty ?? 0),
          Number(r.difference ?? 0),
          (session?.name || '').replace(/;/g, ','),
          now,
          (user?.full_name || user?.username || '').replace(/;/g, ',')
        ];
        lines.push(row.join(';'));
      }
      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fname = `differences-session-${session?.id || 'none'}-${new Date().toLocaleDateString('pl-PL')}.csv`;
      link.download = fname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (_err) {
      toast.error(t('inventory.export.errors.failed'));
    } finally {
      setCsvExporting(false);
    }
  };

  const isAdmin = hasPermission(user, PERMISSIONS.ADMIN);
  const canExportInventory = hasPermission(user, PERMISSIONS.INVENTORY_EXPORT_CSV);
  const canAcceptCorrection = hasPermission(user, PERMISSIONS.INVENTORY_ACCEPT_CORRECTION) || isAdmin;

  const acceptCorrection = async (corr) => {
    if (!isAdmin) {
      toast.error(t('inventory.toast.onlyAdminApprove'));
      return;
    }
    try {
      await api.post(`/api/inventory/corrections/${corr.id}/accept`, {});
      // Refresh the differences and history after the action
      try {
        const diffs = await api.get(`/api/inventory/sessions/${selectedSessionId}/differences?t=${Date.now()}`);
        setDifferences(Array.isArray(diffs) ? diffs : []);
      } catch (_) { void 0; }
      try {
        const data = await api.get(`/api/inventory/sessions/${selectedSessionId}/history?t=${Date.now()}`);
        const corrList = Array.isArray(data?.corrections) ? data.corrections : Array.isArray(data) ? data : [];
        setCorrections(corrList);
      } catch (_) { void 0; }
      // Add a marker for the newly corrected position
      setRecentCorrections(prev => [
        { toolId: corr.tool_id ?? null, sku: corr.tool_sku ?? null, at: Date.now() },
        ...prev
      ].filter(rc => Date.now() - rc.at < 60000));
      toast.success(t('inventory.toast.approveSuccess'));
    } catch (err) {
      toast.error(err?.message || t('inventory.toast.approveFailed'));
    }
  };

  const openDeleteModal = (corr) => {
    if (!isAdmin) {
      toast.error(t('inventory.toast.onlyAdminDelete'));
      return;
    }
    setDeleteTarget(corr);
    setShowDeleteModal(true);
  };

  const deleteCorrection = async (corr) => {
    if (!isAdmin) {
      toast.error(t('inventory.toast.onlyAdminDelete'));
      return;
    }
    try {
      await api.delete(`/api/inventory/corrections/${corr.id}`);
      // Refresh the differences and history after the action
      try {
        const diffs = await api.get(`/api/inventory/sessions/${selectedSessionId}/differences?t=${Date.now()}`);
        setDifferences(Array.isArray(diffs) ? diffs : []);
      } catch (_) { void 0; }
      try {
        const data = await api.get(`/api/inventory/sessions/${selectedSessionId}/history?t=${Date.now()}`);
        const corrList = Array.isArray(data?.corrections) ? data.corrections : Array.isArray(data) ? data : [];
        setCorrections(corrList);
      } catch (_) { void 0; }
      toast.success(t('inventory.toast.deleteSuccess'));
    } catch (err) {
      toast.error(err?.message || t('inventory.toast.deleteFailed'));
      throw err;
    }
  };

  return (
    <div className="px-6 pb-6 bg-white dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('inventory.title')}</h1>
          <p className="text-slate-600 dark:text-slate-400">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('sessions')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'sessions'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t('inventory.tabs.sessions') || 'Inventory Sessions'}
          </button>
          <button
            onClick={() => setViewMode('reports')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'reports'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t('inventory.tabs.reports') || 'Advanced Reports'}
          </button>
        </div>
      </div>

      {viewMode === 'reports' ? (
        <InventoryReports />
      ) : (
        <>
      {/* Session panel */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('inventory.sessions.title')}</h2>
          {isAdmin && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <label htmlFor="inventory-session-name" className="sr-only">{t('inventory.sessions.newNamePlaceholder')}</label>
              <input
                id="inventory-session-name"
                name="inventorySessionName"
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder={t('inventory.sessions.newNamePlaceholder')}
                className="w-full sm:w-56 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
              />
              <label htmlFor="inventory-session-notes" className="sr-only">{t('inventory.sessions.notesPlaceholder')}</label>
              <input
                id="inventory-session-notes"
                name="inventorySessionNotes"
                type="text"
                value={newSessionNotes}
                onChange={(e) => setNewSessionNotes(e.target.value)}
                placeholder={t('inventory.sessions.notesPlaceholder')}
                className="w-full sm:w-64 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
              />
              <button
                onClick={handleCreateSession}
                disabled={creatingSession}
                className="w-full sm:w-auto px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800"
              >
                {creatingSession ? t('inventory.sessions.creating') : t('inventory.sessions.createBtn')}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {sessionsLoading ? (
            <div className="text-slate-600 dark:text-slate-300">{t('loading.sessions')}</div>
          ) : sessionsError ? (
            <div className="text-red-600 dark:text-red-400">{sessionsError}</div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.sessions.headers.name')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.sessions.headers.status')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.sessions.headers.counted')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.sessions.headers.startedAt')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.sessions.headers.finishedAt')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                {(sessions || []).map(s => (
                  <tr key={s.id} className={selectedSessionId === s.id ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                      {s.name}
                      <div className="sm:hidden mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <div>{t('inventory.sessions.details.status')}: {t(`inventory.sessions.statusValues.${s.status}`)}</div>
                        <div>{t('inventory.sessions.details.counted')}: {s.counted_items ?? 0}</div>
                        <div>{t('inventory.sessions.details.start')}: {s.started_at ? formatDate(s.started_at) : '-'}</div>
                        <div>{t('inventory.sessions.details.end')}: {s.finished_at ? formatDate(s.finished_at) : '-'}</div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{t(`inventory.sessions.statusValues.${s.status}`)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{s.counted_items ?? 0}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{s.started_at ? formatDate(s.started_at) : '-'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{s.finished_at ? formatDate(s.finished_at) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSessionId(s.id)}
                          className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                          title={t('inventory.sessions.select')}
                          aria-label={t('inventory.sessions.select')}
                        >
                          <CursorArrowRaysIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                        {isAdmin && s.status === 'active' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSessionStatus('pause')}
                              className="p-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                              title={t('inventory.sessions.pause')}
                              aria-label={t('inventory.sessions.pause')}
                            >
                              <PauseIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSessionStatus('end')}
                              className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                              title={t('inventory.sessions.end')}
                              aria-label={t('inventory.sessions.end')}
                            >
                              <StopIcon className="h-6 w-6" aria-hidden="true" />
                            </button>
                          </>
                        )}
                        {isAdmin && s.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => handleSessionStatus('resume')}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            title={t('inventory.sessions.resume')}
                            aria-label={t('inventory.sessions.resume')}
                          >
                            <PlayIcon className="h-6 w-6" aria-hidden="true" />
                          </button>
                        )}
                        {isAdmin && s.status === 'ended' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(s)}
                            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            title={t('inventory.sessions.delete.title')}
                            aria-label={t('inventory.sessions.delete.title')}
                          >
                            <TrashIcon className="h-6 w-6" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {sessions && sessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-600 dark:text-slate-400">{t('noData.sessions')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Scanning in the selected session */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700 dark:text-slate-300">{t('inventory.sessions.selected')}: </span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedSessionId ? sessions.find(x => x.id === selectedSessionId)?.name : '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="inventory-scan-qty" className="sr-only">{t('inventory.scan.qtyPlaceholder')}</label>
            <input
              id="inventory-scan-qty"
              name="inventoryScanQty"
              type="number"
              min={1}
              value={scanQty}
              onChange={(e) => setScanQty(e.target.value)}
              className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
              placeholder={t('inventory.scan.qtyPlaceholder')}
            />
            <button
              onClick={handleOpenScanner}
              disabled={!selectedSessionId || sessions.find(s => s.id === selectedSessionId)?.status !== 'active'}
              className="px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 flex items-center gap-2"
            >
              <QrCodeIcon className="h-5 w-5" />
              <span>{t('inventory.scan.open')}</span>
            </button>
          </div>
        </div>
        {scanStatus && (
          <div className="mt-2 text-green-700 dark:text-green-300 text-sm">{scanStatus}</div>
        )}
        {scanError && (
          <div className="mt-2 text-red-700 dark:text-red-300 text-sm">{scanError}</div>
        )}
        {lastScanTool && (
          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">{t('inventory.scan.last')}: {lastScanTool.name} ({t('inventory.labels.sku')}: {lastScanTool.sku})</div>
        )}
      </div>

      {/* Differences in the selected session */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('inventory.diffs.title')}</h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <label htmlFor="inventory-diff-search" className="sr-only">{t('inventory.diffs.filterPlaceholder')}</label>
            <input
              id="inventory-diff-search"
              name="inventoryDiffSearch"
              type="text"
              value={diffSearch}
              onChange={(e) => setDiffSearch(e.target.value)}
              placeholder={t('inventory.diffs.filterPlaceholder')}
              className="w-full sm:w-56 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
            />
            <label htmlFor="inventory-diff-minabs" className="sr-only">{t('inventory.diffs.minAbsPlaceholder')}</label>
            <input
              id="inventory-diff-minabs"
              name="inventoryDiffMinAbs"
              type="number"
              min={0}
              value={diffMinAbs}
              onChange={(e) => setDiffMinAbs(e.target.value)}
              placeholder={t('inventory.diffs.minAbsPlaceholder')}
              className="w-full sm:w-40 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
            />
            {canExportInventory && (
              <button
                onClick={exportDiffsToCSV}
                disabled={csvExporting || filteredDiffs.length === 0}
                className="w-full sm:w-auto px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                {csvExporting ? t('inventory.diffs.exporting') : t('inventory.diffs.exportCsv')}
              </button>
            )}
            {isAdmin && (
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 ml-2">
                <input
                  type="checkbox"
                  checked={autoAcceptDisabled}
                  onChange={(e) => setAutoAcceptDisabled(!!e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span>{t('inventory.diffs.autoAcceptDisabled')}</span>
              </label>
            )}
          </div>
        </div>
        {diffsLoading ? (
          <div className="text-slate-600 dark:text-slate-300">{t('loading.differences')}</div>
        ) : diffsError ? (
          <div className="text-red-600 dark:text-red-400">{diffsError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.diffs.headers.name')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.diffs.headers.sku')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.diffs.headers.systemQty')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.diffs.headers.countedQty')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.diffs.headers.difference')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                {filteredDiffs.map((r) => {
                  const diffVal = Number(r.counted_qty ?? 0) - Number(r.system_qty ?? 0);
                  const recently = recentCorrections.some(rc => ((rc.toolId && rc.toolId === (r.tool_id ?? r.id)) || (rc.sku && rc.sku === r.sku)));
                  return (
                    <tr key={`diff-${r.tool_id ?? r.sku ?? r.name}`}>
                      <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                        {r.name}
                        {recently ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-2 py-0.5 text-xs">{t('inventory.diffs.correctedTag')}</span>
                        ) : null}
                        <div className="mt-1 text-xs text-slate-500 sm:hidden">
                          <div>{t('inventory.labels.sku')}: {r.sku || '-'}</div>
                          <div>{t('inventory.labels.systemQty')}: {Number(r.system_qty ?? 0)}</div>
                          <div>{t('inventory.labels.countedQty')}: {Number(r.counted_qty ?? 0)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{r.sku}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{Number(r.system_qty ?? 0)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{Number(r.counted_qty ?? 0)}</td>
                      <td className={`px-4 py-3 text-sm ${diffVal > 0 ? 'text-green-700 dark:text-green-300' : diffVal < 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}>{diffVal}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          onClick={() => openCorrectionModal(r)}
                          className="w-full sm:w-auto px-3 py-2 text-sm bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800"
                        >
                          {t('inventory.diffs.addCorrection')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredDiffs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-600 dark:text-slate-400">{t('inventory.diffs.empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Correction history */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('inventory.history.title')}</h2>
          <div className="flex items-center gap-2">
            <input
              id="corrPendingOnly"
              type="checkbox"
              checked={corrShowPendingOnly}
              onChange={(e) => setCorrShowPendingOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="corrPendingOnly" className="text-sm text-slate-700 dark:text-slate-300">{t('inventory.history.pendingOnly')}</label>
          </div>
        </div>
        {corrLoading ? (
          <div className="text-slate-600 dark:text-slate-300">{t('loading.history')}</div>
        ) : corrError ? (
          <div className="text-red-600 dark:text-red-400">{corrError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.history.headers.name')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.history.headers.sku')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.history.headers.difference')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.history.headers.reason')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.history.headers.status')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.history.headers.created')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.history.headers.acceptedBy')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.history.headers.acceptedAt')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                {((corrections || []).filter(c => !corrShowPendingOnly || !c.accepted_at)).map(c => (
                  <tr key={`corr-${c.id}`}>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                      {c.tool_name}
                      <div className="mt-1 text-xs text-slate-500 sm:hidden">
                        <div>{t('inventory.history.headers.sku')}: {c.tool_sku || '-'}</div>
                        <div>{t('inventory.history.headers.reason')}: {c.reason || '-'}</div>
                        <div>{t('inventory.history.headers.status')}: {c.accepted_at ? t('inventory.history.status.accepted') : t('inventory.history.status.pending')}</div>
                        <div>{t('inventory.history.headers.created')}: {c.created_at ? formatDate(c.created_at) : '-'}</div>
                        {c.accepted_at ? (
                          <div>{t('inventory.history.headers.acceptedBy')}: {(c.accepted_by_username || c.accepted_by_user_id || '-')} • {formatDate(c.accepted_at)}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{c.tool_sku}</td>
                    <td className={`px-4 py-3 text-sm ${c.difference_qty > 0 ? 'text-green-700 dark:text-green-300' : c.difference_qty < 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}>{c.difference_qty}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{c.reason || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{c.accepted_at ? t('inventory.history.status.accepted') : t('inventory.history.status.pending')}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{c.created_at ? formatDate(c.created_at) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{c.accepted_at ? formatDate(c.accepted_at) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{c.accepted_at ? new Date(c.accepted_at).toLocaleString('pl-PL') : '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {!c.accepted_at && isAdmin ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => acceptCorrection(c)}
                            title={t('inventory.history.accept.title')}
                            aria-label={t('inventory.history.accept.aria')}
                            className="w-10 h-10 sm:w-8 sm:h-8 grid place-items-center rounded-full bg-green-600 text-white hover:bg-green-700"
                          >
                            <CheckIcon className="w-5 h-5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(c)}
                            title={t('inventory.history.delete.title')}
                            aria-label={t('inventory.history.delete.aria')}
                            className="w-10 h-10 sm:w-8 sm:h-8 grid place-items-center rounded-full bg-red-600 text-white hover:bg-red-700"
                          >
                            <TrashIcon className="w-5 h-5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{t('inventory.history.accept.acceptedLabel')}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(!corrections || corrections.length === 0) && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-slate-600 dark:text-slate-400">{t('inventory.history.empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for adding corrections */}
      {corrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('inventory.correction.modal.title')}</h3>
            <div className="space-y-3">
              <div className="text-sm text-slate-700 dark:text-slate-300">{t('inventory.correction.modal.item')}: <span className="font-medium">{corrToolName}</span> <span className="text-slate-500">({corrSku || '-'})</span></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('inventory.correction.modal.systemQty')}</label>
                  <input
                    type="number"
                    value={corrSystemQty}
                    readOnly
                    className="w-full px-3 py-2 border rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('inventory.correction.modal.countedQty')}</label>
                  <input
                    type="number"
                    value={corrCountedQty}
                    onChange={(e) => {
                      const val = Number(e.target.value || 0);
                      setCorrCountedQty(val);
                      setCorrDifferenceQty(val - Number(corrSystemQty || 0));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('inventory.correction.modal.difference')}</label>
                <span className="text-xs text-slate-500 dark:text-slate-400">{t('inventory.correction.modal.calculatedInfo')}</span>
              </div>
              <input
                type="number"
                value={corrDifferenceQty}
                readOnly
                className="w-full px-3 py-2 border rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-slate-100"
              />
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('inventory.correction.modal.reasonLabel')}</label>
              <input
                type="text"
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                placeholder={t('inventory.correction.modal.reasonPlaceholder')}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={closeCorrectionModal} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">{t('common.cancel')}</button>
              <button onClick={submitCorrection} disabled={corrSubmitting} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">{corrSubmitting ? t('inventory.correction.modal.saving') : t('inventory.correction.modal.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Existing stock filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('inventory.stock.title')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="inventory-stock-search" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('inventory.stock.searchLabel')}</label>
            <div className="flex gap-2">
              <input
                id="inventory-stock-search"
                name="inventoryStockSearch"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('inventory.stock.searchPlaceholder')}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={openSearchScanner}
                className="px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2"
                title={t('inventory.stock.searchScanTitle')}
              >
                <QrCodeIcon className="h-5 w-5" />
                <span>{t('inventory.scan.open')}</span>
              </button>
            </div>
            {searchScanError && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{searchScanError}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              id="onlyConsumables"
              type="checkbox"
              checked={onlyConsumables}
              onChange={(e) => setOnlyConsumables(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="onlyConsumables" className="text-sm text-slate-700 dark:text-slate-300">{t('inventory.stock.onlyConsumablesLabel')}</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="onlyBelowMin"
              type="checkbox"
              checked={onlyBelowMin}
              onChange={(e) => setOnlyBelowMin(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="onlyBelowMin" className="text-sm text-slate-700 dark:text-slate-300">{t('inventory.stock.onlyBelowMinLabel')}</label>
          </div>
        </div>
        <div className="overflow-x-auto">

        {/* Consumables table */}
        {toolsLoading && sourceTools.length === 0 ? (
          <SkeletonList rows={8} cols={4} />
        ) : (
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.stock.headers.name')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.stock.headers.sku')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.stock.headers.quantity')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.stock.headers.min')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden sm:table-cell">{t('inventory.stock.headers.max')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 uppercase tracking-wider">{t('inventory.stock.headers.status')}</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {filtered.map((tool) => {
              const min = typeof tool.min_stock === 'number' ? tool.min_stock : null;
              const max = typeof tool.max_stock === 'number' ? tool.max_stock : null;
              const qty = tool.quantity || 0;
              const belowMin = min !== null && min >= 0 ? qty < min : false;
              return (
                <tr key={tool.id} className={belowMin ? 'bg-red-50/60 dark:bg-red-900/20' : ''}>
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                    {tool.name}
                    <div className="mt-1 text-xs text-slate-500 sm:hidden">
                      <div>{t('inventory.stock.headers.sku')}: {tool.sku || '-'}</div>
                      <div>{t('inventory.stock.headers.min')}: {min ?? '-'} | {t('inventory.stock.headers.max')}: {max ?? '-'}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{tool.sku}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{qty}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{min ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hidden sm:table-cell">{max ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {belowMin ? (
                      <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">{t('inventory.stock.status.missing')}</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">{t('inventory.stock.status.ok')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-600 dark:text-slate-400">{t('inventory.stock.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
        )}
        </div>
      </div>

      {/* Scanner modal */}
      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={handleCloseScanner}
        onScan={handleScan}
        onError={(msg) => setScanError(msg)}
        displayQuantity={scanQty}
      />

      {/* Scanner modal for search */}
      <BarcodeScanner
        isOpen={searchScannerOpen}
        onClose={closeSearchScanner}
        onScan={handleSearchScan}
        onError={(msg) => setSearchScanError(msg)}
      />

      {/* Correction deletion confirmation modal */}
      {showDeleteModal && (
        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
          onConfirm={async () => {
            if (!deleteTarget) return;
            try {
              setDeleteLoading(true);
              await deleteCorrection(deleteTarget);
              setShowDeleteModal(false);
              setDeleteTarget(null);
            } catch (_) {
              // Error reported by deleteCorrection
            } finally {
              setDeleteLoading(false);
            }
          }}
          title={t('inventory.modalDelete.title')}
          message={t('inventory.modalDelete.message')}
          confirmText={t('inventory.modalDelete.confirm')}
          cancelText={t('common.cancel')}
          type="danger"
          loading={deleteLoading}
        />
      )}
      </>
      )}
    </div>
  );
}

export default InventoryScreen;
