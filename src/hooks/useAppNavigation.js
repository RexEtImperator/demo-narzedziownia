import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { initFlowbite } from 'flowbite';
import { PERMISSIONS, hasPermission } from '../constants';
import { AUDIT_ACTIONS } from '../constants/auditActions';
import { addAuditLog } from '../utils/auditLogger';
import { useLanguage } from '../contexts/LanguageContext';

export const useAppNavigation = (user) => {
  // Removed local state for currentScreen to rely on URL source of truth
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [initialSearchTerm, setInitialSearchTerm] = useState({ tools: '', bhp: '' });
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const savedCollapsed = localStorage.getItem('sidebarCollapsed');
      if (savedCollapsed === null) return false;
      const normalized = String(savedCollapsed).trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      try {
        const parsed = JSON.parse(savedCollapsed);
        return Boolean(parsed);
      } catch (_) {
        return false;
      }
    } catch (_) {
      return false;
    }
  });

  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive currentScreen from URL
  const path = String(location.pathname || '/').replace(/^\/+/, '');
  const [baseScreen] = path.split('/');
  const allowed = ['dashboard','tools','bhp','inventory','employees','labels','analytics','audit','admin','report','user-management','config','app-config','user-settings','db-viewer','settings','kiosk','map'];
  const currentScreen = allowed.includes(baseScreen) ? baseScreen : 'dashboard';

  // Wrapper to maintain API compatibility, but it just navigates
  const setCurrentScreen = useCallback((screen) => {
    navigate(screen === 'dashboard' ? '/dashboard' : `/${screen}`);
  }, [navigate]);

  // Save sidebar collapse preference
  useEffect(() => {
    try {
      localStorage.setItem('sidebarCollapsed', isSidebarCollapsed ? 'true' : 'false');
      if (isSidebarCollapsed) {
        initFlowbite();
      }
    } catch (_) {
      // Ignore errors
    }
  }, [isSidebarCollapsed]);

  // Check permissions on URL change
  useEffect(() => {
    if (!user) return;

    const hasScreenPermission = (() => {
      const permMap = {
        tools: PERMISSIONS.VIEW_TOOLS,
        bhp: PERMISSIONS.VIEW_BHP,
        inventory: PERMISSIONS.VIEW_INVENTORY,
        employees: PERMISSIONS.VIEW_EMPLOYEES,
        labels: PERMISSIONS.VIEW_LABELS,
        map: PERMISSIONS.VIEW_MAP,
        analytics: PERMISSIONS.VIEW_ANALYTICS,
        'user-management': PERMISSIONS.VIEW_USERS,
        'config': PERMISSIONS.SYSTEM_SETTINGS,
        'settings': PERMISSIONS.SYSTEM_SETTINGS,
        'db-viewer': PERMISSIONS.VIEW_DATABASE,
        'audit': PERMISSIONS.VIEW_AUDIT_LOG
      };
      const p = permMap[currentScreen];
      return !p || hasPermission(user, p);
    })();

    if (!hasScreenPermission) {
      navigate('/dashboard', { replace: true });
      localStorage.setItem('currentScreen', 'dashboard');
    }
  }, [currentScreen, user, navigate]);

  const handleNavigation = (screen) => {
    const [baseScreen] = screen.split('/');
    const hasScreenPermission = (() => {
      const permMap = {
        tools: PERMISSIONS.VIEW_TOOLS,
        bhp: PERMISSIONS.VIEW_BHP,
        inventory: PERMISSIONS.VIEW_INVENTORY,
        employees: PERMISSIONS.VIEW_EMPLOYEES,
        labels: PERMISSIONS.VIEW_LABELS,
        map: PERMISSIONS.VIEW_MAP,
        analytics: PERMISSIONS.VIEW_ANALYTICS,
        'user-management': PERMISSIONS.VIEW_USERS,
        'config': PERMISSIONS.SYSTEM_SETTINGS,
        'settings': PERMISSIONS.SYSTEM_SETTINGS,
        'db-viewer': PERMISSIONS.VIEW_DATABASE,
        'audit': PERMISSIONS.VIEW_AUDIT_LOG
      };
      const p = permMap[baseScreen];
      return !p || hasPermission(user, p);
    })();

    if (!hasScreenPermission) {
      toast.error(t('common.noPermission'));
      navigate('/dashboard');
      setCurrentScreen('dashboard');
      localStorage.setItem('currentScreen', 'dashboard');
      return;
    }
    
    setCurrentScreen(screen);
    setIsMobileMenuOpen(false);
    
    localStorage.setItem('currentScreen', screen);
    navigate(`/${screen}`);
    
    const screenLabels = {
      'analytics': 'Przeglądano sekcję analityki',
      'settings': 'Dostęp do ogólnych ustawień systemu',
      'audit': 'Przeglądano dziennik audytu'
    };
    
    if (screenLabels[screen]) {
      const action = screen === 'analytics' ? AUDIT_ACTIONS.VIEW_ANALYTICS : AUDIT_ACTIONS.ACCESS_ADMIN;
      addAuditLog(user, action, screenLabels[screen]);
    }
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const toggleSidebarCollapse = () => setIsSidebarCollapsed(prev => !prev);

  // Global event listeners for navigation
  useEffect(() => {
    const onNavigate = (e) => {
      try {
        const { screen, q, url } = e?.detail || {};
        if (typeof url === 'string' && url.trim()) {
          const path = url.trim();
          if (/^https?:\/\//i.test(path)) {
            const w = window.open(path, '_blank');
            if (!w) toast.error(t('common.popupBlocked'));
            return;
          }
          const first = path.replace(/^\/+/, '').split(/[/?#]/)[0] || 'dashboard';
          const permMap = {
            tools: PERMISSIONS.VIEW_TOOLS,
            bhp: PERMISSIONS.VIEW_BHP,
            inventory: PERMISSIONS.VIEW_INVENTORY,
            employees: PERMISSIONS.VIEW_EMPLOYEES,
            labels: PERMISSIONS.VIEW_LABELS,
            map: PERMISSIONS.VIEW_MAP,
            analytics: PERMISSIONS.VIEW_ANALYTICS,
            admin: PERMISSIONS.VIEW_ADMIN,
            'user-management': PERMISSIONS.VIEW_USERS,
            'config': PERMISSIONS.SYSTEM_SETTINGS,
            'settings': PERMISSIONS.SYSTEM_SETTINGS,
            'db-viewer': PERMISSIONS.VIEW_DATABASE,
            'audit': PERMISSIONS.VIEW_AUDIT_LOG,
            'dashboard': undefined
          };
          const p = permMap[first];
          if (p && !hasPermission(user, p)) {
            toast.error(t('common.noPermission'));
            navigate('/dashboard');
            return;
          }
          navigate(path.startsWith('/') ? path : `/${path}`);
          return;
        }

        if (screen === 'bhp' || screen === 'tools' || screen === 'employees') {
          if (screen === 'employees') {
            if (!hasPermission(user, PERMISSIONS.VIEW_EMPLOYEES)) {
              toast.error(t('common.noPermission'));
              return;
            }
            setCurrentScreen(screen);
            localStorage.setItem('currentScreen', screen);
            navigate(`/employees?q=${encodeURIComponent(q || '')}`);
            return;
          }

          if (screen === 'bhp') {
            setInitialSearchTerm(prev => ({ ...prev, bhp: q || '' }));
            if (!hasPermission(user, PERMISSIONS.VIEW_BHP)) {
              toast.error(t('common.noPermission'));
              return;
            }
          } else {
            setInitialSearchTerm(prev => ({ ...prev, tools: q || '' }));
            if (!hasPermission(user, PERMISSIONS.VIEW_TOOLS)) {
              toast.error(t('common.noPermission'));
              return;
            }
          }
          setCurrentScreen(screen);
          localStorage.setItem('currentScreen', screen);
          navigate(`/${screen}`);
        }
      } catch (err) {
        console.warn('navigate event error:', err);
      }
    };

    window.addEventListener('navigate', onNavigate);
    return () => window.removeEventListener('navigate', onNavigate);
  }, [navigate, user, t, setCurrentScreen]);

  return {
    currentScreen,
    setCurrentScreen,
    isMobileMenuOpen,
    toggleMobileMenu,
    closeMobileMenu,
    isSidebarCollapsed,
    toggleSidebarCollapse,
    initialSearchTerm,
    setInitialSearchTerm,
    handleNavigation
  };
};
