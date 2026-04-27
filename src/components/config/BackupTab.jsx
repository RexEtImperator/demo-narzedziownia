import React, { useState, useEffect, useCallback } from 'react';
import { ArchiveBoxIcon, CloudArrowDownIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from '../ConfirmationModal';
import { formatDate } from '../../utils/dateUtils';

const parseBackupDate = (file) => {
  try {
    const m = String(file).match(/^database-(\d{8})-(\d{6})\.db$/);
    if (!m) return '-';
    const ymd = m[1];
    const hms = m[2];
    const yyyy = ymd.slice(0, 4);
    const mm = ymd.slice(4, 6);
    const dd = ymd.slice(6, 8);
    const hh = hms.slice(0, 2);
    const mi = hms.slice(2, 4);
    const ss = hms.slice(4, 6);
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000Z`;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return formatDate(iso);
  } catch { return '-'; }
};

const BackupTab = ({
  config,
  updateConfig,
  apiClient,
  t,
  notifySuccess,
  notifyError,
  errors = {}
}) => {
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackupFile, setLastBackupFile] = useState(null);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [backendActionLoading, setBackendActionLoading] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      setBackupLoading(true);
      const resp = await apiClient.get('/api/backup/list');
      const list = Array.isArray(resp?.backups) ? resp.backups : [];
      const sorted = list.slice().sort((a, b) => {
        const an = a.file || '';
        const bn = b.file || '';
        if (an < bn) return 1;
        if (an > bn) return -1;
        return 0;
      });
      setBackups(sorted);
      setLastBackupFile((sorted[0] && sorted[0].file) || null);
    } catch (err) {
      console.warn(t('appConfig.backup.listError'), err?.message || err);
    } finally {
      setBackupLoading(false);
    }
  }, [apiClient, t]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const runBackup = async () => {
    try {
      setBackupLoading(true);
      await apiClient.post('/api/backup/run', {});
      notifySuccess('Kopia zapasowa wykonana');
      await loadBackups();
    } catch (err) {
      const msg = err?.message || t('appConfig.backup.runError');
      notifyError(msg);
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    try {
      setBackupLoading(true);
      await apiClient.post('/api/backup/restore', { file });
      notifySuccess(t('appConfig.backup.restored'));
      setShowRestartModal(true);
    } catch (err) {
      const msg = err?.message || t('appConfig.backup.restoreError');
      notifyError(msg);
    } finally {
      setBackupLoading(false);
    }
  };

  const downloadBackup = async (file) => {
    try {
      const blob = await apiClient.get(`/api/backup/download/${file}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_err) {
      notifyError('Błąd pobierania kopii zapasowej');
    }
  };

  const restartBackend = async () => {
    try {
      setBackendActionLoading(true);
      await apiClient.post('/api/system/server/restart', {});
      notifySuccess(t('appConfig.server.backend.restartStarted'));
      setShowRestartModal(false);
    } catch (err) {
      const msg = err?.message || t('appConfig.server.backend.restartError');
      notifyError(msg);
    } finally {
      setBackendActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 items-end mb-6">
          <div>
            <label htmlFor="backupFrequency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.backup.backupFrequency')}</label>
            <select
              id="backupFrequency"
              name="backupFrequency"
              value={config.backup.backupFrequency}
              onChange={(e) => updateConfig('backup', 'backupFrequency', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="daily">{t('appConfig.backup.frequencyDaily')}</option>
              <option value="weekly">{t('appConfig.backup.frequencyWeekly')}</option>
              <option value="monthly">{t('appConfig.backup.frequencyMonthly')}</option>
            </select>
            <div className="mt-4">
              <label htmlFor="backupRetentionDays" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('appConfig.backup.backupRetentionDays') || 'Retencja kopii zapasowych (dni)'}
              </label>
              <input
                type="number"
                id="backupRetentionDays"
                name="backupRetentionDays"
                min="1"
                value={config.backup.backupRetentionDays}
                onChange={(e) => updateConfig('backup', 'backupRetentionDays', parseInt(e.target.value) || 30)}
                className={`mt-1 w-full px-3 py-2 border ${errors?.backupRetentionDays ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100`}
              />
              {errors?.backupRetentionDays && <p className="mt-1 text-sm text-red-600">{errors.backupRetentionDays}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runBackup}
              disabled={backupLoading}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {backupLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('appConfig.backup.running')}
                </>
              ) : (
                <>
                  <ArchiveBoxIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('appConfig.backup.createNow')}
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
            <div className="text-sm text-gray-700 dark:text-gray-300">{t('appConfig.backup.lastFromConfig')}</div>
            <div className="mt-1 text-base font-medium text-gray-900 dark:text-white">{lastBackupFile ? parseBackupDate(lastBackupFile) : '-'}</div>
          </div>
          <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
            <div className="text-sm text-gray-700 dark:text-gray-300">{t('appConfig.backup.lastFile')}</div>
            <div className="mt-1 text-base font-medium text-gray-900 dark:text-white">{lastBackupFile || '-'}</div>
          </div>
        </div>

        {/* Backup List */}
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('appConfig.backup.history')}</h3>
          {backups.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('appConfig.backup.noBackups')}</p>
          ) : (
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
                      {t('appConfig.backup.headers.file')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('appConfig.backup.headers.createdAt')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('appConfig.backup.headers.size')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('appConfig.backup.headers.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {backups.map((backup) => (
                    <tr key={backup.file}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
                        {backup.file}
                        {backup.file === lastBackupFile && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            {t('appConfig.backup.latest')}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {parseBackupDate(backup.file)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {(backup.size / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => downloadBackup(backup.file)}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                            title={t('common.download')}
                          >
                            <CloudArrowDownIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => restoreBackup(backup.file)}
                            disabled={backupLoading}
                            className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-50"
                            title={t('appConfig.backup.restore')}
                          >
                            <ArrowUturnLeftIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showRestartModal}
        onClose={() => setShowRestartModal(false)}
        onConfirm={restartBackend}
        title={t('appConfig.server.backend.restartTitle')}
        message={t('appConfig.server.backend.restartMessage')}
        confirmLabel={t('appConfig.server.backend.restart')}
        cancelLabel={t('common.cancel')}
        isDestructive={true}
        isLoading={backendActionLoading}
      />
    </div>
  );
};

export default BackupTab;
