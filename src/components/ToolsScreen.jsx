import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { notifyError, notifySuccess, notifyInfo, notifyWarn } from '../utils/notify.jsx';

import BarcodeScanner from './BarcodeScanner';
import { PERMISSIONS, hasPermission } from '../constants';
import SkeletonList from './SkeletonList';
import { useLanguage } from '../contexts/LanguageContext';
import ConfirmationModal from './ConfirmationModal';
import ToolsFilter from './tools/ToolsFilter';
import ToolsTable from './tools/ToolsTable';
import ToolsNotifyModal from './tools/ToolsNotifyModal';
import ToolsDetailsModal from './tools/ToolsDetailsModal';
import ToolsServiceModal from './tools/ToolsServiceModal';
import ToolsTooltip from './tools/ToolsTooltip';
import ToolsIssueModal from './tools/ToolsIssueModal';
import ToolsReturnModal from './tools/ToolsReturnModal';
import { exportListToPDF, exportListToXLSX } from '../utils/toolsExport';
import { useWeldingInspectionNotifications } from '../hooks/useWeldingInspectionNotifications';
import { useToolsManagement } from '../hooks/useToolsManagement';
import { useTools, useAddTool, useUpdateTool, useDeleteTool, useToolReturnRequests, useNotifyReturn, useToolDetails, useSendToService, useReceiveFromService, useCategories, useCategoryStats, useAppConfig } from '../hooks/useTools';
import { useEmployees } from '../hooks/useEmployees';
import { useIssuedTools } from '../hooks/useIssuedTools';
import api from '../api';

