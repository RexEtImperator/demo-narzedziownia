import React, { useState } from 'react';
import { formatDate } from '../../utils/dateUtils';

const formatUptime = (s) => {
  if (typeof s === 'undefined' || s === null) return '-';
  const total = Math.floor(Number(s) || 0);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  const dd = String(d).padStart(2, '0');
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return `${dd}:${hh}:${mm}:${ss}`;
};

const ServerTab = ({
  t,
  user,
  apiClient,
  notifySuccess,
  notifyError
}) => {
  const [frontendActionLoading, setFrontendActionLoading] = useState(false);
  const [frontendHealth, setFrontendHealth] = useState(null);
  const [backendActionLoading, setBackendActionLoading] = useState(false);
  const [backendHealth, setBackendHealth] = useState(null);
  const [backendHealthLoading, setBackendHealthLoading] = useState(false);
  const [backendApiHealth, setBackendApiHealth] = useState(null);
  const [backendApiHealthLoading, setBackendApiHealthLoading] = useState(false);
  const canControlFrontend = false;

  const restartFrontend = async () => {
    try {
      setFrontendActionLoading(true);
      if (!canControlFrontend) {
        notifyError(t('appConfig.server.frontend.restartError'));
        return;
      }
    } catch (err) {
      const msg = err?.message || t('appConfig.server.frontend.restartError');
      notifyError(msg);
    } finally {
      setFrontendActionLoading(false);
    }
  };

  const stopFrontend = async () => {
    try {
      setFrontendActionLoading(true);
      if (!canControlFrontend) {
        notifyError(t('appConfig.server.frontend.stopError'));
        return;
      }
    } catch (err) {
      const msg = err?.message || t('appConfig.server.frontend.stopError');
      notifyError(msg);
    } finally {
      setFrontendActionLoading(false);
    }
  };

  const checkFrontendHealth = async () => {
    try {
      setFrontendActionLoading(true);
      try {
        const url = `${window.location.origin}/favicon.ico?_=${Date.now()}`;
        const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!resp.ok) throw new Error('Frontend not reachable');
        setFrontendHealth({ status: 'ok', uptime: null, timestamp: new Date().toISOString() });
      } catch (_err) {
        setFrontendHealth({ status: 'error', uptime: null, timestamp: new Date().toISOString() });
        throw _err;
      }
      notifySuccess(t('appConfig.server.frontend.healthOk'));
    } catch (_) {
      notifyError(t('appConfig.server.frontend.healthError'));
    } finally {
      setFrontendActionLoading(false);
    }
  };

  const restartBackend = async () => {
    try {
      setBackendActionLoading(true);
      await apiClient.post('/api/system/server/restart', {});
      notifySuccess(t('appConfig.server.backend.restartStarted'));
    } catch (err) {
      const msg = err?.message || t('appConfig.server.backend.restartError');
      notifyError(msg);
    } finally {
      setBackendActionLoading(false);
    }
  };

  const stopBackend = async () => {
    try {
      setBackendActionLoading(true);
      await apiClient.post('/api/system/server/stop', {});
      notifySuccess(t('appConfig.server.backend.stopStarted'));
    } catch (err) {
      const msg = err?.message || t('appConfig.server.backend.stopError');
      notifyError(msg);
    } finally {
      setBackendActionLoading(false);
    }
  };

  const checkBackendHealth = async () => {
    try {
      setBackendHealthLoading(true);
      const resp = await apiClient.get('/api/system/health');
      const normalized = {
        status: String(resp?.status || 'unknown'),
        uptime: typeof resp?.uptime === 'number' ? resp.uptime : null,
        timestamp: resp?.timestamp || null
      };
      setBackendHealth(normalized);
      notifySuccess(t('appConfig.server.backend.healthOk'));
    } catch (_) {
      notifyError(t('appConfig.server.backend.healthError'));
    } finally {
      setBackendHealthLoading(false);
    }
  };

  const checkBackendApiHealth = async () => {
    try {
      setBackendApiHealthLoading(true);
      const resp = await apiClient.get('/api/system/health');
      setBackendApiHealth(resp || null);
      notifySuccess(t('appConfig.server.backend.healthOk'));
    } catch (_err) {
      notifyError(t('appConfig.server.backend.healthError'));
    } finally {
      setBackendApiHealthLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          <h4 className="text-md font-medium text-gray-900 dark:text-gray-200 mb-3">{t('appConfig.server.frontend.title')}</h4>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={restartFrontend}
              disabled={canControlFrontend ? (frontendActionLoading || user?.role !== 'administrator') : true}
              className="px-4 py-2 rounded-md bg-amber-600 dark:bg-amber-700 text-white hover:bg-amber-700 dark:hover:bg-amber-800 disabled:opacity-50"
            >
              {t('appConfig.server.frontend.restart')}
            </button>
            <button
              type="button"
              onClick={stopFrontend}
              disabled={canControlFrontend ? (frontendActionLoading || user?.role !== 'administrator') : true}
              className="px-4 py-2 rounded-md bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
            >
              {t('appConfig.server.frontend.stop')}
            </button>
            <button
              type="button"
              onClick={checkFrontendHealth}
              disabled={frontendActionLoading}
              className="px-4 py-2 rounded-md bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 dark:hover:bg-indigo-800 disabled:opacity-50"
            >
              {t('appConfig.server.frontend.check')}
            </button>
          </div>
          {user?.role !== 'administrator' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('appConfig.backup.adminRequired')}</p>
          )}
          <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            <div>{t('appConfig.server.status')} {frontendHealth ? frontendHealth.status : '-'}</div>
            <div>{t('appConfig.server.uptime')} {frontendHealth && typeof frontendHealth.uptime !== 'undefined' ? formatUptime(frontendHealth.uptime) : '-'}</div>
            <div>{t('appConfig.server.generatedAt')} {frontendHealth && frontendHealth.timestamp ? formatDate(frontendHealth.timestamp) : '-'}</div>
          </div>
        </div>
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          <h4 className="text-md font-medium text-gray-900 dark:text-gray-200 mb-3">{t('appConfig.server.backend.title')}</h4>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={restartBackend}
              disabled={backendActionLoading || user?.role !== 'administrator'}
              className="px-4 py-2 rounded-md bg-amber-600 dark:bg-amber-700 text-white hover:bg-amber-700 dark:hover:bg-amber-800 disabled:opacity-50"
            >
              {t('appConfig.server.backend.restart')}
            </button>
            <button
              type="button"
              onClick={stopBackend}
              disabled={backendActionLoading || user?.role !== 'administrator'}
              className="px-4 py-2 rounded-md bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
            >
              {t('appConfig.server.backend.stop')}
            </button>
            <button
              type="button"
              onClick={checkBackendHealth}
              disabled={backendHealthLoading}
              className="px-4 py-2 rounded-md bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 dark:hover:bg-indigo-800 disabled:opacity-50"
            >
              {t('appConfig.server.backend.check')}
            </button>
          </div>
          {user?.role !== 'administrator' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('appConfig.backup.adminRequired')}</p>
          )}
          <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            <div>{t('appConfig.server.status')} {backendHealth ? backendHealth.status : '-'}</div>
            <div>{t('appConfig.server.uptime')} {backendHealth && typeof backendHealth.uptime !== 'undefined' ? formatUptime(backendHealth.uptime) : '-'}</div>
            <div>{t('appConfig.server.generatedAt')} {backendHealth && backendHealth.timestamp ? formatDate(backendHealth.timestamp) : '-'}</div>
          </div>
        </div>
      </div>

      <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
        <h4 className="text-md font-medium text-gray-900 dark:text-gray-200 mb-3">API Health Check</h4>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={checkBackendApiHealth}
            disabled={backendApiHealthLoading}
            className="px-4 py-2 rounded-md bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 dark:hover:bg-indigo-800 disabled:opacity-50"
          >
            Check API Health
          </button>
        </div>
        <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
          <div>Status: {backendApiHealth ? backendApiHealth.status : '-'}</div>
          <div>DB: {backendApiHealth ? backendApiHealth.db : '-'}</div>
          <div>Uptime: {backendApiHealth ? Math.floor(backendApiHealth.uptime) + 's' : '-'}</div>
        </div>
      </div>
    </div>
  );
};

export default ServerTab;
