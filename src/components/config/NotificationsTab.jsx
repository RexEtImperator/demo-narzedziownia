import React, { useState, useEffect, useCallback } from 'react';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { notifyError, notifySuccess } from '../../utils/notify.jsx';
import { formatDate } from '../../utils/dateUtils';
import ConfirmationModal from '../ConfirmationModal';

const NotificationsTab = ({ apiClient, t, user }) => {
  const [notifTab, setNotifTab] = useState('all');
  const [notifSender, setNotifSender] = useState(() => {
    const fn = (user?.first_name || '').trim();
    const ln = (user?.last_name || '').trim();
    const fl = [fn, ln].filter(Boolean).join(' ').trim();
    return fl || user?.full_name || user?.name || user?.username || user?.email || '';
  });
  const [notifSubject, setNotifSubject] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifUrlAll, setNotifUrlAll] = useState('');
  const [notifUrlSelected, setNotifUrlSelected] = useState('');
  const [notifSending, setNotifSending] = useState(false);
  const [notifUsers, setNotifUsers] = useState([]);
  const [notifUsersLoading, setNotifUsersLoading] = useState(false);
  const [notifSelectedIds, setNotifSelectedIds] = useState([]);
  const [notifFanoutSelected, setNotifFanoutSelected] = useState(false);
  const [notifPushAllSelected, setNotifPushAllSelected] = useState(false);
  const [notifFanoutAllSelected, setNotifFanoutAllSelected] = useState(false);
  const [notifPushSelected, setNotifPushSelected] = useState(false);
  const [showConfirmBroadcast, setShowConfirmBroadcast] = useState(false);
  const [showDeleteNotifHistory, setShowDeleteNotifHistory] = useState(false);
  const [deletingNotifHistory, setDeletingNotifHistory] = useState(false);
  const [notifHistoryAll, setNotifHistoryAll] = useState([]);
  const [notifHistorySelected, setNotifHistorySelected] = useState([]);
  const [notifHistoryLoadingAll, setNotifHistoryLoadingAll] = useState(false);
  const [notifHistoryLoadingSelected, setNotifHistoryLoadingSelected] = useState(false);
  const [notifAllPage, setNotifAllPage] = useState(1);
  const [notifAllLimit] = useState(10);
  const [notifAllTotal, setNotifAllTotal] = useState(0);
  const [notifAllQuery, setNotifAllQuery] = useState('');
  const [notifSelPage, setNotifSelPage] = useState(1);
  const [notifSelLimit] = useState(10);
  const [notifSelTotal, setNotifSelTotal] = useState(0);
  const [notifSelQuery, setNotifSelQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [notifExpandedAll, setNotifExpandedAll] = useState([]);
  const [notifExpandedSel, setNotifExpandedSel] = useState([]);
  const [generalNotifType, setGeneralNotifType] = useState('');
  const [generalDeleting, setGeneralDeleting] = useState(false);
  const [generalItemType, setGeneralItemType] = useState('');
  const [generalList, setGeneralList] = useState([]);
  const [generalTotal, setGeneralTotal] = useState(0);
  const [generalPage, setGeneralPage] = useState(1);
  const [generalLimit, setGeneralLimit] = useState(10);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalSelectedIds, setGeneralSelectedIds] = useState([]);

  const loadGeneralNotifications = useCallback(async () => {
    try {
      setGeneralLoading(true);
      const params = new URLSearchParams();
      if (generalNotifType) params.set('type', generalNotifType);
      if (generalItemType) params.set('item_type', generalItemType);
      params.set('page', String(generalPage));
      params.set('limit', String(generalLimit));
      const resp = await apiClient.get(`/api/notifications/admin?${params.toString()}`);
      setGeneralList(Array.isArray(resp?.rows) ? resp.rows : []);
      setGeneralTotal(Number(resp?.total ?? 0) || 0);
    } catch (_err) {
      notifyError(t('appConfig.notificationsSend.general.loadError'));
    } finally {
      setGeneralLoading(false);
    }
  }, [apiClient, generalNotifType, generalItemType, generalPage, generalLimit, t]);

  useEffect(() => {
    Promise.resolve().then(() => { loadGeneralNotifications(); });
  }, [loadGeneralNotifications]);

  const loadNotifUsers = useCallback(async () => {
    try {
      setNotifUsersLoading(true);
      const data = await apiClient.get('/api/users');
      setNotifUsers(Array.isArray(data) ? data : []);
    } catch (_error) {
      notifyError(t('appConfig.notificationsSend.fetchUsersError'));
      setNotifUsers([]);
    } finally {
      setNotifUsersLoading(false);
    }
  }, [apiClient, t]);

  const loadNotifHistoryAll = useCallback(async () => {
    try {
      setNotifHistoryLoadingAll(true);
      const params = new URLSearchParams({ type: 'broadcast', page: String(notifAllPage), limit: String(notifAllLimit), q: String(notifAllQuery || '') });
      const data = await apiClient.get(`/api/notifications/history?${params.toString()}`);
      const list = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
      setNotifHistoryAll(list);
      const total = Number(data?.total ?? (Array.isArray(data?.rows) ? data.rows.length : list.length));
      setNotifAllTotal(isNaN(total) ? list.length : total);
    } catch (_error) {
      console.error(_error);
      notifyError(`${t('appConfig.notificationsSend.fetchHistoryError')}: ${_error.message || _error}`);
      setNotifHistoryAll([]);
    } finally {
      setNotifHistoryLoadingAll(false);
    }
  }, [apiClient, t, notifAllPage, notifAllLimit, notifAllQuery]);

  const loadNotifHistorySelected = useCallback(async () => {
    try {
      setNotifHistoryLoadingSelected(true);
      const params = new URLSearchParams({ type: 'custom', page: String(notifSelPage), limit: String(notifSelLimit), q: String(notifSelQuery || '') });
      const data = await apiClient.get(`/api/notifications/history?${params.toString()}`);
      const list = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
      setNotifHistorySelected(list);
      const total = Number(data?.total ?? (Array.isArray(data?.rows) ? data.rows.length : list.length));
      setNotifSelTotal(isNaN(total) ? list.length : total);
    } catch (_error) {
      console.error(_error);
      notifyError(`${t('appConfig.notificationsSend.fetchHistoryError')}: ${_error.message || _error}`);
      setNotifHistorySelected([]);
    } finally {
      setNotifHistoryLoadingSelected(false);
    }
  }, [apiClient, t, notifSelPage, notifSelLimit, notifSelQuery]);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (notifUsers.length === 0) {
        loadNotifUsers();
      }
      loadNotifHistoryAll();
      loadNotifHistorySelected();
    });
  }, [notifUsers.length, loadNotifUsers, loadNotifHistoryAll, loadNotifHistorySelected]);

  const toggleSelectUser = (id) => {
    setNotifSelectedIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
      return next;
    });
  };

  const deleteGeneralNotifications = async () => {
    try {
      setGeneralDeleting(true);
      let count = 0;
      if (generalSelectedIds.length > 0) {
        const resp = await apiClient.post('/api/notifications/bulk-delete', { ids: generalSelectedIds });
        count = Number(resp?.deleted ?? 0) || 0;
      } else {
        const params = new URLSearchParams();
        if (generalNotifType) params.set('type', generalNotifType);
        if (generalItemType) params.set('item_type', generalItemType);
        const resp = await apiClient.del(`/api/notifications?${params.toString()}`);
        count = Number(resp?.deleted ?? 0) || 0;
      }
      notifySuccess(t('appConfig.notificationsSend.general.deleteSuccess', { count }));
      setGeneralSelectedIds([]);
      await loadGeneralNotifications();
    } catch (_err) {
      notifyError(t('appConfig.notificationsSend.general.deleteError'));
    } finally {
      setGeneralDeleting(false);
    }
  };

  const reallySendAllNotifications = async () => {
    const subject = String(notifSubject || '').trim();
    const text = String(notifMessage || '').trim();
    const sender = String(notifSender || '').trim();
    if (!subject || !text || !sender) {
      notifyError(t('appConfig.notificationsSend.validationMissing'));
      return;
    }
    try {
      setNotifSending(true);
      await apiClient.post('/api/notifications/broadcast', { sender, subject, message: text, url: String(notifUrlAll || '').trim(), push: !!notifPushAllSelected, fanout: !!notifFanoutAllSelected });
      notifySuccess(t('appConfig.notificationsSend.sentAll'));
      try { window.dispatchEvent(new CustomEvent('notifications:refresh')); } catch (_) { void 0; }
      setNotifSubject('');
      setNotifMessage('');
      setNotifUrlAll('');
      await loadNotifHistoryAll();
    } catch (_err) {
      notifyError(t('appConfig.notificationsSend.sendError'));
    } finally {
      setNotifSending(false);
    }
  };

  const sendAllNotifications = async () => {
    if (notifFanoutAllSelected) {
      setShowConfirmBroadcast(true);
      return;
    }
    await reallySendAllNotifications();
  };

  const sendSelectedNotifications = async () => {
    const subject = String(notifSubject || '').trim();
    const text = String(notifMessage || '').trim();
    const sender = String(notifSender || '').trim();
    if (!subject || !text || !sender || notifSelectedIds.length === 0) {
      notifyError(t('appConfig.notificationsSend.validationMissing'));
      return;
    }
    try {
      setNotifSending(true);
      await apiClient.post('/api/notifications/custom', { userIds: notifSelectedIds, sender, subject, message: text, url: String(notifUrlSelected || '').trim(), fanout: !!notifFanoutSelected, push: !!notifPushSelected });
      notifySuccess(t('appConfig.notificationsSend.sentSelected'));
      try { window.dispatchEvent(new CustomEvent('notifications:refresh')); } catch (_) { void 0; }
      setNotifSubject('');
      setNotifMessage('');
      setNotifUrlSelected('');
      setNotifSelectedIds([]);
      await loadNotifHistorySelected();
    } catch (_err) {
      notifyError(t('appConfig.notificationsSend.sendError'));
    } finally {
      setNotifSending(false);
    }
  };

  const deleteCurrentNotifHistory = async () => {
    try {
      setDeletingNotifHistory(true);
      const type = notifTab === 'all' ? 'broadcast' : 'custom';
      const resp = await apiClient.del(`/api/notifications/history?type=${type}`);
      if (notifTab === 'all') {
        await loadNotifHistoryAll();
      } else {
        await loadNotifHistorySelected();
      }
      const historyCount = Number(resp?.deleted_history ?? resp?.deleted ?? 0) || 0;
      const notifCount = Number(resp?.deleted_notifications ?? 0) || 0;
      notifySuccess(t('appConfig.notificationsSend.history.deleteAllSuccessCounts', { history: historyCount, notifications: notifCount }));
      setShowDeleteNotifHistory(false);
    } catch (_err) {
      notifyError(t('appConfig.notificationsSend.history.deleteAllError'));
    } finally {
      setDeletingNotifHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">{t('appConfig.notificationsSend.general.title')}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="generalNotifType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.general.typeLabel')}</label>
            <select
              id="generalNotifType"
              name="generalNotifType"
              value={generalNotifType}
              onChange={(e) => setGeneralNotifType(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="">{t('appConfig.notificationsSend.general.types.any')}</option>
              <option value="return_request">{t('appConfig.notificationsSend.general.types.return_request')}</option>
              <option value="overdue_inspection">{t('appConfig.notificationsSend.general.types.overdue_inspection')}</option>
              <option value="admin_message">{t('appConfig.notificationsSend.general.types.admin_message')}</option>
              <option value="custom">{t('appConfig.notificationsSend.general.types.custom')}</option>
              <option value="broadcast">{t('appConfig.notificationsSend.general.types.broadcast')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="generalItemType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.general.itemTypeLabel')}</label>
            <select
              id="generalItemType"
              name="generalItemType"
              value={generalItemType}
              onChange={(e) => setGeneralItemType(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="">{t('appConfig.notificationsSend.general.itemTypes.any')}</option>
              <option value="tool">{t('appConfig.notificationsSend.general.itemTypes.tool')}</option>
              <option value="bhp">{t('appConfig.notificationsSend.general.itemTypes.bhp')}</option>
              <option value="admin">{t('appConfig.notificationsSend.general.itemTypes.admin')}</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={deleteGeneralNotifications}
              disabled={generalDeleting}
              className="w-full px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {t('appConfig.notificationsSend.general.deleteButton')}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600 dark:text-slate-300">{t('appConfig.notificationsSend.general.previewCount', { total: generalTotal })}</div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={generalSelectedIds.length === generalList.length && generalList.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setGeneralSelectedIds(generalList.map(r => r.id));
                    } else {
                      setGeneralSelectedIds([]);
                    }
                  }}
                  className="mr-2"
                />
                {t('appConfig.notificationsSend.general.selectAll')}
              </label>
              <button
                type="button"
                onClick={deleteGeneralNotifications}
                disabled={generalDeleting || (generalSelectedIds.length === 0 && generalTotal === 0)}
                className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              >
                {t('appConfig.notificationsSend.general.deleteSelected')}
              </button>
            </div>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
            {generalLoading ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{t('common.loading')}</div>
            ) : generalList.length === 0 ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{t('common.noData')}</div>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {generalList.map(row => (
                  <li key={row.id} className="p-3 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={generalSelectedIds.includes(row.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setGeneralSelectedIds(prev => [...prev, row.id]);
                        } else {
                          setGeneralSelectedIds(prev => prev.filter(id => id !== row.id));
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.subject || row.message || '-'}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">{t('appConfig.notificationsSend.general.meta', { type: row.type, itemType: row.item_type, created: formatDate(row.created_at) })}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {t('appConfig.notificationsSend.general.recipient', { name: row.recipient_name || `#${row.user_id}` })}
                        {' '}
                        • {t('appConfig.notificationsSend.general.readStatus', { status: row.read ? t('appConfig.notificationsSend.general.readStatuses.read') : t('appConfig.notificationsSend.general.readStatuses.unread') })}
                        {row.read && row.read_at ? ` • ${t('appConfig.notificationsSend.general.readAt', { date: formatDate(row.read_at) })}` : ''}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">#{row.id}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-slate-600 dark:text-slate-300">{t('appConfig.notificationsSend.history.paginationSummary', { page: generalPage, totalPages: Math.max(1, Math.ceil((generalTotal || 0) / (generalLimit || 1))), total: generalTotal || 0 })}</div>
            <div className="flex items-center gap-2">
              <button type="button" className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-sm" disabled={generalPage <= 1} onClick={() => setGeneralPage(p => Math.max(1, p - 1))}>{t('appConfig.notificationsSend.history.prev')}</button>
              <button type="button" className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-sm" disabled={generalPage >= Math.max(1, Math.ceil((generalTotal || 0) / (generalLimit || 1)))} onClick={() => setGeneralPage(p => p + 1)}>{t('appConfig.notificationsSend.history.next')}</button>
              <label htmlFor="generalLimit" className="sr-only">{t('appConfig.notificationsSend.history.perPage')}</label>
              <select id="generalLimit" name="generalLimit" value={generalLimit} onChange={(e) => { setGeneralLimit(parseInt(e.target.value, 10)); setGeneralPage(1); }} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-sm">
                {[10,20,50].map(n => (<option key={n} value={n}>{n}/page</option>))}
              </select>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-1">
          {['all','selected'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setNotifTab(key)}
              className={`px-3 py-1 rounded ${notifTab === key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow' : 'text-slate-600 dark:text-slate-300'}`}
            >
              {key === 'all' ? t('appConfig.notificationsSend.tabs.all') : t('appConfig.notificationsSend.tabs.selected')}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteNotifHistory(true)}
          className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {t('appConfig.notificationsSend.history.deleteAllButton')}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="notifSender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.senderLabel')}</label>
            <input
              id="notifSender"
              name="notifSender"
              type="text"
              value={notifSender}
              onChange={(e) => setNotifSender(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="notifSubject" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.subjectLabel')}</label>
            <input
              id="notifSubject"
              name="notifSubject"
              type="text"
              value={notifSubject}
              onChange={(e) => setNotifSubject(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="notifUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.urlLabel')}</label>
            <input
              id="notifUrl"
              name="notifUrl"
              type="text"
              placeholder={t('appConfig.notificationsSend.urlPlaceholder')}
              value={notifTab === 'all' ? notifUrlAll : notifUrlSelected}
              onChange={(e) => notifTab === 'all' ? setNotifUrlAll(e.target.value) : setNotifUrlSelected(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="notifMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.messageLabel')}</label>
            <textarea
              id="notifMessage"
              name="notifMessage"
              rows={5}
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
          {notifTab === 'all' && (
            <div className="mt-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input id="notifPushAll" name="notifPushAll" type="checkbox" checked={notifPushAllSelected} onChange={(e) => setNotifPushAllSelected(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded" />
                {t('appConfig.notificationsSend.pushAllLabel')}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input id="notifFanoutAll" name="notifFanoutAll" type="checkbox" checked={notifFanoutAllSelected} onChange={(e) => setNotifFanoutAllSelected(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded" />
                {t('appConfig.notificationsSend.fanoutAllLabel')}
              </label>
            </div>
          )}
            {notifTab === 'all' ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={sendAllNotifications}
                  disabled={
                    notifSending ||
                    (!notifPushAllSelected && !notifFanoutAllSelected)
                  }
                  className="inline-flex items-center px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {notifSending ? t('common.saving') : t('appConfig.notificationsSend.send')}
                </button>
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input id="notifPushSelected" name="notifPushSelected" type="checkbox" checked={notifPushSelected} onChange={(e) => setNotifPushSelected(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded" />
                    {t('appConfig.notificationsSend.pushSelectedLabel')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input id="notifFanoutSelected" name="notifFanoutSelected" type="checkbox" checked={notifFanoutSelected} onChange={(e) => setNotifFanoutSelected(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded" />
                    {t('appConfig.notificationsSend.fanoutLabel')}
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={sendSelectedNotifications}
                    disabled={notifSending || notifSelectedIds.length === 0}
                    className="inline-flex items-center px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {notifSending ? t('common.saving') : t('appConfig.notificationsSend.send')}
                  </button>
                </div>
              </>
            )}
          </div>
          {notifTab === 'selected' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-700 dark:text-gray-300">{t('appConfig.notificationsSend.usersListTitle')}</div>
              <input
                type="text"
                placeholder={t('common.search') || 'Szukaj pracownika...'}
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <div className="border border-slate-200 dark:border-slate-700 rounded-md max-h-96 overflow-y-auto bg-white dark:bg-slate-800">
                {notifUsersLoading ? (
                  <div className="p-3 text-sm text-gray-500 dark:text-gray-400">{t('loading.employees')}</div>
                ) : (notifUsers || []).length === 0 ? (
                  <div className="p-3 text-sm text-gray-500 dark:text-gray-400">{t('noData.tables')}</div>
                ) : (
                  (notifUsers || [])
                    .filter(u => {
                      const rawName = u.fullName ?? u.full_name ?? u.username ?? '';
                      const brand = u.brand_number ? String(u.brand_number) : '';
                      const q = userSearchQuery.toLowerCase();
                      return rawName.toLowerCase().includes(q) || brand.toLowerCase().includes(q);
                    })
                    .sort((a, b) => {
                      const brandA = a.brand_number ? String(a.brand_number) : '';
                      const brandB = b.brand_number ? String(b.brand_number) : '';
                      
                      // Put users with brand_number first
                      if (brandA && !brandB) return -1;
                      if (!brandA && brandB) return 1;
                      if (!brandA && !brandB) return (a.fullName || a.full_name || '').localeCompare(b.fullName || b.full_name || '');
                      
                      // Numeric sort for brand numbers
                      return brandA.localeCompare(brandB, undefined, { numeric: true, sensitivity: 'base' });
                    })
                    .map((u) => {
                      const id = u.id ?? u.user_id ?? u.userId;
                      const rawName = u.fullName ?? u.full_name ?? u.username ?? '—';
                      const name = u.brand_number ? `[${u.brand_number}] ${rawName}` : rawName;
                      const selected = notifSelectedIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleSelectUser(id)}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 border-slate-200 dark:border-slate-700 flex items-center justify-between ${selected ? 'bg-indigo-50 dark:bg-slate-700' : ''}`}
                        >
                          <span className="text-sm text-slate-800 dark:text-slate-100">{name}</span>
                          {selected && (<CheckIcon className="w-4 h-4 text-indigo-600" aria-hidden="true" />)}
                        </button>
                      );
                    })
                )}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {t('appConfig.notificationsSend.history.title', { type: notifTab === 'all' ? t('appConfig.notificationsSend.tabs.all') : t('appConfig.notificationsSend.tabs.selected') })}
          </div>
          {notifTab === 'all' && (
            <div>
              <label htmlFor="notif-history-all-search" className="sr-only">{t('appConfig.notificationsSend.history.searchPlaceholder')}</label>
              <input
                id="notif-history-all-search"
                name="notifHistoryAllSearch"
                type="text"
                placeholder={t('appConfig.notificationsSend.history.searchPlaceholder')}
                value={notifAllQuery}
                onChange={(e) => { setNotifAllQuery(e.target.value); setNotifAllPage(1); }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800">
                {notifHistoryLoadingAll ? (
                  <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{t('common.loading')}</div>
                ) : notifHistoryAll.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{t('common.noData')}</div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {notifHistoryAll.map(h => (
                      <li key={h.id} className="p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{h.subject}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{formatDate(h.created_at)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNotifExpandedAll(prev => prev.includes(h.id) ? prev.filter(x => x !== h.id) : [...prev, h.id])}
                            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                          >
                            {notifExpandedAll.includes(h.id) ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {notifExpandedAll.includes(h.id) && (
                          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                            {h.message}
                            {h.url && <div className="mt-1 text-indigo-600 dark:text-indigo-400 text-xs break-all">{h.url}</div>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="p-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-700/50">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('appConfig.notificationsSend.history.paginationSummary', { page: notifAllPage, totalPages: Math.max(1, Math.ceil((notifAllTotal || 0) / (notifAllLimit || 1))), total: notifAllTotal || 0 })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNotifAllPage(p => Math.max(1, p - 1))}
                      disabled={notifAllPage <= 1}
                      className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                    >
                      {t('appConfig.notificationsSend.history.prev')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifAllPage(p => p + 1)}
                      disabled={Math.ceil((notifAllTotal || 0) / (notifAllLimit || 1)) <= notifAllPage}
                      className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                    >
                      {t('appConfig.notificationsSend.history.next')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {notifTab === 'selected' && (
            <div>
              <input
                type="text"
                placeholder={t('appConfig.notificationsSend.history.searchPlaceholder')}
                value={notifSelQuery}
                onChange={(e) => { setNotifSelQuery(e.target.value); setNotifSelPage(1); }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800">
                {notifHistoryLoadingSelected ? (
                  <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{t('common.loading')}</div>
                ) : notifHistorySelected.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{t('common.noData')}</div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {notifHistorySelected.map(h => (
                      <li key={h.id} className="p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{h.subject}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{formatDate(h.created_at)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNotifExpandedSel(prev => prev.includes(h.id) ? prev.filter(x => x !== h.id) : [...prev, h.id])}
                            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                          >
                            {notifExpandedSel.includes(h.id) ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                          </button>
                        </div>
                        {notifExpandedSel.includes(h.id) && (
                          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                              {t('appConfig.notificationsSend.history.recipientsCount', { count: h.recipient_count || 0 })}
                            </div>
                            {h.message}
                            {h.url && <div className="mt-1 text-indigo-600 dark:text-indigo-400 text-xs break-all">{h.url}</div>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="p-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-700/50">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('appConfig.notificationsSend.history.paginationSummary', { page: notifSelPage, totalPages: Math.max(1, Math.ceil((notifSelTotal || 0) / (notifSelLimit || 1))), total: notifSelTotal || 0 })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNotifSelPage(p => Math.max(1, p - 1))}
                      disabled={notifSelPage <= 1}
                      className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                    >
                      {t('appConfig.notificationsSend.history.prev')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifSelPage(p => p + 1)}
                      disabled={Math.ceil((notifSelTotal || 0) / (notifSelLimit || 1)) <= notifSelPage}
                      className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                    >
                      {t('appConfig.notificationsSend.history.next')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfirmBroadcast && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('appConfig.notificationsSend.confirmBroadcast.title')}</h2>
            </div>
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-300 mb-6">{t('appConfig.notificationsSend.confirmBroadcast.message')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmBroadcast(false)}
                  className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  {t('appConfig.notificationsSend.confirmBroadcast.cancel')}
                </button>
                <button
                  onClick={async () => { setShowConfirmBroadcast(false); await reallySendAllNotifications(); }}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
                >
                  {t('appConfig.notificationsSend.confirmBroadcast.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={showDeleteNotifHistory}
        onClose={() => setShowDeleteNotifHistory(false)}
        onConfirm={deleteCurrentNotifHistory}
        title={t('appConfig.notificationsSend.history.deleteAllConfirm.title')}
        message={t('appConfig.notificationsSend.history.deleteAllConfirm.message', { tab: notifTab === 'all' ? t('appConfig.notificationsSend.tabs.all') : t('appConfig.notificationsSend.tabs.selected') })}
        confirmText={t('appConfig.notificationsSend.history.deleteAllConfirm.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
        loading={deletingNotifHistory}
      />
    </div>
  );
};

export default NotificationsTab;
