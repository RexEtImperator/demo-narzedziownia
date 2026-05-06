import { useState, useEffect, useCallback } from 'react';
import { notifySuccess, notifyError, notifyInfo } from '../utils/notify';
import api from '../api';
import supabase from '../utils/supabase';
import { AUDIT_ACTIONS } from '../constants/auditActions';
import { addAuditLog } from '../utils/auditLogger';
import { setDynamicRolePermissions } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

const IS_SUPABASE_MODE = import.meta.env.VITE_DB_SOURCE === 'supabase';

export const useAuth = (options = {}) => {
  const { enableGlobalListeners = true } = options;
  const { t } = useLanguage();
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error parsing user from localStorage', error);
      return null;
    }
  });

  const loadRolePermissions = useCallback(async () => {
    try {
      const data = await api.get('/api/role-permissions');
      setDynamicRolePermissions(data || null);
    } catch (error) {
      console.error('Error getting role permissions:', error);
      setDynamicRolePermissions(null);
    }
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        Promise.resolve().then(() => { setUser(parsedUser); });
        
        // Restore token to API client immediately to prevent unnecessary refresh
        if (parsedUser.token) {
          api.setToken(parsedUser.token);
        }

        // Restore Supabase session
        if (parsedUser.supabase_token && IS_SUPABASE_MODE && supabase) {
            console.log('[Auth] Restoring Supabase session with token:', parsedUser.supabase_token.substring(0, 10) + '...');
            supabase.auth.setSession({
               access_token: parsedUser.supabase_token,
               refresh_token: parsedUser.supabase_token
             }).then(({ data, error }) => {
                if (error) {
                    console.error('[Auth] Failed to restore Supabase session:', error);
                    notifyError('Błąd przywracania sesji Supabase: ' + error.message);
                } else {
                    console.log('[Auth] Supabase session restored successfully', data.session?.user);
                    
                    // CRITICAL FIX: Ensure we keep the role from localStorage if Supabase session has generic role
                    // When using custom tokens or standard Auth, session.user.role might be 'authenticated' or generic.
                    // We trust localStorage 'role' more because it was set correctly during login.
                    if (data.session?.user) {
                        // Check if we need to patch the user object in state to ensure role persistence
                        // data.session.user might have role='authenticated', but parsedUser.role might be 'administrator'
                        
                        // If the session user role is generic 'authenticated', but we have a specific role in storage, keep the storage one
                        const sessionRole = data.session.user.role;
                        const storageRole = parsedUser.role;
                        
                        // Also check metadata
                        const metadataRole = data.session.user.app_metadata?.role || data.session.user.user_metadata?.role;
                        
                        const effectiveRole = metadataRole || (sessionRole === 'authenticated' ? storageRole : sessionRole) || storageRole;
                        
                        if (effectiveRole !== parsedUser.role) {
                            console.log(`[Auth] Correcting user role from ${parsedUser.role} to ${effectiveRole}`);
                            const updatedUser = { ...parsedUser, role: effectiveRole };
                            setUser(updatedUser);
                            localStorage.setItem('user', JSON.stringify(updatedUser));
                        }
                    }
                }
             }).catch(e => {
                console.error('[Auth] Exception restoring Supabase session', e);
                notifyError('Wyjątek sesji Supabase: ' + e.message);
             });
        } else if (IS_SUPABASE_MODE) {
            // console.warn('[Auth] No supabase_token found in user data or supabase client missing');
        }

        (async () => {
          try { 
            const token = await api.ensureToken();
            if (token) {
              setUser(prev => prev ? { ...prev, token } : prev);
            }
            await loadRolePermissions(); 
          } catch (_) { /* noop */ }
        })();
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('currentScreen');
      }
    }
  }, [loadRolePermissions]);

  const login = useCallback(async (credentials) => {
    try {
      if (IS_SUPABASE_MODE && supabase) {
        const rawIdentity = String(credentials?.username || credentials?.email || '').trim();
        const edgeUsername = rawIdentity.replace(/@zarzadzanie\.local$/i, '');
        try {
          const { data: funcData, error: funcError } = await supabase.functions.invoke('login', {
            body: {
              username: edgeUsername,
              password: credentials.password
            }
          });

          if (!funcError && funcData && !funcData.error) {
            if (funcData.supabase_token) {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: funcData.supabase_token,
                refresh_token: funcData.supabase_token
              });
              if (sessionError) console.warn('[Auth] Failed to set session from Edge Function token', sessionError);
            }

            const userObj = {
              id: funcData.id,
              email: funcData.email,
              role: funcData.role,
              full_name: funcData.full_name,
              username: funcData.username,
              token: funcData.supabase_token || funcData.token,
              refresh_token: null,
              supabase_token: funcData.supabase_token
            };

            setUser(userObj);
            localStorage.setItem('user', JSON.stringify(userObj));
            api.setToken(userObj.token);
            await loadRolePermissions();
            await addAuditLog(userObj, AUDIT_ACTIONS.LOGIN, 'Użytkownik zalogował się do systemu (Edge Function)');
            notifyInfo(t('dashboard.welcome', { name: userObj.full_name || userObj.username }));
            return;
          }
        } catch (edgeErr) {
          console.warn('[Auth] Edge Function login failed, fallback to Supabase Auth', edgeErr?.message || edgeErr);
        }

        const emailIdentity = String(credentials?.email || '').trim() || (rawIdentity.includes('@') ? rawIdentity : '');
        const shouldTryPasswordGrant = !!emailIdentity && !/@zarzadzanie\.local$/i.test(emailIdentity);
        if (shouldTryPasswordGrant) {
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: emailIdentity,
              password: credentials.password
            });

            if (!error && data?.session) {
              const session = data.session;
              const userObj = {
                id: session.user.id,
                email: session.user.email,
                role: session.user.app_metadata?.role || 'user',
                full_name: session.user.user_metadata?.full_name || session.user.email,
                username: session.user.user_metadata?.username || session.user.email,
                token: session.access_token,
                refresh_token: session.refresh_token,
                supabase_token: session.access_token
              };
              setUser(userObj);
              localStorage.setItem('user', JSON.stringify(userObj));
              api.setToken(session.access_token);
              await loadRolePermissions();
              await addAuditLog(userObj, AUDIT_ACTIONS.LOGIN, 'Użytkownik zalogował się do systemu (Supabase)');
              notifyInfo(t('dashboard.welcome', { name: userObj.full_name || userObj.username }));
              return;
            }
          } catch (sbError) {
            console.warn('[Auth] Supabase password login failed', sbError?.message || sbError);
          }
        }
      }

      const response = await api.post('/api/login', credentials, { skipAuth: true });
      if (response && response.token) {
        const userToSave = { ...response };
        setUser(response);
        localStorage.setItem('user', JSON.stringify(userToSave));
        
        // Initialize Supabase session with custom token if available
        if (response.supabase_token && IS_SUPABASE_MODE && supabase) {
          try {
             console.log('[Auth] Setting Supabase session after login');
             const { error } = await supabase.auth.setSession({
               access_token: response.supabase_token,
               refresh_token: response.supabase_token // Custom JWT doesn't have real refresh token
             });
             if (error) console.error('[Auth] Supabase setSession error:', error);
          } catch (e) {
             console.error('Failed to set Supabase session', e);
          }
        } else if (IS_SUPABASE_MODE) {
             // console.warn('[Auth] Login response missing supabase_token');
        }

        api.setToken(response.token);
        await loadRolePermissions();
        await addAuditLog(response, AUDIT_ACTIONS.LOGIN, 'Użytkownik zalogował się do systemu');
        notifyInfo(t('dashboard.welcome', { name: response.full_name || response.username }));
      } else {
        throw new Error(t('login.invalidResponse'));
      }
    } catch (error) {
      console.error('Login error:', error);
      const status = error?.status || error?.context?.status || error?.context?.response?.status;
      const name = String(error?.name || '');
      let msg = (typeof error === 'string' ? error : error?.message) || t('login.error');
      const raw = String(msg || '');
      const rawLower = raw.toLowerCase();

      if (
        status === 401 ||
        status === 403 ||
        raw === 'Invalid login credentials' ||
        raw === 'Nieprawidłowa nazwa użytkownika lub hasło' ||
        rawLower.includes('invalid login credentials') ||
        rawLower.includes('edge function returned a non-2xx status code') ||
        name.toLowerCase().includes('functionshttperror')
      ) {
        msg = t('login.invalidCredentials');
      }

      // LoginScreen displays login errors inline; avoid duplicating via global toast.
      throw new Error(msg);
    }
  }, [t, loadRolePermissions]);

  const logout = useCallback(async () => {
    if (user) {
      await addAuditLog(user, AUDIT_ACTIONS.LOGOUT, 'Wylogowano z systemu');
    }
    try {
      if (IS_SUPABASE_MODE && supabase) {
        await supabase.auth.signOut();
      } else {
        await api.post('/api/auth/logout', {}, { skipAuth: true });
      }
    } catch (_) { /* ignore network errors on logout */ }
    
    localStorage.removeItem('user');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('currentScreen');
    setDynamicRolePermissions(null);
    api.setToken(null);
    if (api.setRefreshToken) api.setRefreshToken(null);
    setUser(null);
  }, [user]);

  // Listen for Supabase token refresh from backend
  useEffect(() => {
    if (!IS_SUPABASE_MODE) return;

    const handleSupabaseToken = async (event) => {
        const newToken = event.detail?.supabase_token;
        if (newToken && supabase) {
            console.log('[Auth] Received new Supabase token via refresh');
            try {
                const { error } = await supabase.auth.setSession({
                    access_token: newToken,
                    refresh_token: newToken
                });
                if (error) console.error('[Auth] Failed to update Supabase session:', error);
                
                setUser(prev => {
                    if (!prev) return prev;
                    const updated = { ...prev, supabase_token: newToken };
                    localStorage.setItem('user', JSON.stringify(updated));
                    return updated;
                });
            } catch (e) {
                console.error('[Auth] Exception updating Supabase session:', e);
            }
        }
    };

    window.addEventListener('auth:supabase-token', handleSupabaseToken);
    return () => window.removeEventListener('auth:supabase-token', handleSupabaseToken);
  }, []);

  // Supabase Auth Listener
  useEffect(() => {
    if (!IS_SUPABASE_MODE || !supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('user');
        api.setToken(null);
      } else if (event === 'SIGNED_IN' && session) {
        api.setToken(session.access_token);
        if (!user) {
            const userObj = {
               id: session.user.id,
               email: session.user.email,
               role: session.user.app_metadata?.role || 'user',
               full_name: session.user.user_metadata?.full_name || session.user.email,
               username: session.user.email,
               token: session.access_token,
               refresh_token: session.refresh_token
            };
            setUser(userObj);
            localStorage.setItem('user', JSON.stringify(userObj));
        }
      } else if (event === 'TOKEN_REFRESHED' && session) {
         api.setToken(session.access_token);
         if (user) {
             const updated = { ...user, token: session.access_token, refresh_token: session.refresh_token };
             setUser(updated);
             localStorage.setItem('user', JSON.stringify(updated));
         }
      }
    });

    return () => subscription.unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!enableGlobalListeners) return;

    const onAuthInvalid = (e) => {
       const reason = e?.detail?.reason || 'Sesja wygasła lub token jest nieprawidłowy';
       notifyError(t('auth.invalid', { reason }));
       logout(); 
     };

    const onAuthRefreshed = () => {
      try {
        const msg = t('auth.sessionRefreshed');
        const label = (msg && msg !== 'auth.sessionRefreshed') ? msg : 'Sesja została odświeżona';
        notifySuccess(label);
      } catch (_) { void 0; }
    };

    const onRolePermsUpdated = async () => {
      try {
        await loadRolePermissions();
      } catch (_) { void 0; }
    };

    window.addEventListener('auth:invalid', onAuthInvalid);
    window.addEventListener('auth:refreshed', onAuthRefreshed);
    window.addEventListener('role-permissions:updated', onRolePermsUpdated);

    return () => {
      window.removeEventListener('auth:invalid', onAuthInvalid);
      window.removeEventListener('auth:refreshed', onAuthRefreshed);
      window.removeEventListener('role-permissions:updated', onRolePermsUpdated);
    };
  }, [t, logout, loadRolePermissions, enableGlobalListeners]);


  return { user, setUser, login, logout, loadRolePermissions };
};
