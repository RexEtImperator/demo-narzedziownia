export const PERMISSIONS = {
  // System administration
  VIEW_ADMIN: 'view_admin',
  SYSTEM_SETTINGS: 'system_settings',
  // Users management
  MANAGE_USERS: 'manage_users',
  VIEW_USERS: 'view_users',
  CREATE_USERS: 'create_users',
  EDIT_USERS: 'edit_users',
  DELETE_USERS: 'delete_users',
  // Department and position management
  MANAGE_DEPARTMENTS: 'manage_departments',
  MANAGE_POSITIONS: 'manage_positions',
  // Manage roles
  MANAGE_ROLES: 'manage_roles',
  VIEW_ROLES: 'view_roles',
  // Delete issue, return, and service history
  DELETE_ISSUE_HISTORY: 'delete_issue_history',
  DELETE_RETURN_HISTORY: 'delete_return_history',
  DELETE_SERVICE_HISTORY: 'delete_service_history',
  // Database
  VIEW_DATABASE: 'view_database',
  MANAGE_DATABASE: 'manage_database',
  // Audit logs
  VIEW_AUDIT_LOG: 'view_audit_log',
  // Analytics
  VIEW_ANALYTICS: 'view_analytics',
  // Map
  VIEW_MAP: 'view_map',
  MANAGE_MAP: 'manage_map',
  // Tools management
  VIEW_TOOLS: 'view_tools',
  VIEW_ALL_TOOLS: 'view_all_tools',
  MANAGE_TOOLS: 'manage_tools',
  EXPORT_TOOLS: 'export_tools',
  VIEW_TOOL_HISTORY: 'view_tool_history',
  // Labels
  VIEW_LABELS: 'view_labels',
  // Employees
  VIEW_EMPLOYEES: 'view_employees',
  MANAGE_EMPLOYEES: 'manage_employees',
  EXPORT_EMPLOYEES: 'export_employees',
  // BHP
  VIEW_BHP: 'view_bhp',
  MANAGE_BHP: 'manage_bhp',
  EXPORT_BHP: 'export_bhp',
  VIEW_BHP_HISTORY: 'view_bhp_history',
  // Dashboard / Quick actions
  VIEW_QUICK_ACTIONS: 'view_quick_actions',
  // Inventory check
  VIEW_INVENTORY: 'view_inventory',
  INVENTORY_MANAGE_SESSIONS: 'inventory_manage_sessions',
  INVENTORY_SCAN: 'inventory_scan',
  INVENTORY_ACCEPT_CORRECTION: 'inventory_accept_correction',
  INVENTORY_DELETE_CORRECTION: 'inventory_delete_correction',
  INVENTORY_EXPORT_CSV: 'inventory_export_csv',
  // Notifications bell tabs visibility (TopBar)
  NOTIFY: 'notify',
  // Auxiliary (for readability of calls)
  ADMIN: 'admin'
};

// User roles
export const ROLES = {
  ADMIN: 'administrator',
  MANAGER: 'manager',
  TOOLSMASTER: 'toolsmaster',
  HR: 'hr',
  SUPERVISOR: 'supervisor',
  ENGINEER: 'engineer',
  EMPLOYEE: 'employee',
  USER: 'user'
};

// User statuses
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended'
};

// Department status
export const DEPARTMENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

export const DEFAULT_DEPARTMENTS = [
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

export const DEFAULT_POSITIONS = [
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

// Audit actions
export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  VIEW: 'view'
};

// Pagination config
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 20, 50, 100]
};

// Config API
export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
};

// Endpoints API
export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/api/login',
  LOGOUT: '/api/auth/logout',
  REFRESH_TOKEN: '/api/auth/refresh',
  // Users
  USERS: '/api/users',
  USER_BY_ID: (id) => `/api/users/${id}`,
  // Departments
  DEPARTMENTS: '/api/departments',
  DEPARTMENT_BY_ID: (id) => `/api/departments/${id}`,
  // Positions
  POSITIONS: '/api/positions',
  POSITION_BY_ID: (id) => `/api/positions/${id}`,
  // Roles
  ROLES: '/api/roles',
  ROLE_BY_ID: (id) => `/api/roles/${id}`,
  // Audit
  AUDIT_LOG: '/api/audit',
  // Analytics
  ANALYTICS: '/api/analytics',
  // Application configuration
  CONFIG: '/api/config'
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'A network connection error has occurred.',
  UNAUTHORIZED: 'You do not have permission to perform this operation.',
  FORBIDDEN: 'Access has been denied.',
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_ERROR: 'A data validation error has occurred.',
  SERVER_ERROR: 'A server error has occurred.',
  UNKNOWN_ERROR: 'An unknown error has occurred.'
};

