import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { PERMISSIONS, hasPermission } from '../../constants';
import { AUDIT_ACTIONS } from '../../constants/auditActions';
import { addAuditLog } from '../../utils/auditLogger';
import ConfirmationModal from '../ConfirmationModal';

function DangerZoneTab({ user, apiClient, t }) {
  const [showDeleteHistoryConfirm, setShowDeleteHistoryConfirm] = useState(false);
  const [showDeleteEmployeesConfirm, setShowDeleteEmployeesConfirm] = useState(false);
  const [showDeleteServiceHistoryConfirm, setShowDeleteServiceHistoryConfirm] = useState(false);
  const [showDeleteToolIssuesConfirm, setShowDeleteToolIssuesConfirm] = useState(false);
  const [showDeleteToolReturnsConfirm, setShowDeleteToolReturnsConfirm] = useState(false);
  const [showDeleteBhpIssuesConfirm, setShowDeleteBhpIssuesConfirm] = useState(false);
  const [showDeleteBhpReturnsConfirm, setShowDeleteBhpReturnsConfirm] = useState(false);

  const handleDeleteHistory = async () => {
    try {
      await apiClient.delete('/api/tools/history/all');
      toast.success(t('admin.toast.historyDeleted'));
      setShowDeleteHistoryConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto historię wydań narzędzi');
    } catch (error) {
      console.error('Error deleting history:', error);
      toast.error(t('admin.toast.historyDeleteError'));
    }
  };

  const handleDeleteEmployees = async () => {
    try {
      await apiClient.delete('/employees/all');
      toast.success(t('admin.toast.employeesDeleted'));
      setShowDeleteEmployeesConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto wszystkich pracowników');
    } catch (error) {
      console.error('Error deleting employees:', error);
      toast.error(t('admin.toast.employeesDeleteError'));
    }
  };

  const handleDeleteServiceHistory = async () => {
    try {
      await apiClient.delete('/api/tools/service-history');
      toast.success(t('admin.toast.serviceHistoryDeleted'));
      setShowDeleteServiceHistoryConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto historię serwisowania');
    } catch (error) {
      console.error('Error deleting service history:', error);
      toast.error(t('admin.toast.serviceHistoryDeleteError'));
    }
  };

  const handleDeleteToolIssuesHistory = async () => {
    try {
      await apiClient.delete('/api/tool-issues/history/issues');
      toast.success(t('admin.toast.toolIssuesHistoryDeleted'));
      setShowDeleteToolIssuesConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto historię WYDAŃ narzędzi');
    } catch (error) {
      console.error('Error deleting tool issues history:', error);
      toast.error(t('admin.toast.toolIssuesHistoryDeleteError'));
    }
  };

  const handleDeleteToolReturnsHistory = async () => {
    try {
      await apiClient.delete('/api/tool-issues/history/returns');
      toast.success(t('admin.toast.toolReturnsHistoryDeleted'));
      setShowDeleteToolReturnsConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto historię ZWROTÓW narzędzi');
    } catch (error) {
      console.error('Error deleting tool returns history:', error);
      toast.error(t('admin.toast.toolReturnsHistoryDeleteError'));
    }
  };

  const handleDeleteBhpIssuesHistory = async () => {
    try {
      await apiClient.delete('/api/bhp-issues/history/issues');
      toast.success(t('admin.toast.bhpIssuesHistoryDeleted'));
      setShowDeleteBhpIssuesConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto historię WYDAŃ BHP');
    } catch (error) {
      console.error('Error deleting BHP issues history:', error);
      toast.error(t('admin.toast.bhpIssuesHistoryDeleteError'));
    }
  };

  const handleDeleteBhpReturnsHistory = async () => {
    try {
      await apiClient.delete('/api/bhp-issues/history/returns');
      toast.success(t('admin.toast.bhpReturnsHistoryDeleted'));
      setShowDeleteBhpReturnsConfirm(false);
      addAuditLog(user, AUDIT_ACTIONS.ACCESS_ADMIN, 'Usunięto historię ZWROTÓW BHP');
    } catch (error) {
      console.error('Error deleting BHP returns history:', error);
      toast.error(t('admin.toast.bhpReturnsHistoryDeleteError'));
    }
  };

  if (!hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS) && user?.role !== 'administrator') {
    return (
      <div className="text-center p-8 text-slate-500">
        {t('common.noPermission')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <p className="text-slate-600 dark:text-slate-400">{t('admin.danger.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sekcja: Narzędzia */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🗑️</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('admin.danger.tools.title')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.danger.tools.subtitle')}</p>
            </div>
          </div>
          <div className="flex-1"></div>
          <div className="space-y-6">
            {(hasPermission(user, PERMISSIONS.DELETE_ISSUE_HISTORY) || hasPermission(user, PERMISSIONS.DELETE_RETURN_HISTORY)) && (
              <div>
                <div className="space-y-3">
                  {hasPermission(user, PERMISSIONS.DELETE_ISSUE_HISTORY) && (
                    <button
                      onClick={() => setShowDeleteToolIssuesConfirm(true)}
                      className="w-full bg-red-600 dark:bg-red-700 text-white py-2 px-4 rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
                    >
                      {t('admin.actions.deleteIssues')}
                    </button>
                  )}
                  {hasPermission(user, PERMISSIONS.DELETE_RETURN_HISTORY) && (
                    <button
                      onClick={() => setShowDeleteToolReturnsConfirm(true)}
                      className="w-full bg-red-600 dark:bg-red-700 text-white py-2 px-4 rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
                    >
                      {t('admin.actions.deleteReturns')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Sekcja: Sprzęt BHP */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🗑️</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('admin.danger.bhp.title')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.danger.bhp.subtitle')}</p>
            </div>
          </div>
          <div className="space-y-6">
            {(hasPermission(user, PERMISSIONS.DELETE_ISSUE_HISTORY) || hasPermission(user, PERMISSIONS.DELETE_RETURN_HISTORY)) && (
              <div>
                <div className="space-y-3">
                  {hasPermission(user, PERMISSIONS.DELETE_ISSUE_HISTORY) && (
                    <button
                      onClick={() => setShowDeleteBhpIssuesConfirm(true)}
                      className="w-full bg-orange-600 dark:bg-orange-700 text-white py-2 px-4 rounded-lg hover:bg-orange-700 dark:hover:bg-orange-800 transition-colors"
                    >
                      {t('admin.actions.deleteIssues')}
                    </button>
                  )}
                  {hasPermission(user, PERMISSIONS.DELETE_RETURN_HISTORY) && (
                    <button
                      onClick={() => setShowDeleteBhpReturnsConfirm(true)}
                      className="w-full bg-orange-600 dark:bg-orange-700 text-white py-2 px-4 rounded-lg hover:bg-orange-700 dark:hover:bg-orange-800 transition-colors"
                    >
                      {t('admin.actions.deleteReturns')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Serwisowanie */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🗑️</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('admin.danger.service.title')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.danger.service.subtitle')}</p>
            </div>
          </div>
          <div className="space-y-6">
            {hasPermission(user, PERMISSIONS.DELETE_SERVICE_HISTORY) && (
              <div>
                <button
                  onClick={() => setShowDeleteServiceHistoryConfirm(true)}
                  className="w-full bg-rose-600 dark:bg-rose-700 text-white py-2 px-4 rounded-lg hover:bg-rose-700 dark:hover:bg-rose-800 transition-colors"
                >
                  {t('admin.actions.deleteServiceHistory')}
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Pracownicy */}
        {hasPermission(user, PERMISSIONS.MANAGE_EMPLOYEES) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🗑️</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('admin.danger.employees.title')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.danger.employees.subtitle')}</p>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <button 
                onClick={() => setShowDeleteEmployeesConfirm(true)}
                className="w-full bg-yellow-600 dark:bg-yellow-700 text-white py-2 px-4 rounded-lg hover:bg-yellow-700 dark:hover:bg-yellow-800 transition-colors"
              >
                {t('admin.actions.deleteEmployees')}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* History deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteHistoryConfirm}
        onClose={() => setShowDeleteHistoryConfirm(false)}
        onConfirm={handleDeleteHistory}
        title={t('admin.modals.deleteAllIssues.title')}
        message={t('admin.modals.deleteAllIssues.message')}
        confirmText={t('admin.modals.deleteAllIssues.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
      {/* Service history deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteServiceHistoryConfirm}
        onClose={() => setShowDeleteServiceHistoryConfirm(false)}
        onConfirm={handleDeleteServiceHistory}
        title={t('admin.modals.deleteServiceHistory.title')}
        message={t('admin.modals.deleteServiceHistory.message')}
        confirmText={t('admin.modals.deleteServiceHistory.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
      {/* Tool issues history deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteToolIssuesConfirm}
        onClose={() => setShowDeleteToolIssuesConfirm(false)}
        onConfirm={handleDeleteToolIssuesHistory}
        title={t('admin.modals.deleteToolIssues.title')}
        message={t('admin.modals.deleteToolIssues.message')}
        confirmText={t('admin.modals.deleteToolIssues.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
      {/* Tools returns history deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteToolReturnsConfirm}
        onClose={() => setShowDeleteToolReturnsConfirm(false)}
        onConfirm={handleDeleteToolReturnsHistory}
        title={t('admin.modals.deleteToolReturns.title')}
        message={t('admin.modals.deleteToolReturns.message')}
        confirmText={t('admin.modals.deleteToolReturns.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
      {/* BHP returns history deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteBhpIssuesConfirm}
        onClose={() => setShowDeleteBhpIssuesConfirm(false)}
        onConfirm={handleDeleteBhpIssuesHistory}
        title={t('admin.modals.deleteBhpIssues.title')}
        message={t('admin.modals.deleteBhpIssues.message')}
        confirmText={t('admin.modals.deleteBhpIssues.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
      {/* BHP returns history deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteBhpReturnsConfirm}
        onClose={() => setShowDeleteBhpReturnsConfirm(false)}
        onConfirm={handleDeleteBhpReturnsHistory}
        title={t('admin.modals.deleteBhpReturns.title')}
        message={t('admin.modals.deleteBhpReturns.message')}
        confirmText={t('admin.modals.deleteBhpReturns.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
      {/* Employees deletion confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteEmployeesConfirm}
        onClose={() => setShowDeleteEmployeesConfirm(false)}
        onConfirm={handleDeleteEmployees}
        title={t('admin.modals.deleteEmployees.title')}
        message={t('admin.modals.deleteEmployees.message')}
        confirmText={t('admin.modals.deleteEmployees.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
      />
    </div>
  );
}

export default DangerZoneTab;
