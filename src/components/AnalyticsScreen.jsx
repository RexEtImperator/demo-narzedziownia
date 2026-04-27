import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatDateOnly, formatDate } from '../utils/dateUtils';
import { PERMISSIONS, hasPermission } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

function AnalyticsScreen({ tools, user }) {
  const { t, language } = useLanguage();
  const localeMap = { pl: 'pl-PL', en: 'en-GB', de: 'de-DE' };
  const canViewAnalytics = hasPermission(user, PERMISSIONS.VIEW_ANALYTICS);
  const [bhpItems, setBhpItems] = useState([]);
  const [bhpLoading, setBhpLoading] = useState(false);
  const [bhpPermissionDenied, setBhpPermissionDenied] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [serviceSummary, setServiceSummary] = useState({ in_service: [], recent_events: [] });
  const [serviceLoading, setServiceLoading] = useState(false);
  const [svcPage, setSvcPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Ensure the page number is within range after data change or page size change
  useEffect(() => {
    const svcTotal = Math.max(1, Math.ceil((serviceSummary.in_service?.length || 0) / pageSize));
    const evTotal = Math.max(1, Math.ceil((serviceSummary.recent_events?.length || 0) / pageSize));
    setSvcPage(p => Math.min(Math.max(1, p), svcTotal));
    setEventsPage(p => Math.min(Math.max(1, p), evTotal));
  }, [serviceSummary, pageSize]);

  const exportServiceHistoryToPDF = () => {
    const stamp = new Date().toLocaleString(localeMap[language] || undefined);
    const inServiceRows = (serviceSummary.in_service || []).map(item => ([
      item.name || '-',
      item.sku || '-',
      (item.service_quantity ?? '-') + ' szt.',
      item.service_order_number || '-',
      item.service_sent_at ? formatDate(item.service_sent_at) : '-'
    ]));
    const recentRows = (serviceSummary.recent_events || []).map(ev => ([
      ev.name || '-',
      ev.sku || '-',
      (ev.action === 'sent' ? t('analytics.serviceHistory.action.sent') : t('analytics.serviceHistory.action.received')),
      (ev.quantity ?? '-') + ' szt.',
      ev.order_number || '-',
      ev.created_at ? formatDate(ev.created_at) : '-'
    ]));

    const inServiceTable = `
      <h2>${t('analytics.serviceHistory.inService')}</h2>
      <table>
        <thead><tr>
          <th>${t('analytics.serviceHistory.headers.tool')}</th><th>${t('analytics.serviceHistory.headers.sku')}</th><th>${t('analytics.serviceHistory.headers.quantity')}</th><th>${t('analytics.serviceHistory.headers.orderNumber')}</th><th>${t('analytics.serviceHistory.headers.sent')}</th>
        </tr></thead>
        <tbody>
          ${inServiceRows.map(r => `<tr>${r.map(c => `<td>${String(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="5">${t('analytics.serviceHistory.noData')}</td></tr>`}
        </tbody>
      </table>`;

    const recentTable = `
      <h2>${t('analytics.serviceHistory.recentEvents')}</h2>
      <table>
        <thead><tr>
          <th>${t('analytics.serviceHistory.headers.tool')}</th><th>${t('analytics.serviceHistory.headers.sku')}</th><th>${t('analytics.serviceHistory.headers.action')}</th><th>${t('analytics.serviceHistory.headers.quantity')}</th><th>${t('analytics.serviceHistory.headers.orderNumber')}</th><th>${t('analytics.serviceHistory.headers.date')}</th>
        </tr></thead>
        <tbody>
          ${recentRows.map(r => `<tr>${r.map(c => `<td>${String(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="6">${t('analytics.serviceHistory.noData')}</td></tr>`}
        </tbody>
      </table>`;

    const html = `
      <html><head><meta charset="utf-8" />
      <title>${t('analytics.serviceHistory.title')}</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        h2 { font-size: 16px; margin: 16px 0 8px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead th { background: #f3f4f6; color: #111827; text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
        tbody td { padding: 8px; border-bottom: 1px solid #eee; }
        tbody tr:nth-child(even) td { background: #fafafa; }
        @page { size: A4; margin: 12mm; }
      </style>
      </head>
      <body>
        <h1>${t('analytics.serviceHistory.title')}</h1>
        <div class="meta">${t('analytics.serviceHistory.generatedAt')}: ${stamp}</div>
        ${inServiceTable}
        ${recentTable}
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return toast.error(t('common.popupBlocked'));
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const downloadBlob = (filename, mime, content) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportServiceHistoryToXLSX = () => {
    const inServiceHeaders = [t('analytics.serviceHistory.headers.tool'), t('analytics.serviceHistory.headers.sku'), t('analytics.serviceHistory.headers.quantity'), t('analytics.serviceHistory.headers.orderNumber'), t('analytics.serviceHistory.headers.sent')];
    const inServiceRows = (serviceSummary.in_service || []).map(item => [
      item.name || '',
      item.sku || '',
      item.service_quantity ?? '',
      item.service_order_number || '',
      item.service_sent_at ? formatDate(item.service_sent_at) : ''
    ]);
    const inServiceAoA = [inServiceHeaders, ...inServiceRows];

    const recentHeaders = [t('analytics.serviceHistory.headers.tool'), t('analytics.serviceHistory.headers.sku'), t('analytics.serviceHistory.headers.action'), t('analytics.serviceHistory.headers.quantity'), t('analytics.serviceHistory.headers.orderNumber'), t('analytics.serviceHistory.headers.date')];
    const recentRows = (serviceSummary.recent_events || []).map(ev => [
      ev.name || '',
      ev.sku || '',
      ev.action === 'sent' ? t('analytics.serviceHistory.action.sent') : t('analytics.serviceHistory.action.received'),
      ev.quantity ?? '',
      ev.order_number || '',
      ev.created_at ? formatDate(ev.created_at) : ''
    ]);
    const recentAoA = [recentHeaders, ...recentRows];

    const wb = XLSX.utils.book_new();
    const wsInService = XLSX.utils.aoa_to_sheet(inServiceAoA);
    const wsRecent = XLSX.utils.aoa_to_sheet(recentAoA);
    XLSX.utils.book_append_sheet(wb, wsInService, t('analytics.serviceHistory.inService'));
    XLSX.utils.book_append_sheet(wb, wsRecent, t('analytics.serviceHistory.recentEvents'));
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    downloadBlob(`service_history_${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', wbout);
  };

  useEffect(() => {
    let mounted = true;
    const fetchBhp = async () => {
      try {
        // If the user does not have permission to view BHP, do not call the API and show information
        if (
          !canViewAnalytics ||
          !(hasPermission(user, PERMISSIONS.VIEW_BHP) || hasPermission(user, PERMISSIONS.VIEW_BHP_HISTORY))
        ) {
          if (mounted) {
            setBhpPermissionDenied(true);
            setBhpItems([]);
          }
          return;
        }
        setBhpLoading(true);
        const res = await api.get('/api/bhp?limit=100000');
        if (mounted) {
          const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
          setBhpItems(list);
        }
      } catch (err) {
        if (mounted) {
          setBhpItems([]);
          // If the server returns a forbid, show information instead of logging out
          if (err?.status === 403) {
            setBhpPermissionDenied(true);
          }
        }
        console.warn('Nie udało się pobrać listy BHP:', err?.message || err);
      } finally {
        if (mounted) setBhpLoading(false);
      }
    };
    fetchBhp();
    return () => { mounted = false; };
  }, [canViewAnalytics, user]);

  useEffect(() => {
    let mounted = true;
    const fetchService = async () => {
      try {
        if (!canViewAnalytics) {
          if (mounted) setServiceSummary({ in_service: [], recent_events: [] });
          return;
        }
        setServiceLoading(true);
        const res = await api.get('/api/service-history/summary');
        if (mounted) {
          setServiceSummary({
            in_service: Array.isArray(res?.in_service) ? res.in_service : [],
            recent_events: Array.isArray(res?.recent_events) ? res.recent_events : []
          });
        }
      } catch (err) {
        if (mounted) {
          setServiceSummary({ in_service: [], recent_events: [] });
        }
        console.warn('Nie udało się pobrać podsumowania serwisu:', err?.message || err);
      } finally {
        if (mounted) setServiceLoading(false);
      }
    };
    fetchService();
    return () => { mounted = false; };
  }, [canViewAnalytics]);

  useEffect(() => {
    let mounted = true;
    const fetchAnalytics = async () => {
      try {
        if (!canViewAnalytics) return;
        const res = await api.get('/api/analytics');
        if (mounted) {
          setAnalyticsData(res);
        }
      } catch (err) {
        console.warn('Nie udało się pobrać danych analitycznych:', err?.message || err);
      }
    };
    fetchAnalytics();
    return () => { mounted = false; };
  }, [canViewAnalytics]);

  // const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  // Permission gateway: if VIEW_ANALYTICS is missing, show a message and don't render the rest of the UI
  if (!canViewAnalytics) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('analytics.permissions.title')}</h3>
          <p className="text-slate-600 dark:text-slate-400">{t('analytics.permissions.viewAnalyticsDenied')}</p>
        </div>
      </div>
    );
  }

  const parseDateFlexible = (val) => {
    if (!val) return null;
    const str = String(val).trim();
    // ISO or time: 2024-10-05 or 2024-10-05 12:00:00
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      // Check if it's "2024-10-05" (local) or "2024-10-05T12:00:00.000Z" (UTC)
      // If no time component is provided (length 10), assume local midnight
      if (str.length === 10) {
        // const d = new Date(str);
        // Fix for time zone offset if needed, but new Date('YYYY-MM-DD') is usually UTC.
        // We want 'YYYY-MM-DD' to be treated as local midnight to compare days correctly.
        // new Date('2024-10-05') -> 2024-10-05T00:00:00.000Z (UTC)
        // If we want local midnight: new Date(2024, 9, 5)
        const parts = str.split('-');
        const localD = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return isNaN(localD.getTime()) ? null : localD;
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    // European format: dd.mm.yyyy lub dd/mm/yyyy lub dd-mm-yyyy
    const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const d = new Date(`${yyyy}-${mm}-${dd}`);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const getDaysTo = (dateString) => {
    const date = parseDateFlexible(dateString);
    if (!date) return null;
    const now = new Date();
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = startOfDate - startOfNow;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const inspections = [
    ...(Array.isArray(tools) ? tools.filter(t => !!t.inspection_date).map(t => ({
      id: t.id,
      name: t.name,
      inspection_date: t.inspection_date,
      source: 'tools',
      query: t.sku || t.name || ''
    })) : []),
    ...(Array.isArray(bhpItems) ? bhpItems.filter(b => !!b.inspection_date).map(b => ({
      id: b.id,
      name: [b.inventory_number, b.model].filter(Boolean).join(' '),
      inspection_date: b.inspection_date,
      source: 'bhp',
      query: b.inventory_number || b.model || b.serial_number || ''
    })) : [])
  ];

  const upcomingInspections = inspections
    .map(item => ({ ...item, daysTo: getDaysTo(item.inspection_date) }))
    .filter(x => x.daysTo !== null && x.daysTo >= 0 && x.daysTo <= 30)
    .sort((a, b) => a.daysTo - b.daysTo);

  const overdueInspections = inspections
    .map(item => ({ ...item, daysTo: getDaysTo(item.inspection_date) }))
    .filter(x => x.daysTo !== null && x.daysTo < 0)
    .sort((a, b) => a.daysTo - b.daysTo);

  // Separate overdue inspections into separate sections for Tools and BHP
  const overdueTools = overdueInspections.filter(x => x.source === 'tools');
  const overdueBhp = overdueInspections.filter(x => x.source === 'bhp');

  return (
   <div className="px-6 pb-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('analytics.title')}</h1>
      <p className="text-slate-600 dark:text-slate-400">{t('analytics.subtitle')}</p>
    </div>
    <div className="mt-5">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('analytics.upcomingInspections')}</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30">
                <span className="text-xs font-medium text-red-700 dark:text-red-300">{t('analytics.overdue')}</span>
                <span className="text-xs font-bold text-red-700 dark:text-red-300">{overdueInspections.length}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('analytics.upcomingUnder30')}</span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{upcomingInspections.length}</span>
              </div>
            </div>
          </div>
          {bhpPermissionDenied && (
            <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300">
              {t('analytics.bhpPermissionDenied')}
            </div>
          )}
          {bhpLoading ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.loadingInspections')}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('analytics.overdueTools')}</h4>
                {overdueTools.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.noOverdueTools')}</p>
                ) : (
                  <ul className="space-y-2">
                    {overdueTools.slice(0, 10).map(item => (
                      <li key={`over-tools-${item.id}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                            <span className="px-2 py-0.5 text-xs rounded-full border bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">{t('analytics.chip.tools')}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.sent')}: {formatDateOnly(item.inspection_date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-red-600 dark:text-red-400">{t('analytics.phrases.daysOverdue', { count: Math.abs(item.daysTo) })}</span>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const screen = 'tools';
                                const q = item.query || '';
                                window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
                              } catch (_) { void 0; }
                            }}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('common.details')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100 mt-6 mb-2">{t('analytics.overdueBhp')}</h4>
                {overdueBhp.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.noOverdueBhp')}</p>
                ) : (
                  <ul className="space-y-2">
                    {overdueBhp.slice(0, 10).map(item => (
                      <li key={`over-bhp-${item.id}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                            <span className="px-2 py-0.5 text-xs rounded-full border bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700">{t('analytics.chip.bhp')}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.sent')}: {formatDateOnly(item.inspection_date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-red-600 dark:text-red-400">{t('analytics.phrases.daysOverdue', { count: Math.abs(item.daysTo) })}</span>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const screen = 'bhp';
                                const q = item.query || '';
                                window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
                              } catch (_) { void 0; }
                            }}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('common.details')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('analytics.upcoming')}</h4>
                {upcomingInspections.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.noUpcoming')}</p>
                ) : (
                  <ul className="space-y-2">
                    {upcomingInspections.slice(0, 10).map(item => (
                      <li key={`up-${item.source}-${item.id}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${item.source === 'bhp' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'}`}>{item.source === 'bhp' ? t('analytics.chip.bhp') : t('analytics.chip.tools')}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.sent')}: {formatDateOnly(item.inspection_date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{t('analytics.phrases.inDays', { count: item.daysTo })}</span>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const screen = item.source === 'bhp' ? 'bhp' : 'tools';
                                const q = item.query || '';
                                window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
                              } catch (_) { void 0; }
                            }}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('common.details')}
                          </button>
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

      {analyticsData && (
        <>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Resource Utilization */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6">{t('analytics.utilization.title')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="flex flex-col items-center">
                   <h4 className="text-sm font-medium text-center text-slate-700 dark:text-slate-300 mb-4">{t('analytics.utilization.tools')}</h4>
                   <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                         <Pie
                           data={[
                             { name: t('analytics.utilization.issued'), value: analyticsData.tools?.utilization?.issued || 0 },
                             { name: t('analytics.utilization.inService'), value: analyticsData.tools?.utilization?.in_service || 0 },
                             { name: t('analytics.utilization.total'), value: Math.max(0, (analyticsData.tools?.utilization?.total || 0) - (analyticsData.tools?.utilization?.issued || 0) - (analyticsData.tools?.utilization?.in_service || 0)) }
                           ]}
                           cx="50%" cy="50%"
                           innerRadius={60} outerRadius={80}
                           paddingAngle={5}
                           dataKey="value"
                         >
                           <Cell key="cell-0" fill="#0088FE" />
                           <Cell key="cell-1" fill="#FF8042" />
                           <Cell key="cell-2" fill="#E5E7EB" />
                         </Pie>
                         <Tooltip />
                         <Legend verticalAlign="bottom" height={36} />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                   <div className="text-center mt-4 text-sm text-slate-600 dark:text-slate-400">
                     {analyticsData.tools?.utilization?.issued || 0} / {analyticsData.tools?.utilization?.in_service || 0} / {analyticsData.tools?.utilization?.total || 0}
                   </div>
                </div>
                <div className="flex flex-col items-center">
                   <h4 className="text-sm font-medium text-center text-slate-700 dark:text-slate-300 mb-4">{t('analytics.utilization.bhp')}</h4>
                   <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                         <Pie
                           data={[
                             { name: t('analytics.utilization.issued'), value: analyticsData.bhp?.utilization?.issued || 0 },
                             { name: t('analytics.utilization.total'), value: Math.max(0, (analyticsData.bhp?.utilization?.total || 0) - (analyticsData.bhp?.utilization?.issued || 0)) }
                           ]}
                           cx="50%" cy="50%"
                           innerRadius={60} outerRadius={80}
                           paddingAngle={5}
                           dataKey="value"
                         >
                           <Cell key="cell-0" fill="#00C49F" />
                           <Cell key="cell-1" fill="#E5E7EB" />
                         </Pie>
                         <Tooltip />
                         <Legend verticalAlign="bottom" height={36} />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                   <div className="text-center mt-4 text-sm text-slate-600 dark:text-slate-400">
                     {analyticsData.bhp?.utilization?.issued || 0} / {analyticsData.bhp?.utilization?.total || 0}
                   </div>
                </div>
              </div>
            </div>

            {/* Top Employees */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('analytics.topEmployees.title')}</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={analyticsData.employees?.top_active_tools || []}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="last_name" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="active_count" name={t('analytics.topEmployees.activeTools')} fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Usage Trends */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
               <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('analytics.trends.title')}</h3>
               <div className="h-64">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart
                     data={analyticsData.trends || []}
                     margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                   >
                     <defs>
                       <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                         <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" />
                     <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                     <YAxis allowDecimals={false} />
                     <Tooltip />
                     <Area type="monotone" dataKey="count" name={t('analytics.trends.count')} stroke="#8884d8" fillOpacity={1} fill="url(#colorCount)" />
                   </AreaChart>
                 </ResponsiveContainer>
               </div>
            </div>

            {/* Tools Categories */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
               <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('analytics.categories.title')}</h3>
               <div className="h-64">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart
                     data={analyticsData.tools?.categories || []}
                     margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                   >
                     <defs>
                       <linearGradient id="colorCategory" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#82ca9d" stopOpacity={1}/>
                         <stop offset="100%" stopColor="#82ca9d" stopOpacity={0.6}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" />
                     <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                     <YAxis allowDecimals={false} />
                     <Tooltip cursor={{fill: 'transparent'}} />
                     <Bar dataKey="count" name={t('analytics.categories.count')} fill="url(#colorCategory)" radius={[4, 4, 0, 0]} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>
          </div>

          <div className="mt-8">
             {/* Popular Tools */}
             <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{t('analytics.popularTools.title')}</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsData.tools?.popular || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="colorPopular" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#82ca9d" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#82ca9d" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis />
                      <Tooltip cursor={{fill: 'transparent'}} />
                      <Bar dataKey="usage_count" name={t('analytics.popularTools.uses')} fill="url(#colorPopular)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </div>
        </>
      )}

      <div className="mt-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('analytics.serviceHistory.title')}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportServiceHistoryToPDF}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {t('analytics.serviceHistory.exportPDF')}
              </button>
              <button
                type="button"
                onClick={exportServiceHistoryToXLSX}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {t('analytics.serviceHistory.exportXLSX')}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {t('analytics.serviceHistory.rowsCount')}:
              <select
                id="pageSize"
                name="pageSize"
                className="ml-2 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value) || 10)}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {t('analytics.serviceHistory.total', { count: (serviceSummary.in_service?.length || 0) + (serviceSummary.recent_events?.length || 0) })}
            </div>
          </div>
          {serviceLoading ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.loadingService')}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h5 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('analytics.serviceHistory.inService')}</h5>
                {serviceSummary.in_service.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.serviceHistory.noInService')}</p>
                ) : (
                  <ul className="space-y-2">
                    {(() => {
                      const total = serviceSummary.in_service.length;
                      const start = (svcPage - 1) * pageSize;
                      const end = Math.min(start + pageSize, total);
                      const items = serviceSummary.in_service.slice(start, end);
                      return items.map(item => (
                        <li key={`svc-${item.id}`} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    const screen = 'tools';
                                    const q = item.sku || '';
                                    window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
                                  } catch (_) { void 0; }
                                }}
                                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                              >
                                {item.name}
                              </button>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.sku')}: <span className="font-mono">{item.sku}</span></p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-slate-700 dark:text-slate-200">{item.service_quantity} szt.</p>
                              {item.service_order_number && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.orderNumber')}: <span className="font-mono">{item.service_order_number}</span></p>
                              )}
                              {item.service_sent_at && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.sent')}: {formatDate(item.service_sent_at)}</p>
                              )}
                            </div>
                          </div>
                        </li>
                      ));
                    })()}
                  </ul>
                )}
                {serviceSummary.in_service.length > 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      onClick={() => setSvcPage(p => Math.max(1, p - 1))}
                      disabled={svcPage <= 1}
                    >
                      {t('analytics.pagination.prev')}
                    </button>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {t('analytics.pagination.page')} {svcPage} {t('analytics.pagination.of')} {Math.max(1, Math.ceil(serviceSummary.in_service.length / pageSize))}
                    </span>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      onClick={() => setSvcPage(p => Math.min(Math.max(1, Math.ceil(serviceSummary.in_service.length / pageSize)), p + 1))}
                      disabled={svcPage >= Math.ceil(serviceSummary.in_service.length / pageSize)}
                    >
                      {t('analytics.pagination.next')}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <h5 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('analytics.serviceHistory.recentEvents')}</h5>
                {serviceSummary.recent_events.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('analytics.serviceHistory.noRecentEvents')}</p>
                ) : (
                  <ul className="space-y-2">
                    {(() => {
                      const total = serviceSummary.recent_events.length;
                      const start = (eventsPage - 1) * pageSize;
                      const end = Math.min(start + pageSize, total);
                      const items = serviceSummary.recent_events.slice(start, end);
                      return items.map(ev => (
                        <li key={`ev-${ev.id}`} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{ev.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.sku')}: <span className="font-mono">{ev.sku}</span></p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-slate-700 dark:text-slate-200">{t(ev.action === 'sent' ? 'analytics.serviceHistory.action.sent' : 'analytics.serviceHistory.action.received')}: {ev.quantity} szt.</p>
                              {ev.order_number && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.orderNumber')}: <span className="font-mono">{ev.order_number}</span></p>
                              )}
                              {ev.created_at && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.serviceHistory.headers.date')}: {formatDate(ev.created_at)}</p>
                              )}
                            </div>
                          </div>
                        </li>
                      ));
                    })()}
                  </ul>
                )}
                {serviceSummary.recent_events.length > 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      onClick={() => setEventsPage(p => Math.max(1, p - 1))}
                      disabled={eventsPage <= 1}
                    >
                      {t('analytics.pagination.prev')}
                    </button>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {t('analytics.pagination.page')} {eventsPage} {t('analytics.pagination.of')} {Math.max(1, Math.ceil(serviceSummary.recent_events.length / pageSize))}
                    </span>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      onClick={() => setEventsPage(p => Math.min(Math.max(1, Math.ceil(serviceSummary.recent_events.length / pageSize)), p + 1))}
                      disabled={eventsPage >= Math.ceil(serviceSummary.recent_events.length / pageSize)}
                    >
                      {t('analytics.pagination.next')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsScreen;