// Success messages
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'User has been successfully created.',
  USER_UPDATED: 'User has been successfully updated.',
  USER_DELETED: 'User has been successfully deleted.',
  DEPARTMENT_CREATED: 'The department has been successfully created.',
  DEPARTMENT_UPDATED: 'The department has been successfully updated.',
  DEPARTMENT_DELETED: 'The department has been successfully deleted.',
  POSITION_CREATED: 'The position has been successfully created.',
  POSITION_UPDATED: 'The position has been successfully updated.',
  POSITION_DELETED: 'The position has been successfully deleted.',
  SETTINGS_SAVED: 'The settings have been saved.'
};

// Theme colors
export const THEME_COLORS = {
  PRIMARY: '#3b82f6',
  SECONDARY: '#64748b',
  SUCCESS: '#10b981',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
  INFO: '#06b6d4'
};

// Function to check user permissions
// Dynamic permissions loaded from the backend
let dynamicRolePermissions = null;
export const setDynamicRolePermissions = (permissionsMap) => {
  try {
    // We expect the object: { administrator: [perm...], manager: [...], employee: [...] }
    dynamicRolePermissions = permissionsMap && typeof permissionsMap === 'object' ? permissionsMap : null;
  } catch (_) {
    dynamicRolePermissions = null;
  }
};

