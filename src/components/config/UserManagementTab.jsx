import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import { notifyError } from '../../utils/notify.jsx';
import { AUDIT_ACTIONS } from '../../constants/auditActions';

// Memoized User Row
const UserRow = React.memo(({ u, t, displayName, rolesMap, roleOptions, roleSaving, currentUserId, handleInlineRoleChange, handleEditUser, handleDeleteUser }) => {
  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap">
        <div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{displayName}</div>
          <div className="text-sm text-slate-500 dark:text-slate-300">@{u.username}</div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center justify-between gap-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${rolesMap[u.role]?.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'}`}>
            {rolesMap[u.role]?.name || u.role}
          </span>
          <label htmlFor={`user-role-inline-${u.id}`} className="sr-only">{t('appConfig.users.role')}</label>
          <select
            id={`user-role-inline-${u.id}`}
            name={`user-role-inline-${u.id}`}
            value={u.role}
            onChange={(e) => handleInlineRoleChange(u, e.target.value)}
            disabled={roleSaving || u.id === currentUserId}
            className="text-sm border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            {roleOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button
          onClick={() => handleEditUser(u)}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-3"
        >
          {t('common.edit')}
        </button>
        <button
          onClick={() => handleDeleteUser(u.id, u.username)}
          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
        >
          {t('common.remove')}
        </button>
      </td>
    </tr>
  );
}, (prev, next) => {
  return prev.u.id === next.u.id && 
         prev.u.updated_at === next.u.updated_at &&
         prev.u.role === next.u.role &&
         prev.u.full_name === next.u.full_name &&
         prev.u.username === next.u.username &&
         prev.displayName === next.displayName &&
         prev.rolesMap === next.rolesMap &&
         prev.roleOptions === next.roleOptions &&
         prev.roleSaving === next.roleSaving &&
         prev.currentUserId === next.currentUserId &&
         prev.t === next.t;
});
UserRow.displayName = 'UserRow';

