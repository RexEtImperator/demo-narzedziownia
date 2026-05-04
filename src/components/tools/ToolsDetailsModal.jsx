import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import ToolsSlingsItemsTable from './ToolsSlingsItemsTable';
import ToolsImpactSocketsItemsTable from './ToolsImpactSocketsItemsTable';
import ToolsDetectorsItemsTable from './ToolsDetectorsItemsTable';
import { formatDate, formatDateOnly } from '../../utils/dateUtils';
import { exportDetailsToPDF, exportDetailsToXLSX } from '../../utils/toolsExport';
import api from '../../api';

// QR Code Display Component
const QRCodeDisplay = ({ text, t }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    const generateQR = async () => {
      try {
        const url = await QRCode.toDataURL(text, {
          width: 300,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'H',
          quality: 1
        });
        setQrCodeUrl(url);
      } catch (error) {
        toast.error(error?.message || t('tools.qr.generateError'));
      }
    };

    if (text) {
      generateQR();
    }
  }, [text, t]);

  return (
    <div className="w-32 h-32 flex items-center justify-center border border-slate-200 rounded bg-white">
      {!qrCodeUrl ? (
        <div className="text-xs text-center text-slate-500">{t('tools.qr.generating')}</div>
      ) : (
        <img 
          src={qrCodeUrl} 
          alt={t('tools.qr.title')} 
          className="w-full h-full object-contain"
          style={{ imageRendering: 'crisp-edges' }}
        />
      )}
    </div>
  );
};

// Barcode Display Component
const BarcodeDisplay = ({ text, t }) => {
  const [barcodeUrl, setBarcodeUrl] = useState('');

  useEffect(() => {
    const generateBC = () => {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, text, {
          format: 'CODE128',
          width: 4,
          height: 100,
          fontSize: 16,
          margin: 10,
          font: 'Arial',
          fontOptions: 'bold'
        });
        setBarcodeUrl(canvas.toDataURL('image/png', 1.0));
      } catch (error) {
        toast.error(error?.message || t('tools.barcode.generateError'));
      }
    };

    if (text) {
      generateBC();
    }
  }, [text, t]);

  return (
    <div className="h-32 flex items-center justify-center border border-slate-200 rounded bg-white overflow-hidden">
      {!barcodeUrl ? (
        <div className="text-xs text-center text-slate-500">{t('tools.barcode.generating')}</div>
      ) : (
        <img 
          src={barcodeUrl} 
          alt={t('tools.barcode.title')} 
          className="max-h-full max-w-full object-contain"
          style={{ imageRendering: 'crisp-edges' }}
        />
      )}
    </div>
  );
};