export const hasPermission = (user, permission) => {
  if (!user || !user.role) {
    return false;
  }

  // Normalization of role names from different places in the application
  const normalizeRole = (role) => {
    const r = String(role).toLowerCase();
    if (r === 'administrator' || r === 'admin') return ROLES.ADMIN;
    if (r === 'manager') return ROLES.MANAGER;
    if (r === 'toolsmaster') return ROLES.TOOLSMASTER;
    if (r === 'hr') return ROLES.HR;
    if (r === 'supervisor') return ROLES.SUPERVISOR;
    if (r === 'engineer') return ROLES.ENGINEER;
    if (r === 'employee') return ROLES.EMPLOYEE;
    if (r === 'user') return ROLES.USER;
    return r;
  };

  const normalizedRole = normalizeRole(user.role);
  // Admin has all permissions
  if (normalizedRole === ROLES.ADMIN) {
    return true;
  }
  // Mapping roles to permissions (default values - used when there is no data from the backend)
  const rolePermissions = {
    [ROLES.ADMIN]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.CREATE_USERS,
      PERMISSIONS.EDIT_USERS,
      PERMISSIONS.DELETE_USERS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.EXPORT_EMPLOYEES,
      PERMISSIONS.VIEW_ADMIN,
      PERMISSIONS.SYSTEM_SETTINGS,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_POSITIONS,
      PERMISSIONS.MANAGE_ROLES,
      PERMISSIONS.VIEW_ROLES,
      PERMISSIONS.DELETE_ISSUE_HISTORY,
      PERMISSIONS.DELETE_RETURN_HISTORY,
      PERMISSIONS.DELETE_SERVICE_HISTORY,
      PERMISSIONS.VIEW_DATABASE,
      PERMISSIONS.MANAGE_DATABASE,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.VIEW_MAP,
      PERMISSIONS.MANAGE_MAP,
      PERMISSIONS.VIEW_TOOLS,
      PERMISSIONS.VIEW_ALL_TOOLS,
      PERMISSIONS.MANAGE_TOOLS,
      PERMISSIONS.VIEW_TOOL_HISTORY,
      PERMISSIONS.VIEW_LABELS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.MANAGE_BHP,
      PERMISSIONS.VIEW_BHP_HISTORY,
      PERMISSIONS.EXPORT_TOOLS,
      PERMISSIONS.EXPORT_BHP,
      PERMISSIONS.VIEW_QUICK_ACTIONS,
      PERMISSIONS.VIEW_INVENTORY,
      PERMISSIONS.INVENTORY_MANAGE_SESSIONS,
      PERMISSIONS.INVENTORY_SCAN,
      PERMISSIONS.INVENTORY_ACCEPT_CORRECTION,
      PERMISSIONS.INVENTORY_DELETE_CORRECTION,
      PERMISSIONS.INVENTORY_EXPORT_CSV,
      PERMISSIONS.NOTIFY,
      PERMISSIONS.ADMIN
    ],
    [ROLES.MANAGER]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.CREATE_USERS,
      PERMISSIONS.EDIT_USERS,
      PERMISSIONS.DELETE_USERS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.EXPORT_EMPLOYEES,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.VIEW_MAP,
      PERMISSIONS.MANAGE_MAP,
      PERMISSIONS.VIEW_ALL_TOOLS,
      PERMISSIONS.VIEW_TOOLS,
      PERMISSIONS.VIEW_TOOL_HISTORY,
      PERMISSIONS.VIEW_LABELS,
      PERMISSIONS.MANAGE_TOOLS,
      PERMISSIONS.EXPORT_TOOLS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_POSITIONS,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.VIEW_BHP_HISTORY,
      PERMISSIONS.MANAGE_BHP,
      PERMISSIONS.EXPORT_BHP,
      PERMISSIONS.VIEW_INVENTORY,
      PERMISSIONS.INVENTORY_MANAGE_SESSIONS,
      PERMISSIONS.INVENTORY_SCAN,
      PERMISSIONS.INVENTORY_ACCEPT_CORRECTION,
      PERMISSIONS.INVENTORY_DELETE_CORRECTION,
      PERMISSIONS.INVENTORY_EXPORT_CSV,
      PERMISSIONS.NOTIFY
    ],
    [ROLES.TOOLSMASTER]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.CREATE_USERS,
      PERMISSIONS.EDIT_USERS,
      PERMISSIONS.DELETE_USERS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.EXPORT_EMPLOYEES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_POSITIONS,
      PERMISSIONS.MANAGE_ROLES,
      PERMISSIONS.VIEW_ROLES,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.VIEW_MAP,
      PERMISSIONS.MANAGE_MAP,
      PERMISSIONS.VIEW_TOOLS,
      PERMISSIONS.VIEW_ALL_TOOLS,
      PERMISSIONS.MANAGE_TOOLS,
      PERMISSIONS.VIEW_TOOL_HISTORY,
      PERMISSIONS.VIEW_LABELS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.MANAGE_BHP,
      PERMISSIONS.VIEW_BHP_HISTORY,
      PERMISSIONS.EXPORT_TOOLS,
      PERMISSIONS.EXPORT_BHP,
      PERMISSIONS.VIEW_QUICK_ACTIONS,
      PERMISSIONS.VIEW_INVENTORY,
      PERMISSIONS.INVENTORY_MANAGE_SESSIONS,
      PERMISSIONS.INVENTORY_SCAN,
      PERMISSIONS.INVENTORY_ACCEPT_CORRECTION,
      PERMISSIONS.INVENTORY_DELETE_CORRECTION,
      PERMISSIONS.INVENTORY_EXPORT_CSV,
      PERMISSIONS.NOTIFY
    ],
    [ROLES.SUPERVISOR]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.VIEW_ALL_TOOLS,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.VIEW_TOOL_HISTORY,
      PERMISSIONS.VIEW_BHP_HISTORY,
      PERMISSIONS.VIEW_MAP,
      PERMISSIONS.MANAGE_MAP,
    ],
    [ROLES.ENGINEER]: [
      PERMISSIONS.VIEW_TOOLS,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.VIEW_TOOL_HISTORY,
      PERMISSIONS.VIEW_BHP_HISTORY,
      PERMISSIONS.VIEW_MAP,
      PERMISSIONS.MANAGE_MAP,
    ],
    [ROLES.HR]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.EXPORT_EMPLOYEES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_POSITIONS,
      PERMISSIONS.VIEW_TOOLS,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.VIEW_MAP
    ],
    [ROLES.EMPLOYEE]: [
      PERMISSIONS.VIEW_TOOLS,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.VIEW_TOOL_HISTORY,
      PERMISSIONS.VIEW_BHP_HISTORY,
      PERMISSIONS.VIEW_MAP,
    ],
    [ROLES.USER]: []
  };
  // If we have dynamic permissions from the backend, use them first
  if (dynamicRolePermissions) {
    // Map internal role names to API keys
    const apiRoleKey =
      normalizedRole === ROLES.ADMIN ? 'administrator' :
      normalizedRole === ROLES.MANAGER ? 'manager' :
      normalizedRole === ROLES.TOOLSMASTER ? 'toolsmaster' :
      normalizedRole === ROLES.HR ? 'hr' :
      normalizedRole === ROLES.SUPERVISOR ? 'supervisor' :
      normalizedRole === ROLES.ENGINEER ? 'engineer' :
      normalizedRole === ROLES.EMPLOYEE ? 'employee' :
      normalizedRole === ROLES.USER ? 'user' : normalizedRole;

    const apiRolePerms = dynamicRolePermissions[apiRoleKey];
    if (Array.isArray(apiRolePerms)) {
      const normPerms = apiRolePerms.map(p => String(p).toLowerCase());
      return normPerms.includes(String(permission).toLowerCase());
    }
    // Fallback to static maps if dynamic role is missing
  }
  // Fallback to static maps if dynamic permissions are missing
  const userPermissions = rolePermissions[normalizedRole] || [];
  return userPermissions.includes(permission);
};
