import React, { useState, useRef, useEffect, Suspense } from 'react';
import { WrenchIcon, Bars3Icon, ChevronDownIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, SunIcon, MoonIcon, BellIcon, CircleStackIcon, ShieldExclamationIcon, ClockIcon, CheckIcon, CheckCircleIcon, XCircleIcon, ArrowLeftStartOnRectangleIcon, ChatBubbleOvalLeftEllipsisIcon, ArrowPathIcon, MagnifyingGlassIcon, TvIcon } from '@heroicons/react/24/outline';
import DOMPurify from 'dompurify';
const ChatModal = React.lazy(() => import('./ChatModal'));
const ChatPanel = React.lazy(() => import('./ChatPanel'));
import api from '../api';
import supabase from '../utils/supabase';
import { PERMISSIONS, hasPermission } from '../constants';
import { notifySuccess, notifyError } from '../utils/notify.jsx';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDate, formatDateOnly } from '../utils/dateUtils';
import { useAppConfig } from '../hooks/useAppConfig';
import { HelpButton, HelpPanel } from './HelpSystem';

const ALLOWED_SOUNDS = {
  'notification-get': '/audio/notification-get.mp3',
  'notification-message': '/audio/notification-message.mp3'
};

const playSafeSound = (soundKey, audioRef) => {
  const src = ALLOWED_SOUNDS[soundKey];
  if (!src) return;
  
  if (audioRef && audioRef.current) {
    audioRef.current.src = src;
    audioRef.current.play().catch(() => {});
  } else {
    try {
      new Audio(src).play().catch(() => {});
    } catch (_) { /* noop */ }
  }
};


