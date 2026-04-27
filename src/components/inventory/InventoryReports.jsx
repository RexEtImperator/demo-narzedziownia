import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../api';
import { ArrowPathIcon, ExclamationTriangleIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

const InventoryReports = () => {
  const { t } = useLanguage();
  const [lowStock, setLowStock] = useState([]);
  const [reorder, setReorder] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('lowStock'); // 'lowStock' or 'reorder'

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [lowStockData, reorderData] = await Promise.all([
        api.get('/api/inventory/low-stock'),
        api.get('/api/inventory/reorder-suggestions')
      ]);
      setLowStock(Array.isArray(lowStockData) ? lowStockData : []);
      setReorder(Array.isArray(reorderData) ? reorderData : []);
    } catch (error) {
      toast.error(error.message || t('inventory.reports.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('lowStock')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'lowStock'
                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 ring-1 ring-red-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-2">
              <ExclamationTriangleIcon className="h-5 w-5" />
              <span>{t('inventory.reports.lowStock') || 'Low Stock Alerts'}</span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-xs shadow-sm">
                {lowStock.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('reorder')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'reorder'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-2">
              <ShoppingCartIcon className="h-5 w-5" />
              <span>{t('inventory.reports.reorder') || 'Reorder Suggestions'}</span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-xs shadow-sm">
                {reorder.length}
              </span>
            </div>
          </button>
        </div>
        <button
          onClick={fetchData}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          title={t('common.refresh') || 'Refresh'}
        >
          <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                  {t('inventory.reports.toolName') || 'Tool Name'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                  {t('inventory.reports.sku') || 'SKU'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                  {t('inventory.reports.currentStock') || 'Current Stock'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                  {t('inventory.reports.minStock') || 'Min Stock'}
                </th>
                {activeTab === 'reorder' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('inventory.reports.suggestedReorder') || 'Suggested Reorder'}
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                  {t('inventory.reports.status') || 'Status'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {(activeTab === 'lowStock' ? lowStock : reorder).length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'reorder' ? 6 : 5} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {activeTab === 'lowStock' 
                      ? (t('inventory.reports.noLowStock') || 'No items are currently low on stock.')
                      : (t('inventory.reports.noReorder') || 'No reorder suggestions available.')}
                  </td>
                </tr>
              ) : (
                (activeTab === 'lowStock' ? lowStock : reorder).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                      {item.sku || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white font-bold">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                      {item.min_stock}
                    </td>
                    {activeTab === 'reorder' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400 font-bold">
                        {item.suggested_reorder}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {item.quantity === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          {t('inventory.reports.statusBadge.outOfStock') || 'Out of Stock'}
                        </span>
                      ) : item.quantity < item.min_stock ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                          {t('inventory.reports.statusBadge.lowStock') || 'Low Stock'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          {t('inventory.reports.statusBadge.ok') || 'OK'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryReports;