const UserManagementTab = ({ user, apiClient }) => {
  const [users, setUsers] = useState([]);
  const { t } = useLanguage();
  const [employeesByLogin, setEmployeesByLogin] = useState({});
  const [rolesMeta, setRolesMeta] = useState({});
  const [roleSavingById, setRoleSavingById] = useState({});
  const [showModal, setShowModal] = useState(false);
  const userModalRef = useRef(null);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    role: 'employee',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const addAuditLog = useCallback(async (actor, action, details) => {
    try {
      await apiClient.post('/api/audit', {
        user_id: actor.id,
        username: actor.username,
        action,
        details,
        ip_address: 'localhost'
      });
    } catch (_err) {
      notifyError(t('common.toastr.audit.addError'));
    }
  }, [apiClient, t]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/api/users');
      setUsers(Array.isArray(data) ? data : []);
      addAuditLog(user, AUDIT_ACTIONS.VIEW_USERS, 'Przeglądano listę użytkowników');
    } catch (error) {
      toast.error(error?.message || t('common.toastr.users.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [apiClient, t, user, addAuditLog]);

  useEffect(() => {
    Promise.resolve().then(() => { fetchUsers(); });
  }, [fetchUsers]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (showModal) setShowModal(false);
      }
      if (e.key === 'Tab') {
        const el = userModalRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        const focusables = Array.from(nodes).filter(n => !n.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    if (showModal) {
      document.addEventListener('keydown', handler);
      setTimeout(() => {
        const el = userModalRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        const focusables = Array.from(nodes).filter(n => !n.hasAttribute('disabled'));
        if (focusables[0]) focusables[0].focus();
      }, 0);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [showModal]);

  const handleAddUser = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      full_name: '',
      role: 'employee',
      password: '',
      confirmPassword: ''
    });
    setShowModal(true);
  };

  const handleEditUser = (userToEdit) => {
    setEditingUser(userToEdit);
    setFormData({
      username: userToEdit.username,
      full_name: userToEdit.full_name,
      role: userToEdit.role,
      password: '',
      confirmPassword: ''
    });
    setShowModal(true);
  };

  const baseRolesMap = useMemo(() => {
    return {
      administrator: {
        name: t('users.roles.administrator'),
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        priority: 100
      },
      manager: {
        name: t('users.roles.manager'),
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        priority: 80
      },
      toolsmaster: {
        name: t('users.roles.toolsmaster'),
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        priority: 70
      },
      hr: {
        name: t('users.roles.hr'),
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        priority: 60
      },
      supervisor: {
        name: t('users.roles.supervisor'),
        color: 'bg-indigo-500 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-300',
        priority: 50
      },
      engineer: {
        name: t('users.roles.engineer'),
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        priority: 40
      },
      employee: {
        name: t('users.roles.employee'),
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
        priority: 20
      },
      user: {
        name: t('users.roles.user'),
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
        priority: 0
      }
    };
  }, [t]);

  const customRolesMap = useMemo(() => {
    try {
      const raw = localStorage.getItem('appConfig.customRoles');
      const list = raw ? JSON.parse(raw) : [];
      const out = {};
      if (Array.isArray(list)) {
        list.forEach((r) => {
          const key = String(r?.key || '').trim().toLowerCase();
          if (!key) return;
          out[key] = {
            name: String(r?.name || key),
            color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
            priority: 0
          };
        });
      }
      return out;
    } catch (_e) {
      return {};
    }
  }, []);

  const rolesMap = useMemo(() => {
    const merged = { ...baseRolesMap, ...customRolesMap };
    Object.entries(rolesMeta || {}).forEach(([k, v]) => {
      const key = String(k || '').trim().toLowerCase();
      if (!key) return;
      const prev = merged[key] || { name: key, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300', priority: 0 };
      merged[key] = {
        ...prev,
        name: v?.name || prev.name,
        color: v?.color || prev.color,
        priority: typeof v?.priority === 'number' ? v.priority : prev.priority
      };
    });
    return merged;
  }, [baseRolesMap, customRolesMap, rolesMeta]);

  const roleOptions = useMemo(() => {
    return Object.entries(rolesMap)
      .sort(([, a], [, b]) => {
        const pa = typeof a?.priority === 'number' ? a.priority : 0;
        const pb = typeof b?.priority === 'number' ? b.priority : 0;
        if (pb !== pa) return pb - pa;
        const na = String(a?.name || '').toLowerCase();
        const nb = String(b?.name || '').toLowerCase();
        return na.localeCompare(nb);
      })
      .map(([key, data]) => ({ key, label: data?.name || key }));
  }, [rolesMap]);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/employees');
      const list = Array.isArray(data) ? data : [];
      const map = {};
      list.forEach((e) => {
        const login = String(e?.login || '').trim();
        if (!login) return;
        map[login] = e;
      });
      setEmployeesByLogin(map);
    } catch (_err) {
      setEmployeesByLogin({});
    }
  }, [apiClient]);

  const fetchRolesMeta = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/roles-meta');
      let meta = {};
      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (row && row.role) meta[String(row.role).toLowerCase()] = row;
        });
      } else if (data && data.meta && typeof data.meta === 'object') {
        meta = data.meta;
      } else if (data && typeof data === 'object') {
        meta = data.meta || data;
      }
      setRolesMeta(meta || {});
    } catch (_err) {
      setRolesMeta({});
    }
  }, [apiClient]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchEmployees();
      fetchRolesMeta();
    });
  }, [fetchEmployees, fetchRolesMeta]);

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(t('appConfig.users.confirmDelete', { username }))) {
      return;
    }

    try {
      await apiClient.del(`/api/users/${userId}`);
      setUsers(users.filter(u => u.id !== userId));
      addAuditLog(user, AUDIT_ACTIONS.DELETE_USER, `Usunięto użytkownika: ${username}`);
      toast.success(t('common.toastr.users.deletedSuccess'));
    } catch (error) {
      toast.error(error?.message || t('common.toastr.users.deleteError'));
    }
  };

  const handleInlineRoleChange = useCallback(async (targetUser, newRole) => {
    const userId = targetUser?.id;
    if (!userId) return;
    if (targetUser?.id === user?.id) return;
    const prevRole = targetUser?.role;
    if (prevRole === newRole) return;

    setRoleSavingById(prev => ({ ...prev, [userId]: true }));
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: newRole } : u)));

    try {
      await apiClient.put(`/api/users/${userId}`, {
        username: targetUser.username,
        full_name: targetUser.full_name,
        role: newRole
      });
      addAuditLog(user, AUDIT_ACTIONS.UPDATE_USER, `Zmieniono rolę użytkownika: ${targetUser.username} (${prevRole} → ${newRole})`);
      toast.success(t('common.toastr.users.updatedSuccess'));
    } catch (error) {
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: prevRole } : u)));
      toast.error(error?.message || t('common.toastr.users.saveError'));
    } finally {
      setRoleSavingById(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  }, [apiClient, addAuditLog, user, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.username || !formData.full_name) {
      toast.error(t('common.toastr.form.requiredFields'));
      return;
    }

    if (!editingUser && (!formData.password || formData.password !== formData.confirmPassword)) {
      toast.error(t('common.toastr.form.passwordMismatch'));
      return;
    }

    try {
      setLoading(true);
      const userData = {
        username: formData.username,
        full_name: formData.full_name,
        role: formData.role
      };

      if (formData.password) {
        userData.password = formData.password;
      }

      if (editingUser) {
        await apiClient.put(`/api/users/${editingUser.id}`, userData);
        setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...userData } : u));
        addAuditLog(user, AUDIT_ACTIONS.UPDATE_USER, `Zaktualizowano użytkownika: ${userData.username}`);
        toast.success(t('common.toastr.users.updatedSuccess'));
      } else {
        const newUser = await apiClient.post('/api/users', userData);
        setUsers([...users, newUser]);
        addAuditLog(user, AUDIT_ACTIONS.ADD_USER, `Dodano użytkownika: ${userData.username}`);
        toast.success(t('common.toastr.users.addedSuccess'));
      }

      setShowModal(false);
      setFormData({
        username: '',
        full_name: '',
        role: 'employee',
        password: '',
        confirmPassword: ''
      });
    } catch (error) {
      toast.error(error?.message || t('common.toastr.users.saveError'));
    } finally {
      setLoading(false);
    }
  };

  const [userSortDir, setUserSortDir] = useState('asc');

  const filteredUsers = users.filter(u =>
    (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    Promise.resolve().then(() => { setCurrentPage(1); });
  }, [searchTerm]);

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aName = (a.full_name || a.username || '').toLowerCase();
    const bName = (b.full_name || b.username || '').toLowerCase();
    const base = aName.localeCompare(bName);
    if (userSortDir === 'asc') return base;
    return -base;
  });

  const totalItems = sortedUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndexExclusive = Math.min(startIndex + pageSize, totalItems);
  const paginatedUsers = sortedUsers.slice(startIndex, endIndexExclusive);

  useEffect(() => {
    if (currentPage > totalPages) {
      Promise.resolve().then(() => { setCurrentPage(totalPages); });
    }
  }, [totalPages, currentPage]);

  return (
    <>
      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <label htmlFor="user-search" className="sr-only">{t('appConfig.users.search')}</label>
          <input
            id="user-search"
            name="user-search"
            type="text"
            placeholder={t('appConfig.users.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
          />
        </div>
        <button
          onClick={handleAddUser}
          className="flex items-center gap-2 bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors whitespace-nowrap"
        >
          <PlusIcon className="w-5 h-5" />
          {t('appConfig.users.title.add')}
        </button>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none"
                onClick={() => { setUserSortDir(d => (d === 'asc' ? 'desc' : 'asc')); setCurrentPage(1); }}
                aria-sort={userSortDir === 'asc' ? 'ascending' : 'descending'}
              >
                <span className="inline-flex items-center gap-1">
                  {t('common.user')}
                  {userSortDir === 'asc' ? (
                    <ChevronUpIcon className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />
                  )}
                </span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                {t('appConfig.users.role')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {paginatedUsers.map((u) => (
              (() => {
                const emp = employeesByLogin?.[u.username];
                const name = emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : (u.full_name || u.username || '');
                const brand = emp?.brand_number ? `[${String(emp.brand_number).trim()}] ` : '';
                const displayName = `${brand}${name}`.trim();
                return (
              <UserRow 
                key={u.id} 
                u={u} 
                t={t} 
                displayName={displayName}
                rolesMap={rolesMap}
                roleOptions={roleOptions}
                roleSaving={!!roleSavingById[u.id]}
                currentUserId={user?.id}
                handleInlineRoleChange={handleInlineRoleChange}
                handleEditUser={handleEditUser} 
                handleDeleteUser={handleDeleteUser} 
              />
                );
              })()
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 px-6 py-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="text-sm text-slate-700 dark:text-slate-200">
          {t('common.pagination.range', {
            start: totalItems === 0 ? 0 : (startIndex + 1),
            end: totalItems === 0 ? 0 : endIndexExclusive,
            total: totalItems
          })}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            aria-label="Rows per page"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 disabled:opacity-50"
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-200">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 disabled:opacity-50"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div ref={userModalRef} role="dialog" aria-modal="true" aria-labelledby="user-modal-title" aria-describedby="user-modal-desc" className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 id="user-modal-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {editingUser ? t('appConfig.users.title.edit') : t('appConfig.users.title.add')}
              </h2>
            </div>
            <div id="user-modal-desc" className="px-6 py-2 text-sm text-slate-700 dark:text-slate-300">
              {t('appConfig.users.modalDescription')}
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="user-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('appConfig.users.username')}
                </label>
                <input
                  id="user-username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="user-fullname" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('appConfig.users.fullName')}
                </label>
                <input
                  id="user-fullname"
                  name="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="user-role" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('appConfig.users.role')}
                </label>
                <select
                  id="user-role"
                  name="role"
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="user">{t('topbar.roles.user')}</option>
                  <option value="employee">{t('topbar.roles.employee')}</option>
                  <option value="engineer">{t('topbar.roles.engineer')}</option>
                  <option value="supervisor">{t('topbar.roles.supervisor')}</option>
                  <option value="hr">{t('topbar.roles.hr')}</option>
                  <option value="manager">{t('topbar.roles.manager')}</option>
                  <option value="toolsmaster">{t('topbar.roles.toolsmaster')}</option>
                  <option value="administrator">{t('topbar.roles.administrator')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="user-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {editingUser ? t('appConfig.users.newPasswordOptional') : t('appConfig.users.password')}
                </label>
                <input
                  id="user-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                  required={!editingUser}
                />
              </div>

              {!editingUser && (
                <div>
                  <label htmlFor="user-confirm-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('appConfig.users.confirmPassword')}
                  </label>
                  <input
                    id="user-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
                    required
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? t('common.saving') : (editingUser ? t('appConfig.users.submitUpdate') : t('appConfig.users.submitAdd'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default UserManagementTab;
