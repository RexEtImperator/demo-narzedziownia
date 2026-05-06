import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../api';
import { useLanguage } from '../contexts/LanguageContext';
 
import { TrashIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';

const ReportsScreen = ({ user, employees = [] }) => {
  const { t } = useLanguage();

  const [type, setType] = useState('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [toolId, setToolId] = useState('');
  const [bhpItemId, setBhpItemId] = useState('');
  const [bhpCategory, setBhpCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [issuedTools, setIssuedTools] = useState([]);
  const [issuedBhpItems, setIssuedBhpItems] = useState([]);
  const [loadingIssuedTools, setLoadingIssuedTools] = useState(false);
  const [loadingIssuedBhp, setLoadingIssuedBhp] = useState(false);

  // Admin-only: list and filters
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'list''
  const isAdmin = user?.role === 'administrator';
  const isEmployee = String(user?.role) === 'employee';
  const [list, setList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const statusOptions = useMemo(() => ([
    { value: 'accepted', label: t('reports.status.accepted') },
    { value: 'checking', label: t('reports.status.checking') },
    { value: 'resolved', label: t('reports.status.resolved') },
  ]), [t]);

  const resetForm = () => {
    setEmployeeId('');
    setEmployeeName('');
    setToolId('');
    setBhpItemId('');
    setBhpCategory('');
    setSubject('');
    setDescription('');
    setSeverity('medium');
    setAttachments([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('type', type);
    formData.append('employeeId', type === 'employee' ? (employeeId || '') : '');
    if (type === 'employee' && !isAdmin) {
      formData.append('employeeName', employeeName || '');
    }
    formData.append('toolId', type === 'tool' ? (toolId || '') : '');
    formData.append('bhpCategory', type === 'bhp' ? (bhpCategory || '') : '');
    formData.append('subject', subject || '');
    formData.append('description', description || '');
    formData.append('severity', severity || '');
    // Attach files
    (attachments || []).forEach((file) => {
      formData.append('attachments', file);
    });

    try {
      await api.postForm('/api/reports', formData);
      toast.success(t('reports.toast.success'));
      resetForm();
      if (isAdmin && activeTab === 'list') {
        await fetchList();
      }
    } catch (err) {
      toast.error(err?.message || t('reports.toast.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const fetchList = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterSeverity) params.append('severity', filterSeverity);
      if (filterStatus) params.append('status', filterStatus);
      const data = await api.get(`/api/reports${params.toString() ? `?${params.toString()}` : ''}`);
      setList(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      toast.error(err?.message || t('reports.toast.fetchError'));
    } finally {
      setLoadingList(false);
    }
  }, [isAdmin, filterType, filterSeverity, filterStatus, t]);

  useEffect(() => {
    if (isAdmin && activeTab === 'list') {
      fetchList();
    }
  }, [isAdmin, activeTab, filterType, filterSeverity, filterStatus, fetchList]);

  // Auto-select logged-in employee for 'tool' type if user is employee
  useEffect(() => {
    if (type !== 'tool' || !isEmployee) return;
    if (employeeId) return;
    const matched = (Array.isArray(employees) ? employees : []).find(e => String(e.login || '') === String(user?.username || ''));
    if (matched?.id) {
      Promise.resolve().then(() => {
        setEmployeeId(String(matched.id));
        const name = `${matched.first_name || ''} ${matched.last_name || ''}`.trim();
        if (name) setEmployeeName(name);
      });
    }
  }, [type, isEmployee, user, employees, employeeId]);

  // Auto-select logged-in employee for 'bhpIssued' type if user is employee
  useEffect(() => {
    if (type !== 'bhpIssued' || !isEmployee) return;
    if (employeeId) return;
    const matched = (Array.isArray(employees) ? employees : []).find(e => String(e.login || '') === String(user?.username || ''));
    if (matched?.id) {
      Promise.resolve().then(() => {
        setEmployeeId(String(matched.id));
        const name = `${matched.first_name || ''} ${matched.last_name || ''}`.trim();
        if (name) setEmployeeName(name);
      });
    }
  }, [type, isEmployee, user, employees, employeeId]);

  // Fetch issued tools for selected employee when reporting on 'tool'
  useEffect(() => {
    const fetchIssuedTools = async () => {
      if (type !== 'tool' || !employeeId) {
        setIssuedTools([]);
        return;
      }
      setLoadingIssuedTools(true);
      try {
        const data = await api.get(`/api/tool-issues?status=issued&employee_id=${employeeId}&limit=200`);
        const items = Array.isArray(data?.data) ? data.data : [];
        // Deduplicate by tool_id
        const map = new Map();
        items.forEach(it => {
          if (it.tool_id && !map.has(it.tool_id)) {
            map.set(it.tool_id, { id: it.tool_id, name: it.tool_name });
          }
        });
        setIssuedTools(Array.from(map.values()));
        // Reset tool selection if no longer valid
        if (!Array.from(map.keys()).includes(Number(toolId))) {
          setToolId('');
        }
      } catch (err) {
        toast.error(err?.message || t('reports.toast.fetchError'));
      } finally {
        setLoadingIssuedTools(false);
      }
    };
    fetchIssuedTools();
  }, [type, employeeId, t, toolId]);

  // Fetch issued BHP items for selected employee when reporting on 'bhpIssued'
  useEffect(() => {
    const fetchIssuedBhp = async () => {
      if (type !== 'bhpIssued' || !employeeId) {
        setIssuedBhpItems([]);
        return;
      }
      setLoadingIssuedBhp(true);
      try {
        const data = await api.get(`/api/bhp-issues?status=issued&employee_id=${employeeId}&limit=200`);
        const items = Array.isArray(data?.data) ? data.data : [];
        // Deduplicate by bhp_id
        const map = new Map();
        items.forEach(it => {
          if (it.bhp_id && !map.has(it.bhp_id)) {
            map.set(it.bhp_id, {
              id: it.bhp_id,
              inventoryNumber: it.bhp_inventory_number,
              model: it.bhp_model
            });
          }
        });
        const arr = Array.from(map.values());
        setIssuedBhpItems(arr);
        // Reset selection if invalid
        if (!arr.some(x => String(x.id) === String(bhpItemId))) {
          setBhpItemId('');
        }
      } catch (err) {
        toast.error(err?.message || t('reports.toast.fetchError'));
      } finally {
        setLoadingIssuedBhp(false);
      }
    };
    fetchIssuedBhp();
  }, [type, employeeId, t, bhpItemId]);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/api/reports/${id}/status`, { status });
      toast.success(t('reports.toast.statusUpdated'));
      await fetchList();
    } catch (err) {
      toast.error(err?.message || t('reports.toast.statusError'));
    }
  };

  

  const openDeleteModal = (report) => {
    if (!report) return;
    setDeleteTarget(report);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeletingId(deleteTarget.id);
    try {
      const resp = await api.delete(`/api/reports/${deleteTarget.id}`);
      toast.success(resp?.message || t('reports.toast.deleted'));
      await fetchList();
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err?.message || t('reports.toast.deleteError'));
    } finally {
      setDeletingId(null);
      setDeleteLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('reports.title')}</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t('reports.description')}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className={`px-3 py-2 rounded-md text-sm border ${activeTab === 'form' ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-600'}`}
              >
                {t('reports.tabs.form')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`px-3 py-2 rounded-md text-sm border ${activeTab === 'list' ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-600'}`}
              >
                {t('reports.tabs.reported')}
              </button>
            </div>
          )}
        </div>

        {activeTab === 'form' && (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="report-type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.type.label')}</label>
            <select
              id="report-type"
              name="type"
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="employee">{t('reports.type.employee')}</option>
              <option value="tool">{t('reports.type.tool')}</option>
              <option value="bhpIssued">{t('reports.type.bhpIssued')}</option>
              <option value="bhp">{t('reports.type.bhp')}</option>
              <option value="other">{t('reports.type.other')}</option>
            </select>
          </div>

          {type === 'employee' && (
            <div>
              <label htmlFor={isAdmin ? "report-employee-id" : "report-employee-name"} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{isAdmin ? t('reports.employee.label') : t('reports.employeeManual.label')}</label>
              {isAdmin ? (
                <select
                  id="report-employee-id"
                  name="employeeId"
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">—</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                  ))}
                </select>
              ) : (
                <input
                  id="report-employee-name"
                  name="employeeName"
                  type="text"
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder={t('reports.employeeManual.placeholder')}
                />
              )}
            </div>
          )}

          {type === 'tool' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="report-tool-employee-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.employee.label')}</label>
                {isEmployee ? (
                  <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                    {employeeName || user?.username || 'Twój profil'}
                  </div>
                ) : (
                  <select
                    id="report-tool-employee-id"
                    name="employeeId"
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  >
                    <option value="">—</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="report-tool-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.tool.label')}</label>
                {!isEmployee && (
                  <select
                    id="report-tool-id"
                    name="toolId"
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    value={toolId}
                    onChange={(e) => setToolId(e.target.value)}
                    disabled={!employeeId || loadingIssuedTools}
                  >
                    <option value="">—</option>
                    {loadingIssuedTools && <option value="" disabled>{t('reports.issuedTools.loading')}</option>}
                    {!loadingIssuedTools && issuedTools.length === 0 && employeeId && (
                      <option value="" disabled>{t('reports.issuedTools.none')}</option>
                    )}
                    {!loadingIssuedTools && issuedTools.map(tool => (
                      <option key={tool.id} value={tool.id}>{tool.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tiles for issued tools selection */}
              <div className="pt-1">
                {loadingIssuedTools ? (
                  <div className="flex items-center gap-2 py-4 text-slate-600 dark:text-slate-400">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                    <span>{t('reports.issuedTools.loading')}</span>
                  </div>
                ) : !employeeId ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('reports.issuedTools.selectEmployee')}</p>
                ) : issuedTools.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('reports.issuedTools.none')}</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {issuedTools.map((tool) => (
                      <button
                        type="button"
                        key={tool.id}
                        onClick={() => setToolId(String(tool.id))}
                        className={`text-left p-3 rounded-lg border transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 ${String(toolId) === String(tool.id) ? 'ring-2 ring-indigo-500' : ''}`}
                        aria-pressed={String(toolId) === String(tool.id)}
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">{tool.name || 'Narzędzie'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">ID: {tool.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {type === 'bhpIssued' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="report-bhp-employee-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.employee.label')}</label>
                {isEmployee ? (
                  <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                    {employeeName || user?.username || 'Twój profil'}
                  </div>
                ) : (
                  <select
                    id="report-bhp-employee-id"
                    name="employeeId"
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  >
                    <option value="">—</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="report-bhp-item-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.bhpIssued.label')}</label>
                {!isEmployee && (
                  <select
                    id="report-bhp-item-id"
                    name="bhpItemId"
                    className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    value={bhpItemId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBhpItemId(val);
                      const found = issuedBhpItems.find(x => String(x.id) === String(val));
                      if (found) {
                        setSubject(`${found.inventoryNumber || ''} ${found.model || ''}`.trim());
                      }
                    }}
                    disabled={!employeeId || loadingIssuedBhp}
                  >
                    <option value="">—</option>
                    {loadingIssuedBhp && <option value="" disabled>{t('reports.issuedBhp.loading')}</option>}
                    {!loadingIssuedBhp && issuedBhpItems.length === 0 && employeeId && (
                      <option value="" disabled>{t('reports.issuedBhp.none')}</option>
                    )}
                    {!loadingIssuedBhp && issuedBhpItems.map(item => (
                      <option key={item.id} value={item.id}>{item.inventoryNumber} {item.model ? `(${item.model})` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tiles for issued BHP selection */}
              <div className="pt-1">
                {loadingIssuedBhp ? (
                  <div className="flex items-center gap-2 py-4 text-slate-600 dark:text-slate-400">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                    <span>{t('reports.issuedBhp.loading')}</span>
                  </div>
                ) : !employeeId ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('reports.issuedBhp.selectEmployee')}</p>
                ) : issuedBhpItems.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('reports.issuedBhp.none')}</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {issuedBhpItems.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setBhpItemId(String(item.id));
                          setSubject(`${item.inventoryNumber || ''} ${item.model || ''}`.trim());
                        }}
                        className={`text-left p-3 rounded-lg border transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 ${String(bhpItemId) === String(item.id) ? 'ring-2 ring-indigo-500' : ''}`}
                        aria-pressed={String(bhpItemId) === String(item.id)}
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.inventoryNumber || 'BHP'} {item.model ? `(${item.model})` : ''}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">ID: {item.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {type === 'bhp' && (
            <div>
              <label htmlFor="report-bhp-category" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.bhp.label')}</label>
              <input
                id="report-bhp-category"
                name="bhpCategory"
                type="text"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                value={bhpCategory}
                onChange={(e) => setBhpCategory(e.target.value)}
                placeholder={t('reports.bhp.placeholder')}
              />
            </div>
          )}

          {type === 'other' && (
            <div>
              <label htmlFor="report-other-subject" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.other.label')}</label>
              <input
                id="report-other-subject"
                name="subject"
                type="text"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('reports.other.placeholder')}
              />
            </div>
          )}

          <div>
            <label htmlFor="report-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.details.label')}</label>
              <textarea
                id="report-description"
                name="description"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('reports.details.placeholder')}
              />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.severity.label')}</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSeverity('low')}
                className={`px-3 py-2 rounded-md text-sm border ${severity === 'low' ? 'bg-green-600 text-white border-green-700' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-600'}`}
              >
                {t('reports.severity.low')}
              </button>
              <button
                type="button"
                onClick={() => setSeverity('medium')}
                className={`px-3 py-2 rounded-md text-sm border ${severity === 'medium' ? 'bg-yellow-500 text-white border-yellow-600' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-600'}`}
              >
                {t('reports.severity.medium')}
              </button>
              <button
                type="button"
                onClick={() => setSeverity('high')}
                className={`px-3 py-2 rounded-md text-sm border ${severity === 'high' ? 'bg-red-600 text-white border-red-700' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-600'}`}
              >
                {t('reports.severity.high')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label htmlFor="report-attachments" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.attachments.label')}</label>
              <input
                id="report-attachments"
                name="attachments"
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                className="mt-1 block w-full text-sm text-slate-900 dark:text-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('reports.attachments.hint')}</p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !description || (type === 'employee' && !isAdmin && !employeeName)}
                className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium shadow-sm ${submitting ? 'bg-indigo-300 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-60`}
              >
                {submitting ? t('permissions.saving') : t('reports.submit')}
              </button>
            </div>
          </div>
        </form>
        )}

        {isAdmin && activeTab === 'list' && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label htmlFor="filter-type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.filters.type')}</label>
                <select id="filter-type" name="filterType" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">—</option>
                  <option value="employee">{t('reports.type.employee')}</option>
                  <option value="tool">{t('reports.type.tool')}</option>
                  <option value="bhp">{t('reports.type.bhp')}</option>
                  <option value="other">{t('reports.type.other')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="filter-severity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.filters.severity')}</label>
                <select id="filter-severity" name="filterSeverity" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
                  <option value="">—</option>
                  <option value="low">{t('reports.severity.low')}</option>
                  <option value="medium">{t('reports.severity.medium')}</option>
                  <option value="high">{t('reports.severity.high')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="filter-status" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('reports.filters.status')}</label>
                <select id="filter-status" name="filterStatus" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">—</option>
                  {statusOptions.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => { setFilterType(''); setFilterSeverity(''); setFilterStatus(''); }} className="px-3 py-2 rounded-md text-sm border bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border-slate-300 dark:border-slate-600">
                  {t('employees.clearFilters')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.type')}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.subject')}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.severity')}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.status')}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.created')}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.attachments')}</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-300">{t('reports.list.actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                  {loadingList ? (
                    <tr><td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-100" colSpan={7}>{t('dashboard.search.searching')}</td></tr>
                  ) : list.length === 0 ? (
                    <tr><td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-100" colSpan={7}>{t('employees.none')}</td></tr>
                  ) : (
                    list.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300">{t(`reports.type.${item.type}`)}</td>
                        <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                          {item.subject || item.bhp_category || item.tool_name || item.employee_name || item.employee_name_manual || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300">{t(`reports.severity.${item.severity}`)}</td>
                        <td className="px-3 py-2 text-sm">
                          <select className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-slate-900 dark:text-slate-100" value={item.status} onChange={(e) => updateStatus(item.id, e.target.value)}>
                            {statusOptions.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300">{item.created_at}</td>
                        <td className="px-3 py-2 text-sm">
                          <div className="flex flex-wrap gap-2">
                            {(item.attachments || []).map((att) => (
                              <a key={att.filename} href={att.url} target="_blank" rel="noreferrer" className="block w-12 h-12 overflow-hidden rounded ring-1 ring-slate-200 dark:ring-slate-700">
                                <img src={att.url} alt={att.originalName || 'attachment'} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          <button
                            type="button"
                            onClick={() => openDeleteModal(item)}
                            disabled={deletingId === item.id}
                            title={t('common.remove')}
                            aria-label={t('reports.delete.aria')}
                            className={`inline-flex items-center p-2 rounded-md border border-transparent ${deletingId === item.id ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300`}
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
        )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => { if (!deleteLoading) { setShowDeleteModal(false); setDeleteTarget(null); } }}
        onConfirm={handleConfirmDelete}
        title={t('reports.delete.title')}
        message={deleteTarget ? t('reports.delete.messageWithTarget', { subject: deleteTarget.subject || deleteTarget.bhp_category || deleteTarget.tool_name || deleteTarget.employee_name || deleteTarget.employee_name_manual || '', id: deleteTarget.id }) : t('reports.delete.messageGeneric')}
        confirmText={t('reports.delete.confirm')}
        cancelText={t('common.cancel')}
        type="danger"
        loading={deleteLoading}
      />
      </div>
    </div>
  );
};

export default ReportsScreen;
