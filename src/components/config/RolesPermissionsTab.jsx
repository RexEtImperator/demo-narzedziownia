import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { CheckIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import ConfirmationModal from '../ConfirmationModal';

// Memoized RoleConfigRow
const RoleConfigRow = React.memo(({ 
  roleKey, 
  roleData, 
  t, 
  saving, 
  saveRoleMeta, 
  saveRolePermissions, 
  openRoleDelete, 
  isExpanded, 
  toggleExpanded, 
  handleRoleMetaChange, 
  handlePermissionToggle, 
  availablePermissions, 
  permissions 
}) => {
  return (
    <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${roleData.color}`}>{roleData.name}</span>
          <span className="text-sm text-gray-500 dark:text-slate-400">{roleData.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { await saveRoleMeta(roleKey, roleData); await saveRolePermissions(roleKey, permissions); }}
            disabled={saving}
            className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? t('permissions.saving') : t('permissions.save')}
          </button>
          <button
            onClick={() => openRoleDelete(roleKey)}
            disabled={saving || roleKey === 'administrator'}
            className="px-3 py-1 bg-rose-600 text-white text-sm rounded-md hover:bg-rose-700 disabled:opacity-50"
          >
            {t('common.remove')}
          </button>
          <button
            type="button"
            onClick={() => toggleExpanded(roleKey)}
            aria-expanded={isExpanded}
            aria-controls={`rolePerms-${roleKey}`}
            className="px-3 py-1 bg-slate-600 text-white text-sm rounded-md hover:bg-slate-700"
          >
            {isExpanded ? t('appConfig.rolesPermissions.roleEdit.permissionsHide') : t('appConfig.rolesPermissions.roleEdit.permissionsShow')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="space-y-1 md:col-span-1">
          <label htmlFor={`roleName-${roleKey}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.rolesPermissions.roleEdit.nameLabel')}</label>
          <input
            id={`roleName-${roleKey}`}
            name={`roleName-${roleKey}`}
            type="text"
            value={roleData.name || ''}
            onChange={(e) => handleRoleMetaChange(roleKey, 'name', e.target.value)}
            placeholder={t('appConfig.rolesPermissions.roleEdit.namePlaceholder')}
            className="border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label htmlFor={`roleDescription-${roleKey}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.rolesPermissions.roleEdit.descriptionLabel')}</label>
          <textarea
            id={`roleDescription-${roleKey}`}
            name={`roleDescription-${roleKey}`}
            rows={1}
            value={roleData.description || ''}
            onChange={(e) => handleRoleMetaChange(roleKey, 'description', e.target.value)}
            placeholder={t('appConfig.rolesPermissions.roleEdit.descriptionPlaceholder')}
            className="w-full resize-y min-h-10 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="space-y-1">
          <label htmlFor={`rolePriority-${roleKey}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.rolesPermissions.roleEdit.priorityLabel')}</label>
          <input
            id={`rolePriority-${roleKey}`}
            name={`rolePriority-${roleKey}`}
            type="number"
            value={roleData.priority ?? 0}
            onChange={(e) => handleRoleMetaChange(roleKey, 'priority', Number(e.target.value))}
            className="w-24 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label htmlFor={`roleColor-${roleKey}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.rolesPermissions.roleEdit.colorLabel')}</label>
          <div className="flex items-center gap-2">
            <input
              id={`roleColor-${roleKey}`}
              name={`roleColor-${roleKey}`}
              type="text"
              value={roleData.color || ''}
              onChange={(e) => handleRoleMetaChange(roleKey, 'color', e.target.value)}
              placeholder={t('appConfig.rolesPermissions.roleEdit.colorPlaceholder')}
              className="flex-1 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => saveRoleMeta(roleKey, roleData)}
              className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              aria-label={t('appConfig.rolesPermissions.roleEdit.saveMeta')}
              title={t('appConfig.rolesPermissions.roleEdit.saveMeta')}
            >
              <CheckIcon className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div id={`rolePerms-${roleKey}`} className="grid grid-cols-2 gap-2">
          {availablePermissions.map(permission => (
            <label key={permission} className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={permissions.includes(permission)}
                onChange={() => handlePermissionToggle(roleKey, permission)}
                className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-gray-700 dark:text-slate-300">{t(`permissions.labels.${permission}`)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return prev.roleKey === next.roleKey &&
         prev.roleData === next.roleData &&
         prev.isExpanded === next.isExpanded &&
         prev.saving === next.saving &&
         prev.permissions === next.permissions &&
         prev.availablePermissions === next.availablePermissions &&
         prev.t === next.t;
});
RoleConfigRow.displayName = 'RoleConfigRow';

export default function RolesPermissionsTab({ apiClient }) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [rolePermissions, setRolePermissions] = useState({});
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [expandedRoles, setExpandedRoles] = useState({});

  const [rolesMap, setRolesMap] = useState(() => {
    const base = {
      administrator: {
        name: t('users.roles.administrator'),
        description: t('users.descriptions.administrator'),
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
      },
      manager: {
        name: t('users.roles.manager'),
        description: t('users.descriptions.manager'),
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      },
      employee: {
        name: t('users.roles.employee'),
        description: t('users.descriptions.employee'),
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      }
    };
    try {
      const raw = localStorage.getItem('appConfig.customRoles');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        list.forEach((r) => {
          const key = String(r?.key || '').trim().toLowerCase();
          if (!key || base[key]) return;
          base[key] = {
            name: r?.name || key,
            description: '',
            color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
          };
        });
      }
    } catch (_) { /* noop */ }
    return base;
  });
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleError, setNewRoleError] = useState('');
  const [showRoleDeleteModal, setShowRoleDeleteModal] = useState(false);
  const [roleDeleteKey, setRoleDeleteKey] = useState(null);
  const [roleDeleteLoading, setRoleDeleteLoading] = useState(false);

  const fetchRolePermissions = useCallback(async () => {
    try {
      setLoadingPermissions(true);
      const data = await apiClient.get('/api/role-permissions');
      const normalized = {};

      if (Array.isArray(data)) {
        // Handle flat array from Supabase: [{ role: 'admin', permission: 'X' }, ...]
        data.forEach(row => {
          if (row && row.role && row.permission) {
             if (!normalized[row.role]) normalized[row.role] = [];
             normalized[row.role].push(row.permission);
          }
        });
      } else if (data && typeof data === 'object') {
        for (const [rk, perms] of Object.entries(data)) {
          const list = Array.isArray(perms) ? perms : [];
          normalized[rk] = Array.from(new Set(list));
        }
      }

      // Ensure unique permissions
      Object.keys(normalized).forEach(k => {
          normalized[k] = Array.from(new Set(normalized[k]));
      });

      setRolePermissions(normalized);
      try {
        const keys = Object.keys(normalized);
        if (keys.length) {
          setRolesMap((prev) => {
            const next = { ...prev };
            keys.forEach((k) => {
              if (!next[k]) {
                next[k] = {
                  name: k,
                  description: '',
                  color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                };
              }
            });
            return next;
          });
        }
      } catch (_) { /* noop */ }
    } catch (error) {
      toast.error(error?.message || t('permissions.toast.fetchRolePermsError'));
    } finally {
      setLoadingPermissions(false);
    }
  }, [apiClient, t]);

  const fetchRoleMeta = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/roles-meta');
      let meta = {};

      if (Array.isArray(data)) {
         // Handle Supabase flat array [{role, name, ...}]
         data.forEach(row => {
            if (row && row.role) {
                meta[row.role] = row;
            }
         });
      } else if (data && data.meta && typeof data.meta === 'object') {
         meta = data.meta;
      } else if (data && typeof data === 'object') {
         // Fallback if backend returns direct object
         meta = data.meta || data; 
      }

      setRolesMap(prev => {
        const next = { ...prev };
        Object.entries(meta).forEach(([key, v]) => {
          const k = String(key || '').toLowerCase();
          const current = next[k] || { name: k, description: '', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300', priority: 5 };
          next[k] = {
            ...current,
            name: v?.name || current.name,
            description: v?.description || current.description,
            color: v?.color || current.color,
            priority: typeof v?.priority === 'number' ? v.priority : current.priority
          };
        });
        return next;
      });
    } catch (_err) {
      // silent: meta optional
    }
  }, [apiClient]);

  const fetchAvailablePermissions = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/permissions');
      const list = Array.isArray(data) ? data : [];
      setAvailablePermissions(Array.from(new Set(list)));
    } catch (error) {
      toast.error(error?.message || t('permissions.toast.fetchAvailablePermsError'));
    }
  }, [apiClient, t]);

  useEffect(() => {
    fetchRolePermissions();
    fetchAvailablePermissions();
    fetchRoleMeta();
  }, [fetchRolePermissions, fetchAvailablePermissions, fetchRoleMeta]);

  useEffect(() => {
    fetchRoleMeta();
  }, [fetchRoleMeta]);

  const handlePermissionToggle = useCallback((role, permission) => {
    setRolePermissions(prev => {
      const currentPermissions = prev[role] || [];
      const hasPermission = currentPermissions.includes(permission);
      const next = hasPermission
        ? currentPermissions.filter(p => p !== permission)
        : [...currentPermissions, permission];
      return { ...prev, [role]: next };
    });
  }, []);

  const saveRolePermissions = useCallback(async (role, currentPermissions) => {
    try {
      setSaving(true);
      const permissions = currentPermissions || [];
      await apiClient.put(`/api/role-permissions/${role}`, { permissions });
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('role-permissions:updated', { detail: { role, permissions } }));
        }
      } catch (_) { /* noop */ }
      await fetchRolePermissions();
      toast.success(t('permissions.toast.savePermsSuccess', { role: role }));
    } catch (error) {
      toast.error(error?.message || t('permissions.toast.savePermsError'));
      fetchRolePermissions();
    } finally {
      setSaving(false);
    }
  }, [apiClient, t, fetchRolePermissions]);

  const addCustomRole = () => {
    const nameRaw = String(newRoleName || '').trim();
    if (!nameRaw) { setNewRoleError('1'); return; }
    const base = nameRaw.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const key = base || nameRaw.toLowerCase();
    if (rolesMap[key]) { setNewRoleError('1'); return; }
    const entry = {
      name: nameRaw,
      description: '',
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    };
    setRolesMap(prev => ({ ...prev, [key]: entry }));
    try {
      const raw = localStorage.getItem('appConfig.customRoles');
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? [...list, { key, name: nameRaw }] : [{ key, name: nameRaw }];
      localStorage.setItem('appConfig.customRoles', JSON.stringify(next));
    } catch (_) { /* noop */ }
    setNewRoleName('');
    setNewRoleError('');
  };

  const handleRoleMetaChange = useCallback((roleKey, field, value) => {
    setRolesMap(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], [field]: value } }));
  }, []);

  const saveRoleMeta = useCallback(async (roleKey, currentRoleData) => {
    const role = currentRoleData;
    try {
      await apiClient.put(`/api/roles-meta/${roleKey}`, {
        name: role?.name,
        description: role?.description,
        color: role?.color,
        priority: role?.priority
      });
      try {
        const rawMeta = localStorage.getItem('appConfig.roleMeta');
        const meta = rawMeta ? JSON.parse(rawMeta) : {};
        const nextMeta = { ...meta, [roleKey]: { name: role?.name, color: role?.color, priority: role?.priority, description: role?.description } };
        localStorage.setItem('appConfig.roleMeta', JSON.stringify(nextMeta));
      } catch (_) { void 0; }
      toast.success(t('appConfig.rolesPermissions.roleEdit.saved'));
    } catch (_) {
      toast.error(t('appConfig.rolesPermissions.roleEdit.saveError'));
    }
  }, [apiClient, t]);

  const openRoleDelete = useCallback((roleKey) => {
    if (roleKey === 'administrator') return;
    setRoleDeleteKey(roleKey);
    setShowRoleDeleteModal(true);
  }, []);

  const handleRoleDelete = async (roleKey) => {
    if (!roleKey || roleKey === 'administrator') return;
    try {
      setRoleDeleteLoading(true);
      try {
        const raw = localStorage.getItem('appConfig.customRoles');
        const list = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? list.filter((r) => String(r?.key).toLowerCase() !== roleKey) : [];
        localStorage.setItem('appConfig.customRoles', JSON.stringify(next));
      } catch (_) { void 0; }
      setRolesMap((prev) => {
        const next = { ...prev };
        delete next[roleKey];
        return next;
      });
      setRolePermissions((prev) => {
        const next = { ...prev };
        delete next[roleKey];
        return next;
      });
      try {
        const resp = await apiClient.delete(`/api/roles-meta/${roleKey}`);
        const msg = resp && typeof resp === 'object' ? (resp.message || '') : '';
        toast.success(msg || t('appConfig.rolesPermissions.deleteRole.success'));
      } catch (e) {
        toast.error(e?.message || t('appConfig.rolesPermissions.deleteRole.error'));
      }
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('role-permissions:updated', { detail: { role: roleKey, permissions: [] } }));
        }
      } catch (_) { /* noop */ }
    } catch (_) {
      toast.error(t('appConfig.rolesPermissions.deleteRole.error'));
    } finally {
      setRoleDeleteLoading(false);
      setShowRoleDeleteModal(false);
      setRoleDeleteKey(null);
    }
  };

  const toggleExpanded = useCallback((roleKey) => {
    setExpandedRoles(prev => ({ ...prev, [roleKey]: !prev[roleKey] }));
  }, []);

  return (
    <div className="space-y-6">
      {loadingPermissions ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(rolesMap)
            .sort(([, a], [, b]) => {
              const pa = typeof a?.priority === 'number' ? a.priority : 0;
              const pb = typeof b?.priority === 'number' ? b.priority : 0;
              if (pb !== pa) return pb - pa;
              const na = String(a?.name || '').toLowerCase();
              const nb = String(b?.name || '').toLowerCase();
              return na.localeCompare(nb);
            })
            .map(([roleKey, roleData]) => (
              <RoleConfigRow
                key={roleKey}
                roleKey={roleKey}
                roleData={roleData}
                t={t}
                saving={saving}
                saveRoleMeta={saveRoleMeta}
                saveRolePermissions={saveRolePermissions}
                openRoleDelete={openRoleDelete}
                isExpanded={!!expandedRoles[roleKey]}
                toggleExpanded={toggleExpanded}
                handleRoleMetaChange={handleRoleMetaChange}
                handlePermissionToggle={handlePermissionToggle}
                availablePermissions={Array.from(new Set(availablePermissions))}
                permissions={rolePermissions[roleKey] || []}
              />
            ))}
          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-slate-100">{t('appConfig.rolesPermissions.addRole.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="newRoleName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.rolesPermissions.addRole.nameLabel')}</label>
                <input
                  id="newRoleName"
                  name="newRoleName"
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder={t('appConfig.rolesPermissions.addRole.namePlaceholder')}
                  className="border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100"
                />
              </div>
              <button
                onClick={addCustomRole}
                disabled={saving}
                className="px-3 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {t('appConfig.users.submitAdd')}
              </button>
            </div>
            {newRoleError && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400">{t('appConfig.rolesPermissions.addRole.errorExists')}</div>
            )}
          </div>
        </div>
      )}
      {showRoleDeleteModal && (
        <ConfirmationModal
          isOpen={showRoleDeleteModal}
          onClose={() => { if (!roleDeleteLoading) { setShowRoleDeleteModal(false); setRoleDeleteKey(null); } }}
          onConfirm={() => roleDeleteKey && handleRoleDelete(roleDeleteKey)}
          title={t('appConfig.rolesPermissions.deleteRole.title')}
          message={roleDeleteKey ? t('appConfig.rolesPermissions.deleteRole.message', { role: rolesMap[roleDeleteKey]?.name || roleDeleteKey }) : ''}
          confirmText={t('common.remove')}
          cancelText={t('common.cancel')}
          type="danger"
          loading={roleDeleteLoading}
        />
      )}
    </div>
  );
}