const TopBar = ({ user, onLogout, onToggleSidebar, isSidebarCollapsed, onToggleSidebarCollapse, onNavigate, onOpenCommandPalette }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { isDarkMode, toggleTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [overdueNotifications, setOverdueNotifications] = useState([]);
  const bellRef = useRef(null);
  const audioRef = useRef(null);
  const [adminBellTab, setAdminBellTab] = useState('general');
  const overdueCacheRef = useRef({ ts: 0, data: [] });

  const { t } = useLanguage();
  const userRole = String(user?.role || '').trim().toLowerCase();
  const { data: appConfig, refetch: refetchAppConfig } = useAppConfig(true);
  const kioskEnabled = appConfig?.enableKiosk === true;
  const helpEnabled = appConfig?.enableHelp === true;
  const canOpenKiosk = kioskEnabled && (userRole === 'administrator' || userRole === 'toolsmaster' || userRole === 'manager');
  const [dbSource, setDbSource] = useState(null);

  useEffect(() => {
    const onKioskChanged = () => {
      Promise.resolve(refetchAppConfig()).catch(() => {});
    };
    const onHelpChanged = () => {
      Promise.resolve(refetchAppConfig()).catch(() => {});
    };
    window.addEventListener('feature:kiosk:changed', onKioskChanged);
    window.addEventListener('feature:help:changed', onHelpChanged);
    return () => {
      window.removeEventListener('feature:kiosk:changed', onKioskChanged);
      window.removeEventListener('feature:help:changed', onHelpChanged);
    };
  }, [refetchAppConfig]);

  useEffect(() => {
    if (!helpEnabled && helpOpen) setHelpOpen(false);
  }, [helpEnabled, helpOpen]);

  // Global Presence Tracking
  useEffect(() => {
    const isSupabase = import.meta.env.VITE_DB_SOURCE === 'supabase';
    if (!isSupabase || !user?.id) return;

    const channel = supabase.channel('presence:global');
    channel
      .on('presence', { event: 'sync' }, () => {
        // Optional: handle global sync if needed
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            let userId = user.dbId || user.id;
            // Resolve UUID to Int if needed to match DB foreign keys
            if (typeof userId === 'string' && userId.length > 30) {
               const { data: u } = await supabase.from('users').select('id').eq('auth_user_id', userId).maybeSingle();
               if (u) userId = u.id;
            }

            await channel.track({ 
               user_id: userId, 
               online_at: new Date().toISOString(),
               username: user.username || user.login
            });
          } catch (_) { /* noop */ }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    let mounted = true;
    api.get('/api/config/database')
      .then(data => {
        if (mounted) setDbSource(data?.dbSource || 'local');
      })
      .catch(() => {
        if (mounted) setDbSource(null);
      });
    return () => { mounted = false; };
  }, [onLogout]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'visibility' } }));
        window.dispatchEvent(new CustomEvent('chat:refresh', { detail: { source: 'visibility' } }));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const [chatOpen, setChatOpen] = useState(() => {
    try {
      const raw = localStorage.getItem('chat.modal.open');
      return raw === '1' || String(raw || '').toLowerCase() === 'true';
    } catch (_) { return false; }
  });
  const [chatTabs, setChatTabs] = useState([]);
  const [chatPanels, setChatPanels] = useState(() => {
    try {
      const raw = localStorage.getItem('chat.panels');
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      const valid = arr
        .filter(p => p && p.conversationId)
        .map(p => ({ ...p, lastActiveTs: Number(p.lastActiveTs || 0) }))
        .sort((a, b) => Number(b.lastActiveTs || 0) - Number(a.lastActiveTs || 0));
      return valid.slice(0, 3);
    } catch (_) { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('chat.panels', JSON.stringify(chatPanels)); } catch (_) { /* noop */ }
  }, [chatPanels]);
  useEffect(() => {
    try { localStorage.setItem('chat.modal.open', chatOpen ? '1' : '0'); } catch (_) { /* noop */ }
  }, [chatOpen]);
  useEffect(() => {
    const onPanelActivity = (evt) => {
      const d = evt?.detail || {};
      const convId = d?.conversationId;
      if (!convId) return;
      setChatPanels(prev => {
        const now = Date.now();
        const next = prev.map(p => p.conversationId === convId ? { ...p, lastActiveTs: now } : p)
          .sort((a, b) => Number(b.lastActiveTs || 0) - Number(a.lastActiveTs || 0))
          .slice(0, 3);
        return next;
      });
    };
    try { window.addEventListener('chat:activity', onPanelActivity); } catch (_) { /* noop */ }
    return () => { try { window.removeEventListener('chat:activity', onPanelActivity); } catch (_) { /* noop */ } };
  }, []);
  const [chatFeatureEnabled, setChatFeatureEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem('feature.chat.enabled');
      if (raw != null) {
        const v = String(raw).toLowerCase();
        return v === 'true' || v === '1';
      }
    } catch (_) { /* noop */ }
    return false;
  });
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Helper for formatting and calculations in the notification UI
  const parseDateFlexibleUI = (val) => {
    if (!val) return null;
    const str = String(val).trim();
    
    // ISO or time: 2024-10-05, 2024-10-05T12:00:00.000Z, etc.
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const localD = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return isNaN(localD.getTime()) ? null : localD;
    }

    const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const calcDaysOverdue = (dateStr) => {
    const d = parseDateFlexibleUI(dateStr);
    if (!d) return null;
    const today = new Date();
    const startOfNow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = startOfDate - startOfNow;
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return days < 0 ? Math.abs(days) : 0;
  };

  const formatDatePL = (dateStr) => {
    if (!dateStr) return '-';
    return formatDateOnly(dateStr);
  };

  const formatDateTimeUI = (dateStr) => {
    if (!dateStr) return '-';
    return formatDate(dateStr);
  };

  const extractSenderFromMessage = (msg) => {
    const str = String(msg || '').trim();
    const m = str.match(/^od:\s*(.+?)\s+—\s*(.*)$/);
    if (m) {
      return { sender: m[1] || '', content: m[2] || '' };
    }
    return { sender: '', content: str };
  };

  // Close dropdown when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close notifications (bell) when clicking outside of its area
  useEffect(() => {
    const handleClickOutsideBell = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setBellOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutsideBell);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideBell);
    };
  }, []);

  useEffect(() => {
    const onChatIncoming = (evt) => {
      const d = evt?.detail || {};
      if (!d || !d.conversationId || !d.senderName) return;
      if (Number(d.message?.sender_id || 0) === Number(user?.id || 0)) return;
      setChatTabs((prev) => {
        const exists = prev.find(x => x.conversationId === d.conversationId);
        if (exists) return prev;
        return [...prev, { conversationId: d.conversationId, title: d.senderName }];
      });
      try { setChatUnreadCount((c) => c + 1); } catch (_) { /* noop */ }

      const isEnabled = (() => {
        try {
          const keyUser = user?.username ? `notif.sound.enabled:${user.username}` : null;
          const raw = (keyUser && localStorage.getItem(keyUser)) ?? localStorage.getItem('notif.sound.enabled');
          if (raw == null) return true;
          const v = String(raw).trim().toLowerCase();
          return v === 'true' || v === '1';
        } catch (_) { return true; }
      })();
      if (audioRef.current && isEnabled) {
        playSafeSound('notification-message', audioRef);
      }
    };
    const onFeatureChanged = (evt) => {
      const enabled = !!evt?.detail?.enabled;
      setChatFeatureEnabled(enabled);
    };
    try { window.addEventListener('chat:incoming', onChatIncoming); } catch (_) { /* noop */ }
    try { window.addEventListener('feature:chat:changed', onFeatureChanged); } catch (_) { /* noop */ }
    return () => {
      try { window.removeEventListener('chat:incoming', onChatIncoming); } catch (_) { /* noop */ }
      try { window.removeEventListener('feature:chat:changed', onFeatureChanged); } catch (_) { /* noop */ }
    };
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const controller = new window.AbortController();
    const loadFeature = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const general = await api.get('/api/config/general', { signal: controller.signal });
        if (mounted) setChatFeatureEnabled(!!general?.enableRealtimeChat);
      } catch (_) { /* noop */ }
    };
    loadFeature();
    const timer = setInterval(loadFeature, 60000);
    return () => { 
      mounted = false; 
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const onDeleteResult = (evt) => {
      try {
        const d = evt?.detail || {};
        const ok = !!d.removedForUser;
        const rem = Number(d.remainingParticipants ?? -1);
        const msg = ok
          ? `${t('chat.deleted') || 'Konwersacja usunięta'} — remaining: ${rem}`
          : `${t('chat.deleteError') || 'Nie udało się usunąć'} — remaining: ${rem}`;
        notifySuccess(msg);
      } catch (_) { /* noop */ }
    };
    try { window.addEventListener('chat:delete:result', onDeleteResult); } catch (_) { /* noop */ }
    return () => { try { window.removeEventListener('chat:delete:result', onDeleteResult); } catch (_) { /* noop */ } };
  }, [t]);

  useEffect(() => {
    let mounted = true;
    const controller = new window.AbortController();
    const loadUnread = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!chatFeatureEnabled) { setChatUnreadCount(0); return; }
      try { const r = await api.get('/api/chat/unread-count', { signal: controller.signal }); if (mounted) setChatUnreadCount(Number(r?.unread || 0)); } catch (_) { if (mounted) setChatUnreadCount(0); }
    };
    loadUnread();
    const timer = setInterval(loadUnread, 20000);
    const onRefresh = (evt) => {
      const d = evt?.detail || {};
      if (d.source === 'markUnread') {
        setChatUnreadCount(prev => prev + 1);
      } else if (d.source === 'read') {
         const count = Number(d.count || 0);
         if (count > 0) setChatUnreadCount(prev => Math.max(0, prev - count));
      }
      if (d.skipFetch) return;
      loadUnread();
    };
    try { window.addEventListener('chat:refresh', onRefresh); } catch (_) { /* noop */ }
    return () => { mounted = false; clearInterval(timer); controller.abort(); try { window.removeEventListener('chat:refresh', onRefresh); } catch (_) { /* noop */ } };
  }, [chatFeatureEnabled]);

  useEffect(() => {
    const onPanelClose = (evt) => {
      try {
        const id = evt?.detail?.conversationId;
        if (!id) return;
        setChatPanels(prev => prev.filter(x => x.conversationId !== id));
        setChatTabs(prev => prev.filter(x => x.conversationId !== id));
      } catch (_) { /* noop */ }
    };
    try { window.addEventListener('chat:panel:close', onPanelClose); } catch (_) { /* noop */ }
    return () => { try { window.removeEventListener('chat:panel:close', onPanelClose); } catch (_) { /* noop */ } };
  }, []);

  // Close dropdown notifications when clicking Escape
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setBellOpen(false);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Close dropdown user when clicking Escape
  useEffect(() => {
    const handleUserDropdownEsc = (event) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('keydown', handleUserDropdownEsc);
    return () => {
      document.removeEventListener('keydown', handleUserDropdownEsc);
    };
  }, []);

  // Load notifications:
  // - If user has management/admin perms: include overdue inspections (BHP/Tools)
  // - Always include user-specific notifications (e.g., return requests)
  // Do not mark as read automatically — user does it manually
  const notifCacheRef = useRef({ ts: 0, data: [] });
  useEffect(() => {
    let mounted = true;
    const controller = new window.AbortController();
    const load = async (force = false) => {
      try {
        // Ensure token is available before request to prevent "No Authorization header" error
        if (!api.token && user?.token) {
          api.setToken(user.token);
        }
        if (!api.token) return;

        const nowTs = Date.now();
        if (!force && (nowTs - (notifCacheRef.current.ts || 0) < 30000)) {
          if (mounted) setNotifications(Array.isArray(notifCacheRef.current.data) ? notifCacheRef.current.data : []);
          return;
        }

        const userNotifsRaw = await api.get('/api/notifications', { signal: controller.signal }).catch(() => []);
        const userNotifs = (Array.isArray(userNotifsRaw) ? userNotifsRaw : []).map(n => ({
          id: String(n.id || `${(n.itemType || n.item_type || 'tool')}-${n.item_id || Math.random()}`),
          type: String(n.type || 'return_request'),
          itemType: String(n.itemType || n.item_type || 'tool'),
          inventory_number: n.inventory_number || '-',
          manufacturer: n.manufacturer || '',
          model: n.model || '',
          employee_id: n.employee_id || null,
          employee_brand_number: n.employee_brand_number || '',
          subject: n.subject || '',
          url: n.url || n.target_url || '',
          message: DOMPurify.sanitize(n.message || ''),
          created_at: n.created_at || n.createdAt || null,
          inspection_date: n.inspection_date || null,
          read: !!n.read,
        }));
        const combined = userNotifs;
        notifCacheRef.current = { ts: Date.now(), data: combined };
        if (mounted) {
          setNotifications(combined);
        }
        const canManageNotifications = hasPermission(user, PERMISSIONS.NOTIFY);
        if (canManageNotifications) {
          const overdueNowTs = Date.now();
          const overdueStale = force || (overdueNowTs - (overdueCacheRef.current.ts || 0) >= 30000);
          if (overdueStale) {
            let tools = [];
            let bhpItems = [];
            try {
              const [toolsRes, bhpRes] = await Promise.all([
                api.get('/api/tools').catch(() => []),
                api.get('/api/bhp').catch(() => [])
              ]);
              tools = Array.isArray(toolsRes) ? toolsRes : [];
              bhpItems = Array.isArray(bhpRes) ? bhpRes : [];
            } catch (_) { /* noop */ }

            const dayMs = 1000 * 60 * 60 * 24;
            const daysDelta = (dateStr) => {
              const d = parseDateFlexibleUI(dateStr);
              if (!d) return null;
              const today = new Date();
              const startOfNow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
              const diffMs = startOfDate - startOfNow;
              return Math.round(diffMs / dayMs);
            };
            const makeNotif = (item, itemType, type, msg) => ({
              id: `${type}-${itemType}-${item.id ?? item.inventory_number ?? Math.random()}`,
              type,
              itemType,
              inventory_number: item.inventory_number || '-',
              manufacturer: item.manufacturer || '',
              model: item.model || '',
              employee_id: null,
              employee_brand_number: '',
              subject: '',
              url: '',
              message: msg || '',
              created_at: null,
              inspection_date: item.inspection_date || null,
              read: true
            });

            const overdue = [
              ...tools.filter(t => t?.inspection_date && (daysDelta(t.inspection_date) ?? 1) < 0).map(t => makeNotif(t, 'tool', 'overdue_inspection', '')),
              ...bhpItems.filter(b => b?.inspection_date && (daysDelta(b.inspection_date) ?? 1) < 0).map(b => makeNotif(b, 'bhp', 'overdue_inspection', ''))
            ];
            const upcoming = [
              ...tools.filter(t => t?.inspection_date && (daysDelta(t.inspection_date) ?? -999) >= 0 && (daysDelta(t.inspection_date) ?? 999) <= 30).map(t => {
                const d = daysDelta(t.inspection_date) ?? 0;
                const msg = d <= 7
                  ? t('BHP.notify.upcoming7Days', { number: t.inventory_number || '-', days: d, unit: t('common.days') })
                  : t('BHP.notify.upcoming30Days', { number: t.inventory_number || '-', days: d, unit: t('common.days') });
                return makeNotif(t, 'tool', 'upcoming_inspection', msg);
              }),
              ...bhpItems.filter(b => b?.inspection_date && (daysDelta(b.inspection_date) ?? -999) >= 0 && (daysDelta(b.inspection_date) ?? 999) <= 30).map(b => {
                const d = daysDelta(b.inspection_date) ?? 0;
                const msg = d <= 7
                  ? t('BHP.notify.upcoming7Days', { number: b.inventory_number || '-', days: d, unit: t('common.days') })
                  : t('BHP.notify.upcoming30Days', { number: b.inventory_number || '-', days: d, unit: t('common.days') });
                return makeNotif(b, 'bhp', 'upcoming_inspection', msg);
              })
            ];

            const overdueData = [...overdue, ...upcoming];
            overdueCacheRef.current = { ts: Date.now(), data: overdueData };
            if (mounted) setOverdueNotifications(overdueData);
          } else {
            if (mounted) setOverdueNotifications(Array.isArray(overdueCacheRef.current.data) ? overdueCacheRef.current.data : []);
          }
        }
      } catch (err) {
        if (mounted) setNotifications([]);
        console.warn('Failed to load notifications:', err?.message || err);
      }
    };
    load(false);
    const onSwMessage = (evt) => {
      const data = evt?.data || {};
        if (data && data.type === 'notifications:refresh') {
          notifCacheRef.current.ts = 0;
          load(true);
          const isEnabled = (() => {
            try {
              const keyUser = user?.username ? `notif.sound.enabled:${user.username}` : null;
              const raw = (keyUser && localStorage.getItem(keyUser)) ?? localStorage.getItem('notif.sound.enabled');
              if (raw == null) return true;
              const v = String(raw).trim().toLowerCase();
              return v === 'true' || v === '1';
            } catch (_) { return true; }
          })();
          if (audioRef.current && isEnabled) {
            playSafeSound('notification-get', audioRef);
          }
        }
      };
    const onWindowRefresh = (evt) => {
      notifCacheRef.current.ts = 0;
      load(true);
      const source = evt?.detail?.source;
      if (source !== 'push') return;
      const isEnabled = (() => {
        try {
          const keyUser = user?.username ? `notif.sound.enabled:${user.username}` : null;
          const raw = (keyUser && localStorage.getItem(keyUser)) ?? localStorage.getItem('notif.sound.enabled');
          if (raw == null) return true;
          const v = String(raw).trim().toLowerCase();
          return v === 'true' || v === '1';
        } catch (_) { return true; }
      })();
      if (audioRef.current && isEnabled) {
        playSafeSound('notification-get', audioRef);
      }
    };
    try {
      navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', onSwMessage);
    } catch (_) { /* noop */ }
    try {
      window.addEventListener('notifications:refresh', onWindowRefresh);
    } catch (_) { /* noop */ }
    return () => {
      mounted = false;
      // controller.abort();
      try { navigator.serviceWorker && navigator.serviceWorker.removeEventListener('message', onSwMessage); } catch (_) { /* noop */ }
      try { window.removeEventListener('notifications:refresh', onWindowRefresh); } catch (_) { /* noop */ }
    };
  }, [user, t]);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleLogoutClick = () => {
    setIsDropdownOpen(false);
    onLogout();
  };

  const handleOpenSettings = () => {
    setIsDropdownOpen(false);
    if (onNavigate) {
      onNavigate('user-settings');
    }
  };

  const handleThemeToggle = () => {
    toggleTheme();
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const [sessionLeft, setSessionLeft] = useState(null);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);

  const handleRefreshSession = async () => {
    if (isRefreshingSession) return;
    setIsRefreshingSession(true);
    try {
      if (import.meta.env.VITE_DB_SOURCE === 'supabase' && supabase) {
        // Check if we are using a "fake" session from Edge Function (no refresh_token, or refresh_token == access_token)
        // or if the refresh_token is a JWT (which implies it's our custom token, not Supabase's opaque refresh token)
        const currentSession = (await supabase.auth.getSession()).data.session;
        const isCustomToken = currentSession?.refresh_token && (
            currentSession.refresh_token === currentSession.access_token ||
            currentSession.refresh_token.startsWith('eyJ') // Basic JWT check
        );

        if (isCustomToken) {
             console.log('[TopBar] Detected custom Edge Function token, refreshing via re-login/extension...');
             
             // Call 'refresh-token' Edge Function to extend session
             const { data: refreshData, error: refreshError } = await supabase.functions.invoke('refresh-token', {
                headers: {
                    Authorization: `Bearer ${currentSession.access_token}`
                }
             });

             if (refreshError) {
                 console.error('[TopBar] Refresh token Edge Function failed:', refreshError);
                 throw refreshError;
             }

             if (refreshData && refreshData.token) {
                 console.log('[TopBar] Session refreshed via Edge Function');
                 // Update session manually
                 const { error: setSessionError } = await supabase.auth.setSession({
                     access_token: refreshData.token,
                     refresh_token: refreshData.token // Reuse as refresh token since we don't have a real one
                 });
                 if (setSessionError) throw setSessionError;

                 api.setToken(refreshData.token);
                 window.dispatchEvent(new CustomEvent('auth:refreshed'));
             } else {
                 throw new Error('Invalid response from refresh-token function');
             }
             
        } else {
            // Standard Supabase Auth session
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;
            if (data?.session) {
               api.setToken(data.session.access_token);
               window.dispatchEvent(new CustomEvent('auth:refreshed'));
            }
        }
      } else {
        const data = await api.post('/api/auth/refresh', {});
        if (data && data.token) {
          api.setToken(data.token);
          
          // If backend returns a new supabase_token, notify app to update session
          if (data.supabase_token) {
             try {
               window.dispatchEvent(new CustomEvent('auth:supabase-token', { detail: { supabase_token: data.supabase_token } }));
             } catch (_) { /* noop */ }
          }
  
          window.dispatchEvent(new CustomEvent('auth:refreshed'));
        }
      }
    } catch (err) {
      console.error(err);
      // Don't show error if it's just a "session not found" which might happen during logout races
      if (err.message !== 'Session not found') {
          notifyError(t('auth.errors.refreshFailed') || 'Nie udało się odświeżyć sesji');
      }
    } finally {
      setIsRefreshingSession(false);
    }
  };

  useEffect(() => {
    let timer = null;
    const decodeExpMs = (tok) => {
      try {
        if (!tok) return null;
        const parts = String(tok).split('.');
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 === 2 ? '==': (b64.length % 4 === 3 ? '=' : '');
        const json = atob(b64 + pad);
        const obj = JSON.parse(json);
        if (!obj || !obj.exp) return null;
        return Number(obj.exp) * 1000;
      } catch (_) { return null; }
    };
    const tick = () => {
      const expMs = decodeExpMs(api.token);
      if (!expMs) { setSessionLeft(null); return; }
      const left = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
      setSessionLeft(left);

      // Auto-logout if session expired
      if (left <= 0 && api.token) {
          console.log('[TopBar] Session expired, logging out...');
          // Prevent multiple logout calls
          if (!window._isLoggingOut) {
              window._isLoggingOut = true;
              onLogout();
          }
      }
    };
    tick();
    timer = setInterval(tick, 1000);
    const onRefreshed = () => tick();
    try { window.addEventListener('auth:refreshed', onRefreshed); } catch (_) { /* noop */ }
    return () => { if (timer) clearInterval(timer); try { window.removeEventListener('auth:refreshed', onRefreshed); } catch (_) { /* noop */ } };
  }, [onLogout]);

  useEffect(() => {
    if (!user?.id) return;
    if (!chatFeatureEnabled) return;

    // Supabase Realtime for Notifications & Presence
    if (import.meta.env.VITE_DB_SOURCE === 'supabase') {
      const channel = supabase.channel(`notifications:${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, () => {
          window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'supabase' } }));
          playSafeSound('notification-get', audioRef);
        })
        .subscribe();

      // Global Presence Tracking
      const presenceChannel = supabase.channel('presence:global')
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              await presenceChannel.track({ 
                 user_id: user.id, 
                 online_at: new Date().toISOString() 
              });
            } catch (_) { /* noop */ }
          }
        });

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(presenceChannel);
      };
    }

    // Legacy WebSocket for Node.js backend
    let ws = null;
    let timer = null;
    let pingTimer = null;
    let shouldReconnect = true;

    const connect = async () => {
      try {
        await api.ensureToken();
        const token = api.token;
        if (!token) return;

        const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
        const locProto = isBrowser && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const base = api.baseURL || '';
        let url = '';
        if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
           try {
             const b = new URL(base);
             const wsProto = b.protocol === 'https:' ? 'wss:' : 'ws:';
             url = `${wsProto}//${b.host}/ws?token=${encodeURIComponent(token)}`;
           } catch (_) {
             url = `${locProto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
           }
        } else {
           url = `${locProto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
        }

        ws = new window.WebSocket(url);
        
        ws.onopen = () => {
          pingTimer = setInterval(() => {
             if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'heartbeat' }));
          }, 30000);
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'notification') {
              window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'ws' } }));
            }
          } catch (_) { void 0; }
        };

        ws.onclose = () => {
          if (pingTimer) clearInterval(pingTimer);
          if (shouldReconnect) {
            timer = setTimeout(connect, 5000);
          }
        };
        
        ws.onerror = () => {
           if (ws) ws.close();
        };
      } catch (_) {
         if (shouldReconnect) timer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (timer) clearTimeout(timer);
      if (pingTimer) clearInterval(pingTimer);
      if (ws) ws.close();
    };
  }, [user?.id, chatFeatureEnabled]);

  return (
    <div className="shrink-0 bg-white dark:bg-gray-800 shadow-sm px-4 py-3 flex items-center justify-between transition-colors duration-200">
      <audio ref={audioRef} src="/audio/notification-get.mp3" preload="auto" className="hidden" />
      <div className="flex items-center">
        <button
          onClick={onToggleSidebarCollapse}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200 hidden lg:inline-flex"
          aria-label={isSidebarCollapsed ? t('topbar.expandSidebar') : t('topbar.collapseSidebar')}
          title={isSidebarCollapsed ? t('topbar.expandSidebar') : t('topbar.collapseSidebar')}
        >
          {isSidebarCollapsed ? (
            <ChevronDoubleRightIcon className="w-5 h-5 text-gray-500 dark:text-gray-300" aria-hidden="true" />
          ) : (
            <ChevronDoubleLeftIcon className="w-5 h-5 text-gray-500 dark:text-gray-300" aria-hidden="true" />
          )}
        </button>
        <button
          onClick={handleRefreshSession}
          disabled={isRefreshingSession}
          className="ml-2 hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('auth.refreshSession') || 'Odśwież sesję'}
        >
          {isRefreshingSession ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <ClockIcon className="w-4 h-4" aria-hidden="true" />
          )}
          <span className="font-mono text-xs">
            {sessionLeft == null ? '--:--' : `${String(Math.floor(sessionLeft / 60)).padStart(2,'0')}:${String(sessionLeft % 60).padStart(2,'0')}`}
          </span>
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden p-2 rounded-md text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 lg:hidden transition-colors duration-200"
        >
          <span className="sr-only">{t('topbar.openMenu')}</span>
          <Bars3Icon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 flex justify-center px-2 lg:ml-6 lg:justify-start">
        <div className="max-w-lg w-full lg:max-w-xs">
          <label htmlFor="search" className="sr-only">{t('common.search') || 'Szukaj'}</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <button
              id="search"
              onClick={() => onOpenCommandPalette && onOpenCommandPalette()}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-left shadow-sm hover:bg-white dark:hover:bg-gray-600 transition-colors flex justify-between items-center"
            >
              <span>{t('common.search') || 'Szukaj...'}</span>
              <kbd className="hidden sm:inline-flex items-center border border-gray-200 dark:border-gray-500 rounded px-1.5 text-xs font-sans font-medium text-gray-400 dark:text-gray-500">
                Ctrl K
              </kbd>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {canOpenKiosk && (
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('kiosk')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200"
            aria-label="Kiosk"
            title="Kiosk"
          >
            <TvIcon className="w-6 h-6 text-gray-500 dark:text-gray-300" aria-hidden="true" />
          </button>
        )}
        {helpEnabled && (
          <HelpButton id="help-trigger-btn" onClick={() => setHelpOpen(true)} />
        )}
        {/* Bell icon with notifications for BHP */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen(prev => !prev)}
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200"
            aria-label={t('topbar.notifications')}
            title={t('topbar.notifications') || 'Powiadomienia'}
          >
            <BellIcon className="w-6 h-6 text-gray-500 dark:text-gray-300" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="fixed inset-x-3 top-14 mx-auto max-w-[calc(100vw-1.5rem)] sm:absolute sm:right-0 sm:w-[27rem] sm:inset-auto sm:top-full sm:mt-2 sm:mx-0 sm:max-w-none bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-center">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('topbar.notifications')}</div>
              </div>
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.post('/api/notifications/read-all', {});
                        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                      } catch (_) { void 0; }
                    }}
                    disabled={(hasPermission(user, PERMISSIONS.NOTIFY) && adminBellTab !== 'general') || notifications.length === 0}
                    className="w-full text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {t('topbar.markAllRead')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.post('/api/notifications/unread-all', {});
                        setNotifications(prev => prev.map(n => ({ ...n, read: false })));
                      } catch (_) { void 0; }
                    }}
                    disabled={(hasPermission(user, PERMISSIONS.NOTIFY) && adminBellTab !== 'general') || notifications.length === 0}
                    className="w-full text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {t('topbar.clearNotifications')}
                  </button>
                </div>
              </div>
              {hasPermission(user, PERMISSIONS.NOTIFY) && (
                <div className="px-4 pt-2">
                  <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => { setAdminBellTab('general'); try { window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'local' } })); } catch (_) { /* noop */ } }}
                      className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md transition-all ${
                        adminBellTab === 'general'
                          ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                      aria-label={t('topbar.tabs.general')}
                    >
                      {t('topbar.tabs.general')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdminBellTab('overdue'); try { window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'local' } })); } catch (_) { /* noop */ } }}
                      className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md transition-all ${
                        adminBellTab === 'overdue'
                          ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                      aria-label={t('topbar.tabs.overdue')}
                    >
                      {t('topbar.tabs.overdue')}
                    </button>
                  </div>
                </div>
              )}
              {hasPermission(user, PERMISSIONS.NOTIFY) && adminBellTab === 'overdue' && (
                <div className="max-h-[70vh] sm:max-h-80 overflow-y-auto">
                  {overdueNotifications.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">{t('topbar.noNotifications')}</div>
                  ) : (
                    overdueNotifications.map(n => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 transition-colors border-l-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-red-500 dark:border-red-600`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                              {n.itemType === 'bhp' ? (
                                <ShieldExclamationIcon className="w-5 h-5" aria-hidden="true" />
                              ) : (
                                <WrenchIcon className="w-5 h-5" aria-hidden="true" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      const screen = n.itemType === 'bhp' ? 'bhp' : 'tools';
                                      const q = n.inventory_number || n.model || '';
                                      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
                                      setBellOpen(false);
                                    } catch (_) { void 0; }
                                  }}
                                  className="text-sm font-medium text-gray-900 dark:text-white hover:underline"
                                >
                                  {n.inventory_number || n.model || '-'}
                                </button>
                                <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {n.itemType === 'bhp' ? t('topbar.type.bhp') : t('topbar.type.tools')}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-300">{[n.manufacturer, n.model].filter(Boolean).join(' ')}</div>
                              {n.message ? (
                                <div className="text-xs text-gray-700 dark:text-gray-200 mt-1">{n.message}</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right">
                            {n.type === 'overdue_inspection' ? (
                              <>
                                <div className="flex items-center justify-end gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                  <ClockIcon className="w-4 h-4" aria-hidden="true" />
                                  <span>{t('topbar.overdue')}: {calcDaysOverdue(n.inspection_date) ?? '-'} {t('common.days')}</span>
                                </div>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">{formatDatePL(n.inspection_date)}</div>
                              </>
                            ) : (
                              <div className="text-[11px] text-gray-500 dark:text-gray-400">{formatDatePL(n.inspection_date)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {(((String(user?.role || '').trim() !== 'administrator' ) || (adminBellTab === 'general')) ) && (
                <div className="max-h-[70vh] sm:max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">{t('topbar.noNotifications')}</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 transition-colors border-l-4 ${
                        n.read
                          ? 'bg-slate-50 dark:bg-slate-700/30 border-slate-300 dark:border-slate-600 opacity-75'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-red-500 dark:border-red-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                            {n.itemType === 'bhp' ? (
                              <ShieldExclamationIcon className="w-5 h-5" aria-hidden="true" />
                            ) : n.itemType === 'tool' ? (
                              <WrenchIcon className="w-5 h-5" aria-hidden="true" />
                            ) : (
                              <BellIcon className="w-5 h-5" aria-hidden="true" />
                            )}
                          </div>
                          <div>
                            <div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {n.itemType === 'bhp' ? t('topbar.type.bhp') : (n.itemType === 'admin' ? t('topbar.type.admin') : t('topbar.type.tools'))}
                                </span>
                                {(n.type === 'broadcast' || n.type === 'custom') && (
                                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                                    {n.type === 'broadcast' ? t('topbar.type.broadcast') : t('topbar.type.custom')}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    if (n.itemType === 'admin' && n.url) {
                                      window.dispatchEvent(new CustomEvent('navigate', { detail: { url: n.url } }));
                                    } else {
                                      const screen = n.itemType === 'bhp' ? 'bhp' : (n.itemType === 'tool' ? 'tools' : 'analytics');
                                      const q = n.itemType === 'admin' ? '' : (n.inventory_number || n.model || '');
                                      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
                                    }
                                    setBellOpen(false);
                                  } catch (_) { void 0; }
                                }}
                                className="text-sm font-medium text-gray-900 dark:text-white hover:underline text-left"
                              >
                                {n.itemType === 'admin' 
                                  ? (n.subject || n.message || t('topbar.notifications')) 
                                  : (n.type === 'return_request' 
                                    ? (n.inventory_number || n.model || t('topbar.returnRequest')) 
                                    : (n.inventory_number || n.model || '-'))}
                              </button>
                            </div>
                            {n.itemType !== 'admin' && (
                              <div className="text-xs text-gray-600 dark:text-gray-300">{[n.manufacturer, n.model].filter(Boolean).join(' ')}</div>
                            )}
                            {n.employee_brand_number ? (
                              <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                                {t('employees.brandNumber')}: <span className="font-mono">{n.employee_brand_number}</span>
                              </div>
                            ) : null}
                            {(n.type === 'broadcast' || n.type === 'custom') ? (
                              <>
                                {extractSenderFromMessage(n.message).sender ? (
                                  <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">{t('topbar.from')} {extractSenderFromMessage(n.message).sender}</div>
                                ) : null}
                                {extractSenderFromMessage(n.message).content ? (
                                  <div className="text-xs text-gray-700 dark:text-gray-200 mt-1">{extractSenderFromMessage(n.message).content}</div>
                                ) : null}
                              </>
                            ) : (
                              n.message ? (
                                <div className="text-xs text-gray-700 dark:text-gray-200 mt-1">{n.message}</div>
                              ) : null
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {n.type === 'overdue_inspection' ? (
                            <>
                              <div className="flex items-center justify-end gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <ClockIcon className="w-4 h-4" aria-hidden="true" />
                                <span>{t('topbar.overdue')}: {calcDaysOverdue(n.inspection_date) ?? '-'} {t('common.days')}</span>
                              </div>
                              <div className="text-[11px] text-gray-500 dark:text-gray-400">{formatDatePL(n.inspection_date)}</div>
                            </>
                          ) : (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">{n.created_at ? `${formatDateTimeUI(n.created_at)}` : ''}</div>
                          )}
                          <div className="mt-2 flex items-center justify-end gap-2">
                            {n.read ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center" title={t('topbar.read')} aria-label={t('topbar.read')}>
                                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                                </span>
                                {n.type === 'return_request' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        api.post(`/api/notify-return/${encodeURIComponent(n.id)}/unread`, {}).catch(() => {});
                                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: false } : x));
                                      } catch (_) { void 0; }
                                    }}
                                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                    title={t('topbar.markUnread')}
                                    aria-label={t('topbar.markUnread')}
                                  >
                                    <XCircleIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    api.post(`/api/notifications/${encodeURIComponent(n.id)}/read`, {}).catch(() => {});
                                    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                                  } catch (_) { void 0; }
                                }}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                title={t('topbar.markRead')}
                                aria-label={t('topbar.markRead')}
                              >
                                <CheckIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              )}
            </div>
          )}
        </div>

        {chatFeatureEnabled && (
          <div className="relative">
            <button
              onClick={() => setChatOpen(prev => !prev)}
              className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200"
              aria-label={t('topbar.chat')}
              title={t('topbar.chat')}
            >
              <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6 text-gray-500 dark:text-gray-300" aria-hidden="true" />
              {chatUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {chatUnreadCount}
                </span>
              )}
            </button>
          </div>
        )}

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={toggleDropdown}
            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200"
          >
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {user?.full_name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">
                {user?.full_name || user?.username}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-200">
                {user?.role === 'administrator' ? t('topbar.roles.administrator') :
                  user?.role === 'manager' ? t('topbar.roles.manager') :
                  user?.role === 'toolsmaster' ? t('topbar.roles.toolsmaster') :
                  user?.role === 'hr' ? t('topbar.roles.hr') :
                  user?.role === 'supervisor' ? t('topbar.roles.supervisor') :
                  user?.role === 'engineer' ? t('topbar.roles.engineer') :
                  user?.role === 'employee' ? t('topbar.roles.employee') :
                  user?.role === 'user' ? t('topbar.roles.user') :
                  (user?.role || t('topbar.roles.unknown'))
                }
              </div>
            </div>
            <ChevronDownIcon
              className={`w-4 h-4 text-gray-400 dark:text-gray-300 transition-all duration-200 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 transition-colors duration-200">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center">
                    <span className="text-base font-medium text-white">
                      {user?.full_name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">
                      {user?.full_name || user?.username || t('topbar.user')}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-200">
                      @{user?.username || 'username'}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1 transition-colors duration-200">
                  {t('topbar.role')}
                </div>
                <div className="text-sm text-gray-900 dark:text-white font-medium transition-colors duration-200">
                  {userRole === 'administrator' || userRole === 'admin' ? t('topbar.roles.administrator') :
                   userRole === 'manager' ? t('topbar.roles.manager') :
                   userRole === 'toolsmaster' ? t('topbar.roles.toolsmaster') :
                   userRole === 'hr' ? t('topbar.roles.hr') :
                   userRole === 'supervisor' ? t('topbar.roles.supervisor') :
                   userRole === 'engineer' ? t('topbar.roles.engineer') :
                   userRole === 'employee' ? t('topbar.roles.employee') :
                   userRole === 'user' ? t('topbar.roles.user') :
                   (userRole || t('topbar.roles.unknown'))
                  }
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={handleOpenSettings}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white flex items-center space-x-2 transition-colors duration-200"
                >
                  <WrenchIcon className="w-5 h-5" aria-hidden="true" />
                  <span>{t('topbar.settings')}</span>
                </button>
                {(userRole === 'administrator' || userRole === 'admin') && dbSource === 'local' && (
                  <button
                    onClick={() => { setIsDropdownOpen(false); onNavigate && onNavigate('db-viewer'); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white flex items-center space-x-2 transition-colors duration-200"
                  >
                    <CircleStackIcon className="w-5 h-5" aria-hidden="true" />
                    <span>{t('topbar.dbViewer')}</span>
                  </button>
                )}
                <button
                  onClick={handleThemeToggle}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white flex items-center justify-between transition-colors duration-200"
                >
                  <div className="flex items-center space-x-2">
                    {isDarkMode ? (
                      <SunIcon className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <MoonIcon className="w-5 h-5" aria-hidden="true" />
                    )}
                    <span>{isDarkMode ? t('topbar.themeLight') : t('topbar.themeDark')}</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 ${isDarkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}></div>
                  </div>
                </button>
                
                <button
                  onClick={handleLogoutClick}
                  className="w-full text-left px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-900 flex items-center space-x-2 transition-colors duration-200"
                >
                  <ArrowLeftStartOnRectangleIcon className="w-5 h-5" aria-hidden="true" />
                  <span>{t('topbar.logout')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {chatFeatureEnabled && chatOpen && (
        <Suspense fallback={null}>
          <ChatModal
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            user={user}
            chatFeatureEnabled={chatFeatureEnabled}
            onOpenConversation={(payload) => {
              const convId = typeof payload === 'object' ? (payload.id || payload.conversationId) : payload;
              const convTitle = typeof payload === 'object' ? payload.title : undefined;
              const dock = typeof payload === 'object' ? !!payload.dock : false;
              if (dock && convId) {
                setChatPanels((prev) => {
                  const now = Date.now();
                  const idx = prev.findIndex(p => p.conversationId === convId);
                  let next;
                  if (idx >= 0) {
                    next = prev.map(p => p.conversationId === convId ? { ...p, title: convTitle ?? p.title, lastActiveTs: now } : p);
                  } else {
                    next = [...prev, { conversationId: convId, title: convTitle, lastActiveTs: now }];
                  }
                  next.sort((a, b) => Number(b.lastActiveTs || 0) - Number(a.lastActiveTs || 0));
                  return next.slice(0, 3);
                });
                setChatOpen(false);
              }
              setChatTabs((prev) => prev.filter(x => x.conversationId !== convId));
            }}
          />
        </Suspense>
      )}
      {chatFeatureEnabled && chatTabs.length > 0 && (
        <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-2">
          {chatTabs.map((tab) => (
            <div key={tab.conversationId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg shadow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                className="text-sm font-medium text-gray-900 dark:text-white hover:underline"
                onClick={() => {
                  setChatOpen(false);
                  setChatPanels(prev => {
                    const now = Date.now();
                    const idx = prev.findIndex(p => p.conversationId === tab.conversationId);
                    let next;
                    if (idx >= 0) {
                      next = prev.map(p => p.conversationId === tab.conversationId ? { ...p, title: tab.title ?? p.title, lastActiveTs: now } : p);
                    } else {
                      next = [...prev, { conversationId: tab.conversationId, title: tab.title, lastActiveTs: now }];
                    }
                    next.sort((a, b) => Number(b.lastActiveTs || 0) - Number(a.lastActiveTs || 0));
                    return next.slice(0, 3);
                  });
                  setChatTabs(prev => prev.filter(x => x.conversationId !== tab.conversationId));
                }}
              >
                {tab.title}
              </button>
              <button type="button" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setChatTabs(prev => prev.filter(x => x.conversationId !== tab.conversationId))} aria-label={t('common.close')}>
                <XCircleIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {chatFeatureEnabled && user && chatPanels.length > 0 && (
        <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-2">
          <Suspense fallback={null}>
            {chatPanels.map((p) => (
              <ChatPanel
                key={p.conversationId}
                conversationId={p.conversationId}
                title={p.title}
                user={user}
                onClose={() => setChatPanels(prev => prev.filter(x => x.conversationId !== p.conversationId))}
              />
            ))}
          </Suspense>
        </div>
      )}
      {helpEnabled && <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} user={user} />}
    </div>
  );
}

export default TopBar;
