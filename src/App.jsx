import { useEffect, lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer, toast } from 'react-toastify';
import Sidebar from './components/Sidebar';
import 'react-toastify/dist/ReactToastify.css';
import api from './api';
import { PERMISSIONS, hasPermission } from './constants';
import Preloader from './components/Preloader';
import PageTransition from './components/PageTransition';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import SkeletonList from './components/SkeletonList';
import DashboardSkeleton from './components/DashboardSkeleton';
import { errorTracker } from './services/errorTracking';
import ScreenErrorBoundary from './components/ScreenErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useAppData } from './hooks/useAppData';
import { urlBase64ToUint8Array } from './utils/pushUtils';
import Breadcrumbs from './components/Breadcrumbs';
import BottomNavigation from './components/BottomNavigation';

// Screens loaded dynamically (code-splitting)
const LoginScreen = lazy(() => import('./components/LoginScreen'));
const DashboardScreen = lazy(() => import('./components/DashboardScreen'));
const ToolsScreen = lazy(() => import('./components/ToolsScreen'));
const ToolsEditorScreen = lazy(() => import('./components/ToolsEditorScreen'));
const BhpScreen = lazy(() => import('./components/BhpScreen'));
const KioskScreen = lazy(() => import('./components/KioskScreen'));
const EmployeesScreen = lazy(() => import('./components/EmployeesScreen'));
const AnalyticsScreen = lazy(() => import('./components/AnalyticsScreen'));
const AuditLogScreen = lazy(() => import('./components/AuditLogScreen'));
const TopBar = lazy(() => import('./components/TopBar'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const UserSettingsScreen = lazy(() => import('./components/UserSettingsScreen'));
const ReportsScreen = lazy(() => import('./components/ReportsScreen'));
const AppConfigScreen = lazy(() => import('./components/AppConfigScreen'));
const LabelsManager = lazy(() => import('./components/LabelsManager'));
const InventoryScreen = lazy(() => import('./components/InventoryScreen'));
const DbViewerScreen = lazy(() => import('./components/DbViewerScreen'));
const PlantMapScreen = lazy(() => import('./components/PlantMapScreen'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Main App Component
function AppImpl() {
  const { user, login: handleLogin, logout: handleLogout } = useAuth();
  const { 
    currentScreen, 
    isMobileMenuOpen, toggleMobileMenu, closeMobileMenu, 
    isSidebarCollapsed, toggleSidebarCollapse, 
    initialSearchTerm,
    handleNavigation 
  } = useAppNavigation(user);
  const location = useLocation();

  const { 
    tools, setTools, 
    employees, setEmployees,
    bhpItems, 
    toolsCount, bhpCount, employeesCount, 
    appName 
  } = useAppData(user);

  const { t } = useLanguage();
  const { theme } = useTheme();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    let lastKey = null;
    let lastKeyTime = 0;

    const handleGlobalShortcuts = (e) => {
       if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
         if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
           e.preventDefault();
           setIsCommandPaletteOpen(prev => !prev);
         }
         return;
       }

       const now = Date.now();
       
       // Command Palette
       if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
         e.preventDefault();
         setIsCommandPaletteOpen(prev => !prev);
         return;
       }

       // Sequential shortcuts
       if (e.key.toLowerCase() === 'g') {
         lastKey = 'g';
         lastKeyTime = now;
         return; // Wait for next key
       }

       if (lastKey === 'g' && (now - lastKeyTime < 1000)) {
         const key = e.key.toLowerCase();
         if (key === 't') {
           handleNavigation('tools');
           lastKey = null;
         } else if (key === 'b') {
           handleNavigation('bhp');
           lastKey = null;
         } else if (key === 'e') {
           handleNavigation('employees');
           lastKey = null;
         } else if (key === 'd') {
           handleNavigation('dashboard');
           lastKey = null;
         }
       } else {
         // Reset if too much time passed or other key
         if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
            lastKey = null;
         }
       }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [handleNavigation]);

  useEffect(() => {
    const onRateLimit = (event) => {
      toast.warn(event.detail?.message || 'Zbyt wiele zapytań');
    };
    window.addEventListener('api:ratelimit', onRateLimit);
    return () => window.removeEventListener('api:ratelimit', onRateLimit);
  }, []);

  useEffect(() => {
    const onGlobalError = (event) => {
      try {
        errorTracker.capture(event.error || event, { type: 'uncaught_error', screen: currentScreen });
      } catch (_) { return; }
    };
    const onUnhandledRejection = (event) => {
      try {
        errorTracker.capture(event.reason || event, { type: 'unhandled_rejection', screen: currentScreen });
      } catch (_) { return; }
    };
    window.addEventListener('error', onGlobalError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onGlobalError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [currentScreen]);

  useEffect(() => {
    const flushErrors = () => { try { errorTracker.flush(); } catch (_) { return; } };
    document.addEventListener('visibilitychange', flushErrors);
    window.addEventListener('beforeunload', flushErrors);
    return () => {
      document.removeEventListener('visibilitychange', flushErrors);
      window.removeEventListener('beforeunload', flushErrors);
    };
  }, []);

  useEffect(() => {
    const registerPush = async () => {
      if (!user) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      
      // Don't try to register if we don't have permission already granted
      // Requesting permission requires a user gesture, so we can't do it in useEffect
      if (Notification.permission !== 'granted') return;
      
      try {
        const registration = await navigator.serviceWorker.ready;
        const cfg = await api.get('/api/push/config').catch(() => ({}));
        const publicKey = cfg && cfg.publicKey ? cfg.publicKey : null;
        if (!publicKey) return;
        
        const appServerKey = urlBase64ToUint8Array(publicKey);
        const existing = await registration.pushManager.getSubscription();
        const sub = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
        await api.post('/api/push/subscribe', sub).catch(() => void 0);
      } catch (err) {
        console.warn('Push registration failed silently:', err);
      }
    };
    registerPush().catch(() => void 0);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const run = () => {
      const loaders = [];

      // Preload common screens
      loaders.push(() => import('./components/ReportsScreen'));

      // Preload restricted screens only if user has permission
      if (hasPermission(user, PERMISSIONS.VIEW_ANALYTICS)) {
        loaders.push(() => import('./components/AnalyticsScreen'));
      }
      if (hasPermission(user, PERMISSIONS.VIEW_AUDIT_LOG)) {
        loaders.push(() => import('./components/AuditLogScreen'));
      }
      if (hasPermission(user, PERMISSIONS.VIEW_DATABASE)) {
        loaders.push(() => import('./components/DbViewerScreen'));
      }
      if (hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS)) {
        loaders.push(() => import('./components/AppConfigScreen'));
      }
      
      loaders.forEach(fn => { try { fn(); } catch (_) { return; } });
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run);
    } else {
      setTimeout(run, 1200);
    }
  }, [user]);

  if (!user) {
    return (
      <Suspense fallback={<Preloader fullscreen label={t('common.loading')} /> }>
        <LoginScreen onLogin={handleLogin} />
      </Suspense>
    );
  }

  const isKioskRoute = String(location.pathname || '').startsWith('/kiosk');

  return (
      <div className="flex h-screen md:h-screen h-[100dvh] bg-slate-50 dark:bg-gray-900 overflow-hidden transition-colors duration-300">
        {!isKioskRoute && (
          <Sidebar 
            onNav={handleNavigation} 
            current={currentScreen} 
            user={user}
            isMobileOpen={isMobileMenuOpen}
            onMobileClose={closeMobileMenu}
            collapsed={isSidebarCollapsed}
            toolsCount={toolsCount}
            bhpCount={bhpCount}
            employeesCount={employeesCount}
          />
        )}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* TopBar + content in Suspense, to avoid blocking the first render */}
          {!isKioskRoute && (
            <Suspense fallback={<div className="h-14 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800"/>}>
              <TopBar 
                user={user} 
                onLogout={handleLogout} 
                onToggleSidebar={toggleMobileMenu}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebarCollapse={toggleSidebarCollapse}
                isSidebarOpen={isMobileMenuOpen}
                appName={appName}
                onNavigate={handleNavigation}
                onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
              />
            </Suspense>
          )}

          <Suspense fallback={null}>
            <CommandPalette 
              isOpen={isCommandPaletteOpen} 
              onClose={() => setIsCommandPaletteOpen(false)}
              tools={tools}
              employees={hasPermission(user, PERMISSIONS.VIEW_EMPLOYEES) ? employees : []}
              bhpItems={bhpItems}
              user={user}
              onNavigate={handleNavigation}
            />
          </Suspense>

          {!isKioskRoute && <Breadcrumbs />}

          <div data-app-scroll="main" className="flex-1 min-h-0 overflow-auto overscroll-contain mb-28 md:mb-0 bg-slate-50 dark:bg-gray-900">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                <Route path="/dashboard" element={
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Pulpit">
                      <Suspense fallback={<DashboardSkeleton />}>
                        <DashboardScreen tools={tools} employees={employees} user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                } />

                <Route path="/tools/new" element={hasPermission(user, PERMISSIONS.MANAGE_TOOLS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Dodaj Narzędzie">
                      <Suspense fallback={<div className="p-6"><Preloader /></div>}>
                        <ToolsEditorScreen user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/tools" replace />} />

                <Route path="/tools/edit/:id" element={hasPermission(user, PERMISSIONS.MANAGE_TOOLS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Edytuj Narzędzie">
                      <Suspense fallback={<div className="p-6"><Preloader /></div>}>
                        <ToolsEditorScreen user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/tools" replace />} />
                
                <Route path="/tools" element={hasPermission(user, PERMISSIONS.VIEW_TOOLS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Narzędzia">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={12} cols={6} /></div>}>
                        <ToolsScreen tools={tools} setTools={setTools} employees={employees} user={user} initialSearchTerm={initialSearchTerm.tools} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/bhp" element={hasPermission(user, PERMISSIONS.VIEW_BHP) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="BHP">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={12} cols={6} /></div>}>
                        <BhpScreen employees={employees} user={user} initialSearchTerm={initialSearchTerm.bhp} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/kiosk" element={hasPermission(user, PERMISSIONS.VIEW_TOOLS) || hasPermission(user, PERMISSIONS.VIEW_BHP) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Kiosk">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={12} cols={3} /></div>}>
                        <KioskScreen />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/inventory" element={hasPermission(user, PERMISSIONS.VIEW_INVENTORY) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Inwentaryzacja">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={8} cols={4} /></div>}>
                        <InventoryScreen tools={tools} user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />

                <Route path="/map" element={hasPermission(user, PERMISSIONS.VIEW_MAP) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Mapa zakładu">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={4} cols={2} /></div>}>
                        <PlantMapScreen user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/labels" element={hasPermission(user, PERMISSIONS.VIEW_LABELS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Etykiety">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={6} cols={3} /></div>}>
                        <LabelsManager user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/employees" element={hasPermission(user, PERMISSIONS.VIEW_EMPLOYEES) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Pracownicy">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={12} cols={5} /></div>}>
                        <EmployeesScreen employees={employees} setEmployees={setEmployees} user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/analytics" element={hasPermission(user, PERMISSIONS.VIEW_ANALYTICS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Analityka">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={4} cols={2} /></div>}>
                        <AnalyticsScreen tools={tools} employees={employees} user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/audit" element={hasPermission(user, PERMISSIONS.VIEW_AUDIT_LOG) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Dziennik Zdarzeń">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={15} cols={4} /></div>}>
                        <AuditLogScreen user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/report" element={
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Raporty">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={5} cols={3} /></div>}>
                        <ReportsScreen user={user} employees={employees} tools={tools} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                } />
                
                <Route path="/settings" element={hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Konfiguracja Aplikacji">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={8} cols={2} /></div>}>
                        <AppConfigScreen user={user} apiClient={api} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />

                <Route path="/settings/:tab" element={hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Konfiguracja Aplikacji">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={8} cols={2} /></div>}>
                        <AppConfigScreen user={user} apiClient={api} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="/user-settings" element={
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Ustawienia Użytkownika">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={4} cols={2} /></div>}>
                        <UserSettingsScreen user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                } />
                
                <Route path="/db-viewer" element={hasPermission(user, PERMISSIONS.VIEW_DATABASE) ? (
                  <PageTransition>
                    <ScreenErrorBoundary screenName="Przeglądarka Bazy">
                      <Suspense fallback={<div className="p-6"><SkeletonList rows={10} cols={6} /></div>}>
                        <DbViewerScreen user={user} />
                      </Suspense>
                    </ScreenErrorBoundary>
                  </PageTransition>
                ) : <Navigate to="/dashboard" replace />} />
                
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AnimatePresence>
          </div>
        </div>
        <div aria-live="polite" aria-atomic="true" role="status">
          <ToastContainer
            position="top-right"
            autoClose={2500}
            hideProgressBar={false}
            newestOnTop={true}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme={theme}
            toastClassName="rounded-lg shadow-md"
            bodyClassName="text-sm"
          />
        </div>
        
        <BottomNavigation onMenuToggle={toggleMobileMenu} user={user} />
      </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <AppImpl />
            </ErrorBoundary>
          </BrowserRouter>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

