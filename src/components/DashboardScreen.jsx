import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UsersIcon, UserIcon, WrenchScrewdriverIcon, PlusIcon, ArrowUturnRightIcon, BoltIcon, ClockIcon, UserCircleIcon, Bars3Icon, InboxIcon, QrCodeIcon, ArrowUturnLeftIcon, XMarkIcon, ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import api from '../api';
import { PERMISSIONS, hasPermission } from '../constants';
import BarcodeScanner from './BarcodeScanner';
import { toast } from 'react-toastify';
import { useLanguage } from '../contexts/LanguageContext';
import EmployeeModal from './employees/EmployeeModal';
import OnboardingTour from './OnboardingTour';
import { formatDate, formatDateOnly } from '../utils/dateUtils';

// Hooks
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useEmployees } from '../hooks/useEmployees';
import { useDepartments } from '../hooks/useDepartments';
import { usePositions } from '../hooks/usePositions';
import { useIssuedTools } from '../hooks/useIssuedTools';

const DashboardScreen = ({ user }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Data Hooks
  const { stats, pagination, filters, isLoading: statsLoading } = useDashboardStats(user);
  const { data: employees = [] } = useEmployees();

  const sortedEmployees = React.useMemo(() => {
    return [...employees].sort((a, b) => {
      const brandA = a.brand_number ? String(a.brand_number) : '';
      const brandB = b.brand_number ? String(b.brand_number) : '';
      return brandA.localeCompare(brandB, undefined, { numeric: true });
    });
  }, [employees]);
  const { data: departments = [] } = useDepartments();
  const { data: positions = [] } = usePositions();

  const isEmployee = user?.role === 'employee';

  // Helper functions for grouping history by date
  const getGroupLabel = (dateString) => {
    if (!dateString) return t('common.time.unknownDate') || 'Nieznana data';
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = today - itemDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return t('common.time.today') || 'Dzisiaj';
    if (diffDays === 1) return t('common.time.yesterday') || 'Wczoraj';
    if (diffDays > 1 && diffDays < 7) return `${diffDays} ${t('common.time.daysAgo') || 'dni temu'}`;
    if (diffDays >= 7 && diffDays < 14) return t('common.time.lastWeek') || 'Tydzień temu';
    if (diffDays >= 14 && diffDays < 30) return `${Math.floor(diffDays / 7)} ${t('common.time.weeksAgo') || 'tygodnie temu'}`;
    
    return formatDateOnly(itemDate);
  };

  const groupHistoryItems = (items) => {
    if (!items || items.length === 0) return [];
    
    const grouped = [];
    let currentLabel = null;
    let currentGroup = null;
    
    items.forEach(item => {
      const label = getGroupLabel(item.rawDate);
      if (label !== currentLabel) {
        if (currentGroup) grouped.push(currentGroup);
        currentLabel = label;
        currentGroup = { label, items: [] };
      }
      currentGroup.items.push(item);
    });
    
    if (currentGroup) grouped.push(currentGroup);
    return grouped;
  };

  const [showQuickIssueModal, setShowQuickIssueModal] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'scan'
  const [searchCode, setSearchCode] = useState(''); // Used for 'scan' tab now
  const [searchListQuery, setSearchListQuery] = useState(''); // Used for 'list' tab
  const [foundTools, setFoundTools] = useState([]); // Used for 'list' tab results
  const [selectedToolForIssue, setSelectedToolForIssue] = useState(null); // Selected tool in 'list' tab
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [selectedEmployee, setSelectedEmployee] = useState(''); // Used for 'scan' tab (batch)
  const [selectedEmployeeForIssue, setSelectedEmployeeForIssue] = useState(''); // Used for 'list' tab (single)
  const [isPermanentIssue, setIsPermanentIssue] = useState(false);
  
  const [showQuickReturnModal, setShowQuickReturnModal] = useState(false);
  const [issuedSectionCollapsed, setIssuedSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dashboard_issued_collapsed') === 'true';
    } catch { return false; }
  });
  const [permanentSectionCollapsed, setPermanentSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dashboard_permanent_collapsed') === 'true';
    } catch { return false; }
  });

  const toggleIssuedSection = () => {
    const newState = !issuedSectionCollapsed;
    setIssuedSectionCollapsed(newState);
    localStorage.setItem('dashboard_issued_collapsed', String(newState));
  };

  const togglePermanentSection = () => {
    const newState = !permanentSectionCollapsed;
    setPermanentSectionCollapsed(newState);
    localStorage.setItem('dashboard_permanent_collapsed', String(newState));
  };
  
  // Issued Tools Hook (fetching only when return modal is open)
  const { data: issuedTools = [], isLoading: issuedToolsLoading } = useIssuedTools(user, showQuickReturnModal);
  
  const standardIssued = issuedTools.filter(t => t.status === 'issued');
  const permanentIssued = issuedTools.filter(t => t.status === 'permanent');

  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  
  // Multi-scan: list of items to issue
  const [quickIssueItems, setQuickIssueItems] = useState([]);

  const handleAddEmployee = async (employeeData) => {
    try {
      // Map department/position IDs to API-required names
      const apiData = {
        first_name: employeeData.firstName,
        last_name: employeeData.lastName,
        phone: employeeData.phone,
        email: employeeData.email,
        department: departments.find(d => d.id?.toString() === employeeData.departmentId)?.name || '',
        position: positions.find(p => p.id?.toString() === employeeData.positionId)?.name || '',
        brand_number: employeeData.brandNumber || ''
      };

      const res = await api.post('/api/employees', apiData);
      if (res) {
        toast.success(t('dashboard.quick.employee.addSuccess'));
        setShowAddEmployeeModal(false);
        // Refresh employee lists and stats
        queryClient.invalidateQueries(['employees']);
        queryClient.invalidateQueries(['dashboardStats']);
      }
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('dashboard.quick.employee.addError'));
      toast.error(msg);
      throw error; // Allows EmployeeModal to manage loading state
    }
  };

  // Handle scan errors
  const handleScanError = (errorMessage) => {
    toast.error(errorMessage);
  };

  const searchToolByCode = async (code, isListSearch = false) => {
    if (!code.trim()) {
      if (isListSearch) setFoundTools([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await api.get(`/api/tools/search?code=${encodeURIComponent(code.trim())}`);
      if (isListSearch) {
        if (Array.isArray(response)) {
          setFoundTools(response);
        } else if (response) {
          setFoundTools([response]);
        } else {
          setFoundTools([]);
        }
      } else {
        // Legacy behavior for scan (if needed, but usually handled by addByCode)
        return response;
      }
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('common.toastr.searchError'));
      toast.error(msg);
      if (isListSearch) setFoundTools([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchListChange = (e) => {
    const value = e.target.value;
    setSearchListQuery(value);
    
    // Auto-search after 3+ characters
    if (value.length >= 3) {
      searchToolByCode(value, true);
    } else {
      setFoundTools([]);
    }
  };

  const handleSearchCodeChange = (e) => {
    setSearchCode(e.target.value);
  };

  const handleIssueSingle = async () => {
    if (!selectedToolForIssue) return;
    if (!selectedEmployeeForIssue) {
      toast.error(t('common.selectEmployee'));
      return;
    }

    try {
      await api.post(`/api/tools/${selectedToolForIssue.id}/issue`, {
        employee_id: parseInt(selectedEmployeeForIssue),
        quantity: 1, // Default to 1 for single issue
        status: isPermanentIssue ? 'permanent' : 'issued'
      });
      
      const employee = employees.find(emp => emp.id.toString() === selectedEmployeeForIssue);
      const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : t('dashboard.labels.employeeFallback');
      
      toast.success(t('dashboard.quick.issue.successBatch', { ok: 1, total: 1, employee: employeeName }));
      
      setSelectedToolForIssue(null);
      setSelectedEmployeeForIssue('');
      setIsPermanentIssue(false);
      // Refresh dashboard data
      queryClient.invalidateQueries(['dashboardStats']);
      queryClient.invalidateQueries(['toolHistory']);
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('dashboard.quick.issue.errorItem', { name: selectedToolForIssue.name }));
      toast.error(msg);
    }
  };

  // Add found tool to list (default quantity = 1) - Repurposed for List Tab Selection
  const selectToolForIssue = (tool) => {
    if (!tool) return;
    if (tool.status === 'issued' || tool.status === 'permanent') {
      toast.error(t('dashboard.quick.issue.errors.alreadyIssuedOrPermanent'));
      return;
    }
    if (!(tool.status === 'available' || tool.status === 'partially_issued')) {
      toast.error(t('dashboard.quick.issue.errors.toolNotAvailableSimple'));
      return;
    }
    setSelectedToolForIssue(tool);
  };

  // Add by code (used by scanner)
  const addByCode = async (code) => {
    try {
      const response = await api.get(`/api/tools/search?code=${encodeURIComponent(code.trim())}`);
      
      let tool = null;
      if (Array.isArray(response)) {
        // Try to find exact match on codes
        tool = response.find(t => 
          String(t.barcode) === code || 
          String(t.qr_code) === code || 
          String(t.sku) === code || 
          String(t.inventory_number) === code
        );
        // If no exact match but exactly one result, use it
        if (!tool && response.length === 1) {
          tool = response[0];
        }
      } else {
        tool = response;
      }

      if (!tool) {
        toast.error(t('dashboard.quick.issue.errors.toolNotFoundWithCode', { code }));
        return;
      }
      if (!(tool.status === 'available' || tool.status === 'partially_issued')) {
        toast.error(t('dashboard.quick.issue.errors.toolUnavailableDetails', { name: tool.name, sku: tool.sku }));
        return;
      }
      const existsIdx = quickIssueItems.findIndex(it => it.tool?.id === tool.id);
      if (existsIdx >= 0) {
        const next = quickIssueItems.map((it, idx) => idx === existsIdx ? { ...it, quantity: (it.quantity || 1) + 1 } : it);
        setQuickIssueItems(next);
      } else {
        setQuickIssueItems(prev => [...prev, { tool, quantity: 1 }]);
      }
    } catch (err) {
      const msg = err?.messageKey ? t(err.messageKey) : (err?.message || t('dashboard.quick.issue.errors.addByCode'));
      toast.error(msg);
    }
  };

  const removeItem = (idx) => {
    setQuickIssueItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItemQty = (idx, qty) => {
    const q = Math.max(1, parseInt(qty || 1, 10));
    setQuickIssueItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: q } : it));
  };

  const clearItems = () => setQuickIssueItems([]);

  // Batch release of all items from the list
  const handleQuickIssueBatch = async () => {
    if (!selectedEmployee) {
      toast.error(t('common.selectEmployee'));
      return;
    }
    if (quickIssueItems.length === 0) {
      toast.error(t('dashboard.quick.issue.errors.emptyList'));
      return;
    }
    try {
      let successCount = 0;
      for (const item of quickIssueItems) {
        const tool = item.tool;
        const quantity = Math.max(1, parseInt(item.quantity || 1, 10));
        try {
          await api.post(`/api/tools/${tool.id}/issue`, {
            employee_id: parseInt(selectedEmployee),
            quantity,
            status: isPermanentIssue ? 'permanent' : 'issued'
          });
          successCount += 1;
        } catch (e) {
          const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('dashboard.quick.issue.errorItem', { name: tool?.name || t('dashboard.labels.tool') }));
          toast.error(msg);
        }
      }
      const employee = employees.find(emp => emp.id.toString() === selectedEmployee);
      const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : t('dashboard.labels.employeeFallback');
      toast.success(t('dashboard.quick.issue.successBatch', { ok: successCount, total: quickIssueItems.length, employee: employeeName }));
      // Close modal and clear
      setShowQuickIssueModal(false);
      setSearchCode('');
      setFoundTools([]);
      setSelectedEmployee('');
      setIsPermanentIssue(false);
      clearItems();
      // Refresh dashboard data
      queryClient.invalidateQueries(['dashboardStats']);
      queryClient.invalidateQueries(['toolHistory']);
    } catch (error) {
      toast.error(error?.message || t('dashboard.quick.issue.batchError'));
      alert(error?.response?.data?.message || t('dashboard.quick.issue.batchError'));
    }
  };

  const handleQuickReturn = async (tool) => {
    if (!tool) {
      alert(t('dashboard.quick.return.errors.noToolData'));
      return;
    }
    try {
      const response = await api.post(`/api/tools/${tool.toolId}/return`, {
        issue_id: tool.id,
        quantity: tool.quantity
      });
      if (response) {
        toast.success(t('dashboard.quick.return.successSingle', { tool: tool.toolName, employee: tool.employeeName }));
        // Refresh issued tools list and stats
        queryClient.invalidateQueries(['issuedTools']);
        queryClient.invalidateQueries(['dashboardStats']);
        queryClient.invalidateQueries(['toolHistory']);
      }
    } catch (error) {
      toast.error(error?.message || t('dashboard.quick.return.errorGeneral'));
    }
  };

  const colorVariants = {
    orange: {
      gradient: 'to-orange-50/50',
      text: 'text-orange-600',
      darkText: 'dark:text-orange-400',
      bg: 'bg-orange-50',
      darkBg: 'dark:bg-orange-500/10',
      ring: 'ring-orange-100',
      darkRing: 'dark:ring-orange-500/20'
    },
    green: {
      gradient: 'to-green-50/50',
      text: 'text-green-600',
      darkText: 'dark:text-green-400',
      bg: 'bg-green-50',
      darkBg: 'dark:bg-green-500/10',
      ring: 'ring-green-100',
      darkRing: 'dark:ring-green-500/20'
    },
    purple: {
      gradient: 'to-purple-50/50',
      text: 'text-purple-600',
      darkText: 'dark:text-purple-400',
      bg: 'bg-purple-50',
      darkBg: 'dark:bg-purple-500/10',
      ring: 'ring-purple-100',
      darkRing: 'dark:ring-purple-500/20'
    },
    red: {
      gradient: 'to-red-50/50',
      text: 'text-red-600',
      darkText: 'dark:text-red-400',
      bg: 'bg-red-50',
      darkBg: 'dark:bg-red-500/10',
      ring: 'ring-red-100',
      darkRing: 'dark:ring-red-500/20'
    },
    blue: {
      gradient: 'to-blue-50/50',
      text: 'text-blue-600',
      darkText: 'dark:text-blue-400',
      bg: 'bg-blue-50',
      darkBg: 'dark:bg-blue-500/10',
      ring: 'ring-blue-100',
      darkRing: 'dark:ring-blue-500/20'
    }
  };

  const StatCard = ({ title, value, icon, color = 'blue', tooltip }) => {
    const variant = colorVariants[color] || colorVariants.blue;

    return (
      <div className="relative bg-white dark:bg-gray-800 rounded-xl p-6 ring-1 ring-slate-200 dark:ring-white/10 shadow-lg dark:shadow-indigo-500/10 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl group">
        {/* Background Layer with Overflow Hidden */}
        <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
          {/* Gradient Background */}
          <div className={`absolute inset-0 bg-gradient-to-br from-white ${variant.gradient} dark:from-gray-800 dark:to-gray-900 opacity-100 transition-colors`} />
          {/* Watermark Icon */}
          <div className="absolute right-4 top-4 opacity-[0.1] dark:opacity-[0.1] scale-150 group-hover:scale-[1.6] group-hover:opacity-10 transition-all duration-500 ease-out">
            {React.cloneElement(icon, { 
              className: `w-24 h-24 ${variant.text} ${variant.darkText}` 
            })}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 tracking-wide">{title}</p>
            <div className="relative inline-block">
              <p className={`text-3xl font-bold text-slate-800 dark:text-white tracking-tight tabular-nums`} aria-describedby={tooltip ? `${title}-tooltip` : undefined}>
                {statsLoading ? (
                  <span className="inline-block w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></span>
                ) : value}
              </p>
              {tooltip && (
                <div
                  id={`${title}-tooltip`}
                  role="tooltip"
                  className="absolute left-1/2 -translate-x-1/2 mt-2 z-50 whitespace-nowrap rounded-md bg-slate-900 text-white text-xs px-3 py-2 shadow-lg opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 pointer-events-none transition-all duration-200"
                >
                  {tooltip}
                </div>
              )}
            </div>
          </div>
          <div className={`w-12 h-12 ${variant.bg} ${variant.darkBg} rounded-lg flex items-center justify-center ring-1 ${variant.ring} ${variant.darkRing} group-hover:scale-110 transition-transform duration-200`}>
            {React.cloneElement(icon, { 
              className: `w-6 h-6 ${variant.text} ${variant.darkText}` 
            })}
          </div>
        </div>
      </div>
    );
  };

  const getActionIcon = (action) => {
    if (action === 'wydanie_permanent') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4Z" />
        </svg>
      );
    }
    if (action === 'wydanie') {
      return (<ArrowUturnRightIcon className="w-5 h-5 text-white" aria-hidden="true" />);
    }
    return (<ArrowUturnLeftIcon className="w-5 h-5 text-white" aria-hidden="true" />);
  };

  const getActionColor = (action) => {
    return (action === 'wydanie' || action === 'wydanie_permanent') ? 'bg-red-500' : 'bg-green-500';
  };

  const getActionText = (action) => {
    if (action === 'wydanie_permanent') {
      return t('dashboard.quick.return.section.permanent') || `${t('dashboard.action.issued')} - na stałe`;
    }
    return action === 'wydanie' ? t('dashboard.action.issued') : t('dashboard.action.returned');
  };

  return (
    <div className="space-y-8 p-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-200">
      {/* Stats Grid - hide for role 'employee' */}
      {String(user?.role) !== 'employee' && (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.stats.tools')}
          value={stats.totalTools}
          icon={
            <WrenchScrewdriverIcon />
          }
          color="orange"
        />
        <StatCard
          title={t('dashboard.stats.bhp')}
          value={stats.totalBhp}
          icon={
            <InboxIcon />
          }
          color="green"
        />
        <StatCard
          title={t('dashboard.stats.employees')}
          value={stats.totalEmployees}
          icon={
            <UsersIcon />
          }
          color="purple"
        />
        <StatCard
          title={t('dashboard.stats.overdueInspections')}
          value={stats.overdueInspections}
          icon={
            <ClockIcon />
          }
          color="red"
          tooltip={
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t('dashboard.stats.tooltip.tools')}</span>
                <span>{stats.overdueToolsCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t('dashboard.stats.tooltip.bhp')}</span>
                <span>{stats.overdueBhpCount}</span>
              </div>
            </div>
          }
        />
      </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: History */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tool History */}
          <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-none rounded-xl border border-gray-100 dark:border-white/5 ring-1 ring-slate-200 dark:ring-white/5 transition-colors duration-200">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center mr-3 ring-1 ring-indigo-500/20">
                    <WrenchScrewdriverIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-200 tracking-tight">
                    {t('dashboard.history.tools.title')}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">
                    {stats.toolHistoryPagination.total > 0 && (
                      <>
                        {((stats.toolHistoryPagination.page - 1) * stats.toolHistoryPagination.limit) + 1}
                        -
                        {Math.min(stats.toolHistoryPagination.page * stats.toolHistoryPagination.limit, stats.toolHistoryPagination.total)}
                        {' '}{t('common.of')}{' '}
                        {stats.toolHistoryPagination.total}
                      </>
                    )}
                  </span>
                  <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 ring-1 ring-gray-200 dark:ring-gray-600">
                     <button
                       onClick={() => pagination.tools.setPage(p => Math.max(1, p - 1))}
                       disabled={stats.toolHistoryPagination.page === 1}
                       className="p-1 rounded-md hover:bg-white dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm disabled:shadow-none"
                     >
                       <ChevronLeftIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                     </button>
                     <button
                       onClick={() => pagination.tools.setPage(p => Math.min(stats.toolHistoryPagination.totalPages, p + 1))}
                       disabled={stats.toolHistoryPagination.page === stats.toolHistoryPagination.totalPages || stats.toolHistoryPagination.total === 0}
                       className="p-1 rounded-md hover:bg-white dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm disabled:shadow-none"
                     >
                       <ChevronRightIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                     </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Tool Filters */}
            <div className="px-6 py-3 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap gap-3 items-center">
                {/* Search */}
                <div className="relative max-w-xs w-full sm:w-auto">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="dashboard-tools-search"
                    name="dashboard-tools-search"
                    type="text"
                    className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Szukaj..."
                    value={filters?.tools?.values?.search || ''}
                    onChange={(e) => filters?.tools?.set(prev => ({ ...prev, search: e.target.value }))}
                  />
                </div>

                {/* Employee Select */}
                {!isEmployee && (
                  <div className="max-w-xs w-full sm:w-auto">
                    <select
                      id="dashboard-tools-employee-filter"
                      name="dashboard-tools-employee-filter"
                      className="block w-full py-1.5 pl-3 pr-8 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={filters?.tools?.values?.employeeId || ''}
                      onChange={(e) => filters?.tools?.set(prev => ({ ...prev, employeeId: e.target.value || null }))}
                    >
                      <option value="">Wszyscy pracownicy</option>
                      {sortedEmployees.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.brand_number ? `${e.brand_number} - ` : ''}{e.first_name} {e.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Status Select */}
                <div className="max-w-xs w-full sm:w-auto">
                    <select
                      id="dashboard-tools-status-filter"
                      name="dashboard-tools-status-filter"
                      className="block w-full py-1.5 pl-3 pr-8 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={filters?.tools?.values?.status || ''}
                      onChange={(e) => filters?.tools?.set(prev => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="">Wszystkie statusy</option>
                      <option value="issued">Wydane</option>
                      <option value="permanent">Wydane - na stałe</option>
                      <option value="partially_issued">Częściowo wydane</option>
                      <option value="returned">Zwrócone</option>
                    </select>
                </div>
            </div>
            <div className="pt-3 pb-6 pl-6 pr-6">
              {!hasPermission(user, PERMISSIONS.VIEW_TOOL_HISTORY) ? (
                <div className="text-center py-8">
                  <InboxIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 opacity-50" aria-hidden="true" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{t('common.noPermissionsTitle')}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">{t('dashboard.history.tools.noPermissions')}</p>
                </div>
              ) : statsLoading ? (
                <div className="animate-pulse space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex space-x-4">
                      <div className="rounded-full bg-gray-200 dark:bg-gray-700 h-12 w-12"></div>
                      <div className="flex-1 space-y-2 py-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : stats.toolHistory.length > 0 ? (
                <div className="flow-root">
                  {groupHistoryItems(stats.toolHistory).map((group, _groupIndex) => (
                    <div key={group.label} className="mb-4 last:mb-0">
                      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm py-1.5 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-white/5">
                        {group.label}
                      </div>
                      <ul className="-mb-8">
                        {group.items.map((item, index) => (
                          <li key={item.id}>
                            <div className="relative pb-6">
                              {index !== group.items.length - 1 && (
                                <span className="absolute top-5 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-600" aria-hidden="true" />
                              )}
                              <div
                                className="relative flex space-x-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg p-2 -m-2"
                                onClick={() => {
                                  const toolId = item?.toolId;
                                  const highlightSku = item?.toolSku;
                                  const search = item?.toolBaseName || item?.toolName || '';

                                  if (toolId) {
                                    const params = new URLSearchParams();
                                    if (search) params.set('search', String(search));
                                    params.set('openToolId', String(toolId));
                                    if (highlightSku) params.set('highlightSku', String(highlightSku));
                                    window.dispatchEvent(new CustomEvent('navigate', { detail: { url: `/tools?${params.toString()}` } }));
                                    return;
                                  }

                                  window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'tools', q: highlightSku || item?.toolName } }));
                                }}
                              >
                                <div className="flex items-center justify-center">
                                  <span className={`h-9 w-9 rounded-xl ${getActionColor(item.action)} flex items-center justify-center`}>
                                    {getActionIcon(item.action)}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1 pt-1.5">
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="text-base font-medium text-gray-900 dark:text-white transition-colors duration-200">
                                          {getActionText(item.action)}: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{item.toolName}</span>
                                        </p>
                                        {item.toolCategory && ![
                                          'zawiesia łańcuchowe',
                                          'zawiesia pasowe',
                                          'nasadki 1"',
                                          'nasadki 1/2"',
                                          'detektory'
                                        ].includes(String(item.toolCategory || '').trim().toLowerCase()) && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
                                            {item.toolCategory}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 gap-y-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/employees?q=${encodeURIComponent(item.employeeName)}`);
                                          }}
                                          className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5 cursor-pointer"
                                        >
                                          <UserIcon className="w-5 h-5" aria-hidden="true" />
                                          {item.employeeName}
                                        </button>
                                        {item.issuedByName && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(`/employees?q=${encodeURIComponent(item.issuedByName)}`);
                                            }}
                                            className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5 cursor-pointer"
                                          >
                                            <UserCircleIcon className="w-5 h-5" aria-hidden="true" />
                                            {t('dashboard.history.labels.issuedBy')}: {item.issuedByName}
                                          </button>
                                        )}
                                        <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5">
                                          <Bars3Icon className="w-5 h-5" aria-hidden="true" />
                                          {t('dashboard.history.labels.quantity')}: {item.quantity}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-1 sm:mt-0 text-base text-gray-500 dark:text-gray-400 flex items-center transition-colors duration-200 whitespace-nowrap sm:ml-4 shrink-0">
                                      <ClockIcon className="w-5 h-5 mr-1" aria-hidden="true" />
                                      {item.time}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <InboxIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{t('dashboard.history.noDataTitle')}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">{t('dashboard.history.tools.noData')}</p>
                </div>
              )}
            </div>
          </div>

          {/* BHP History */}
          <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-none rounded-xl border border-gray-100 dark:border-white/5 ring-1 ring-slate-200 dark:ring-white/5 transition-colors duration-200">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center mr-3 ring-1 ring-indigo-500/20">
                    <ClockIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-200">
                    {t('dashboard.history.bhp.title')}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">
                    {stats.bhpHistoryPagination.total > 0 && (
                      <>
                        {((stats.bhpHistoryPagination.page - 1) * stats.bhpHistoryPagination.limit) + 1}
                        -
                        {Math.min(stats.bhpHistoryPagination.page * stats.bhpHistoryPagination.limit, stats.bhpHistoryPagination.total)}
                        {' '}{t('common.of')}{' '}
                        {stats.bhpHistoryPagination.total}
                      </>
                    )}
                  </span>
                  <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 ring-1 ring-gray-200 dark:ring-gray-600">
                     <button
                       onClick={() => pagination.bhp.setPage(p => Math.max(1, p - 1))}
                       disabled={stats.bhpHistoryPagination.page === 1}
                       className="p-1 rounded-md hover:bg-white dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm disabled:shadow-none"
                     >
                       <ChevronLeftIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                     </button>
                     <button
                       onClick={() => pagination.bhp.setPage(p => Math.min(stats.bhpHistoryPagination.totalPages, p + 1))}
                       disabled={stats.bhpHistoryPagination.page === stats.bhpHistoryPagination.totalPages || stats.bhpHistoryPagination.total === 0}
                       className="p-1 rounded-md hover:bg-white dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm disabled:shadow-none"
                     >
                       <ChevronRightIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                     </button>
                  </div>
                </div>
              </div>
            </div>

            {/* BHP Filters */}
            <div className="px-6 py-3 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap gap-3 items-center">
                {/* Search */}
                <div className="relative max-w-xs w-full sm:w-auto">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="bhp-search"
                    name="bhpSearch"
                    type="text"
                    className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Szukaj..."
                    value={filters?.bhp?.values?.search || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      filters?.bhp?.set(prev => ({ ...prev, search: val }));
                    }}
                  />
                </div>

                {/* Employee Select */}
                {!isEmployee && (
                  <div className="max-w-xs w-full sm:w-auto">
                    <select
                      id="bhp-employee-filter"
                      name="bhpEmployeeId"
                      className="block w-full py-1.5 pl-3 pr-8 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={filters?.bhp?.values?.employeeId || ''}
                      onChange={(e) => filters?.bhp?.set(prev => ({ ...prev, employeeId: e.target.value || null }))}
                    >
                      <option value="">Wszyscy pracownicy</option>
                      {sortedEmployees.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.brand_number ? `${e.brand_number} - ` : ''}{e.first_name} {e.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Status Select */}
                <div className="max-w-xs w-full sm:w-auto">
                    <select
                      id="bhp-status-filter"
                      name="bhpStatus"
                      className="block w-full py-1.5 pl-3 pr-8 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={filters?.bhp?.values?.status || ''}
                      onChange={(e) => filters?.bhp?.set(prev => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="">Wszystkie statusy</option>
                      <option value="issued">Wydane</option>
                      <option value="permanent">Wydane - na stałe</option>
                      <option value="returned">Zwrócone</option>
                    </select>
                </div>
            </div>

            <div className="pt-3 pb-6 pl-6 pr-6">
              {!hasPermission(user, PERMISSIONS.VIEW_BHP_HISTORY) ? (
                <div className="text-center py-8">
                  <InboxIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{t('common.noPermissionsTitle')}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">{t('dashboard.history.bhp.noPermissions')}</p>
                </div>
              ) : statsLoading ? (
                <div className="animate-pulse space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex space-x-4">
                      <div className="rounded-full bg-gray-200 dark:bg-gray-700 h-12 w-12"></div>
                      <div className="flex-1 space-y-2 py-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (stats.bhpHistory?.length || 0) > 0 ? (
                <div className="flow-root">
                  {groupHistoryItems(stats.bhpHistory).map((group, _groupIndex) => (
                    <div key={group.label} className="mb-4 last:mb-0">
                      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm py-1.5 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-white/5">
                        {group.label}
                      </div>
                      <ul className="-mb-8">
                        {group.items.map((item, index) => (
                          <li key={item.id}>
                            <div className="relative pb-8">
                              {index !== group.items.length - 1 && (
                                <span className="absolute top-5 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-600" aria-hidden="true" />
                              )}
                              <div className="relative flex space-x-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg p-2 -m-2" onClick={() => { window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'bhp', q: item.bhpInventoryNumber || item.bhpModel || item.bhpLabel } })); }}>
                                <div className="flex items-center justify-center">
                                  <span className={`h-9 w-9 rounded-xl ${getActionColor(item.action)} flex items-center justify-center shadow-lg`}>
                                    {getActionIcon(item.action)}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1 pt-1.5">
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                    <div className="flex-1">
                                      <p className="text-base font-medium text-gray-900 dark:text-white mb-1 transition-colors duration-200">
                                        {getActionText(item.action)}: <span className="font-semibold text-green-600 dark:text-green-400">{item.bhpLabel}</span>
                                      </p>

                                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/employees?q=${encodeURIComponent(item.employeeName)}`);
                                          }}
                                          className="inline-flex items-center px-2.5 py-1 rounded text-base font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5 cursor-pointer"
                                        >
                                          <UserIcon className="w-5 h-5" aria-hidden="true" />
                                          {item.employeeName}
                                        </button>
                                        {item.issuedByName && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(`/employees?q=${encodeURIComponent(item.issuedByName)}`);
                                            }}
                                            className="inline-flex items-center px-2.5 py-1 rounded text-base font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5 cursor-pointer"
                                          >
                                            <UserCircleIcon className="w-5 h-5" aria-hidden="true" />
                                            {t('dashboard.history.labels.issuedBy')}: {item.issuedByName}
                                          </button>
                                        )}
                                        {typeof item.quantity !== 'undefined' && (
                                          <span className="inline-flex items-center px-2.5 py-1 rounded text-base font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5">
                                            <Bars3Icon className="w-5 h-5" aria-hidden="true" />  
                                            {t('dashboard.history.labels.quantity')}: {item.quantity}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-1 sm:mt-0 text-base text-gray-500 dark:text-gray-400 flex items-center transition-colors duration-200 whitespace-nowrap sm:ml-4 shrink-0">
                                      <ClockIcon className="w-5 h-5 mr-1" aria-hidden="true" />
                                      {item.time}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <InboxIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{t('dashboard.history.noDataTitle')}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">{t('dashboard.history.bhp.noData')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions & New Tiles */}
        <div className="space-y-6">
          {/* Quick Actions */}
          {hasPermission(user, PERMISSIONS.VIEW_QUICK_ACTIONS) && (
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-white/5 p-6 ring-1 ring-slate-100 dark:ring-white/5 shadow-sm dark:shadow-none">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-purple-50/50 dark:from-indigo-500/5 dark:via-transparent dark:to-purple-500/5 pointer-events-none" />
            
            <h3 className="relative z-10 text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3 px-1 mb-6 tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                <BoltIcon className="w-5 h-5" />
              </div>
              {t('dashboard.quick.title')}
            </h3>
            
            <div className="relative z-10 grid grid-cols-1 gap-3">
                {hasPermission(user, PERMISSIONS.MANAGE_EMPLOYEES) && (
                  <button 
                    onClick={() => setShowAddEmployeeModal(true)} 
                    className="group relative flex flex-row items-center text-left p-3 cursor-pointer overflow-hidden rounded-xl bg-white dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-white/10 hover:ring-indigo-500/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/20 active:scale-95"
                  >
                    {/* Glow Effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-transparent to-purple-50/80 dark:from-indigo-500/10 dark:via-transparent dark:to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <div className="relative z-10 mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-indigo-500/40 group-hover:scale-110">
                      <PlusIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="relative z-10 flex flex-col">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 tracking-tight transition-colors">
                        {t('dashboard.quick.createEmployeeTitle')}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {t('dashboard.quick.createEmployee')}
                      </span>
                    </div>
                  </button>
                )}
                
                <button 
                  id="quick-issue-btn"
                  onClick={() => setShowQuickIssueModal(true)}
                  className="group relative flex flex-row items-center text-left p-3 cursor-pointer overflow-hidden rounded-xl bg-white dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-white/10 hover:ring-emerald-500/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/10 dark:hover:shadow-emerald-500/20 active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-teal-50/80 dark:from-emerald-500/10 dark:via-transparent dark:to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative z-10 mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-emerald-500/40 group-hover:scale-110">
                    <QrCodeIcon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="relative z-10 flex flex-col">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 tracking-tight transition-colors">
                      {t('dashboard.quick.issue.title')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                      {t('dashboard.quick.issue.subtitle')}
                    </span>
                  </div>
                </button>
                
                <button 
                  id="quick-return-btn"
                  onClick={() => setShowQuickReturnModal(true)}
                  className="group relative flex flex-row items-center text-left p-3 cursor-pointer overflow-hidden rounded-xl bg-white dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-white/10 hover:ring-purple-500/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-500/10 dark:hover:shadow-purple-500/20 active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-50/80 via-transparent to-pink-50/80 dark:from-purple-500/10 dark:via-transparent dark:to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative z-10 mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-purple-500/40 group-hover:scale-110">
                    <ArrowUturnLeftIcon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="relative z-10 flex flex-col">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 tracking-tight transition-colors">
                      {t('dashboard.quick.return.title')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                      {t('dashboard.quick.return.subtitle')}
                    </span>
                  </div>
                </button>
            </div>
          </div>
          )}

          {/* New Tile: Nadchodzące przeglądy - Visible only for admins/managers */}
          {['administrator', 'toolsmaster', 'manager'].includes(user?.role) && (
            <>
              {/* New Tile: Nadchodzące przeglądy */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10 shadow-sm flex flex-col group hover:shadow-md transition-all h-auto min-h-[12rem] max-h-96">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nadchodzące przeglądy</p>
                  <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 rounded-xl flex items-center justify-center ring-1 ring-red-100 dark:ring-red-500/20 text-red-600 dark:text-red-400">
                    <ClipboardDocumentCheckIcon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {stats.upcomingInspectionsList && stats.upcomingInspectionsList.length > 0 ? (
                    <ul className="space-y-3">
                      {stats.upcomingInspectionsList.map((item, idx) => (
                        <li key={`${item.type}-${item.id}-${idx}`} className="flex justify-between items-start text-sm border-b border-slate-100 dark:border-slate-700/50 last:border-0 pb-2 last:pb-0">
                          <button 
                            onClick={() => {
                              // Search by serial number (BHP) or factory number (Tools - stored in serial_number)
                              // Fallback to name if not available
                              const searchTerm = item.serial_number || item.name;
                              navigate(item.type === 'bhp' ? `/bhp?search=${encodeURIComponent(searchTerm)}` : `/tools?search=${encodeURIComponent(searchTerm)}`);
                            }}
                            className="text-left font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {item.name}
                          </button>
                          <span className="text-xs font-mono text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded ml-2 whitespace-nowrap">
                             {item.inspection_date ? formatDateOnly(item.inspection_date) : '-'}
                           </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm italic">
                      Brak nadchodzących przeglądów
                    </div>
                  )}
                </div>
              </div>

              {/* New Tile: Narzędzia w serwisie */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-white/10 shadow-sm flex flex-col group hover:shadow-md transition-all h-auto min-h-[12rem] max-h-96">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Narzędzia w serwisie</p>
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center ring-1 ring-blue-100 dark:ring-blue-500/20 text-blue-600 dark:text-blue-400">
                    <WrenchScrewdriverIcon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {stats.toolsInServiceList && stats.toolsInServiceList.length > 0 ? (
                    <ul className="space-y-3">
                      {stats.toolsInServiceList.map((item, _idx) => (
                        <li key={item.id} className="flex justify-between items-start text-sm border-b border-slate-100 dark:border-slate-700/50 last:border-0 pb-2 last:pb-0">
                           <button 
                             onClick={() => navigate(`/tools?search=${encodeURIComponent(item.name)}`)}
                             className="text-left font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                           >
                             {item.name}
                           </button>
                           <span className="text-xs font-mono text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded ml-2 whitespace-nowrap">
                             {item.service_sent_at ? formatDateOnly(item.service_sent_at) : '-'}
                           </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm italic">
                      Brak narzędzi w serwisie
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Quick Issue Modal */}
      {showQuickIssueModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowQuickIssueModal(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 sm:mx-0 sm:h-10 sm:w-10">
                    <BoltIcon className="h-6 w-6 text-green-600 dark:text-green-400" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                      {t('dashboard.quick.issue.modalTitle')}
                    </h3>
                    
                    {/* Tabs */}
                    <div className="mt-4 border-b border-gray-200 dark:border-gray-700">
                      <nav className="-mb-px flex space-x-8">
                        <button
                          onClick={() => { setActiveTab('list'); setIsPermanentIssue(false); }}
                          className={`${
                            activeTab === 'list'
                              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                          } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                        >
                          {t('dashboard.quick.issue.tabs.list')}
                        </button>
                        <button
                          onClick={() => { setActiveTab('scan'); setIsPermanentIssue(false); }}
                          className={`${
                            activeTab === 'scan'
                              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                          } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                        >
                          {t('dashboard.quick.issue.tabs.scan')}
                        </button>
                      </nav>
                    </div>

                    <div className="mt-4">
                      {activeTab === 'list' ? (
                        <div className="space-y-4">
                          {/* Search and List View */}
                          {!selectedToolForIssue ? (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {t('dashboard.quick.issue.searchLabel')}
                                </label>
                                <input
                                id="quick-issue-search"
                                name="quickIssueSearch"
                                  type="text"
                                  className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                                  placeholder={t('dashboard.quick.issue.searchPlaceholder')}
                                  value={searchListQuery}
                                  onChange={handleSearchListChange}
                                  autoFocus
                                />
                              </div>

                              {/* Search Results */}
                              {searchLoading ? (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400">{t('common.searching')}</div>
                              ) : foundTools.length > 0 ? (
                                <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
                                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {foundTools.map((tool) => (
                                      <li 
                                        key={tool.id} 
                                        className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex justify-between items-center transition-colors duration-150"
                                        onClick={() => selectToolForIssue(tool)}
                                      >
                                        <div>
                                          <p className="text-sm font-medium text-gray-900 dark:text-white">{tool.name}</p>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {tool.sku || '-'} | Loc: {tool.location || '-'}</p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                          tool.status === 'available' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                                          tool.status === 'partially_issued' ? 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200' :
                                          tool.status === 'permanent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                        }`}>
                                          {t(`common.status.${tool.status}`, { defaultValue: tool.status })}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : searchListQuery.length >= 3 ? (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400">{t('dashboard.quick.issue.noResults')}</div>
                              ) : null}
                            </>
                          ) : (
                            /* Selected Tool View */
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <h4 className="text-lg font-medium text-gray-900 dark:text-white">{selectedToolForIssue.name}</h4>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">SKU: {selectedToolForIssue.sku}</p>
                                </div>
                                <button 
                                  onClick={() => { setSelectedToolForIssue(null); setSelectedEmployeeForIssue(''); }}
                                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                >
                                  <XMarkIcon className="h-5 w-5" />
                                </button>
                              </div>
                              
                              <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {t('dashboard.quick.issue.selectEmployee')}
                                </label>
                                <select
                                id="issue-employee-single"
                                name="employeeIdSingle"
                                  value={selectedEmployeeForIssue}
                                  onChange={(e) => setSelectedEmployeeForIssue(e.target.value)}
                                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                                >
                                  <option value="">{t('common.select')}</option>
                                  {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.first_name} {emp.last_name} ({emp.brand_number || 'brak nr'})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="mb-4 flex items-center">
                                <input
                                  id="issue-permanent-single"
                                  name="issue-permanent-single"
                                  type="checkbox"
                                  checked={isPermanentIssue}
                                  onChange={(e) => setIsPermanentIssue(e.target.checked)}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="issue-permanent-single" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                                  {t('dashboard.quick.issue.permanent')}
                                </label>
                              </div>

                              <div className="flex justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={() => { setSelectedToolForIssue(null); setSelectedEmployeeForIssue(''); }}
                                  className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                                >
                                  {t('common.cancel')}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleIssueSingle}
                                  className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                                >
                                  {t('dashboard.quick.issue.submitButton')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Scan Tab Content (Multi-issue) */}
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                            <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2 text-sm">{t('dashboard.quick.issue.scanInstructions')}</h4>
                            <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-400 space-y-1">
                              <li>{t('dashboard.quick.issue.scanStep1')}</li>
                              <li>{t('dashboard.quick.issue.scanStep2')}</li>
                              <li>{t('dashboard.quick.issue.scanStep3')}</li>
                            </ul>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('dashboard.quick.issue.employeeLabel')}
                              </label>
                              <select
                                id="issue-employee-batch"
                                name="employeeIdBatch"
                                value={selectedEmployee}
                                onChange={(e) => setSelectedEmployee(e.target.value)}
                                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                              >
                                <option value="">{t('common.select')}</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.first_name} {emp.last_name} ({emp.brand_number || 'brak nr'})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('dashboard.quick.issue.scanCodeLabel')}
                              </label>
                              <div className="flex gap-2">
                                <input
                                  id="scan-code-input"
                                  name="scanCode"
                                  type="text"
                                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                                  placeholder={t('dashboard.quick.issue.scanCodePlaceholder')}
                                  value={searchCode}
                                  onChange={handleSearchCodeChange}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addByCode(searchCode);
                                      setSearchCode('');
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowBarcodeScanner(!showBarcodeScanner)}
                                  className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                >
                                  <QrCodeIcon className="h-5 w-5" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center mt-2">
                            <input
                              id="issue-permanent-batch"
                              name="issue-permanent-batch"
                              type="checkbox"
                              checked={isPermanentIssue}
                              onChange={(e) => setIsPermanentIssue(e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="issue-permanent-batch" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                              {t('dashboard.quick.issue.permanent')}
                            </label>
                          </div>

                          {showBarcodeScanner && (
                            <div className="mb-4 p-4 border rounded-lg dark:border-gray-700">
                              <BarcodeScanner
                                onScan={(code) => {
                                  addByCode(code);
                                  setShowBarcodeScanner(false);
                                }}
                                onError={handleScanError}
                              />
                              <button
                                onClick={() => setShowBarcodeScanner(false)}
                                className="mt-2 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              >
                                {t('common.cancelScan')}
                              </button>
                            </div>
                          )}

                          {/* Scanned Items List */}
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              {t('dashboard.quick.issue.itemsList')} ({quickIssueItems.length})
                            </h4>
                            {quickIssueItems.length === 0 ? (
                              <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                                <p className="text-gray-500 dark:text-gray-400 text-sm">{t('dashboard.quick.issue.noItemsScanned')}</p>
                              </div>
                            ) : (
                              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-60 overflow-y-auto">
                                  {quickIssueItems.map((item, idx) => (
                                    <li key={idx} className="p-3 flex justify-between items-center bg-white dark:bg-gray-800">
                                      <div className="flex-1 min-w-0 mr-4">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.tool.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          SKU: {item.tool.sku || '-'} | {t('common.quantity')}:
                                          <input 
                                            id={`quick-issue-qty-${idx}`}
                                            name={`quickIssueQty-${idx}`}
                                            type="number" 
                                            min="1" 
                                            className="ml-1 w-16 p-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-center dark:bg-gray-700 dark:text-white"
                                            value={item.quantity}
                                            onChange={(e) => updateItemQty(idx, e.target.value)}
                                          />
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => removeItem(idx)}
                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                      >
                                        <XMarkIcon className="h-5 w-5" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                            <button
                              type="button"
                              onClick={handleQuickIssueBatch}
                              disabled={quickIssueItems.length === 0 || !selectedEmployee}
                              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('dashboard.quick.issue.submitButton', { count: quickIssueItems.length })}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowQuickIssueModal(false);
                                clearItems();
                              }}
                              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Return Modal */}
      {showQuickReturnModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowQuickReturnModal(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 sm:mx-0 sm:h-10 sm:w-10">
                    <ArrowUturnLeftIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                      {t('dashboard.quick.return.title')}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        {t('dashboard.quick.return.subtitle')}
                      </p>
                      
                      {issuedToolsLoading ? (
                        <div className="text-center py-8">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Standard Issued Section */}
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div 
                              className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex justify-between items-center cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              onClick={toggleIssuedSection}
                            >
                              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                {t('dashboard.quick.return.section.issued')}
                                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({standardIssued.length})</span>
                              </h4>
                              {issuedSectionCollapsed ? <ChevronDownIcon className="h-5 w-5 text-gray-500" /> : <ChevronUpIcon className="h-5 w-5 text-gray-500" />}
                            </div>
                            {!issuedSectionCollapsed && (
                              standardIssued.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                      <tr>
                                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">{t('dashboard.labels.tool')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.labels.employee')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.labels.quantity')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.labels.date')}</th>
                                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                          <span className="sr-only">{t('common.actions')}</span>
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                      {standardIssued.map((tool) => (
                                        <tr key={tool.id}>
                                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
                                            {tool.toolName}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{tool.employeeName}</td>
                                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{tool.quantity}</td>
                                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {tool.issuedAt ? formatDate(tool.issuedAt) : '-'}
                                          </td>
                                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            <button
                                              onClick={() => handleQuickReturn(tool)}
                                              className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
                                            >
                                              {t('dashboard.quick.return.submitReturn')}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="p-8 text-center border-t border-gray-200 dark:border-gray-700">
                                  <InboxIcon className="mx-auto h-12 w-12 text-gray-400" />
                                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.quick.return.errors.noIssuedTools')}</h3>
                                </div>
                              )
                            )}
                          </div>

                          {/* Permanent Issued Section */}
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div 
                              className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex justify-between items-center cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              onClick={togglePermanentSection}
                            >
                              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                {t('dashboard.quick.return.section.permanent')}
                                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({permanentIssued.length})</span>
                              </h4>
                              {permanentSectionCollapsed ? <ChevronDownIcon className="h-5 w-5 text-gray-500" /> : <ChevronUpIcon className="h-5 w-5 text-gray-500" />}
                            </div>
                            {!permanentSectionCollapsed && (
                              permanentIssued.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                      <tr>
                                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">{t('dashboard.labels.tool')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.labels.employee')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.labels.quantity')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.labels.date')}</th>
                                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                          <span className="sr-only">{t('common.actions')}</span>
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                      {permanentIssued.map((tool) => (
                                        <tr key={tool.id}>
                                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
                                            {tool.toolName}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{tool.employeeName}</td>
                                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{tool.quantity}</td>
                                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {tool.issuedAt ? formatDate(tool.issuedAt) : '-'}
                                          </td>
                                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            <button
                                              onClick={() => handleQuickReturn(tool)}
                                              className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
                                            >
                                              {t('dashboard.quick.return.submitReturn')}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="p-8 text-center border-t border-gray-200 dark:border-gray-700">
                                  <InboxIcon className="mx-auto h-12 w-12 text-gray-400" />
                                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.quick.return.errors.noPermanentTools') || 'Brak narzędzi wydanych na stałe'}</h3>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setShowQuickReturnModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showBarcodeScanner && (
        <BarcodeScanner
          isOpen={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          autoCloseOnScan={false}
          onCheckExists={async (code) => {
            const url = `/api/tools/search?code=${encodeURIComponent(code.trim())}`;
            try {
              const resp = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
              if (!resp.ok) return false;
              const data = await resp.json();
              if (!data) return false;
              if (Array.isArray(data)) return data.length > 0;
              if (typeof data === 'object') {
                if (data.id || data.name || data.sku) return true;
                if (typeof data.found !== 'undefined') return !!data.found;
                if (typeof data.data !== 'undefined') return !!data.data;
              }
              return false;
            } catch (_) {
              return false;
            }
          }}
          onScan={async (code) => {
            await addByCode(code);
          }}
          onAddTool={(code) => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: { url: `/tools?newSku=${encodeURIComponent(code)}` } }));
          }}
          onAddBhp={(code) => {
            window.dispatchEvent(new CustomEvent('navigate', { detail: { url: `/bhp?newSku=${encodeURIComponent(code)}` } }));
          }}
          onError={handleScanError}
        />
      )}

      {/* Add Employee Modal */}
      {showAddEmployeeModal && (
        <EmployeeModal 
          isOpen={showAddEmployeeModal}
          onClose={() => setShowAddEmployeeModal(false)}
          onSave={handleAddEmployee}
          departments={departments}
          positions={positions}
        />
      )}

      <OnboardingTour />
    </div>
  );
};

export default DashboardScreen;