const ToolsDetailsModal = ({
  isOpen,
  onClose,
  selectedTool,
  highlightSku,
  subAction,
  canExportTools,
  canManageTools,
  handleServiceReceive,
  downloadQrLabel,
  downloadBarcodeLabel,
  returnRequests,
  returnRequestsLoading,
  language,
  t,
  notifyInfo,
  notifyError
}) => {
  const [slingsStats, setSlingsStats] = useState(null);
  const [socketsStats, setSocketsStats] = useState(null);

  useEffect(() => {
    const fetchSlingsStats = async () => {
      if (!selectedTool || !['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(String(selectedTool.category || '').trim().toLowerCase())) {
        setSlingsStats(null);
        return;
      }

      try {
        const res = await api.get(`/api/slings/by-tool/${selectedTool.id}`);
        const items = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        
        const stats = {
          total: items.length,
          issued: items.filter(i => i.status === 'issued').length,
          permanent: items.filter(i => i.status === 'permanent').length,
          service: items.filter(i => i.status === 'service' || i.status === 'in_service').length,
          damaged: items.filter(i => i.status === 'damaged').length,
          available: items.filter(i => ['available', null, undefined, ''].includes(i.status)).length
        };
        
        setSlingsStats(stats);
      } catch (err) {
        console.error("Failed to fetch slings stats", err);
      }
    };

    if (isOpen && selectedTool) {
      fetchSlingsStats();
    }
  }, [selectedTool, isOpen]);

  useEffect(() => {
    const fetchSocketsStats = async () => {
      const cat = String(selectedTool?.category || '').trim().toLowerCase();
      if (!selectedTool || !['nasadki 1"', 'nasadki 1/2"'].includes(cat)) {
        setSocketsStats(null);
        return;
      }

      try {
        const res = await api.get(`/api/impact-sockets/by-tool/${selectedTool.id}`);
        const items = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);

        const totalQty = (items || []).reduce((acc, it) => acc + Math.max(0, Number(it.quantity || 0)), 0);
        const issuedQty = (items || []).reduce((acc, it) => acc + Math.max(0, Number(it.issued_quantity || 0)), 0);
        const availableQty = (items || []).reduce((acc, it) => acc + Math.max(0, Number(it.available_quantity ?? (Number(it.quantity || 0) - Number(it.issued_quantity || 0)))), 0);

        setSocketsStats({
          total: totalQty,
          issued: issuedQty,
          available: Math.max(0, availableQty)
        });
      } catch (err) {
        console.error('Failed to fetch sockets stats', err);
      }
    };

    if (isOpen && selectedTool) {
      fetchSocketsStats();
    }
  }, [selectedTool, isOpen]);

  if (!isOpen || !selectedTool) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 sharp-text">
            {t('tools.details.title')}: {selectedTool.name}
          </h2>
          <div className="flex items-center gap-3">
            {canExportTools && (
              <>
                <button
                  onClick={() => exportDetailsToPDF(selectedTool, language, t)}
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white rounded-lg dark:text-slate-700 hover:opacity-70 sharp-text text-sm font-medium"
                >
                  {t('common.export.PDF')}
                </button>
                <button
                  onClick={() => exportDetailsToXLSX(selectedTool, language)}
                  className="px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 sharp-text text-sm font-medium"
                >
                  {t('common.export.EXCEL')}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tool Information */}
            <div className="space-y-1">
              <div>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(() => {
                      const cat = String(selectedTool?.category || '').trim().toLowerCase();
                      const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
                      const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(cat);
                      const isDetectors = ['detektory'].includes(cat);
                      const hideSerialAndSku = isSlings || isSockets || isDetectors;

                      return (
                        <>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                      <span className="text-xs text-slate-400 dark:text-slate-400 sharp-text">{t('tools.details.inventoryNumber')}</span>
                      <span className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono sharp-text">
                        {selectedTool.inventory_number || '-'}
                      </span>
                    </div>
                    {!hideSerialAndSku && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                        <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.serialNumber')}</span>
                        <span className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono sharp-text">
                          {selectedTool.serial_unreadable ? t('tools.details.unreadable') : (selectedTool.serial_number || '-')}
                        </span>
                      </div>
                    )}
                    {!hideSerialAndSku && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                        <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.sku')}</span>
                        <span
                          className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono sharp-text cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title={t('common.copy')}
                          onClick={() => {
                            if (selectedTool?.sku) {
                              if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(selectedTool.sku)
                                  .then(() => notifyInfo(t('common.copied')))
                                  .catch(() => notifyError(t('tools.errors.copyFailed')));
                              } else {
                                try {
                                  const textArea = document.createElement('textarea');
                                  textArea.value = selectedTool.sku;
                                  textArea.style.position = 'fixed';
                                  textArea.style.left = '-9999px';
                                  document.body.appendChild(textArea);
                                  textArea.focus();
                                  textArea.select();
                                  document.execCommand('copy');
                                  document.body.removeChild(textArea);
                                  notifyInfo(t('common.copied'));
                                } catch (_err) {
                                  notifyError(t('tools.errors.copyFailed'));
                                }
                              }
                            }
                          }}
                        >
                          {selectedTool?.sku || '-'}
                        </span>
                      </div>
                    )}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                      <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.category')}</span>
                      <span className="text-base font-semibold text-slate-900 dark:text-slate-100 sharp-text">
                        {selectedTool.category || '-'}
                      </span>
                    </div>
                        </>
                      );
                    })()}
                    {['elektronarzędzia', 'akumulatorowe'].includes(String(selectedTool.category || '').trim().toLowerCase()) && (
                      <>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                          <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.manufacturer')}</span>
                          <span className="text-base font-semibold text-slate-900 dark:text-slate-100 sharp-text">
                            {selectedTool.manufacturer || '-'}
                          </span>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                          <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.model')}</span>
                          <span className="text-base font-semibold text-slate-900 dark:text-slate-100 sharp-text">
                            {selectedTool.model || '-'}
                          </span>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                          <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.productionYear')}</span>
                          <span className="text-base font-semibold text-slate-900 dark:text-slate-100 sharp-text">
                            {selectedTool.production_date
                              ? selectedTool.production_date
                              : (typeof selectedTool.production_year !== 'undefined' && selectedTool.production_year !== null)
                                ? String(selectedTool.production_year)
                                : '-'}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                      <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.location')}</span>
                      <span className="text-base font-semibold text-slate-900 dark:text-slate-100 sharp-text">
                        {selectedTool.location || '-'}
                      </span>
                    </div>
                  </div>

                  {String(selectedTool.category || '').trim().toLowerCase() === 'spawalnicze' && (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                        <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">{t('tools.details.inspectionDate')}</span>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-100 sharp-text">
                            {selectedTool.inspection_date
                              ? formatDateOnly(selectedTool.inspection_date)
                              : '-'}
                          </div>
                          {selectedTool.inspection_date && (() => {
                            const d = new Date(selectedTool.inspection_date);
                            const now = new Date();
                            const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                            const diffMs = startOfDate - startOfNow;
                            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

                            const dayWord = (n) => {
                              const langStr = String(language || 'PL').toLowerCase();
                              const isOne = Math.abs(n) === 1;
                              if (langStr === 'pl') return isOne ? 'dzień' : 'dni';
                              if (langStr === 'de') return isOne ? 'Tag' : 'Tage';
                              return isOne ? 'day' : 'days';
                            };

                            const statusClass =
                              diffDays < 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                : diffDays <= 30
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';

                            const label =
                              diffDays < 0
                                ? `${t('tools.details.overdue')} (${Math.abs(diffDays)} ${dayWord(diffDays)})`
                                : `${t('tools.details.inspectionDueIn')} ${diffDays} ${dayWord(diffDays)}`;

                            return (
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusClass} sharp-text`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text mt-1">
                      {t('tools.details.quantity')}
                    </span>
                    <div className="mt-2">
                      {(() => {
                      let total = 0, available = 0, issued = 0, permanent = 0, service = 0, damaged = 0;
                      const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(String(selectedTool.category || '').trim().toLowerCase());
                      const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(String(selectedTool.category || '').trim().toLowerCase());

                      if (isSlings && slingsStats) {
                         total = slingsStats.total;
                         available = slingsStats.available;
                         issued = slingsStats.issued;
                         permanent = slingsStats.permanent;
                         service = slingsStats.service;
                         damaged = slingsStats.damaged;
                      } else if (isSockets && socketsStats) {
                         total = socketsStats.total;
                         available = socketsStats.available;
                         issued = socketsStats.issued;
                      } else {
                         total = Number(selectedTool.quantity || 0) || 0;
                         service = Number(selectedTool.service_quantity || 0) || 0;
                         const issues = Array.isArray(selectedTool.issues) ? selectedTool.issues : [];
                         issued = issues.filter(i => i.status === 'issued').reduce((sum, it) => sum + (Number(it.quantity || 0) || 0), 0);
                         permanent = issues.filter(i => i.status === 'permanent').reduce((sum, it) => sum + (Number(it.quantity || 0) || 0), 0);
                         
                         if (typeof selectedTool.available_quantity !== 'undefined') {
                            available = selectedTool.available_quantity;
                         } else {
                            available = Math.max(0, total - service - issued - permanent);
                         }
                      }

                      const getPercent = (val) => total > 0 ? (val / total) * 100 : 0;

                      return (
                        <div className="w-full">
                          <div className="flex justify-between text-xs mb-1 sharp-text">
                            <span className="text-slate-900 dark:text-slate-100 font-medium">Dostępne: {available}</span>
                            <span className="text-slate-500 dark:text-slate-400">Ogólne: {total}</span>
                          </div>
                          <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
                            {issued > 0 && (
                              <div
                                className="h-full bg-yellow-100 dark:bg-yellow-900"
                                style={{ width: `${getPercent(issued)}%` }}
                                title={`${t('common.status.issued')}: ${issued}`}
                              />
                            )}
                            {permanent > 0 && (
                              <div
                                className="h-full bg-blue-100 dark:bg-blue-900"
                                style={{ width: `${getPercent(permanent)}%` }}
                                title={`${t('common.status.permanent')}: ${permanent}`}
                              />
                            )}
                            {service > 0 && (
                              <div
                                className="h-full bg-red-100 dark:bg-red-900"
                                style={{ width: `${getPercent(service)}%` }}
                                title={`${t('common.status.service')}: ${service}`}
                              />
                            )}
                            {damaged > 0 && (
                              <div
                                className="h-full bg-orange-100 dark:bg-orange-900"
                                style={{ width: `${getPercent(damaged)}%` }}
                                title={`${t('common.status.damaged')}: ${damaged}`}
                              />
                            )}
                            {available > 0 && (
                              <div
                                className="h-full bg-green-100 dark:bg-green-900"
                                style={{ width: `${getPercent(available)}%` }}
                                title={`${t('common.status.available')}: ${available}`}
                              />
                            )}
                          </div>
                          {(issued > 0 || permanent > 0 || service > 0) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              {issued > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-yellow-100 dark:bg-yellow-900" />
                                  {t('common.status.issued')}: {issued}
                                </div>
                              )}
                              {permanent > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-blue-100 dark:bg-blue-900" />
                                  {t('common.status.permanent')}: {permanent}
                                </div>
                              )}
                              {service > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-red-100 dark:bg-red-900" />
                                  {t('common.status.service')}: {service}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    </div>
                  </div>

                  {selectedTool.description && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400 sharp-text">
                        {t('tools.details.description')}
                      </span>
                      <p className="text-sm text-slate-900 dark:text-slate-100 mt-1 sharp-text">
                        {selectedTool.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Informacja o serwisie */}
              {(selectedTool.service_quantity || 0) > 0 && (
                <div className="pt-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 sharp-text">{t('tools.details.serviceTitle')}</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-200 sharp-text">{t('tools.details.inService')}: <span className="font-medium">{selectedTool.service_quantity}</span> {t('tools.details.pieces')}</p>
                    {selectedTool.service_order_number && (
                      <p className="text-sm text-slate-700 dark:text-slate-200 sharp-text">{t('tools.details.orderNumber')}: <span className="font-mono">{selectedTool.service_order_number}</span></p>
                    )}
                    {selectedTool.status === 'service' && selectedTool.service_sent_at && (
                      <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 sharp-text">{t('tools.details.sentDate')}: {formatDate(selectedTool.service_sent_at)}</p>
                    )}
                    <div className="pt-2">
                      {canManageTools && (
                        <button
                          onClick={handleServiceReceive}
                          className="px-3 py-1.5 bg-green-600 dark:bg-green-700 text-white rounded-lg text-sm hover:bg-green-700 dark:hover:bg-green-800 sharp-text"
                        >
                          {t('tools.actions.serviceReceived')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {Array.isArray(selectedTool.issues) && selectedTool.issues.some(i => ['issued', 'permanent', 'partially_issued'].includes(i.status)) && (
                <div className="pt-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-700">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 sharp-text">{t('tools.details.issuesTitle')}</h3>
                    <div className="space-y-2">
                      {selectedTool.issues.filter(i => ['issued', 'permanent', 'partially_issued'].includes(i.status)).map((it, idx) => {
                        const name = `${it.employee_first_name || ''} ${it.employee_last_name || ''}`.trim();
                        const brandValue = it.employee_brand_number;
                        const hasBrand = brandValue !== null && brandValue !== undefined && String(brandValue).trim() !== '';
                        const qty = Number(it.quantity || 0) || 0;
                        const qParam = hasBrand ? String(brandValue).trim() : name;
                        return (
                          <div key={`${it.id || idx}-${it.employee_id || idx}`} className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                              <div className="text-md text-slate-700 dark:text-slate-200 sharp-text">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono sharp-text cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); try { window.dispatchEvent(new CustomEvent('navigate', { detail: { url: `/employees?q=${encodeURIComponent(qParam)}` } })); } catch (_) { void 0; } }}
                                >
                                  {hasBrand ? (
                                    <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white dark:bg-indigo-500">
                                      {String(brandValue).trim()}
                                    </span>
                                  ) : null}
                                  <span>{name || t('tools.details.unknownUser')}</span>
                                </button>
                              </div>
                              <div className="text-md text-slate-600 dark:text-slate-300 sharp-text">
                                {t('tools.details.issued')}: <span className="font-medium">{qty}</span> {t('tools.details.pieces')}
                                {it.issued_at && (
                                <div className="text-xs text-slate-500 dark:text-slate-300 sharp-text">
                                  {formatDate(it.issued_at)}
                                </div>
                                )}
                              </div>

                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {(() => {
                const cat = String(selectedTool?.category || '').trim().toLowerCase();
                const hideCodes = ['zawiesia pasowe', 'zawiesia łańcuchowe', 'nasadki 1"', 'nasadki 1/2"', 'detektory'].includes(cat);
                if (!canManageTools || hideCodes) return null;

                return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 sharp-text">{t('tools.qr.title')}</h3>
                  <button
                    onClick={() => downloadQrLabel(selectedTool)}
                    aria-label={t('tools.qr.downloadLabel')}
                    title={t('tools.qr.downloadLabel')}
                    className="bg-blue-600 dark:bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors flex items-center justify-center sharp-text"
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                    <span className="sr-only">{t('tools.qr.downloadLabel')}</span>
                  </button>
                </div>
                <div className="flex justify-center">
                  <QRCodeDisplay text={selectedTool?.qr_code || ''} t={t} />
                </div>
              </div>
                );
              })()}
              {(() => {
                const cat = String(selectedTool?.category || '').trim().toLowerCase();
                const hideCodes = ['zawiesia pasowe', 'zawiesia łańcuchowe', 'nasadki 1"', 'nasadki 1/2"', 'detektory'].includes(cat);
                if (!canManageTools || hideCodes) return null;

                return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 sharp-text">{t('tools.barcode.title')}</h3>
                  <button
                    onClick={() => downloadBarcodeLabel(selectedTool)}
                    aria-label={t('tools.barcode.downloadLabel')}
                    title={t('tools.barcode.downloadLabel')}
                    className="bg-blue-600 dark:bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors flex items-center justify-center sharp-text"
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                    <span className="sr-only">{t('tools.barcode.downloadLabel')}</span>
                  </button>
                </div>
              <div className="flex justify-center">
                <BarcodeDisplay text={selectedTool?.barcode || ''} t={t} />
              </div>
            </div>
                );
              })()}
            {canManageTools && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 sharp-text">{t('tools.returnRequests.title') || 'Historia wysyłania prośby zwrotu'}</h3>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-3 max-h-60 overflow-y-auto">
                  {returnRequestsLoading ? (
                    <div className="text-sm text-slate-600 dark:text-slate-300 sharp-text">{t('common.loading') || 'Ładowanie…'}</div>
                  ) : (returnRequests || []).length === 0 ? (
                    <div className="text-sm text-slate-600 dark:text-slate-300 sharp-text">{t('tools.returnRequests.empty') || 'Brak historii'}</div>
                  ) : (
                    <ul className="space-y-2">
                      {returnRequests.map(rr => (
                        <li key={rr.id} className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm text-slate-900 dark:text-slate-100 sharp-text">{rr.recipient_name || t('common.user')}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-300 sharp-text">{t('common.sent') || 'Wysłano'}: {formatDate(rr.created_at)}</div>
                            {rr.read && rr.read_at && (
                              <div className="text-xs text-slate-500 dark:text-slate-300 sharp-text">{t('common.read') || 'Przeczytano'}: {formatDate(rr.read_at)}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>

          {['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(String(selectedTool.category || '').trim().toLowerCase()) && (
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <ToolsSlingsItemsTable 
                     toolId={selectedTool.id} 
                     category={selectedTool.category} 
                     t={t} 
                     canManage={canManageTools}
                     highlightSku={highlightSku}
                     autoAction={subAction}
                  />
              </div>
          )}

          {['nasadki 1"', 'nasadki 1/2"'].includes(String(selectedTool.category || '').trim().toLowerCase()) && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <ToolsImpactSocketsItemsTable
                toolId={selectedTool.id}
                category={selectedTool.category}
                t={t}
                canManage={canManageTools}
                highlightSku={highlightSku}
                autoAction={subAction}
              />
            </div>
          )}

          {['detektory'].includes(String(selectedTool.category || '').trim().toLowerCase()) && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <ToolsDetectorsItemsTable toolId={selectedTool.id} t={t} canManage={canManageTools} highlightSku={highlightSku} autoAction={subAction} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolsDetailsModal;
