import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  EnvelopeIcon, 
  ArrowDownOnSquareIcon, 
  WrenchIcon, 
  PencilSquareIcon, 
  TrashIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { getToolStatusInfo } from '../../utils/statusUtils';

// Memoized Row Component
const ToolRow = React.memo(({ 
  tool, 
  t, 
  handleRowClick, 
  onToolHover, 
  onToolLeave, 
  onActionsHover, 
  onActionsLeave, 
  canManageTools, 
  openNotify, 
  handleServiceReceiveFor, 
  handleOpenServiceModal, 
  handleOpenModal, 
  openDeleteConfirm, 
  handleCopySku,
  handleIssue,
  handleReturn,
  openDropdownId,
  toggleDropdown,
  dropdownPosition,
  dropdownRef
}) => {
  const { statusBorderColor, displayStatus } = getToolStatusInfo(tool);
  const isOpen = openDropdownId === tool.id;
  const toolStatus = String(tool?.status || '').trim().toLowerCase();
  const issuedQty = Number(tool?.issued_quantity ?? tool?.issuedQuantity ?? 0) || 0;
  const availableQty = (() => {
    const fromApi = tool?.available_quantity ?? tool?.availableQuantity;
    if (typeof fromApi !== 'undefined' && fromApi !== null) {
      return Math.max(0, Number(fromApi) || 0);
    }
    if (toolStatus === 'issued' || toolStatus === 'permanent') {
      return 0;
    }
    return Math.max(0, (Number(tool?.quantity || 0) || 0) - issuedQty);
  })();

  const getButtonColorClasses = (status) => {
    switch(status) {
      case 'available':
        return 'from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 border-emerald-700/20';
      case 'issued':
        return 'from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 border-amber-600/20';
      case 'partially_issued':
        return 'from-lime-500 to-lime-400 hover:from-lime-600 hover:to-lime-500 border-lime-600/20';
      case 'permanent':
        return 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 border-blue-700/20';
      case 'service':
        return 'from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 border-rose-700/20';
      case 'damaged':
        return 'from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 border-orange-700/20';
      default: // unknown, missing
        return 'from-slate-600 to-slate-500 hover:from-slate-700 hover:to-slate-600 border-slate-700/20';
    }
  };

  const buttonColorClasses = getButtonColorClasses(displayStatus);

  return (
    <tr 
      className="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
      onClick={() => handleRowClick(tool)}
      style={{ borderLeft: '4px solid', borderLeftColor: statusBorderColor }}
    >
      <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-sm sharp-text">{tool.display_inventory_number || tool.inventory_number || '-'}</td>
      <td
        className="p-4"
        data-name-cell="true"
        onMouseEnter={(e) => onToolHover(tool, e)}
        onMouseLeave={onToolLeave}
      >
        <div className="font-medium text-slate-900 dark:text-slate-100 sharp-text">{tool.name}</div>
        {tool.description && (
          <div className="text-sm text-slate-500 dark:text-slate-400 sharp-text">{tool.description}</div>
        )}
      </td>
      <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-sm sharp-text">{tool.serial_number || (tool.serial_unreadable ? t('tools.table.unreadableSerial') : '-')}</td>
      <td className="p-4 text-slate-600 dark:text-slate-300 sharp-text">{tool.category || '-'}</td>
      
      <td className="p-4 text-slate-600 dark:text-slate-300 sharp-text">{tool.location || '-'}</td>
      <td 
        className="p-4 text-slate-600 dark:text-slate-300 font-mono text-sm sharp-text cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        title={t('common.copy')}
        onClick={(e) => handleCopySku(e, tool.sku)}
      >
        {tool.display_sku || tool.sku || '-'}
      </td>
      <td
        className="p-4"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onActionsHover}
        onMouseLeave={onActionsLeave}
      >
        {canManageTools ? (
          <div className="relative">
            <div className="flex rounded-md shadow-sm">
              {(() => {
                const cat = String(tool.category || '').trim().toLowerCase();
                const disableIssueByCategory = ['zawiesia pasowe', 'zawiesia łańcuchowe', 'nasadki 1"', 'nasadki 1/2"', 'detektory'].includes(cat);
                const showPrimaryReturn =
                  displayStatus !== 'service' &&
                  (toolStatus === 'issued' || toolStatus === 'permanent' || (toolStatus === 'partially_issued' && availableQty <= 0));

                const isDisabled = !showPrimaryReturn && displayStatus !== 'service' && (disableIssueByCategory || availableQty <= 0);
                const issueDisabledTitle = disableIssueByCategory
                  ? (cat.includes('nasadki')
                      ? 'Wydawanie zablokowane dla tej kategorii. Użyj podpozycji.'
                      : 'Wydawanie zablokowane dla tej kategorii. Użyj podpozycji.')
                  : (availableQty <= 0 ? 'Brak dostępnej ilości do wydania.' : '');

                return (
              <button 
                disabled={isDisabled}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (displayStatus === 'service') handleServiceReceiveFor(tool);
                  else if (showPrimaryReturn) handleReturn(tool);
                  else handleIssue(tool);
                }} 
                className={`px-3 py-1.5 text-sm font-medium rounded-l-md transition-all shadow-sm bg-gradient-to-r text-white ${buttonColorClasses} ${isDisabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                title={
                  displayStatus === 'service'
                    ? 'Odbierz z serwisu'
                    : (showPrimaryReturn ? 'Zwróć' : (isDisabled ? issueDisabledTitle : 'Wydaj'))
                }
              >
                {displayStatus === 'service' ? 'Odbierz' : (showPrimaryReturn ? 'Zwróć' : 'Wydaj')}
              </button>
                );
              })()}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  const rect = e.currentTarget.getBoundingClientRect();
                  const itemsHeight = 44;
                  const dividerHeight = 9;
                  const paddingHeight = 23;
                  let itemsCount = 0;

                  if (['issued', 'partially_issued', 'permanent'].includes(tool.status)) itemsCount += 2;

                  if ((tool.service_quantity || 0) > 0 && displayStatus !== 'service') itemsCount += 1;
                  else if ((tool.service_quantity || 0) <= 0) itemsCount += 1;

                  itemsCount += 2;

                  const estimatedMenuHeight = (itemsCount * itemsHeight) + dividerHeight + paddingHeight;
                  toggleDropdown(tool.id, rect, estimatedMenuHeight); 
                }}
                onMouseDown={(e) => e.stopPropagation()} 
                className={`px-1 py-1.5 border-l rounded-r-md transition-all shadow-sm bg-gradient-to-r text-white ${buttonColorClasses}`}
              >
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isOpen && createPortal(
              <div 
                ref={dropdownRef}
                style={{
                  position: 'absolute',
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  zIndex: 9999
                }}
                className="w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {(['partially_issued', 'permanent'].includes(tool.status)) && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReturn(tool); toggleDropdown(null); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                    >
                      <ArrowDownIcon className="h-4 w-4" />
                      {t('tools.actions.return') || 'Zwróć'}
                    </button>
                  </>
                )}
                {(['issued', 'partially_issued', 'permanent'].includes(tool.status)) && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); openNotify(tool); toggleDropdown(null); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                    >
                      <EnvelopeIcon className="h-4 w-4" />
                      {t('tools.actions.notifyReturn')}
                    </button>
                  </>
                )}
                
                {(tool.service_quantity || 0) > 0 && displayStatus !== 'service' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleServiceReceiveFor(tool); toggleDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-green-700 dark:text-green-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                  >
                    <ArrowDownOnSquareIcon className="h-4 w-4" />
                    {t('tools.actions.receiveFromService')}
                  </button>
                ) : (tool.service_quantity || 0) <= 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenServiceModal(tool); toggleDropdown(null); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                  >
                    <WrenchIcon className="h-4 w-4" />
                    {t('tools.actions.service')}
                  </button>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenModal(tool); toggleDropdown(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  {t('tools.actions.edit')}
                </button>

                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />

                <button
                  onClick={(e) => { e.stopPropagation(); openDeleteConfirm(tool.id); toggleDropdown(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                  {t('tools.actions.delete')}
                </button>
              </div>,
              document.body
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('BHP.actions.noPermission')}</span>
        )}
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.tool.id === nextProps.tool.id &&
    prevProps.tool.updated_at === nextProps.tool.updated_at &&
    prevProps.tool.status === nextProps.tool.status &&
    prevProps.canManageTools === nextProps.canManageTools &&
    prevProps.t === nextProps.t &&
    prevProps.openDropdownId === nextProps.openDropdownId // Important for dropdown toggle re-render
  );
});

// Memoized Mobile Row Component
const MobileToolRow = React.memo(({ tool, t, handleRowClick, openToolWithHighlight }) => {
  const { statusBorderColor } = getToolStatusInfo(tool);
  return (
    <div
      className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
      onClick={() => handleRowClick(tool)}
      style={{ borderLeft: '4px solid', borderLeftColor: statusBorderColor }}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100 sharp-text">{tool.name}</div>
          {tool.description && (
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 sharp-text">{tool.description}</div>
          )}
        </div>
      </div>
        <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400 sharp-text">{t('tools.mobile.labels.inventoryNumber')}:</span>
          <span className="text-slate-900 dark:text-slate-100 font-mono text-xs sharp-text">{tool.inventory_number || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400 sharp-text">{t('tools.mobile.labels.serialNumber')}:</span>
          <span className="text-slate-900 dark:text-slate-100 font-mono text-xs sharp-text">{tool.serial_number || (tool.serial_unreadable ? t('tools.table.unreadableSerial') : '-')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400 sharp-text">{t('tools.mobile.labels.category')}:</span>
          <span className="text-slate-900 dark:text-slate-100 sharp-text">{tool.category || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400 sharp-text">{t('tools.mobile.labels.location')}:</span>
          <span className="text-slate-900 dark:text-slate-100 sharp-text">{tool.location || '-'}</span>
        </div>
      </div>

      {Array.isArray(tool.search_matches) && tool.search_matches.length > 0 ? (
        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          {tool.search_matches.slice(0, 10).map((m, idx) => {
            const sku = String(m?.sku || '').trim();
            const inv = String(m?.inventory_number || '').trim();
            const sn = String(m?.serial_number || '').trim();
            const kind = String(m?.kind || '').trim();
            const size = String(m?.size || '').trim();
            const type = String(m?.type || '').trim();
            const status = String(m?.status || '').trim().toLowerCase();
            const issuedQty = Number(m?.issued_quantity || 0) || 0;
            const isIssued = status === 'issued' || issuedQty > 0;
            const text = sku || inv || sn || '';
            const detail = [type, kind, size].filter(Boolean).join(' • ');
            if (!text && !detail) return null;
            return (
              <div
                key={`${tool.id}-m-${idx}-${text || detail}`}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                title={String(m?.source || '')}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-slate-800 dark:text-slate-100">{text || '-'}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-300">{String(m?.source || '').replace(/_/g, ' ')}</span>
                </div>
                {detail ? (
                  <div className="text-xs text-slate-600 dark:text-slate-200 mt-1 sharp-text">{detail}</div>
                ) : null}
                <div className="mt-2 flex items-center gap-3">
                  {isIssued ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof openToolWithHighlight === 'function') openToolWithHighlight(tool, sku, 'return');
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm bg-gradient-to-r text-white from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 border border-amber-600/20"
                    >
                      {t?.('tools.actions.return') || 'Zwróć'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof openToolWithHighlight === 'function') openToolWithHighlight(tool, sku, 'issue');
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm bg-gradient-to-r text-white from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 border border-emerald-700/20"
                    >
                      {t?.('common.issue') || 'Wydaj'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

ToolRow.displayName = 'ToolRow';
MobileToolRow.displayName = 'MobileToolRow';

const ToolsTable = ({ 
  tools, 
  t, 
  onToolHover, 
  onToolLeave,
  onActionsHover,
  onActionsLeave,
  sortConfig,
  handleSort,
  handleRowClick,
  setHighlightSku,
  canManageTools,
  openNotify,
  handleServiceReceiveFor,
  handleOpenServiceModal,
  handleOpenModal,
  openDeleteConfirm,
  notifyInfo,
  notifyError,
  handleIssue,
  handleReturn
}) => {
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!openDropdownId) return;
    const handleScroll = (event) => {
      const dropdownEl = dropdownRef.current;
      if (dropdownEl && event?.target && dropdownEl.contains(event.target)) return;
      setOpenDropdownId(null);
    };
    const handleResize = () => setOpenDropdownId(null);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [openDropdownId]);

  const toggleDropdown = (id, rect, estimatedMenuHeightOverride) => {
    if (openDropdownId === id) {
      setOpenDropdownId(null);
    } else {
      if (rect) {
        const menuWidth = 224;
        const gap = 4;
        const estimatedMenuHeight = Number.isFinite(estimatedMenuHeightOverride)
          ? estimatedMenuHeightOverride
          : 200;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const desiredLeft = rect.right + scrollX - menuWidth;
        const minLeft = scrollX + 8;
        const maxLeft = scrollX + window.innerWidth - menuWidth - 8;
        const clampedLeft = Math.min(Math.max(desiredLeft, minLeft), Math.max(minLeft, maxLeft));
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUp = estimatedMenuHeight > spaceBelow && spaceAbove > spaceBelow;
        const desiredTop = openUp
          ? (rect.top + scrollY - estimatedMenuHeight - gap)
          : (rect.bottom + scrollY + gap);
        const minTop = scrollY + 8;
        setDropdownPosition({
          top: Math.max(desiredTop, minTop),
          left: clampedLeft,
          placement: openUp ? 'top' : 'bottom'
        });
      }
      setOpenDropdownId(id);
    }
  };

  const handleCopySku = React.useCallback((e, sku) => {
    e.preventDefault();
    e.stopPropagation();
    if (sku) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sku)
          .then(() => notifyInfo(t('common.copied')))
          .catch(() => notifyError(t('tools.errors.copyFailed') || 'Błąd kopiowania'));
      } else {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = sku;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          notifyInfo(t('common.copied'));
        } catch (_) {
          notifyError(t('tools.errors.copyFailed') || 'Błąd kopiowania');
        }
      }
    }
  }, [notifyInfo, notifyError, t]);

  const safeOnToolHover = React.useCallback((tool, e) => {
    if (typeof onToolHover === 'function') onToolHover(tool, e);
  }, [onToolHover]);

  const safeOnToolLeave = React.useCallback(() => {
    if (typeof onToolLeave === 'function') onToolLeave();
  }, [onToolLeave]);

  const safeOnActionsHover = React.useCallback(() => {
    if (typeof onActionsHover === 'function') onActionsHover();
  }, [onActionsHover]);

  const safeOnActionsLeave = React.useCallback(() => {
    if (typeof onActionsLeave === 'function') onActionsLeave();
  }, [onActionsLeave]);

  const openToolWithHighlight = React.useCallback((tool, sku, action) => {
    try {
      handleRowClick(tool);
    } catch (_) { void 0; }
    const s = String(sku || '').trim();
    if (typeof setHighlightSku === 'function' && s) {
      try {
        setHighlightSku(s, action);
      } catch (_) { void 0; }
    }
  }, [handleRowClick, setHighlightSku]);

  const renderSubItemRow = React.useCallback((tool, m, idx) => {
    const sku = String(m?.sku || '').trim();
    const inv = String(m?.inventory_number || '').trim();
    const sn = String(m?.serial_number || '').trim();
    const kind = String(m?.kind || '').trim();
    const size = String(m?.size || '').trim();
    const type = String(m?.type || '').trim();
    const source = String(m?.source || '').trim();
    const status = String(m?.status || '').trim().toLowerCase();
    const issuedQty = Number(m?.issued_quantity || 0) || 0;
    const isIssued = status === 'issued' || issuedQty > 0;

    const isSockets = source === 'nasadki_1' || source === 'nasadki_12';
    const isSlings = source === 'zawiesia łańcuchowe' || source === 'zawiesia pasowe';
    
    const totalQty = Math.max(0, Number(m?.quantity ?? 0) || 0);
    const availableQty = Math.max(0, Number(m?.available_quantity ?? (totalQty - issuedQty)) || 0);

    const invCell = inv || '-';
    const serialCell = sn || '-';
    const nameLine = (type || kind) ? [type, kind].filter(Boolean).join(' • ') : (t?.('tools.details.subItem') || 'Podpozycja');
    const detailLine = [source ? source.replace(/_/g, ' ') : '', size].filter(Boolean).join(' • ');
    const statusForBadge = status || (isIssued ? 'issued' : 'available');
    const statusBadgeClass = statusForBadge === 'available'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
      : statusForBadge === 'issued'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
        : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';

    return (
      <tr
        key={`${tool.id}-sub-${idx}-${sku || inv || sn || source}`}
        className="bg-slate-50/70 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openToolWithHighlight(tool, sku);
        }}
      >
        <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-sm sharp-text">{isSockets ? '-' : invCell}</td>
        <td className="p-4">
          <div className="font-medium text-slate-800 dark:text-slate-100 sharp-text">
            {isSockets ? (kind || t?.('tools.details.subItem') || 'Podpozycja') : nameLine}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 sharp-text">
            {isSockets ? (size || (source ? source.replace(/_/g, ' ') : '')) : (detailLine || '')}
          </div>
        </td>
        <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-sm sharp-text">
          {isSockets ? (
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-500 dark:text-slate-300 sharp-text">{t?.('tools.details.totalQty') || 'Ogółem'}</span>
              <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{totalQty}</span>
            </div>
          ) : (
            serialCell
          )}
        </td>
        <td className="p-4 text-slate-600 dark:text-slate-300 sharp-text">
          {isSockets || isSlings ? (
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-500 dark:text-slate-300 sharp-text">{t?.('tools.details.issuedQty') || 'Wydane'}</span>
              <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{issuedQty}</span>
            </div>
          ) : (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass}`}>
              {t?.(`common.status.${statusForBadge}`) || statusForBadge}
            </span>
          )}
        </td>
        <td className="p-4 text-slate-600 dark:text-slate-300 sharp-text">
          {isSockets ? (
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-500 dark:text-slate-300 sharp-text">{t?.('tools.details.availableQty') || 'Dostępne'}</span>
              <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{availableQty}</span>
            </div>
          ) : (
            '-'
          )}
        </td>
        <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-sm sharp-text">{sku || '-'}</td>
        <td className="p-4">
          {(() => {
            const canReturn = isSockets ? issuedQty > 0 : isIssued;
            const canIssue = isSockets ? availableQty > 0 : !isIssued;

            if (canIssue && canReturn) {
              return (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openToolWithHighlight(tool, sku, 'issue');
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm bg-gradient-to-r text-white from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 border border-emerald-700/20"
                  >
                    {t?.('common.issue') || 'Wydaj'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openToolWithHighlight(tool, sku, 'return');
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm bg-gradient-to-r text-white from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 border border-amber-600/20"
                  >
                    {t?.('tools.actions.return') || 'Zwróć'}
                  </button>
                </div>
              );
            }

            if (canReturn) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openToolWithHighlight(tool, sku, 'return');
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm bg-gradient-to-r text-white from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 border border-amber-600/20"
                >
                  {t?.('tools.actions.return') || 'Zwróć'}
                </button>
              );
            }

            if (canIssue) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openToolWithHighlight(tool, sku, 'issue');
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm bg-gradient-to-r text-white from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 border border-emerald-700/20"
                >
                  {t?.('common.issue') || 'Wydaj'}
                </button>
              );
            }

            return null;
          })()}
        </td>
      </tr>
    );
  }, [openToolWithHighlight, t]);

  return (
    <>
      <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700 border-l-4 border-slate-50 dark:border-slate-700">
            <tr>
              <th 
                onClick={() => handleSort('inventory_number')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('tools.table.headers.inventoryNumberShort')}
                  {sortConfig.key === 'inventory_number' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('name')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('tools.table.headers.name')}
                  {sortConfig.key === 'name' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('serial_number')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('tools.table.headers.serialNumber')}
                  {sortConfig.key === 'serial_number' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('category')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('tools.table.headers.category')}
                  {sortConfig.key === 'category' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('location')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('tools.table.headers.location')}
                  {sortConfig.key === 'location' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('sku')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('tools.table.headers.sku')}
                  {sortConfig.key === 'sku' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 sharp-text">{t('tools.table.headers.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
            {tools.map((tool) => (
              <React.Fragment key={tool.id}>
                <ToolRow 
                  tool={tool}
                  t={t}
                  handleRowClick={handleRowClick}
                  onToolHover={safeOnToolHover}
                  onToolLeave={safeOnToolLeave}
                  onActionsHover={safeOnActionsHover}
                  onActionsLeave={safeOnActionsLeave}
                  canManageTools={canManageTools}
                  openNotify={openNotify}
                  handleServiceReceiveFor={handleServiceReceiveFor}
                  handleOpenServiceModal={handleOpenServiceModal}
                  handleOpenModal={handleOpenModal}
                  openDeleteConfirm={openDeleteConfirm}
                  handleCopySku={handleCopySku}
                  handleIssue={handleIssue}
                  handleReturn={handleReturn}
                  openDropdownId={openDropdownId}
                  toggleDropdown={toggleDropdown}
                  dropdownPosition={dropdownPosition}
                  dropdownRef={dropdownRef}
                />
                {Array.isArray(tool.search_matches) && tool.search_matches.length > 0 ? (
                  tool.search_matches.slice(0, 20).map((m, idx) => renderSubItemRow(tool, m, idx))
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {Array.isArray(tools) && tools.length > 0 ? (
          tools.map((tool) => (
            <MobileToolRow 
              key={tool.id}
              tool={tool}
              t={t}
              handleRowClick={handleRowClick}
              openToolWithHighlight={openToolWithHighlight}
            />
          ))
        ) : (
          <div className="text-center py-4 text-slate-500 dark:text-slate-400">
            {t('tools.table.noTools')}
          </div>
        )}
      </div>
    </>
  );
};

ToolsTable.displayName = 'ToolsTable';

export default ToolsTable;