function ToolsScreen({ initialSearchTerm = '', user }) {
  const { t, language } = useLanguage();
  const locale = language === 'EN' ? 'en-GB' : (language === 'DE' ? 'de-DE' : 'pl-PL');
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState(() => {
    try {
      const qs = typeof window !== 'undefined' ? window.location.search : '';
      const params = new URLSearchParams(qs);
      const fromUrl = params.get('search');
      if (fromUrl) return fromUrl;
    } catch (_e) {
      void 0;
    }
    if (initialSearchTerm) return initialSearchTerm;
    return '';
  });
  const [selectedCategory, setSelectedCategory] = useState(() => {
    try {
      return window.localStorage.getItem('tools.filter.category') || '';
    } catch (_e) {
      return '';
    }
  });
  const [selectedStatus, setSelectedStatus] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'inventory_number', direction: 'asc' });
  // Prefix for tool codes
  const serviceModalRef = useRef(null);
  const notifyModalRef = useRef(null);
  const searchInputRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isEmployee = String(user?.role) === 'employee';
  const canViewTools = ( hasPermission(user, PERMISSIONS.VIEW_TOOLS) || hasPermission(user, PERMISSIONS.VIEW_TOOL_HISTORY));
  const canManageTools = hasPermission(user, PERMISSIONS.MANAGE_TOOLS);
  const canExportTools = hasPermission(user, PERMISSIONS.EXPORT_TOOLS);
  const highlightSkuFromUrl = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search);
      const v = params.get('highlightSku');
      return v ? String(v) : null;
    } catch (_) {
      return null;
    }
  }, [location.search]);

  useEffect(() => {
    try {
      window.localStorage.setItem('tools.filter.category', selectedCategory || '');
    } catch (_e) {
      void 0;
    }
  }, [selectedCategory]);

  // React Query Hooks
  const { data: tools = [], isLoading: toolsLoading } = useTools({ 
    search: debouncedSearch, 
    category: selectedCategory, 
    status: selectedStatus,
    enabled: canViewTools 
  });

  const { data: issuedTools = [], isLoading: issuedToolsLoading } = useIssuedTools(user?.id, isEmployee);

  const { mutateAsync: addTool } = useAddTool();
  const { mutateAsync: updateTool } = useUpdateTool();
  const { mutateAsync: deleteTool } = useDeleteTool();
  const { mutateAsync: notifyReturn } = useNotifyReturn();
  const { mutateAsync: sendToService } = useSendToService();
  const { mutateAsync: receiveFromService } = useReceiveFromService();
  const { data: availableCategories = [] } = useCategories(canViewTools);
  const { data: categoryStats = [] } = useCategoryStats(canViewTools && !isEmployee);
  const { data: appConfig = {} } = useAppConfig(canViewTools);
  const { data: employees = [] } = useEmployees(canManageTools); // Fetch employees for issue modal
  
  const toolsCodePrefix = appConfig?.toolsCodePrefix || '';
  const toolCategoryPrefixes = appConfig?.toolCategoryPrefixes || {};

  const {
    editingTool,
    showDetailsModal,
    selectedTool: hookSelectedTool,
    showServiceModal,
    serviceFormData, setServiceFormData,
    showBarcodeScanner,
    handleScanResult,
    handleScanError,
    handleOpenDetailsModal,
    handleCloseDetailsModal,
    handleOpenServiceModal,
    handleCloseServiceModal,
    handleSendToService,
    handleServiceReceive,
    handleServiceReceiveFor,
    downloadQrLabel,
    downloadBarcodeLabel,
    // exportDetailsToXLSX removed (handled in ToolsDetailsModal)
    // Notify
    notifyModal,
    notifyTool,
    notifySending,
    handleOpenNotify,
    handleCloseNotify,
    handleConfirmNotify,
    // Delete
    confirmDeleteOpen,
    confirmDeleteLoading,
    openDeleteConfirm,
    closeDeleteConfirm,
    handleDeleteTool,
    // Tooltip
    hoveredToolId,
    issueTooltipPos,
    handleToolHover,
    handleToolLeave,
    handleTooltipEnter,
    handleTooltipLeave,
    handleActionsHover,
    handleActionsLeave,
    // Issue/Return
    issueModalOpen,
    selectedToolForIssue,
    handleOpenIssueModal,
    handleCloseIssueModal,
    handleConfirmIssue,
    returnModalOpen,
    selectedToolForReturn,
    handleOpenReturnModal,
    handleCloseReturnModal,
    handleConfirmReturn
  } = useToolsManagement({
    t,
    tools,
    addTool,
    updateTool,
    deleteTool,
    sendToService,
    receiveFromService,
    notifyReturn,
    notifySuccess,
    notifyError,
    notifyInfo,
    notifyWarn,
    toolsCodePrefix,
    toolCategoryPrefixes,
    canManageTools,
    language
  });
  
  const selectedToolId = hookSelectedTool?.id;
  const { data: toolDetails } = useToolDetails(selectedToolId);
  
  const selectedTool = useMemo(() => {
    if (!selectedToolId) return null;
    // Fallback to hookSelectedTool if not found in current list (e.g. after filtering changes)
    const fromList = tools.find(t => t.id === selectedToolId) || hookSelectedTool;
    if (toolDetails) return { ...fromList, ...toolDetails };
    return fromList || null;
  }, [selectedToolId, tools, toolDetails, hookSelectedTool]);
  
  // Fetch return requests only when details modal is open
  const { data: returnRequests = [], isLoading: returnRequestsLoading } = useToolReturnRequests(
    showDetailsModal && selectedTool?.id ? selectedTool.id : null
  );

  useEffect(() => {
    try {
      if (showDetailsModal && selectedTool && selectedTool.id) {
        // Return requests handled by hook
      }
    } catch (_) { /* noop */ }
  }, [showDetailsModal, selectedTool]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (showServiceModal) handleCloseServiceModal();
        if (notifyModal) handleCloseNotify();
      }
      if (e.key === 'Tab') {
        const el = serviceModalRef.current || notifyModalRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        const focusables = Array.from(nodes).filter(n => !n.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    if (showServiceModal || notifyModal) {
      document.addEventListener('keydown', handler);
      setTimeout(() => {
        const el = serviceModalRef.current || notifyModalRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        const focusables = Array.from(nodes).filter(n => !n.hasAttribute('disabled'));
        if (focusables[0]) focusables[0].focus();
      }, 0);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [showServiceModal, notifyModal, handleCloseServiceModal, handleCloseNotify]);

  // Powiadomienia o nadchodzących przeglądach dla narzędzi spawalniczych
  useWeldingInspectionNotifications(tools, t);

  // Filter tools based on search and employee-issued restriction
  const filteredTools = useMemo(() => {
    const term = String(searchTerm || '').trim().toLowerCase();
    const base = (tools || []).filter(t => {
      if (term && term.length > (debouncedSearch || '').length) {
        const name = String(t?.name || '').toLowerCase();
        const sku = String(t?.sku || '').toLowerCase();
        const inv = String(t?.inventory_number || '').toLowerCase();
        const serial = String(t?.serial_number || '').toLowerCase();
        const loc = String(t?.location || '').toLowerCase();
        const nfc = String(t?.nfc_tag_id || '').toLowerCase();
        return name.includes(term) || sku.includes(term) || inv.includes(term) || serial.includes(term) || loc.includes(term) || nfc.includes(term);
      }
      return true;
    });

    if (!isEmployee) return base;

    const ids = Array.isArray(issuedTools) ? issuedTools.map(item => String(item.toolId)) : [];
    if (ids.length === 0) return [];
    const allowedIds = new Set(ids);
    return base.filter(t => allowedIds.has(String(t.id)));
  }, [tools, searchTerm, debouncedSearch, isEmployee, issuedTools]);

  // Get unique statuses and category tabs with counts, scoped for employees
  const statuses = useMemo(() => {
    const source = filteredTools;
    return [...new Set((source || []).map(tool => tool.status).filter(Boolean))];
  }, [filteredTools]);
  
  const { categoryCounts, allToolsCount } = useMemo(() => {
    if (isEmployee) {
      const source = filteredTools;
      if (!source) return { categoryCounts: {}, allToolsCount: 0 };
      const counts = {};
      const total = source.length;
      source.forEach(t => {
        const c = t?.category;
        if (!c) return;
        counts[c] = (counts[c] || 0) + 1;
      });
      return { categoryCounts: counts, allToolsCount: total };
    }

    const counts = {};
    let total = 0;
    if (Array.isArray(categoryStats)) {
      for (const row of categoryStats) {
        const name = row?.name;
        const cnt = Number(row?.tool_count || 0) || 0;
        if (!name) continue;
        counts[name] = cnt;
        total += cnt;
      }
    }
    return { categoryCounts: counts, allToolsCount: total };
  }, [filteredTools, isEmployee, categoryStats]);

  const categoriesWithCounts = useMemo(() => {
    const cats = Array.isArray(availableCategories) ? availableCategories : [];
    return [...cats].sort((a, b) => a.localeCompare(b)).map(name => ({ name, count: categoryCounts[name] || 0 }));
  }, [availableCategories, categoryCounts]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort tools
  const sortedTools = useMemo(() => {
    let sortable = [...filteredTools];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        // Special sorting for status: issued/permanent/partially_issued first
        if (sortConfig.key === 'status') {
          const priority = {
            'issued': 1,
            'permanent': 1,
            'partially_issued': 1,
            'available': 2,
            'service': 3,
            'damaged': 4
          };
          
          const pA = priority[a.status] || 99;
          const pB = priority[b.status] || 99;
          
          if (pA !== pB) {
            return sortConfig.direction === 'asc' ? pA - pB : pB - pA;
          }
          // If status is same, sort by name
          return (a.name || '').localeCompare(b.name || '');
        }

        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [filteredTools, sortConfig]);

  // Client-side view paging when the backend doesn't apply a limit
  const visibleSortedTools = useMemo(() => {
    return sortedTools;
  }, [sortedTools]);

  const handleEditTool = (tool) => {
    navigate(`/tools/edit/${tool.id}`);
  };

  const handleAddTool = () => {
    navigate('/tools/new');
  };

  // Open add tool modal with prefilled SKU from query param - REDIRECT TO NEW PAGE
  useEffect(() => {
    try {
      if (!canManageTools) return;
      const params = new URLSearchParams(location.search);
      const newSku = params.get('newSku');
      if (newSku) {
        // Navigate to new tool page with SKU (we might need to pass it via state or query param)
        // Since ToolsEditorScreen generates SKU automatically or we can pass it via state
        navigate('/tools/new', { state: { sku: newSku }, replace: true });
      }
    } catch (_) { /* noop */ }
  }, [location.search, canManageTools, navigate]);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll('button[data-cat]');
    let active = null;
    buttons.forEach((b) => { if ((b.dataset.cat || '') === (selectedCategory || '')) active = b; });
    if (active && typeof active.scrollIntoView === 'function') {
      try { active.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) { /* noop */ }
    }
  }, [selectedCategory]);

  // Listen for global refresh events
  useEffect(() => {
    const handler = async () => {
      await Promise.all([
        queryClient.invalidateQueries(['tools']),
        queryClient.invalidateQueries(['categories']),
        queryClient.invalidateQueries(['appConfig'])
      ]);
    };
    window.addEventListener('tools:categories:refresh', handler);
    window.addEventListener('tools:list:changed', handler);
    return () => {
      window.removeEventListener('tools:categories:refresh', handler);
      window.removeEventListener('tools:list:changed', handler);
    };
  }, [queryClient]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const openToolId = params.get('openToolId');
      if (!openToolId) return;

      const parsedId = Number(openToolId);
      handleOpenDetailsModal({ id: Number.isNaN(parsedId) ? openToolId : parsedId });

      params.delete('openToolId');
      const nextSearch = params.toString();
      navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
    } catch (_) { void 0; }
  }, [location.search, location.pathname, navigate, handleOpenDetailsModal]);

  if (!canViewTools) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Brak uprawnień</h3>
          <p className="text-slate-600 dark:text-slate-400">Brak uprawnień do przeglądania narzędzi (VIEW_TOOLS).</p>
        </div>
      </div>
    );
  }

  const loadingToolsList = toolsLoading || (isEmployee && issuedToolsLoading);

  // Fallback loading (after registering all hooks and fetchTools definition)
  if (loadingToolsList) {
    return (
      <div className="p-6">
        <SkeletonList rows={12} cols={8} />
      </div>
    );
  }

  return (
    <div className="px-6 pb-6 bg-white dark:bg-slate-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 sharp-text">{t('tools.header.title')}</h1>
          <p className="text-slate-600 dark:text-slate-400 sharp-text">{t('tools.header.subtitle')}</p>
        </div>
        {canManageTools && (
          <button
            onClick={handleAddTool}
            className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors sharp-text"
          >
            {t('tools.actions.add')}
          </button>
        )}
      </div>
      
      {/* Search and Filter Section */}
      <ToolsFilter
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setDebouncedSearch={setDebouncedSearch}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        categories={categoriesWithCounts}
        allToolsCount={allToolsCount}
        statuses={statuses}
        canExportTools={canExportTools}
        exportListToPDF={() => exportListToPDF(filteredTools, locale, t)}
        exportListToXLSX={() => exportListToXLSX(filteredTools, locale)}
        t={t}
        searchInputRef={searchInputRef}
      />

      {/* Tools List */}
      {loadingToolsList && !filteredTools.length ? (
        <div className="mt-6">
          <SkeletonList rows={8} cols={6} />
        </div>
      ) : filteredTools.length === 0 ? (
        <div className="p-8 text-center">
          <div className="text-slate-400 dark:text-slate-500 text-6xl mb-4">🔧</div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2 sharp-text">{t('tools.empty.title')}</h3>
          <p className="text-slate-600 dark:text-slate-400 sharp-text">
            {searchTerm || selectedCategory || selectedStatus 
              ? t('tools.empty.descFiltered')
              : t('tools.empty.descDefault')}
          </p>
        </div>
      ) : (
        <>
          <div className={`transition-opacity duration-200 ${loadingToolsList ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <ToolsTable
              tools={visibleSortedTools}
              sortConfig={sortConfig}
              handleSort={handleSort}
              t={t}
              handleRowClick={handleOpenDetailsModal}
              onToolHover={handleToolHover}
              onToolLeave={handleToolLeave}
              onActionsHover={handleActionsHover}
              onActionsLeave={handleActionsLeave}
              canManageTools={canManageTools}
              openNotify={handleOpenNotify}
              handleServiceReceiveFor={handleServiceReceiveFor}
              handleOpenServiceModal={handleOpenServiceModal}
              handleOpenModal={handleEditTool}
              openDeleteConfirm={openDeleteConfirm}
              notifyInfo={notifyInfo}
              notifyError={notifyError}
              handleIssue={handleOpenIssueModal}
              handleReturn={handleOpenReturnModal}
            />
          </div>
        </>
      )}

      {/* Global tooltip for issues (position: fixed) */}
      <ToolsTooltip
        tool={visibleSortedTools.find(t => t.id === hoveredToolId)}
        position={issueTooltipPos}
        onMouseEnter={handleTooltipEnter}
        onMouseLeave={handleTooltipLeave}
      />

      {/* Confirmation Modal: Delete Tool */}
      <ConfirmationModal
        isOpen={confirmDeleteOpen}
        onClose={closeDeleteConfirm}
        onConfirm={handleDeleteTool}
        type="danger"
        loading={confirmDeleteLoading}
        title={t('tools.actions.delete')}
        message={t('tools.confirm.deleteTool')}
        confirmText={t('confirmation.confirm')}
        cancelText={t('confirmation.cancel')}
      />
      {/* Service Modal */}
      <ToolsServiceModal
        isOpen={showServiceModal}
        onClose={handleCloseServiceModal}
        editingTool={editingTool}
        serviceFormData={serviceFormData}
        setServiceFormData={setServiceFormData}
        handleSendToService={handleSendToService}
        modalRef={serviceModalRef}
        t={t}
      />

      {/* Notify Return Modal */}
      <ToolsNotifyModal
        isOpen={notifyModal}
        onClose={handleCloseNotify}
        tool={notifyTool}
        onConfirm={handleConfirmNotify}
        isSending={notifySending}
        modalRef={notifyModalRef}
        t={t}
      />

      {/* Barcode Scanner */}
      {showBarcodeScanner && (
        <BarcodeScanner
          onScanResult={handleScanResult}
          onError={handleScanError}
        />
      )}

      {/* Tool Details Modal */}
      <ToolsDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          try {
            const params = new URLSearchParams(location.search);
            if (params.has('highlightSku')) {
              params.delete('highlightSku');
              const nextSearch = params.toString();
              navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
            }
          } catch (_) { void 0; }
          handleCloseDetailsModal();
        }}
        selectedTool={selectedTool}
        highlightSku={highlightSkuFromUrl}
        canExportTools={canExportTools}
        canManageTools={canManageTools}
        handleServiceReceive={handleServiceReceive}
        downloadQrLabel={downloadQrLabel}
        downloadBarcodeLabel={downloadBarcodeLabel}
        returnRequests={returnRequests}
        returnRequestsLoading={returnRequestsLoading}
        language={language}
        locale={locale}
        t={t}
        notifyInfo={notifyInfo}
        notifyError={notifyError}
      />

      {/* Issue Modal */}
      {issueModalOpen && selectedToolForIssue && (
        <ToolsIssueModal
          isOpen={true}
          onClose={handleCloseIssueModal}
          tool={selectedToolForIssue}
          employees={employees}
          onConfirm={handleConfirmIssue}
          showQuantity={Number(selectedToolForIssue?.available_quantity ?? selectedToolForIssue?.availableQuantity ?? selectedToolForIssue?.quantity ?? 1) > 1}
        />
      )}
      {/* Return Modal */}
      <ToolsReturnModal
        isOpen={returnModalOpen}
        onClose={handleCloseReturnModal}
        tool={selectedToolForReturn}
        apiClient={api}
        onConfirm={handleConfirmReturn}
      />
    </div>
  );
}

export default ToolsScreen;
