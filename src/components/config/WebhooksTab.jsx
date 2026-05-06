import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  TrashIcon, 
  PencilIcon, 
  ArrowPathIcon,
  PlayIcon,
  ListBulletIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import api from '../../api';

const WebhooksTab = () => {
  const { t } = useLanguage();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    secret: '',
    events: [],
    is_active: true
  });

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedWebhookLogs, setSelectedWebhookLogs] = useState(null);

  const availableEvents = [
    { value: 'inventory.low_stock', label: t('appConfig.webhooks.events.lowStock') || 'Low Stock' },
    { value: 'tool.status_change', label: t('appConfig.webhooks.events.toolStatusChange') || 'Tool Status Change' },
    { value: 'tool.issue', label: t('appConfig.webhooks.events.toolIssue') || 'Tool Issue' },
    { value: 'tool.return', label: t('appConfig.webhooks.events.toolReturn') || 'Tool Return' },
    { value: 'inventory.correction', label: t('appConfig.webhooks.events.inventoryCorrection') || 'Inventory Correction' }
  ];

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/webhooks');
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.message || t('appConfig.webhooks.errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    Promise.resolve().then(() => { fetchWebhooks(); });
  }, [fetchWebhooks]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEventChange = (e) => {
    const { value, checked } = e.target;
    setFormData(prev => {
      const currentEvents = prev.events || [];
      if (checked) {
        return { ...prev, events: [...currentEvents, value] };
      } else {
        return { ...prev, events: currentEvents.filter(ev => ev !== value) };
      }
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      secret: '',
      events: [],
      is_active: true
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/api/webhooks/${editingId}`, formData);
        toast.success(t('appConfig.webhooks.success.updated'));
      } else {
        await api.post('/api/webhooks', formData);
        toast.success(t('appConfig.webhooks.success.created'));
      }
      resetForm();
      fetchWebhooks();
    } catch (error) {
      toast.error(error.message || t('appConfig.webhooks.errors.saveFailed'));
    }
  };

  const handleEdit = (webhook) => {
    setEditingId(webhook.id);
    setFormData({
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret || '', // Secret might be hidden or empty
      events: Array.isArray(webhook.events) ? webhook.events : (webhook.events ? JSON.parse(webhook.events) : []),
      is_active: !!webhook.is_active
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('appConfig.webhooks.confirmDelete'))) return;
    try {
      await api.delete(`/api/webhooks/${id}`);
      toast.success(t('appConfig.webhooks.success.deleted'));
      fetchWebhooks();
    } catch (error) {
      toast.error(error.message || t('appConfig.webhooks.errors.deleteFailed'));
    }
  };

  const handleTest = async (id) => {
    try {
      const result = await api.post(`/api/webhooks/${id}/test`);
      if (result.success) {
        toast.success(t('appConfig.webhooks.success.testSent'));
      } else {
        toast.warning(t('appConfig.webhooks.warnings.testFailed'));
      }
    } catch (error) {
      toast.error(error.message || t('appConfig.webhooks.errors.testFailed'));
    }
  };

  const handleViewLogs = async (id) => {
    try {
      setLogsLoading(true);
      setSelectedWebhookLogs(id);
      const data = await api.get(`/api/webhooks/${id}/logs`);
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.message || t('appConfig.webhooks.errors.logsFailed'));
    } finally {
      setLogsLoading(false);
    }
  };

  const closeLogs = () => {
    setSelectedWebhookLogs(null);
    setLogs([]);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {editingId ? (t('appConfig.webhooks.editTitle') || 'Edit Webhook') : (t('appConfig.webhooks.addTitle') || 'Add New Webhook')}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="webhook-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('appConfig.webhooks.fields.name') || 'Name'}
              </label>
              <input
                id="webhook-name"
                type="text"
                name="name"
                autoComplete="off"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="webhook-url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('appConfig.webhooks.fields.url') || 'Payload URL'}
              </label>
              <input
                id="webhook-url"
                type="url"
                name="url"
                autoComplete="url"
                value={formData.url}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="webhook-secret" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('appConfig.webhooks.fields.secret') || 'Secret (Optional)'}
              </label>
              <input
                id="webhook-secret"
                type="password"
                name="secret"
                autoComplete="new-password"
                value={formData.secret}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                name="is_active"
                id="is_active"
                checked={formData.is_active}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-slate-700 dark:text-slate-300">
                {t('appConfig.webhooks.fields.active') || 'Active'}
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('appConfig.webhooks.fields.events') || 'Trigger Events'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {availableEvents.map(event => (
                <div key={event.value} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`event-${event.value}`}
                    value={event.value}
                    checked={formData.events.includes(event.value)}
                    onChange={handleEventChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor={`event-${event.value}`} className="ml-2 text-sm text-slate-700 dark:text-slate-300">
                    {event.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {editingId ? (t('common.update') || 'Update') : (t('common.add') || 'Add')}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('appConfig.webhooks.listTitle') || 'Configured Webhooks'}
          </h3>
          <button 
            onClick={fetchWebhooks}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            title={t('common.refresh') || 'Refresh'}
          >
            <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{t('appConfig.webhooks.headers.name')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{t('appConfig.webhooks.headers.url')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{t('appConfig.webhooks.headers.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{t('appConfig.webhooks.headers.events')}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {webhooks.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t('appConfig.webhooks.noWebhooks')}
                  </td>
                </tr>
              ) : (
                webhooks.map((webhook) => (
                  <tr key={webhook.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                      {webhook.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {webhook.url}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        webhook.is_active 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {webhook.is_active 
                          ? (t('appConfig.webhooks.status.active') || 'Active') 
                          : (t('appConfig.webhooks.status.inactive') || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(webhook.events) ? webhook.events : (webhook.events ? JSON.parse(webhook.events) : [])).map(ev => (
                          <span key={ev} className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 rounded text-xs">
                            {ev.split('.').pop()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleTest(webhook.id)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                        title={t('appConfig.webhooks.actions.test') || 'Test Delivery'}
                      >
                        <PlayIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleViewLogs(webhook.id)}
                        className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300"
                        title={t('appConfig.webhooks.actions.logs')}
                      >
                        <ListBulletIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleEdit(webhook)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title={t('common.edit')}
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(webhook.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        title={t('common.delete')}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedWebhookLogs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('appConfig.webhooks.logsTitle') || 'Delivery Logs'}
              </h3>
              <button 
                onClick={closeLogs}
                className="text-slate-400 hover:text-slate-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {logsLoading ? (
                <div className="text-center py-8 text-slate-500">{t('common.loading')}</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">{t('appConfig.webhooks.noLogs') || 'No logs found'}</div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase">{t('appConfig.webhooks.logs.time') || 'Time'}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase">{t('appConfig.webhooks.logs.event') || 'Event'}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase">{t('appConfig.webhooks.logs.status') || 'Status'}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase">{t('appConfig.webhooks.logs.duration') || 'Duration'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
                          {log.event_type}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            log.status_code >= 200 && log.status_code < 300
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {log.status_code}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
                          {log.duration_ms}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={closeLogs}
                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper icon component since I used XMarkIcon which wasn't imported
function XMarkIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default WebhooksTab;
