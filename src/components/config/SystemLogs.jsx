import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { formatDate } from '../../utils/dateUtils';

const SystemLogs = ({ apiClient, t }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('offset', offset);
      if (level) params.append('level', level);
      if (category) params.append('category', category);
      params.append('_t', Date.now()); // Prevent caching

      const data = await apiClient.get(`/api/system/logs?${params.toString()}`);
      if (data && (Array.isArray(data.data) || Array.isArray(data.rows))) {
        setLogs(data.data || data.rows);
        setTotal(Number(data.total || 0));
      } else {
        setLogs([]);
        setTotal(0);
        if (data && data.message) {
            setError(data.message);
        }
      }
    } catch (error) {
      console.error('Failed to load system logs', error);
      setError(error.message || t('appConfig.server.logs.errorLoad'));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [apiClient, page, limit, level, category, t]);

  useEffect(() => {
    Promise.resolve().then(() => { loadLogs(); });
  }, [loadLogs]);

  const handleRefresh = () => {
    loadLogs();
  };

  const handleDeleteLogs = async () => {
    if (window.confirm(t('appConfig.server.logs.confirmDelete'))) {
      try {
        await apiClient.delete('/api/system/logs');
        toast.success(t('appConfig.server.logs.deleteSuccess'));
        loadLogs();
      } catch (error) {
        console.error('Failed to delete logs', error);
        toast.error(t('appConfig.server.logs.deleteError'));
      }
    }
  };

  return (
    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
      <h4 className="text-md font-medium text-gray-900 dark:text-gray-200 mb-3">
        {t('appConfig.server.logs.title')}
      </h4>
      <div className="flex flex-wrap gap-4 mb-4">
         <label htmlFor="system-logs-level" className="sr-only">{t('appConfig.server.logs.level')}</label>
         <select
           id="system-logs-level"
           name="level"
           value={level}
           onChange={(e) => { setLevel(e.target.value); setPage(1); }}
           className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
           autoComplete="on"
         >
           <option value="">{t('appConfig.server.logs.allLevels')}</option>
           <option value="info">{t('appConfig.server.logs.info')}</option>
           <option value="warn">{t('appConfig.server.logs.warn')}</option>
           <option value="error">{t('appConfig.server.logs.error')}</option>
         </select>
         <label htmlFor="system-logs-category" className="sr-only">{t('appConfig.server.logs.category')}</label>
         <select
           id="system-logs-category"
           name="category"
           value={category}
           onChange={(e) => { setCategory(e.target.value); setPage(1); }}
           className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
           autoComplete="on"
         >
           <option value="">{t('appConfig.server.logs.allCategories')}</option>
           <option value="SYSTEM">{t('appConfig.server.logs.system')}</option>
           <option value="AUTH">{t('appConfig.server.logs.auth')}</option>
           <option value="PERFORMANCE">{t('appConfig.server.logs.performance')}</option>
           <option value="BACKUP">{t('appConfig.server.logs.backup')}</option>
         </select>
         <button
           onClick={handleRefresh}
           className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
         >
           <ArrowPathIcon className="h-4 w-4" />
           {t('common.refresh')}
         </button>
         <button
           onClick={handleDeleteLogs}
           className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
         >
           <TrashIcon className="h-4 w-4" />
           {t('common.delete')}
         </button>
      </div>

      {loading ? (
         <div className="text-center py-4">{t('common.loading')}</div>
      ) : error ? (
        <div className="text-center py-4 text-red-600 dark:text-red-400">
            {error}
            <button 
                onClick={loadLogs} 
                className="ml-2 underline hover:no-underline"
            >
                {t('common.retry')}
            </button>
        </div>
      ) : logs.length === 0 ? (
         <div className="text-center py-4 text-gray-500">{t('common.noData') || 'Brak danych'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Level</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    <span className={`px-2 py-0.5 rounded-full ${
                      log.level === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                      log.level === 'warn' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{log.category}</td>
                  <td className="px-3 py-2 text-xs text-gray-900 dark:text-white break-words max-w-lg">
                    {log.message}
                    {log.details && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">Details</summary>
                        <pre className="mt-1 p-2 bg-slate-100 dark:bg-slate-900 rounded text-[10px] overflow-auto max-h-32">
                          {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-between items-center text-xs text-gray-500">
         <div>{t('common.pagination.total')}: {total}</div>
         <div className="flex gap-2">
           <button
             disabled={page <= 1}
             onClick={() => setPage(p => p - 1)}
             className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
           >
             {t('common.pagination.prev')}
           </button>
           <span className="py-1">{t('common.pagination.page')} {page}</span>
           <button
             disabled={page * limit >= total}
             onClick={() => setPage(p => p + 1)}
             className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
           >
             {t('common.pagination.next')}
           </button>
         </div>
      </div>
    </div>
  );
};

export default SystemLogs;
