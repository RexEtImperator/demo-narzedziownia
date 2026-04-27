import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { BuildingOfficeIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import ConfirmationModal from '../ConfirmationModal';

const DepartmentManagementScreen = ({ apiClient }) => {
  const { t } = useLanguage();
  const [departments, setDepartments] = useState([]);
  const [dbDepartments, setDbDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    managerId: '',
    status: 'active'
  });
  const [errors, setErrors] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/api/departments');
      setDbDepartments(Array.isArray(data) ? data : []);
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('common.error'));
      toast.error(msg);
      // Fallback: użyj domyślnych nazw działów z wymagań
      const fallbackNames = [
        'Administracja',
        'Automatyczny',
        'Elektryczny',
        'Mechaniczny',
        'Narzędziownia',
        'Skrawanie',
        'Pomiarowy',
        'Zewnętrzny',
        'Ślusarko-spawalniczy'
      ];
      const fallback = fallbackNames.map((name, idx) => ({
        id: idx + 1,
        name,
        description: '',
        managerId: '',
        managerName: 'Nie przypisano',
        employeeCount: 0,
        status: 'active'
      }));
      setDbDepartments(fallback);
    } finally {
      setLoading(false);
    }
  }, [apiClient, t]);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/employees');
      // Normalizuj do { id, name, department }
      const normalized = (Array.isArray(data) ? data : []).map(e => ({ 
        id: e.id || e.employee_id || e.brand_number, 
        name: `${e.first_name} ${e.last_name}`,
        department: e.department || e.department_name || ''
      }));
      setEmployees(normalized);
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('common.error'));
      toast.error(msg);
      // Fallback minimalny
      setEmployees([
        { id: 1, name: 'Jan Kowalski', department: '' },
        { id: 2, name: 'Anna Nowak', department: '' },
        { id: 3, name: 'Piotr Wiśniewski', department: '' }
      ]);
    }
  }, [apiClient, t]);

  useEffect(() => {
    fetchDepartments();
    fetchEmployees();
  }, [fetchDepartments, fetchEmployees]);

  // After downloading the data from the DB and employees, prepare a list to display with the missing departments
  useEffect(() => {
    const dbList = Array.isArray(dbDepartments) ? dbDepartments : [];
    const dbNames = new Set(dbList.map(d => (d.name || '').trim()).filter(Boolean));
    const employeeDeptNames = new Set((Array.isArray(employees) ? employees : [])
      .map(e => (e.department || '').trim())
      .filter(Boolean));

    const computeCount = (name) => {
      const n = (name || '').trim().toLowerCase();
      return (Array.isArray(employees) ? employees : []).filter(e => (e.department || '').trim().toLowerCase() === n).length;
    };

    const merged = dbList.map(d => {
      const managerIdRaw = d.managerId ?? d.manager_id ?? '';
      const managerId = managerIdRaw ? String(managerIdRaw) : '';
      const managerName = (Array.isArray(employees) ? employees : []).find(e => String(e.id) === managerId)?.name || 'Nie przypisano';
      return {
        id: d.id,
        name: d.name,
        description: d.description || '',
        managerId,
        managerName,
        employeeCount: computeCount(d.name),
        status: d.status || 'active',
        isMissing: false
      };
    });

    employeeDeptNames.forEach(name => {
      if (!dbNames.has(name)) {
        merged.push({
          id: null,
          name,
          description: '',
          managerId: '',
          managerName: 'Nie przypisano',
          employeeCount: computeCount(name),
          status: 'active',
          isMissing: true
        });
      }
    });

  setDepartments(merged);
  }, [dbDepartments, employees]);

  const handleAdd = () => {
    setEditingDepartment(null);
    setFormData({
      name: '',
      description: '',
      managerId: '',
      status: 'active'
    });
    setErrors({});
  setShowModal(true);
  };

  const handleEdit = (department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      description: department.description ?? '',
      managerId: department.managerId || '',
      status: department.status || 'active'
    });
    setErrors({});
    setShowModal(true);
  };

  const promptDelete = (department) => {
    setDeleteTarget(department);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.id) {
        await apiClient.delete(`/api/departments/${deleteTarget.id}`);
        setDbDepartments(prev => prev.filter(dept => dept.id !== deleteTarget.id));
        setDepartments(prev => prev.filter(dept => dept.id !== deleteTarget.id));
      } else {
        // Element without ID (not in the database): unlink employees by name and remove from the list
        const name = (deleteTarget.name || '').trim();
        if (name) {
          await apiClient.delete(`/api/departments/by-name/${encodeURIComponent(name)}`);
        }
        setDepartments(prev => prev.filter(dept => (dept.name || '').trim() !== name));
      }
      toast.success(t('departments.toast.deleted'));
      try { await fetchDepartments(); } catch (_) { void 0; }
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('departments.toast.deleteError'));
      toast.error(msg);
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Nazwa jest wymagana';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const managerNameFromForm = employees.find(e => String(e.id) === String(formData.managerId))?.name || 'Nie przypisano';
      const isExisting = !!(editingDepartment && editingDepartment.id != null);

      if (isExisting) {
        // Updating full details in DB (PUT)
        const updated = await apiClient.put(`/api/departments/${editingDepartment.id}`, {
          name: formData.name,
          description: formData.description,
          manager_id: formData.managerId || null,
          status: formData.status
        });
        const managerName = employees.find(e => String(e.id) === String(updated.manager_id ?? formData.managerId))?.name || managerNameFromForm;
        setDbDepartments(prev => prev.map(dept => 
          dept.id === editingDepartment.id ? { ...dept, ...updated } : dept
        ));
        setDepartments(prev => prev.map(dept => 
          dept.id === editingDepartment.id 
            ? { ...dept, ...formData, managerName, isMissing: false }
            : dept
        ));
      } else {
        // Dodawanie pełnych szczegółów do DB (POST)
        const created = await apiClient.post('/api/departments', {
          name: formData.name,
          description: formData.description,
          manager_id: formData.managerId || null,
          status: formData.status
        });
        const managerName = employees.find(e => String(e.id) === String(created.manager_id ?? formData.managerId))?.name || managerNameFromForm;
        const newDepartment = {
          id: created.id,
          name: created.name,
          description: created.description || formData.description,
          managerId: created.manager_id ?? formData.managerId,
          managerName,
          employeeCount: 0,
          status: created.status || formData.status
        };
        // Keep the full record from API in dbDepartments for future normalizations to have correct fields
        setDbDepartments(prev => [...prev, created]);
        setDepartments(prev => {
          // If editing a missing record (isMissing), replace the entry by name
          if (editingDepartment && editingDepartment.isMissing) {
            const nameKey = (editingDepartment.name || '').trim().toLowerCase();
            return prev.map(dept => (
              (dept.id == null && (dept.name || '').trim().toLowerCase() === nameKey)
                ? { ...dept, ...newDepartment, isMissing: false }
                : dept
            ));
          }
          // If not editing a missing record, add a new entry
          return [...prev, { ...newDepartment, isMissing: false }];
        });
      }
      toast.success(t('departments.toast.saved'));
      // Refresh the list from API to ensure UI shows the latest data
      try {
        await fetchDepartments();
      } catch (_) {
        void 0;
      }
      setShowModal(false);
    } catch (error) {
      const apiMsg = error?.messageKey ? t(error.messageKey) : ((error && error.message) ? error.message : (error?.response?.data?.error || t('departments.toast.saveError')));
      setErrors(prev => ({ ...prev, submit: apiMsg }));
      toast.error(apiMsg);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { label: t('departments.status.active'), className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
      inactive: { label: t('departments.status.inactive'), className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' }
    };
    
    const config = statusConfig[status] || statusConfig.active;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('departments.header.title')}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('departments.header.subtitle')}</p>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <PlusIcon className="w-4 h-4 mr-2" aria-hidden="true" />
          {t('departments.actions.add')}
        </button>
      </div>

      {/* Departments Table */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden sm:rounded-xl">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t('loading.departments')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {departments.map((department) => (
              <li key={department.id != null ? `dept-${department.id}` : `missing-${(department.name || '').trim().toLowerCase()}` }>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
                        <BuildingOfficeIcon className="w-6 h-6 text-white" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center">
                        <div className={`text-sm font-medium ${department.isMissing ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {department.name}{typeof department.employeeCount === 'number' ? ` (${department.employeeCount})` : ''}
                        </div>
                        {department.isMissing && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            {t('departments.list.missingBadge')}
                          </span>
                        )}
                        <div className="ml-2">
                          {getStatusBadge(department.status)}
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {department.description}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        {t('departments.list.managerPrefix')}{department.managerName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(department)}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm font-medium"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => promptDelete(department)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                    >
                      {t('common.remove')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowModal(false)}></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

            <div className="inline-block align-bottom bg-white dark:bg-slate-800 rounded-xl text-left overflow-hidden shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 transform transition-all sm:my-12 sm:align-middle sm:max-w-xl sm:w-full">
              <form onSubmit={handleSubmit}>
                <div className="bg-white dark:bg-slate-800">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {editingDepartment ? t('departments.modal.titles.edit') : t('departments.modal.titles.add')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      aria-label={t('common.close')}
                      className="inline-flex items-center justify-center rounded-md p-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      <XMarkIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="px-6 pt-4 pb-6">
                  {errors.submit && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                      <p className="text-sm text-red-700 dark:text-red-300">{errors.submit}</p>
                    </div>
                  )}

                  <div className="space-y-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('departments.modal.labels.name')}
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={t('departments.modal.placeholders.name')}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 ${
                          errors.name ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{t('departments.modal.errors.nameRequired')}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('departments.modal.labels.description')}
                      </label>
                      <textarea
                        name="description"
                        id="description"
                        rows={3}
                        value={formData.description ?? ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={t('departments.modal.placeholders.description')}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="managerId" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('departments.modal.labels.manager')}
                      </label>
                      <select
                        name="managerId"
                        id="managerId"
                        value={formData.managerId}
                        onChange={(e) => setFormData(prev => ({ ...prev, managerId: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value="">{t('departments.modal.options.unassigned')}</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('departments.modal.labels.status')}
                      </label>
                      <select
                        name="status"
                        id="status"
                        value={formData.status}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value="active">{t('departments.status.active')}</option>
                        <option value="inactive">{t('departments.status.inactive')}</option>
                      </select>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Zapisz
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-gray-700 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => { if (!deleteLoading) { setShowDeleteModal(false); setDeleteTarget(null); } }}
        onConfirm={handleConfirmDelete}
        title="Usuń dział"
        message={`Czy na pewno chcesz usunąć dział "${deleteTarget?.name || ''}"?`}
        confirmText="Usuń"
        cancelText={t('common.cancel')}
        type="danger"
        loading={deleteLoading}
      />
    </div>
  );
};

export default DepartmentManagementScreen;
