import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../api';
import { AUDIT_ACTIONS } from '../constants/auditActions';
import { addAuditLog } from '../utils/auditLogger';
import { sanitizeObject } from '../utils/sanitize';
import { generateAndPrintEmployeeCard } from '../utils/employeesExport';

export const useEmployeeManagement = (employees, setEmployees, user, t) => {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterPosition, setFilterPosition] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState('');

  const employeesList = Array.isArray(employees) ? employees : [];
  const normalizeEmployees = (value) => (Array.isArray(value) ? value : employeesList);

  // Derived data for filters
  const departmentNames = Array.from(new Set([
    ...departments.map(d => d.name).filter(Boolean),
    ...employeesList.map(e => e.department).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b));

  const positionNames = Array.from(new Set([
    ...positions.map(p => p.name).filter(Boolean),
    ...employeesList.map(e => e.position).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b));

  // Initialize search from URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || '');
      const q = params.get('q');
      if (q) setSearchTerm(q);
    } catch (_) { /* noop */ }
  }, [location.search]);

  // Load employees on mount - REMOVED to avoid duplicate requests
  // Employees are passed from parent (App -> useAppData)
  // which handles the initial fetching.
  /*
  useEffect(() => {
    const canView = hasPermission(user, PERMISSIONS.VIEW_EMPLOYEES);
    if (!canView) return;
    
    let cancelled = false;
    const loadEmployees = async () => {
      try {
        setInitialLoading(true);
        const data = await api.get('/api/employees');
        if (!cancelled) setEmployees(Array.isArray(data) ? data : []);
      } catch (_err) {
        const msg = _err?.messageKey ? t(_err.messageKey) : (_err?.message || t('common.error'));
        toast.error(msg);
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };

    if (!employees || employees.length === 0) {
      loadEmployees();
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setEmployees, t]);
  */

  // Fetch departments and positions
  const fetchDepartments = useCallback(async () => {
    try {
      const data = await api.get('/api/departments');
      setDepartments(data);
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('common.error'));
      // Only show error if not a 404 or similar harmless error, or just use fallback
      console.error(msg); 
      setDepartments([
        { id: 1, name: 'IT' },
        { id: 2, name: 'HR' },
        { id: 3, name: 'Produkcja' },
        { id: 4, name: 'Magazyn' }
      ]);
    }
  }, [t]);

  const fetchPositions = useCallback(async () => {
    try {
      const data = await api.get('/api/positions');
      setPositions(data);
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('common.error'));
      console.error(msg);
      setPositions([
        { id: 1, name: 'Kierownik' },
        { id: 2, name: 'Specjalista' },
        { id: 3, name: 'Pracownik' },
        { id: 4, name: 'Stażysta' }
      ]);
    }
  }, [t]);

  useEffect(() => {
    fetchDepartments();
    fetchPositions();
  }, [fetchDepartments, fetchPositions]);

  const refreshEmployees = useCallback(async () => {
    try {
      setInitialLoading(true);
      const data = await api.get('/api/employees');
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err?.messageKey ? t(err.messageKey) : (err?.message || t('common.error'));
      toast.error(msg);
    } finally {
      setInitialLoading(false);
    }
  }, [setEmployees, t]);

  const handleAddEmployee = async (employeeData) => {
    try {
      setLoading(true);
      const apiData = {
        first_name: employeeData.firstName,
        last_name: employeeData.lastName,
        phone: employeeData.phone,
        email: employeeData.email,
        department: departments.find(d => String(d.id) === String(employeeData.departmentId))?.name || '',
        position: positions.find(p => String(p.id) === String(employeeData.positionId))?.name || '',
        brand_number: employeeData.brandNumber || '',
        rfid_uid: employeeData.rfidUid || '',
        status: employeeData.status || 'active'
      };
      
      const newEmployee = await api.post('/api/employees', apiData);
      setEmployees(prev => [...normalizeEmployees(prev), newEmployee]);
      setShowAddModal(false);
      toast.success(t('employees.addedSuccess'));
      
      await addAuditLog(user, AUDIT_ACTIONS.ADD_EMPLOYEE, 
        `Dodano pracownika: ${employeeData.firstName} ${employeeData.lastName}`);
    } catch (error) {
      const msg = error?.messageKey ? t(error.messageKey) : (error?.message || t('employees.addError'));
      toast.error(msg);
      setError(t('employees.addError'));
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    setShowEditModal(true);
    addAuditLog(
      user,
      AUDIT_ACTIONS.VIEW_EMPLOYEE_DETAILS,
      `Otwarto szczegóły/edycję pracownika: ${employee.first_name} ${employee.last_name}`
    );
  };

  const handleEditEmployee = async (employeeData) => {
    try {
      setLoading(true);
      let apiData = {
        first_name: employeeData.firstName,
        last_name: employeeData.lastName,
        phone: employeeData.phone,
        email: employeeData.email,
        department: departments.find(d => String(d.id) === String(employeeData.departmentId))?.name || '',
        position: positions.find(p => String(p.id) === String(employeeData.positionId))?.name || '',
        brand_number: employeeData.brandNumber || editingEmployee.brand_number,
        rfid_uid: employeeData.rfidUid || editingEmployee.rfid_uid || '',
        status: employeeData.status || editingEmployee.status || 'active'
      };
      
      apiData = sanitizeObject(apiData);

      const updatedEmployee = await api.put(`/api/employees/${editingEmployee.id}`, apiData);
      setEmployees(prev => normalizeEmployees(prev).map(emp => (
        emp.id === editingEmployee.id ? updatedEmployee : emp
      )));
      setShowEditModal(false);
      setEditingEmployee(null);
      toast.success(t('employees.updatedSuccess'));
      
      await addAuditLog(user, AUDIT_ACTIONS.UPDATE_EMPLOYEE, 
        `Edytowano pracownika: ${employeeData.firstName} ${employeeData.lastName}`);
    } catch (error) {
      toast.error(error?.message || t('employees.updateError'));
      setError(t('employees.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const regenerateLogin = async (firstNameOrData, lastNameArg) => {
    let firstName = firstNameOrData;
    let lastName = lastNameArg;

    if (typeof firstNameOrData === 'object' && firstNameOrData !== null) {
      firstName = firstNameOrData.firstName;
      lastName = firstNameOrData.lastName;
    }

    try {
      if (!editingEmployee?.id) return;
      setLoading(true);
      const resp = await api.post(`/api/employees/${editingEmployee.id}/regenerate-login`, {
        first_name: String(firstName || '').trim(),
        last_name: String(lastName || '').trim()
      });
      const updated = resp?.employee;
      const newLogin = resp?.login || updated?.login;
      if (updated) {
        setEmployees(prev => normalizeEmployees(prev).map(emp => emp.id === updated.id ? updated : emp));
        setEditingEmployee(updated);
      } else if (newLogin) {
        setEmployees(prev => normalizeEmployees(prev).map(emp => (
          emp.id === editingEmployee.id ? { ...emp, login: newLogin } : emp
        )));
        setEditingEmployee(prev => ({ ...prev, login: newLogin }));
      }
      toast.success(t('employees.updatedSuccess'));
      await addAuditLog(user, AUDIT_ACTIONS.UPDATE_EMPLOYEE, `Zregenerowano login pracownika ID=${editingEmployee.id} -> ${newLogin}`);
    } catch (err) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmployee = async (employee) => {
    if (!window.confirm(`${t('employees.confirmDelete')} ${employee.first_name} ${employee.last_name}?`)) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/api/employees/${employee.id}`);
      setEmployees(prev => normalizeEmployees(prev).filter(emp => emp.id !== employee.id));
      toast.success(t('employees.deletedSuccess'));
      
      await addAuditLog(user, AUDIT_ACTIONS.DELETE_EMPLOYEE, 
        `Usunięto pracownika: ${employee.first_name} ${employee.last_name}`);
    } catch (error) {
      toast.error(error?.message || t('employees.deleteError'));
      setError(t('employees.deleteError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCredentials = async (employee) => {
    try {
      if (!employee?.email) {
        toast.warn(t('employees.toast.noEmail'));
        return;
      }
      setLoading(true);
      const resp = await api.post(`/api/employees/${employee.id}/send-credentials`, {});
      const emailSent = resp?.emailSent;
      const createdLogin = resp?.createdLogin;
      const updatedEmployee = resp?.employee;
      const emailErrorCode = resp?.code;
      const emailErrorMessageKey = resp?.messageKey;
      const emailErrorMessage = resp?.error;
      if (updatedEmployee) {
        setEmployees(prev => normalizeEmployees(prev).map(e => e.id === updatedEmployee.id ? updatedEmployee : e));
      }
      if (emailSent) {
        toast.success(createdLogin ? t('employees.toast.loginCreatedAndEmailSent') : t('employees.toast.emailSent'));
      } else {
        if (emailErrorCode === 'SMTP_NOT_CONFIGURED') {
          const msg = emailErrorMessageKey ? t(emailErrorMessageKey) : (emailErrorMessage || t('employees.toast.sendError'));
          toast.error(msg);
          return;
        }
        toast.info(createdLogin ? t('employees.toast.loginCreatedEmailNotSent') : t('employees.toast.emailNotSent'));
      }
      
      await addAuditLog(user, AUDIT_ACTIONS.SEND_EMPLOYEE_CREDENTIALS, 
        `Wysłano dane logowania dla pracownika ID=${employee.id}, login=${updatedEmployee?.login || employee.login || 'brak'}, emailSent=${emailSent}, createdLogin=${createdLogin}`);
    } catch (error) {
      toast.error(error?.message || t('employees.toast.sendError'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportEmployeeCard = async (employee) => {
    try {
      setLoading(true);

      // Fetch currently issued tools (including permanent)
      const toolsRes = await api.get(`/api/tool-issues?status=issued,permanent&employee_id=${employee.id}&limit=1000`);
      const tools = Array.isArray(toolsRes?.data) ? toolsRes.data : [];

      const slingsRes = await api.get(`/api/slings/issued-by-employee/${employee.id}`);
      const slings = Array.isArray(slingsRes?.data) ? slingsRes.data : (Array.isArray(slingsRes) ? slingsRes : []);

      // Fetch currently issued BHP
      const bhpRes = await api.get(`/api/bhp-issues?status=issued&employee_id=${employee.id}&limit=1000`);
      const bhp = Array.isArray(bhpRes?.data) ? bhpRes.data : [];

      const allTools = [...tools, ...slings].sort((a, b) => new Date(b.issued_at || 0) - new Date(a.issued_at || 0));

      await generateAndPrintEmployeeCard(employee, allTools, bhp, t, user);
      toast.success(t('employees.cardGeneratedSuccess'));
      
      await addAuditLog(user, AUDIT_ACTIONS.EXPORT_EMPLOYEE_CARD, 
        `Wygenerowano kartę pracownika: ${employee.first_name} ${employee.last_name}`);
    } catch (error) {
      toast.error(error?.message || t('employees.cardGenerationError'));
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employeesList.filter(employee => {
    const term = (searchTerm || '').toLowerCase().trim();
    const fullName = `${employee.first_name || ''} ${employee.last_name || ''}`.toLowerCase().trim();
    const matchesSearch = 
      (term.length === 0) ||
      employee.first_name?.toLowerCase().includes(term) ||
      employee.last_name?.toLowerCase().includes(term) ||
      fullName.includes(term) ||
      employee.phone?.toLowerCase().includes(term) ||
      employee.brand_number?.toLowerCase().includes(term);

    const matchesDepartment = filterDepartment === 'all' || (employee.department && filterDepartment && employee.department.toLowerCase() === filterDepartment.toLowerCase());
    const matchesPosition = filterPosition === 'all' || (employee.position && filterPosition && employee.position.toLowerCase() === filterPosition.toLowerCase());
    
    return matchesSearch && matchesDepartment && matchesPosition;
  }).sort((a, b) => {
    const brandA = parseInt(a.brand_number) || 999999;
    const brandB = parseInt(b.brand_number) || 999999;
    return brandA - brandB;
  });

  return {
    searchTerm,
    setSearchTerm,
    filterDepartment,
    setFilterDepartment,
    filterPosition,
    setFilterPosition,
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    editingEmployee,
    setEditingEmployee,
    departments,
    positions,
    loading,
    initialLoading,
    error,
    setError,
    departmentNames,
    positionNames,
    filteredEmployees,
    refreshEmployees,
    handleAddEmployee,
    openEditModal,
    handleEditEmployee,
    regenerateLogin,
    handleDeleteEmployee,
    handleSendCredentials,
    handleExportEmployeeCard
  };
};
