import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  Bars3Icon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  UserIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';
import api from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppConfig } from '../hooks/useAppConfig';
import ToolsIssueModal from './tools/ToolsIssueModal';
import BhpIssueModal from './bhp/BhpIssueModal';
import ConfirmationModal from './ConfirmationModal';
import { formatDate } from '../utils/dateUtils';

const KioskScreen = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: appConfig, isLoading: isConfigLoading } = useAppConfig(true);
  const kioskEnabled = appConfig?.enableKiosk === false ? false : true;
  const [searchTerm, setSearchTerm] = useState('');
  const [layout, setLayout] = useState(() => {
    try {
      const v = localStorage.getItem('kioskLayout');
      return v === 'list' ? 'list' : 'grid';
    } catch (_) {
      return 'grid';
    }
  });
  const [searchResults, setSearchResults] = useState([]);
  const [issuedItems, setIssuedItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingIssued, setLoadingIssued] = useState(false);

  // Modal states
  const [issueModal, setIssueModal] = useState({ isOpen: false });
  const [subIssueModal, setSubIssueModal] = useState({ isOpen: false });
  const [confirmReturnModal, setConfirmReturnModal] = useState({ isOpen: false });
  const [returningId, setReturningId] = useState(null);

  const [expandedResults, setExpandedResults] = useState({});
  const [subitemsByTool, setSubitemsByTool] = useState({});

  useEffect(() => {
    if (isConfigLoading) return;
    if (!kioskEnabled) {
      toast.error(t('kiosk.disabled') || 'Kiosk jest wyłączony');
      navigate('/dashboard', { replace: true });
    }
  }, [isConfigLoading, kioskEnabled, navigate, t]);

  useEffect(() => {
    try {
      localStorage.setItem('kioskLayout', layout);
    } catch (_) { void 0; }
  }, [layout]);

  const toArray = (res) => {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.items)) return res.items;
    if (Array.isArray(res?.rows)) return res.rows;
    return [];
  };

  const getToolSubitemsKind = (category) => {
    const cat = String(category || '').trim().toLowerCase();
    if (cat === 'zawiesia pasowe' || cat === 'zawiesia łańcuchowe') return 'slings';
    if (cat === 'nasadki 1"' || cat === 'nasadki 1/2"') return 'sockets';
    return null;
  };

  const fetchSubitems = useCallback(async (toolId, kind) => {
    if (!toolId || !kind) return;
    setSubitemsByTool(prev => ({
      ...prev,
      [toolId]: {
        ...(prev[toolId] || {}),
        kind,
        loading: true,
        error: null
      }
    }));
    try {
      const endpoint = kind === 'slings'
        ? `/api/slings/by-tool/${toolId}`
        : `/api/impact-sockets/by-tool/${toolId}`;
      const res = await api.get(endpoint);
      const items = toArray(res);
      setSubitemsByTool(prev => ({
        ...prev,
        [toolId]: { kind, loading: false, items }
      }));
    } catch (e) {
      setSubitemsByTool(prev => ({
        ...prev,
        [toolId]: { kind, loading: false, items: [], error: e?.message || t('kiosk.subitems.fetchError') }
      }));
    }
  }, [t]);

  // Fetch employees on mount
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await api.get('/api/employees', {
          params: { limit: 500, page: 1 },
        });
        const list = toArray(response);
        setEmployees(list.length ? list : (response?.employees || []));
      } catch (err) {
        console.error('Error fetching employees:', err);
      }
    };

    fetchEmployees();
  }, []);

  // Fetch issued items (tools + BHP)
  const fetchIssuedItems = useCallback(async () => {
    setLoadingIssued(true);
    try {
      const [toolIssuesRes, bhpIssuesRes, slingsIssuedRes, socketsIssuedRes] = await Promise.all([
        api.get('/api/tool-issues', {
          params: { status: 'issued,permanent,partially_issued', limit: 100, page: 1 },
        }),
        api.get('/api/bhp-issues', {
          params: { status: 'issued,permanent', limit: 100, page: 1 },
        }),
        api.get('/api/slings/issued', {
          params: { limit: 200 },
        }).catch(() => []),
        api.get('/api/impact-sockets/issued', {
          params: { limit: 200 },
        }).catch(() => []),
      ]);

      const toolIssues = toArray(toolIssuesRes).map(item => ({
        id: `tool-${item.id}`,
        type: 'tool',
        name: item.tool_name || t('kiosk.fallbacks.unknownTool'),
        code: item.tool_sku || item.tool_inventory_number || '',
        employeeName: `${item.employee_first_name || ''} ${item.employee_last_name || ''}`.trim(),
        employeeBrandNumber: item.employee_brand_number,
        issuedAt: item.issued_at,
        isPermanent: (item.tool_status || item.status) === 'permanent',
        status: (item.tool_status || item.status) === 'partially_issued' ? 'partially_issued' : (item.tool_status || item.status),
        issueId: item.id,
        toolOrBhpId: item.tool_id,
      }));

      const bhpIssues = toArray(bhpIssuesRes).map(item => ({
        id: `bhp-${item.id}`,
        type: 'bhp',
        name: item.bhp_model || item.bhp_catalog_number || t('kiosk.fallbacks.unknownBhp'),
        code: item.bhp_inventory_number || '',
        employeeName: `${item.employee_first_name || ''} ${item.employee_last_name || ''}`.trim(),
        employeeBrandNumber: item.employee_brand_number,
        issuedAt: item.issued_at,
        isPermanent: item.status === 'permanent',
        status: item.status,
        issueId: item.id,
        toolOrBhpId: item.bhp_id,
        inspectionDate: item.bhp_inspection_date,
      }));

      const slingsIssued = toArray(slingsIssuedRes).map(row => ({
        id: `sling-${row.item_id ?? row.id}`,
        type: 'sling',
        name: row.tool_name || row.toolName || t('kiosk.fallbacks.sling'),
        code: row.sku || '',
        employeeName: `${row.employee_first_name || row.employeeFirstName || ''} ${row.employee_last_name || row.employeeLastName || ''}`.trim(),
        employeeBrandNumber: row.employee_brand_number ?? row.employeeBrandNumber,
        issuedAt: row.issued_at || row.issuedAt,
        isPermanent: false,
        status: 'issued',
        itemId: row.item_id ?? row.id,
        toolId: row.tool_id ?? row.toolId,
        inspectionDate: row.tool_inspection_date || row.toolInspectionDate,
        kind: row.kind,
        serialNumber: row.serial_number || row.serialNumber
      }));

      const socketsIssued = toArray(socketsIssuedRes).map(row => ({
        id: `socket-${row.variant || 'x'}-${row.item_id}-${row.employee_id}`,
        type: 'socket',
        name: row.tool_name || row.toolName || t('kiosk.fallbacks.sockets'),
        code: row.sku || '',
        employeeName: `${row.employee_first_name || row.employeeFirstName || ''} ${row.employee_last_name || row.employeeLastName || ''}`.trim(),
        employeeBrandNumber: row.employee_brand_number ?? row.employeeBrandNumber,
        issuedAt: row.issued_at || row.issuedAt,
        isPermanent: false,
        status: 'issued',
        itemId: row.item_id,
        toolId: row.tool_id,
        employeeId: row.employee_id,
        quantity: Number(row.quantity || 0) || 1,
        inspectionDate: row.tool_inspection_date || row.toolInspectionDate,
        kind: row.kind,
        size: row.size
      }));

      // Combine and sort by issuedAt (newest first)
      const combined = [...toolIssues, ...bhpIssues, ...slingsIssued, ...socketsIssued].sort(
        (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
      );

      setIssuedItems(combined);
    } catch (err) {
      console.error('Error fetching issued items:', err);
      toast.error(t('kiosk.toasts.loadIssuedError'));
    } finally {
      setLoadingIssued(false);
    }
  }, [t]);

  useEffect(() => {
    fetchIssuedItems();
    const interval = setInterval(fetchIssuedItems, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchIssuedItems]);

  const performSearch = useCallback(async (term) => {
    const q = String(term || '').trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const [toolRes, bhpRes] = await Promise.all([
        api.get('/api/tools/search', { params: { code: q } }).catch(() => []),
        api.get('/api/bhp', { params: { search: q, limit: 10 } }).catch(() => []),
      ]);

      const toolResults = toArray(toolRes).map(tool => ({
        type: 'tool',
        id: tool.id,
        name: tool.name,
        category: tool.category,
        sku: tool.sku,
        inventory_number: tool.inventory_number,
        inspectionDate: tool.inspection_date,
        available_quantity: tool.available_quantity ?? tool.availableQuantity ?? tool.quantity ?? 1,
        quantity: tool.quantity ?? 1
      }));

      const bhpResults = toArray(bhpRes).map(bhp => ({
        type: 'bhp',
        id: bhp.id,
        name: bhp.model || bhp.catalog_number || bhp.name || 'BHP',
        inventory_number: bhp.inventory_number,
        inspectionDate: bhp.inspection_date,
      }));

      const allResults = [...toolResults, ...bhpResults];

      if (allResults.length === 0) {
        setSearchResults([]);
        setExpandedResults({});
        return;
      }

      setSearchResults(allResults);
      setExpandedResults({});
    } catch (err) {
      console.error('Search error:', err);
      toast.error(t('kiosk.toasts.searchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const q = String(searchTerm || '').trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      performSearch(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, performSearch]);

  const handleSearch = async (e) => {
    e.preventDefault();
    await performSearch(searchTerm);
  };

  const handleIssueConfirm = async (toolOrBhpId, employeeId, isPermanent, quantity = 1) => {
    if (isOverdue(issueModal?.item)) {
      toast.error(t('kiosk.toasts.overdueIssueBlocked'));
      return;
    }
    try {
      const type = issueModal.type;
      const endpoint = type === 'tool' ? '/api/tools' : '/api/bhp';

      if (type === 'tool') {
        await api.post(`${endpoint}/${toolOrBhpId}/issue`, {
          employee_id: employeeId,
          quantity: Number(quantity) || 1,
          status: isPermanent ? 'permanent' : 'issued',
          is_permanent: !!isPermanent
        });
      } else {
        await api.post(`${endpoint}/${toolOrBhpId}/issue`, {
          employee_id: employeeId,
          status: isPermanent ? 'permanent' : 'issued',
          is_permanent: !!isPermanent
        });
      }

      toast.success(t('kiosk.toasts.issueSuccess'));
      setIssueModal({ isOpen: false });
      setSearchResults(prev => prev.map(r => {
        if (r.type !== 'tool') return r;
        if (String(r.id) !== String(toolOrBhpId)) return r;
        const cur = Number(r.available_quantity ?? 1);
        const next = Math.max(0, cur - (Number(quantity) || 1));
        return { ...r, available_quantity: next };
      }).filter(r => r.type !== 'tool' || Number(r.available_quantity ?? 1) > 0));
      await fetchIssuedItems();
    } catch (err) {
      const errorMsg = err.response?.data?.message || t('kiosk.toasts.issueError');
      toast.error(errorMsg);
      console.error('Issue error:', err);
    }
  };

  const handleSubitemIssueConfirm = async (modalState, employeeId, quantity = 1) => {
    const toolId = modalState?.toolId;
    const kind = modalState?.kind;
    const item = modalState?.item;
    if (!toolId || !kind || !item?.id) return;
    if (modalState?.parentOverdue || isOverdue(item)) {
      toast.error(t('kiosk.toasts.overdueIssueBlocked'));
      return;
    }
    try {
      if (kind === 'slings') {
        await api.post('/api/slings/issue', { item_ids: [item.id], employee_id: employeeId });
      } else {
        await api.post('/api/impact-sockets/issue', {
          tool_id: toolId,
          employee_id: employeeId,
          items: [{ item_id: item.id, quantity: Math.max(1, parseInt(quantity || 1, 10)) }]
        });
      }
      toast.success(t('kiosk.toasts.subitemIssueSuccess'));
      setSubIssueModal({ isOpen: false });
      await fetchIssuedItems();
      await fetchSubitems(toolId, kind);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || t('kiosk.toasts.subitemIssueError');
      toast.error(errorMsg);
    }
  };

  const SubItemIssueModal = ({ state, onClose }) => {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [qty, setQty] = useState(1);

    const availableQty = (() => {
      if (state?.kind !== 'sockets') return 1;
      const v = Number(state?.item?.available_quantity ?? state?.item?.quantity ?? 1);
      return Number.isFinite(v) ? Math.max(0, v) : 1;
    })();

    const filteredEmployees = (employees || [])
      .filter(emp => emp && emp.status !== 'Zawieszony')
      .filter(emp => {
        const search = String(employeeSearch || '').toLowerCase();
        if (!search) return true;
        const full = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
        const brand = (emp.brand_number != null ? String(emp.brand_number) : '').toLowerCase();
        const formatted = `${emp.first_name || ''} ${emp.last_name || ''}${emp.brand_number ? ` [${emp.brand_number}]` : ''}`.toLowerCase();
        return full.includes(search) || brand.includes(search) || formatted.includes(search);
      })
      .sort((a, b) => {
        const bnA = a.brand_number ? String(a.brand_number) : '';
        const bnB = b.brand_number ? String(b.brand_number) : '';
        const brandCompare = bnA.localeCompare(bnB, undefined, { numeric: true });
        if (brandCompare !== 0) return brandCompare;
        return (a.last_name || '').localeCompare(b.last_name || '');
      });

    if (!state?.isOpen) return null;

    const title = state.kind === 'slings' ? t('kiosk.subitemModal.titleSlings') : t('kiosk.subitemModal.titleSockets');
    const code = state.kind === 'slings'
      ? (state.item?.sku || '')
      : (state.item?.sku || '');

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg md:max-w-xl">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{state.parentName}{code ? ` (${code})` : ''}</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('common.employee')}</label>
              <input
                type="text"
                id="kiosk-subitem-employee"
                name="kioskSubitemEmployee"
                autoComplete="off"
                placeholder={t('kiosk.subitemModal.employeePlaceholder')}
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setSelectedEmployeeId('');
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {showDropdown && (
                <ul className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg">
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map(emp => (
                      <li
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployeeId(emp.id);
                          setEmployeeSearch(`${emp.brand_number ? `[${emp.brand_number}] ` : ''}${emp.first_name || ''} ${emp.last_name || ''}`.trim());
                          setShowDropdown(false);
                        }}
                        className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-slate-700 dark:text-slate-200"
                      >
                        {emp.brand_number && <span className="text-slate-800 dark:text-slate-400">[{emp.brand_number}]</span>} {emp.first_name} {emp.last_name}
                      </li>
                    ))
                  ) : (
                    <li className="px-4 py-2 text-slate-500 dark:text-slate-400">{t('kiosk.subitemModal.noResults')}</li>
                  )}
                </ul>
              )}
            </div>

            {state.kind === 'sockets' && availableQty > 1 && (
              <div>
                <label htmlFor="kiosk-subitem-qty" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('kiosk.subitemModal.quantity')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="kiosk-subitem-qty"
                    name="kioskSubitemQty"
                    type="number"
                    min={1}
                    max={availableQty}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-28 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {t('kiosk.subitemModal.available', { count: availableQty })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">{t('common.cancel')}</button>
              <button
                onClick={() => {
                  if (!selectedEmployeeId) {
                    toast.error(t('kiosk.toasts.selectEmployee'));
                    return;
                  }
                  handleSubitemIssueConfirm(state, selectedEmployeeId, qty);
                }}
                className="flex-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 hover:brightness-105 dark:hover:bg-emerald-800 transition-all duration-150 active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800"
              >
                {t('common.issue')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleReturnConfirm = async () => {
    const item = confirmReturnModal.item;
    if (!item) return;

    setReturningId(item.id);
    try {
      if (item.type === 'tool' || item.type === 'bhp') {
        const endpoint = item.type === 'tool' ? '/api/tools' : '/api/bhp';
        await api.post(`${endpoint}/${item.toolOrBhpId}/return`, {
          issue_id: item.issueId,
        });
      } else if (item.type === 'sling') {
        await api.post('/api/slings/return', { item_ids: [item.itemId] });
      } else if (item.type === 'socket') {
        await api.post('/api/impact-sockets/return', {
          tool_id: item.toolId,
          employee_id: item.employeeId,
          items: [{ item_id: item.itemId, quantity: Math.max(1, parseInt(item.quantity || 1, 10)) }]
        });
      }

      toast.success(t('kiosk.toasts.returnSuccess'));
      setConfirmReturnModal({ isOpen: false });
      await fetchIssuedItems();
    } catch (err) {
      const errorMsg = err.response?.data?.message || t('kiosk.toasts.returnError');
      toast.error(errorMsg);
      console.error('Return error:', err);
    } finally {
      setReturningId(null);
    }
  };

  // Check if item is overdue (inspection_date < today for BHP)
  const isOverdue = (item) => {
    const raw = item?.inspectionDate ?? item?.inspection_date ?? item?.bhp_inspection_date;
    if (!raw) return false;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(d);
    check.setHours(0, 0, 0, 0);
    return check < today;
  };

  // Calculate stats
  const activeCount = issuedItems.filter(item => !isOverdue(item)).length;
  const overdueCount = issuedItems.filter(item => isOverdue(item)).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title={t('kiosk.back')}
              >
                <ArrowLeftIcon className="w-6 h-6 text-slate-900 dark:text-slate-100" />
              </button>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{t('kiosk.title')}</h1>

              <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
                <div className="relative flex-1 min-w-[260px] md:w-[420px] md:flex-none">
                <MagnifyingGlassIcon className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  id="kiosk-search"
                  name="kioskSearch"
                  autoComplete="off"
                  placeholder={t('kiosk.search.placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {loading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <MagnifyingGlassIcon className="w-5 h-5" />}
                  {t('kiosk.search.button')}
                </button>
              </form>
            </div>

            <div className="flex justify-end">
              <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1">
                <button
                  type="button"
                  onClick={() => setLayout('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    layout === 'grid'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
                  }`}
                  title={t('kiosk.layout.grid')}
                  aria-label={t('kiosk.layout.grid')}
                >
                  <Squares2X2Icon className="w-5 h-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('list')}
                  className={`p-2 rounded-md transition-colors ${
                    layout === 'list'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
                  }`}
                  title={t('kiosk.layout.list')}
                  aria-label={t('kiosk.layout.list')}
                >
                  <Bars3Icon className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="mb-6 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('kiosk.search.results', { count: searchResults.length })}
                </div>
                <button
                  type="button"
                  onClick={() => setSearchResults([])}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {t('kiosk.search.clear')}
                </button>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {searchResults.map((r) => {
                  const key = `${r.type}-${r.id}`;
                  const code = r.type === 'tool'
                    ? (r.sku || r.inventory_number || '')
                    : (r.inventory_number || '');
                  const qty = r.type === 'tool' ? Number(r.available_quantity ?? r.quantity ?? 1) : 1;
                  const subKind = r.type === 'tool' ? getToolSubitemsKind(r.category) : null;
                  const isExpanded = !!expandedResults[key];
                  const subState = r.type === 'tool' ? subitemsByTool[r.id] : null;
                  const isResultOverdue = isOverdue(r);
                  const canIssue = !isResultOverdue && !subKind && (r.type !== 'tool' || qty > 0);
                  return (
                    <div key={key}>
                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {r.name}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          {r.type === 'tool' ? t('kiosk.itemType.tool') : t('kiosk.itemType.bhp')}{code ? ` • ${code}` : ''}
                          {r.type === 'tool' && r.category ? ` • ${r.category}` : ''}
                          {!subKind && r.type === 'tool' && Number.isFinite(qty) && qty > 1 ? ` • ${t('kiosk.search.quantity', { count: qty })}` : ''}
                          {isResultOverdue ? ` • ${t('kiosk.overdueBadge')}` : ''}
                        </div>
                      </div>
                        {subKind ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setExpandedResults(prev => ({ ...prev, [key]: !prev[key] }));
                              const nextOpen = !isExpanded;
                              if (nextOpen) {
                                const existing = subitemsByTool[r.id];
                                if (!existing || (!existing.loading && !Array.isArray(existing.items))) {
                                  await fetchSubitems(r.id, subKind);
                                }
                              }
                            }}
                            className="shrink-0 px-3 py-2 rounded-lg font-semibold transition-colors text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center gap-2"
                          >
                            {isExpanded ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
                            {t('kiosk.subitems.button')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canIssue}
                            onClick={() => setIssueModal({ isOpen: true, type: r.type, item: r })}
                            className="shrink-0 px-4 py-2 rounded-lg font-semibold text-white bg-emerald-600 hover:bg-emerald-700 hover:brightness-105 dark:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800"
                          >
                            {t('common.issue')}
                          </button>
                        )}
                      </div>

                      {subKind && isExpanded && (
                        <div className="px-4 pb-4">
                          {subState?.loading ? (
                            <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                              <ArrowPathIcon className="w-4 h-4 animate-spin" />
                              {t('kiosk.subitems.loading')}
                            </div>
                          ) : subState?.error ? (
                            <div className="text-sm text-red-600 dark:text-red-400">
                              {subState.error}
                            </div>
                          ) : (
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900/20">
                              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                {(Array.isArray(subState?.items) ? subState.items : []).map((it) => {
                                  const isSlings = subKind === 'slings';
                                  const parentOverdue = isResultOverdue;
                                  const available = isSlings ? (it.status === 'available') : (Number(it.available_quantity ?? (Number(it.quantity || 0) - Number(it.issued_quantity || 0))) > 0);
                                  const isSubOverdue = parentOverdue || isOverdue(it);
                                  const canIssueSub = available && !isSubOverdue;
                                  const secondary = isSlings
                                    ? [it.kind, it.serial_number ? `SN: ${it.serial_number}` : null].filter(Boolean).join(' • ')
                                    : [it.kind, it.size, t('kiosk.subitems.available', { count: Number(it.available_quantity ?? (Number(it.quantity || 0) - Number(it.issued_quantity || 0))) })].filter(Boolean).join(' • ');

                                  return (
                                    <div key={`${subKind}-${it.id}`} className="px-3 py-2 flex items-center justify-between gap-3 bg-white dark:bg-slate-800">
                                      <div className="min-w-0">
                                        <div className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate">
                                          {it.sku || '-'}
                                        </div>
                                        <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                          {secondary}{isSubOverdue ? ` • ${t('kiosk.overdueBadge')}` : ''}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={!canIssueSub}
                                        onClick={() => setSubIssueModal({ isOpen: true, kind: subKind, toolId: r.id, item: it, parentName: r.name, parentOverdue })}
                                        className="shrink-0 px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 hover:brightness-105 dark:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800"
                                      >
                                        {t('common.issue')}
                                      </button>
                                    </div>
                                  );
                                })}
                                {Array.isArray(subState?.items) && subState.items.length === 0 && (
                                  <div className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800">
                                    {t('kiosk.subitems.empty')}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="flex gap-6 text-sm font-semibold">
            <div className="text-emerald-600 dark:text-emerald-400">
              {t('kiosk.stats.active')}: <span className="text-lg">{activeCount}</span>
            </div>
            {overdueCount > 0 && (
              <div className="text-red-600 dark:text-red-400">
                {t('kiosk.stats.overdue')}: <span className="text-lg">{overdueCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loadingIssued && (
          <div className="text-center py-12">
            <ArrowPathIcon className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-2" />
            <p className="text-slate-500 dark:text-slate-400">{t('kiosk.issued.loading')}</p>
          </div>
        )}

        {/* Empty state */}
        {!loadingIssued && issuedItems.length === 0 && (
          <div className="text-center py-12">
            <WrenchScrewdriverIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 text-lg">{t('kiosk.issued.empty')}</p>
          </div>
        )}

        {/* Grid of issued items */}
        {!loadingIssued && issuedItems.length > 0 && (
          <div className={layout === 'list' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
            {issuedItems.map((item) => {
              const overdue = isOverdue(item);
              
              let tileClasses = 'bg-white dark:bg-slate-800 border-2 shadow-md hover:shadow-lg ';
              if (overdue) {
                tileClasses = 'bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 hover:border-red-500 dark:hover:border-red-500 hover:ring-2 hover:ring-red-200 dark:hover:ring-red-900/40 shadow-md hover:shadow-lg';
              } else if (item.status === 'permanent') {
                tileClasses += 'border-blue-400 dark:border-blue-600 hover:border-blue-500 dark:hover:border-blue-500 hover:ring-2 hover:ring-blue-200 dark:hover:ring-blue-900/40';
              } else if (item.status === 'partially_issued') {
                tileClasses += 'border-lime-400 dark:border-lime-600 hover:border-lime-500 dark:hover:border-lime-500 hover:ring-2 hover:ring-lime-200 dark:hover:ring-lime-900/40';
              } else {
                tileClasses += 'border-amber-400 dark:border-amber-600 hover:border-amber-500 dark:hover:border-amber-500 hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-900/40';
              }

              return (
                <div
                  key={item.id}
                  className={`rounded-lg p-5 transition-all duration-200 ease-out transform-gpu hover:-translate-y-0.5 ${tileClasses}`}
                >
                  <div className={`${overdue ? 'bg-red-50/70 dark:bg-red-900/30' : 'bg-slate-50 dark:bg-slate-700/30'} rounded-md px-3 py-2 mb-2 border border-slate-100 dark:border-slate-700/50`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                          {item.name}
                        </h3>
                        <h2 className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          {item.code && <span className="text-emerald-600 dark:text-emerald-400 ml-1 whitespace-nowrap">({item.code})</span>}
                        </h2>
                        {item.type === 'socket' && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {[item.kind, item.size, item.quantity ? `ilość: ${item.quantity}` : null].filter(Boolean).join(' • ')}
                          </div>
                        )}
                        {item.type === 'sling' && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {[item.kind, item.serialNumber ? `SN: ${item.serialNumber}` : null].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`p-2 rounded-lg ${
                          overdue ? 'bg-red-100 dark:bg-red-900/40' : 
                          item.status === 'permanent' ? 'bg-blue-100 dark:bg-blue-900/40' : 
                          item.status === 'partially_issued' ? 'bg-lime-100 dark:bg-lime-900/40' : 
                          'bg-amber-100 dark:bg-amber-900/40'
                        }`}>
                          {item.type === 'tool' || item.type === 'sling' || item.type === 'socket' ? (
                            <WrenchScrewdriverIcon className={`w-6 h-6 ${
                              overdue ? 'text-red-600' : 
                              item.status === 'permanent' ? 'text-blue-600' : 
                              item.status === 'partially_issued' ? 'text-lime-600' : 
                              'text-amber-600'
                            }`} />
                          ) : item.type === 'bhp' ? (
                            <ShieldCheckIcon className={`w-6 h-6 ${
                              overdue ? 'text-red-600' : 
                              item.status === 'permanent' ? 'text-blue-600' : 
                              item.status === 'partially_issued' ? 'text-lime-600' : 
                              'text-amber-600'
                            }`} />
                          ) : (
                            <div className={`w-6 h-6 flex items-center justify-center text-sm font-bold ${
                              overdue ? 'text-red-600' : 
                              item.status === 'permanent' ? 'text-blue-600' : 
                              item.status === 'partially_issued' ? 'text-lime-600' : 
                              'text-amber-600'
                            }`}>
                              <NoSymbolIcon className={`w-6 h-6 ${
                                overdue ? 'text-red-600' : 
                                item.status === 'permanent' ? 'text-blue-600' : 
                                item.status === 'partially_issued' ? 'text-lime-600' : 
                                'text-amber-600'
                              }`} />
                            </div>
                          )}
                        </div>
                        {overdue && (
                          <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
                        )}
                        {item.isPermanent && (
                          <LockClosedIcon className="w-6 h-6 text-slate-400 dark:text-slate-500 shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-slate-200 dark:bg-slate-700 mb-3"></div>

                  {/* Employee info */}
                  <div className="mb-3 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      <button
                        type="button"
                        onClick={() => {
                          const q = String(item.employeeName || '').trim();
                          if (!q) return;
                          navigate(`/employees?q=${encodeURIComponent(q)}`);
                        }}
                        className="text-left text-slate-700 dark:text-slate-200 font-medium hover:underline"
                        title={t('employees.searchPlaceholder') || 'Szukaj pracownika'}
                      >
                        [{item.employeeBrandNumber}] {item.employeeName}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDaysIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      <span className="text-slate-600 dark:text-slate-300">
                        {formatDate(item.issuedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Return button */}
                  <button
                    onClick={() => setConfirmReturnModal({ isOpen: true, item })}
                    disabled={returningId === item.id}
                    className={`w-full py-2 rounded-lg font-semibold transition-colors text-white ${
                      overdue
                        ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                        : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800'
                    } disabled:opacity-50`}
                  >
                    {returningId === item.id ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 inline-block animate-spin mr-2" />
                        {t('kiosk.return.processing')}
                      </>
                    ) : overdue ? (
                      t('kiosk.return.immediate')
                    ) : (
                      t('kiosk.return.button')
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-lg bg-slate-900/70 dark:bg-slate-950/40 border border-slate-800/60 dark:border-slate-700/60 px-4 py-3 text-sm text-slate-200">
          <span className="font-semibold text-amber-400">{t('kiosk.hint.label')}</span>{' '}
          <span className="text-slate-200">{t('kiosk.hint.text')}</span>
        </div>
      </div>

      {/* Modals */}
      {issueModal.isOpen && issueModal.type === 'tool' && (
        <ToolsIssueModal
          isOpen={issueModal.isOpen}
          onClose={() => setIssueModal({ isOpen: false })}
          tool={issueModal.item}
          employees={employees}
          onConfirm={handleIssueConfirm}
          showQuantity={Number(issueModal?.item?.available_quantity ?? issueModal?.item?.quantity ?? 1) > 1}
        />
      )}

      {issueModal.isOpen && issueModal.type === 'bhp' && (
        <BhpIssueModal
          isOpen={issueModal.isOpen}
          onClose={() => setIssueModal({ isOpen: false })}
          bhp={issueModal.item}
          employees={employees}
          onConfirm={handleIssueConfirm}
        />
      )}

      <SubItemIssueModal
        key={`${subIssueModal?.kind || 'x'}-${subIssueModal?.toolId || 'x'}-${subIssueModal?.item?.id || 'x'}-${subIssueModal?.isOpen ? '1' : '0'}`}
        state={subIssueModal}
        onClose={() => setSubIssueModal({ isOpen: false })}
      />

      <ConfirmationModal
        isOpen={confirmReturnModal.isOpen}
        onClose={() => setConfirmReturnModal({ isOpen: false })}
        onConfirm={handleReturnConfirm}
        title={t('kiosk.return.confirmTitle')}
        message={t('kiosk.return.confirmMessage', { name: confirmReturnModal.item?.name || '' })}
        confirmText={t('common.return')}
        cancelText={t('common.cancel')}
        type={isOverdue(confirmReturnModal.item || {}) ? 'danger' : 'warning'}
      />
    </div>
  );
};

export default KioskScreen;
