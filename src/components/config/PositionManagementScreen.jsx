import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, BriefcaseIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import ConfirmationModal from '../ConfirmationModal';
import { useLanguage } from '../../contexts/LanguageContext';

const PositionManagementScreen = ({ apiClient }) => {
  const { t } = useLanguage();
  const [positions, setPositions] = useState([]);
  const [dbPositions, setDbPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    departmentId: '',
    requirements: '',
    status: 'active'
  });
  const [errors, setErrors] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/api/positions');
      // Normalizacja ewentualnych pól z API
      const normalized = (Array.isArray(data) ? data : []).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        departmentId: p.departmentId || p.department_id || '',
        departmentName: p.departmentName || p.department_name || '',
        requirements: p.requirements || '',
        employeeCount: p.employeeCount || p.employee_count || 0,
        status: p.status || 'active'
      }));
      setDbPositions(normalized);
    } catch (error) {
      toast.error(error?.message || t('common.error'));
      const fallbackNames = [
        'Kierownik działu',
        'Automatyk',
        'Elektryk',
        'Mechanik',
        'Narzędziowiec',
        'Pomiarowiec',
        'Tokarz',
        'Spawacz',
        'Ślusarz',
        'Zewnętrzny'
      ];
      const fallback = fallbackNames.map((name, idx) => ({
        id: idx + 1,
        name,
        description: '',
        departmentId: '',
        departmentName: '',
        requirements: '',
        employeeCount: 0,
        status: 'active'
      }));
      setDbPositions(fallback);
    } finally {
      setLoading(false);
    }
  }, [apiClient, t]);

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/departments');
      const normalized = (Array.isArray(data) ? data : []).map(d => ({ id: d.id, name: d.name }));
      setDepartments(normalized);
    } catch (error) {
      toast.error(error?.message || t('common.error'));
      setDepartments([
        { id: 1, name: 'Administracja' },
        { id: 2, name: 'Automatyczny' },
        { id: 3, name: 'Elektryczny' },
        { id: 4, name: 'Mechaniczny' },
        { id: 5, name: 'Narzędziownia' },
        { id: 6, name: 'Skrawanie' },
        { id: 7, name: 'Pomiarowy' },
        { id: 8, name: 'Zewnętrzny' },
        { id: 9, name: 'Ślusarko-spawalniczy' }
      ]);
    }
  }, [apiClient, t]);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/employees');
      const normalized = (Array.isArray(data) ? data : []).map(e => ({ 
        id: e.id || e.employee_id || e.brand_number, 
        name: `${e.first_name} ${e.last_name}`,
        position: e.position || e.position_name || ''
      }));
      setEmployees(normalized);
    } catch (error) {
      toast.error(error?.message || t('common.error'));
      setEmployees([
        { id: 1, name: 'Jan Kowalski', position: '' },
        { id: 2, name: 'Anna Nowak', position: '' }
      ]);
    }
  }, [apiClient, t]);

  useEffect(() => {
    fetchPositions();
    fetchDepartments();
    fetchEmployees();
  }, [fetchPositions, fetchDepartments, fetchEmployees]);

  // After downloading the positions from the DB and employee data, merge the missing positions
  useEffect(() => {
    const dbList = Array.isArray(dbPositions) ? dbPositions : [];
    const dbNames = new Set(dbList.map(p => (p.name || '').trim()).filter(Boolean));
    const employeePositionNames = new Set((Array.isArray(employees) ? employees : [])
      .map(e => (e.position || '').trim())
      .filter(Boolean));

    const computeCount = (name) => {
      const n = (name || '').trim().toLowerCase();
      return (Array.isArray(employees) ? employees : []).filter(e => (e.position || '').trim().toLowerCase() === n).length;
    };

    const getDepartmentNameById = (deptId) => {
      const idNum = Number(deptId);
      if (!Number.isFinite(idNum) || idNum <= 0) return '';
      const found = (Array.isArray(departments) ? departments : []).find(d => Number(d.id) === idNum);
      return found?.name || '';
    };

    const merged = dbList.map(p => ({
      ...p,
      // Ensure departmentName is always computed from departments
      departmentName: p.departmentName || getDepartmentNameById(p.departmentId || p.department_id),
      employeeCount: computeCount(p.name)
    }));
    employeePositionNames.forEach(name => {
      if (!dbNames.has(name)) {
        merged.push({
          id: null,
          name,
          description: '',
          departmentId: '',
          departmentName: '',
          requirements: '',
          employeeCount: computeCount(name),
          status: 'active',
          isMissing: true
        });
      }
    });

    setPositions(merged);
  }, [dbPositions, employees, departments]);

  const handleAdd = () => {
    setEditingPosition(null);
    setFormData({
      name: '',
      description: '',
      departmentId: '',
      requirements: '',
      status: 'active'
    });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (position) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      description: position.description,
      departmentId: String(position.departmentId ?? ''),
      requirements: position.requirements || '',
      status: position.status
    });
    setErrors({});
    setShowModal(true);
  };

  const promptDelete = (position) => {
    setDeleteTarget(position);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.id) {
        await apiClient.delete(`/api/positions/${deleteTarget.id}`);
        setDbPositions(prev => prev.filter(pos => pos.id !== deleteTarget.id));
        setPositions(prev => prev.filter(pos => pos.id !== deleteTarget.id));
      } else {
        // Element bez ID (brak w bazie): odczep pracowników po nazwie i usuń z listy
        const name = (deleteTarget.name || '').trim();
        if (name) {
          await apiClient.delete(`/api/positions/by-name/${encodeURIComponent(name)}`);
        }
        setPositions(prev => prev.filter(pos => (pos.name || '').trim() !== name));
      }
      toast.success(t('positions.toastr.positionDeleted'));
      try { await fetchPositions(); } catch (_) { void 0; }
    } catch (error) {
      toast.error(error?.message || t('positions.toastr.errors.positionDeleteError'));
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
    if (!formData.departmentId) {
      newErrors.departmentId = 'Departament jest wymagany';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const departmentIdNum = Number(formData.departmentId);
      if (!Number.isInteger(departmentIdNum) || departmentIdNum <= 0) {
        setErrors(prev => ({ ...prev, departmentId: 'Nieprawidłowy departament' }));
        toast.error(t('positions.toastr.errors.invalidDepartment'));
        return;
      }
      const departmentName = departments.find(d => d.id.toString() === formData.departmentId)?.name || '';
      
      if (editingPosition && editingPosition.id != null) {
        // Update complete details in DB
        const updated = await apiClient.put(`/api/positions/${editingPosition.id}`, {
          name: formData.name,
          description: formData.description,
          department_id: departmentIdNum,
          requirements: formData.requirements,
          status: formData.status
        });
        setDbPositions(prev => prev.map(pos => 
          pos.id === editingPosition.id ? { ...pos, ...updated } : pos
        ));
        setPositions(prev => prev.map(pos => 
          pos.id === editingPosition.id 
            ? { 
                ...pos, 
                ...formData, 
                departmentId: departmentIdNum,
                departmentName,
                isMissing: false
              }
            : pos
        ));
        toast.success(t('positions.toastr.positionUpdated'));
      } else {
        // Add complete details to DB
        const created = await apiClient.post('/api/positions', {
          name: formData.name,
          description: formData.description,
          department_id: departmentIdNum,
          requirements: formData.requirements,
          status: formData.status
        });
        const newPosition = {
          id: created.id,
          name: created.name,
          description: created.description || formData.description,
          departmentId: created.department_id ?? departmentIdNum,
          departmentName,
          requirements: created.requirements || formData.requirements,
          employeeCount: 0,
          status: created.status || formData.status
        };
        setDbPositions(prev => [...prev, { id: created.id, name: created.name, description: created.description || '' }]);
        setPositions(prev => [...prev, { ...newPosition, isMissing: false }]);
        toast.success(t('positions.toastr.positionCreated'));
      }
      // Refresh position list from API to ensure DB and local state are synchronized
      try {
        await fetchPositions();
      } catch (_) {
        // If refresh fails, keep local changes
        toast.error(t('positions.toastr.errors.refreshError'));
      }
      setShowModal(false);
    } catch (error) {
      toast.error(error?.message || t('positions.toastr.errors.save'));
      let apiMsg = 'Nie udało się zapisać stanowiska';
      if (error && typeof error.message === 'string') {
        try {
          const parsed = JSON.parse(error.message);
          apiMsg = parsed.error || parsed.message || apiMsg;
        } catch (_) {
          apiMsg = error.message || apiMsg;
        }
      }
      setErrors(prev => ({ ...prev, submit: apiMsg }));
      toast.error(apiMsg);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { label: t('positions.status.active'), className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' },
      inactive: { label: t('positions.status.inactive'), className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' }
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('positions.header.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('positions.header.subtitle')}</p>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <PlusIcon className="w-4 h-4 mr-2" aria-hidden="true" />
          {t('positions.actions.add')}
        </button>
      </div>
      {/* Positions Table */}
      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('loading.data')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {positions.map((position) => (
              <li key={position.id != null ? `pos-${position.id}` : `missing-${(position.name || '').trim().toLowerCase()}` }>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <BriefcaseIcon className="w-6 h-6 text-white" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center">
                        <div className={`text-sm font-medium ${position.isMissing ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                          {position.name}{typeof position.employeeCount === 'number' ? ` (${position.employeeCount})` : ''}
                        </div>
                        {position.isMissing && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            {t('positions.list.statusMissing')}
                          </span>
                        )}
                        <div className="ml-2">
                          {getStatusBadge(position.status)}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {position.description}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t('positions.list.departmentPrefix')}{position.departmentName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(position)}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm font-medium"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => promptDelete(position)}
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

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleSubmit}>
                <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
                    {editingPosition ? t('positions.modal.titles.edit') : t('positions.modal.titles.add')}
                  </h3>
                  {errors.submit && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                      <p className="text-sm text-red-700 dark:text-red-300">{errors.submit}</p>
                    </div>
                  )}
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('positions.modal.labels.name')}
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={t('positions.modal.placeholders.name')}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-500 ${
                          errors.name ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-gray-600'
                        }`}
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-red-600">{t('positions.modal.errors.nameRequired')}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('positions.modal.labels.department')}
                      </label>
                      <select
                        name="departmentId"
                        id="departmentId"
                        value={formData.departmentId}
                        onChange={(e) => setFormData(prev => ({ ...prev, departmentId: e.target.value }))}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                          errors.departmentId ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-gray-600'
                        }`}
                      >
                        <option value="">{t('positions.modal.select.department')}</option>
                        {departments.map(dept => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                      {errors.departmentId && (
                        <p className="mt-1 text-sm text-red-600">{t('positions.modal.errors.departmentRequired')}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('positions.modal.labels.description')}
                      </label>
                      <textarea
                        name="description"
                        id="description"
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-500"
                        placeholder={t('positions.modal.placeholders.description')}
                      />
                    </div>
                    <div>
                      <label htmlFor="requirements" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('positions.modal.labels.requirements')}
                      </label>
                      <textarea
                        name="requirements"
                        id="requirements"
                        rows={3}
                        value={formData.requirements}
                        onChange={(e) => setFormData(prev => ({ ...prev, requirements: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-500"
                        placeholder={t('positions.modal.placeholders.requirements')}
                      />
                    </div>
                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('positions.modal.labels.status')}
                      </label>
                      <select
                        name="status"
                        id="status"
                        value={formData.status}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="active">{t('positions.status.active')}</option>
                        <option value="inactive">{t('positions.status.inactive')}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    {t('positions.modal.buttons.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
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
        title={t('positions.delete.title')}
        message={`${t('positions.delete.message')} "${deleteTarget?.name || ''}"?`}
        confirmText={t('positions.delete.confirmText')}
        cancelText={t('common.cancel')}
        type="danger"
        loading={deleteLoading}
      />
    </div>
  );
};

export default PositionManagementScreen;