import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  WrenchScrewdriverIcon, 
  ShieldCheckIcon, 
  UsersIcon, 
  ArchiveBoxIcon, 
  ArrowDownTrayIcon,
  BellIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CircleStackIcon,
  Cog8ToothIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  LanguageIcon,
  LinkIcon,
  QrCodeIcon,
  ServerStackIcon,
  TagIcon, 
  ChartBarIcon, 
  FlagIcon, 
  Cog6ToothIcon,
  MapIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  NewspaperIcon
} from '@heroicons/react/24/solid';
import { useLanguage } from '../contexts/LanguageContext';
import { PERMISSIONS, hasPermission } from '../constants';
import { useAppConfig } from '../hooks/useAppConfig';

function Sidebar({ onNav, current, user, isMobileOpen, onMobileClose, collapsed = false, toolsCount = 0, bhpCount = 0, employeesCount = 0 }) {
  const { t } = useLanguage();
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState(null);
  const showSettingsMenu = !collapsed && location.pathname.startsWith('/settings');
  const { data: appConfig } = useAppConfig(true);
  const [mapEnabledLocal, setMapEnabledLocal] = useState(() => {
    try {
      const raw = localStorage.getItem('feature.map.enabled');
      if (raw == null) return null;
      const v = String(raw).trim().toLowerCase();
      return v === 'true' || v === '1';
    } catch (_e) {
      return null;
    }
  });

  useEffect(() => {
    const enabled = appConfig?.enableMap;
    if (typeof enabled === 'boolean') {
      try {
        localStorage.setItem('feature.map.enabled', String(enabled));
      } catch (_e) { void 0; }
    }
  }, [appConfig?.enableMap]);

  useEffect(() => {
    const onMapChanged = (e) => {
      const enabled = e?.detail?.enabled;
      if (typeof enabled === 'boolean') {
        setMapEnabledLocal(enabled);
        try {
          localStorage.setItem('feature.map.enabled', String(enabled));
        } catch (_e) { void 0; }
      } else {
        try {
          const raw = localStorage.getItem('feature.map.enabled');
          const v = String(raw || '').trim().toLowerCase();
          if (v === 'true' || v === '1') setMapEnabledLocal(true);
          if (v === 'false' || v === '0') setMapEnabledLocal(false);
        } catch (_e) { void 0; }
      }
    };
    window.addEventListener('feature:map:changed', onMapChanged);
    return () => window.removeEventListener('feature:map:changed', onMapChanged);
  }, []);

  const mapEnabled = mapEnabledLocal === null ? (appConfig?.enableMap === true) : mapEnabledLocal;

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar.collapsedSections');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const toggleSection = (index) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [index]: !prev[index] };
      localStorage.setItem('sidebar.collapsedSections', JSON.stringify(next));
      return next;
    });
  };

  const menuSections = [
    {
      title: 'OGÓLNE',
      items: [
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: (<HomeIcon className="w-6 h-6" aria-hidden="true" />), permission: null },
        { id: 'report', label: t('sidebar.report'), icon: (<FlagIcon className="w-6 h-6" aria-hidden="true" />), permission: null },
      ]
    },
    {
      title: 'OPERACJE',
      items: [
        { id: 'tools', label: t('sidebar.tools'), icon: (<WrenchScrewdriverIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_TOOLS },
        { id: 'bhp', label: t('sidebar.bhp'), icon: (<ShieldCheckIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_BHP },
        { id: 'employees', label: t('sidebar.employees'), icon: (<UsersIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_EMPLOYEES },
        ...(mapEnabled ? [{ id: 'map', label: t('sidebar.map'), icon: (<MapIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_MAP }] : []),
        { id: 'inventory', label: t('sidebar.inventory'), icon: (<ArchiveBoxIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_INVENTORY },
        { id: 'labels', label: t('sidebar.labels'), icon: (<TagIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_LABELS },
      ]
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'analytics', label: t('sidebar.analytics'), icon: (<ChartBarIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_ANALYTICS },
        { id: 'audit', label: t('sidebar.audit'), icon: (<NewspaperIcon className="w-6 h-6" aria-hidden="true" />), permission: PERMISSIONS.VIEW_AUDIT_LOG },
        { 
          id: 'settings', 
          label: t('sidebar.settings'), 
          icon: (<Cog6ToothIcon className="w-6 h-6" aria-hidden="true" />), 
          permission: PERMISSIONS.SYSTEM_SETTINGS,
          isSettings: true
        }
      ]
    }
  ];

  const [isLocalDb] = useState(() => {
    try {
      const dbSource = localStorage.getItem('app_config_db_source');
      return dbSource === 'local';
    } catch (_e) {
      return false;
    }
  });

  // Settings Sub-items definition
  const settingsSubItems = [
    { id: 'general', label: t('appConfig.tabs.general'), icon: (<Cog8ToothIcon className="w-5 h-5" aria-hidden="true" />) },
    ...(user?.role === 'administrator' ? [{ id: 'security', label: t('appConfig.tabs.security'), icon: (<ShieldCheckIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    ...(user?.role === 'administrator' ? [{ id: 'email', label: t('appConfig.tabs.email'), icon: (<EnvelopeIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    { id: 'users', label: t('appConfig.tabs.users'), icon: (<UsersIcon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'rolesPermissions', label: t('appConfig.tabs.rolesPermissions'), icon: (<KeyIcon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'features', label: t('appConfig.tabs.features'), icon: (<Cog6ToothIcon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'notifications', label: t('appConfig.tabs.notifications'), icon: (<BellIcon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'departments', label: t('appConfig.tabs.departments'), icon: (<BuildingOffice2Icon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'positions', label: t('appConfig.tabs.positions'), icon: (<BriefcaseIcon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'categories', label: t('appConfig.tabs.categories'), icon: (<TagIcon className="w-5 h-5" aria-hidden="true" />) },
    { id: 'codes', label: t('appConfig.tabs.codes'), icon: (<QrCodeIcon className="w-5 h-5" aria-hidden="true" />) },
    ...(user?.role === 'administrator' ? [{ id: 'translations', label: t('appConfig.tabs.translations'), icon: (<LanguageIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    ...(user?.role === 'administrator' && isLocalDb ? [{ id: 'backup', label: t('appConfig.tabs.backup'), icon: (<ArrowDownTrayIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    ...(user?.role === 'administrator' ? [{ id: 'database', label: t('appConfig.tabs.database'), icon: (<CircleStackIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    ...(user?.role === 'administrator' ? [{ id: 'webhooks', label: t('appConfig.tabs.webhooks') || 'Webhooks', icon: (<LinkIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    ...(user?.role === 'administrator' && isLocalDb ? [{ id: 'server', label: t('appConfig.tabs.server'), icon: (<ServerStackIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
    ...(user?.role === 'administrator' ? [{ id: 'danger-zone', label: t('appConfig.tabs.dangerZone'), icon: (<ExclamationTriangleIcon className="w-5 h-5" aria-hidden="true" />) }] : []),
  ];

  const counts = { tools: toolsCount, bhp: bhpCount, employees: employeesCount };

  // Helper to determine if a sub-item is active
  const isSubItemActive = (subItemId) => {
    const path = location.pathname;
    return path === `/settings/${subItemId}` || (subItemId === 'general' && path === '/settings');
  };

  const handleSettingsClick = () => {
    if (collapsed) {
      // If collapsed, regular navigation (or expand sidebar logic could be here)
      onNav('settings');
    } else {
      onNav('settings'); // Navigate to default settings page
    }
  };

  const handleBackFromSettings = () => {
    onNav('dashboard'); // Go back to dashboard or previous page? Dashboard is safer.
  };

  return (
    <>
      {/* mobile */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      {/* sidebar */}
      <div id="main-sidebar" className={`fixed lg:static inset-y-0 left-0 z-50 ${collapsed ? 'w-20' : 'w-64'} bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-slate-800 transform transition-all duration-200 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col overflow-hidden`}>
        
        {/* Logo Area */}
        <div className={`flex items-center justify-center h-[76px] border-b border-slate-100 dark:border-slate-800/50 ${collapsed ? 'px-2' : 'px-6'}`}>
          <img
            src="/logo.png"
            alt="Logo systemu"
            className={`${collapsed ? 'w-10 h-10' : 'w-12 h-12'} object-contain drop-shadow-sm transition-all duration-200`}
          />
        </div>

        {/* Navigation Content */}
        <div className="flex-1 relative overflow-x-hidden overflow-y-auto custom-scrollbar">
          
          {/* MAIN MENU VIEW */}
          <div className={`absolute inset-0 w-full transition-transform duration-300 ease-in-out ${showSettingsMenu && !collapsed ? '-translate-x-full' : 'translate-x-0'} px-3 py-4 space-y-6`}>
            {menuSections.map((section, sectionIndex) => {
              const filteredItems = section.items.filter(item => 
                !item.permission || hasPermission(user, item.permission)
              );

              if (filteredItems.length === 0) return null;
              const isSectionCollapsed = collapsedSections[sectionIndex];

              return (
                <div key={sectionIndex}>
                  {!collapsed ? (
                    <button 
                      onClick={() => toggleSection(sectionIndex)}
                      className="w-full flex items-center justify-between px-4 mb-2 group focus:outline-none"
                    >
                      <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {section.title}
                      </h3>
                      {isSectionCollapsed ? (
                        <ChevronRightIcon className="w-3 h-3 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                      ) : (
                        <ChevronDownIcon className="w-3 h-3 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                      )}
                    </button>
                  ) : (
                    <div className="h-px w-8 mx-auto bg-slate-200 dark:bg-slate-700 mb-4 mt-2" />
                  )}
                  
                  {!isSectionCollapsed && (
                    <div className="space-y-1">
                      {filteredItems.map(item => {
                        const isActive = current === item.id || (item.isSettings && location.pathname.startsWith('/settings'));

                        return (
                          <div key={item.id} className="relative group">
                            <button
                              onClick={() => {
                                if (item.isSettings) {
                                  handleSettingsClick();
                                } else {
                                  onNav(item.id);
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (collapsed) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredItem({
                                    id: item.id,
                                    label: item.label,
                                    count: counts[item.id],
                                    top: rect.top + rect.height / 2,
                                    left: rect.right
                                  });
                                }
                              }}
                              onMouseLeave={() => setHoveredItem(null)}
                              className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-xl transition-all duration-200 group relative ${
                                isActive
                                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium shadow-sm shadow-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-700 hover:text-indigo-900 dark:hover:text-indigo-300'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              <span className={`transition-colors duration-200 ${collapsed ? '' : 'mr-3'}`}>
                                {React.cloneElement(item.icon, { className: `w-5 h-5 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-200'}` })}
                              </span>
                              
                              {!collapsed && (
                                <>
                                  <span className="flex-1 text-sm text-left">{item.label}</span>
                                  {item.isSettings && (
                                    <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                                  )}
                                </>
                              )}

                              {/* Badges/Counts */}
                              {!collapsed && typeof counts[item.id] !== 'undefined' && counts[item.id] !== null && (
                                <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-md ${
                                  isActive
                                    ? 'bg-indigo-100 dark:bg-indigo-500 text-indigo-700 dark:text-indigo-300' 
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-white hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                }`}>
                                  {counts[item.id]}
                                </span>
                              )}
                              
                              {/* Collapsed Badge (Dot) */}
                              {collapsed && typeof counts[item.id] !== 'undefined' && counts[item.id] !== null && counts[item.id] > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* SETTINGS SUB-MENU VIEW */}
          {!collapsed && (
            <div className={`absolute inset-0 w-full bg-white dark:bg-gray-800 transition-transform duration-300 ease-in-out ${showSettingsMenu ? 'translate-x-0' : 'translate-x-full'} flex flex-col z-20`}>
              {/* Header with Back Button */}
              <div className="flex items-center px-4 py-4 border-b border-slate-100 dark:border-slate-800/50">
                <button 
                  onClick={handleBackFromSettings}
                  className="p-2 -ml-2 mr-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('sidebar.settings')}</h2>
              </div>

              {/* Settings Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {settingsSubItems.map(subItem => {
                  const isSubActive = isSubItemActive(subItem.id);
                  return (
                    <button
                      key={subItem.id}
                      onClick={() => onNav(`settings/${subItem.id}`)} 
                      className={`group w-full flex items-center px-2 py-2 text-sm rounded-xl transition-all duration-200 ${
                        isSubActive
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="mr-3">
                        {typeof subItem.icon === 'string'
                          ? <span className="text-lg opacity-80">{subItem.icon}</span>
                          : React.cloneElement(subItem.icon, { className: `w-5 h-5 ${isSubActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-200'}` })}
                      </span>
                      <span>{subItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FIXED TOOLTIP PORTAL-LIKE */}
      {collapsed && hoveredItem && (
        <div
          className="fixed z-[9999] px-3 py-2 bg-slate-900 text-white text-sm rounded-lg shadow-xl whitespace-nowrap pointer-events-none transition-opacity duration-200 animate-in fade-in zoom-in-95"
          style={{
            top: hoveredItem.top,
            left: hoveredItem.left + 12,
            transform: 'translateY(-50%)'
          }}
        >
          {hoveredItem.label}
          {typeof hoveredItem.count !== 'undefined' && hoveredItem.count !== null && (
            <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-sm">{hoveredItem.count}</span>
          )}
          {/* Arrow */}
          <div className="absolute top-1/2 -left-2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
        </div>
      )}
    </>
  );
}

export default Sidebar;
