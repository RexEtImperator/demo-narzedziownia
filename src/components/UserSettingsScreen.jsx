import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { CheckIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../api';
import { toast } from 'react-toastify';
import { formatDateOnly } from '../utils/dateUtils';

function UserSettingsScreen({ user }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('security');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [employeeData, setEmployeeData] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const phoneOriginal = (employeeData?.phone || '').trim();
  const emailOriginal = (employeeData?.email || '').trim();
  const phoneVal = (phoneInput || '').trim();
  const emailVal = (emailInput || '').trim();
  const isPhoneValid = phoneVal === '' ? true : /^[+]?[\d\s\-()]{6,20}$/.test(phoneVal);
  const isEmailValid = emailVal === '' ? true : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  const phoneUnchanged = phoneVal === phoneOriginal;
  const emailUnchanged = emailVal === emailOriginal;
  const getStatusLabel = (s) => {
    const k = String(s || '').trim().toLowerCase();
    if (k === 'active') return t('userSettings.profile.statusLabels.active');
    if (k === 'inactive') return t('userSettings.profile.statusLabels.inactive');
    if (k === 'suspended') return t('userSettings.profile.statusLabels.suspended');
    return s || '-';
  };

  const tabs = [
    { id: 'security', name: t('userSettings.tabs.security'), icon: '🔐' },
    { id: 'notifications', name: t('userSettings.tabs.notifications'), icon: '🔔' }
  ];

  useEffect(() => {
    let cancelled = false;
    const loadEmployee = async () => {
      try {
        const list = await api.get('/api/employees');
        const arr = Array.isArray(list) ? list : [];
        const found = arr.find(e => String(e.login || '').trim().toLowerCase() === String(user?.username || '').trim().toLowerCase())
          || arr.find(e => `${String(e.first_name||'').trim()} ${String(e.last_name||'').trim()}`.trim().toLowerCase() === String(user?.full_name || '').trim().toLowerCase());
        if (!cancelled) {
          setEmployeeData(found || null);
          setPhoneInput(found?.phone || '');
          setEmailInput(found?.email || '');
        }
      } catch (_err) {
        if (!cancelled) {
          setEmployeeData(null);
        }
      }
    };
    loadEmployee();
    return () => { cancelled = true; };
  }, [user]);

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('userSettings.errors.fillAllFields'));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('userSettings.errors.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('userSettings.errors.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      // Verify current password by attempting to log in
      await api.post('/api/login', { username: user.username, password: currentPassword });

      // Updating user password
      await api.put(`/api/users/${user.id}`, {
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        password: newPassword
      });

      setSaved(true);
      toast.success(t('userSettings.toast.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      const msg = error?.message || t('userSettings.errors.changeFailed');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const [notifSoundEnabled, setNotifSoundEnabled] = useState(() => {
    try {
      const keyUser = user?.username ? `notif.sound.enabled:${user.username}` : null;
      const raw = (keyUser && localStorage.getItem(keyUser)) ?? localStorage.getItem('notif.sound.enabled');
      if (raw == null) return true;
      const v = String(raw).trim().toLowerCase();
      return v === 'true' || v === '1';
    } catch (_) { return true; }
  });

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    // Check if push is supported and subscribed
    const checkPush = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushEnabled(!!subscription);
      } catch (e) {
        console.warn('Push check failed', e);
      }
    };
    checkPush();
  }, []);

  const handleTogglePush = async (enable) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error(t('common.browserNotSupported'));
      return;
    }
    setPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      if (enable) {
        // Subscribe
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error(t('userSettings.notifications.errors.pushConfigFailed'));
          setPushLoading(false);
          return;
        }
        const cfg = await api.get('/api/push/config');
        if (!cfg.publicKey) throw new Error('No public key');
        
        const appServerKey = urlBase64ToUint8Array(cfg.publicKey);
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey
        });
        await api.post('/api/push/subscribe', sub);
        setPushEnabled(true);
        toast.success(t('userSettings.notifications.saved'));
      } else {
        // Unsubscribe
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Notify backend to remove subscription first (while we still have the endpoint)
          try {
             await api.delete('/api/push/subscribe', { data: { endpoint: subscription.endpoint } });
          } catch (e) {
             console.warn('Failed to remove subscription from backend', e);
          }
          await subscription.unsubscribe();
        }
        setPushEnabled(false);
        toast.info(t('userSettings.notifications.saved'));
      }
    } catch (err) {
      console.error(err);
      toast.error(t('userSettings.notifications.errors.pushConfigFailed'));
    } finally {
      setPushLoading(false);
    }
  };

  const sendTestPush = async () => {
    try {
      await api.post('/api/push/test');
      toast.success('Test push sent!');
    } catch (_err) {
      toast.error('Failed to send test push');
    }
  };

  const toggleNotifSound = (enabled) => {
    setNotifSoundEnabled(enabled);
    try {
      const keyUser = user?.username ? `notif.sound.enabled:${user.username}` : 'notif.sound.enabled';
      localStorage.setItem(keyUser, enabled ? 'true' : 'false');
      toast.success(t('userSettings.notifications.saved'));
    } catch (_) { void 0; }
  };

  const playNotifTest = async () => {
    try {
      const a = new Audio('/audio/notification-get.mp3');
      await a.play();
    } catch (_err) {
      toast.error(t('userSettings.notifications.playFailed'));
    }
  };

  const saveEmployeeField = async (field, value) => {
    if (!employeeData?.id) {
      toast.error(t('common.error'));
      return;
    }
    const payload = {
      first_name: employeeData.first_name || '',
      last_name: employeeData.last_name || '',
      phone: field === 'phone' ? value : (employeeData.phone || ''),
      email: field === 'email' ? value : (employeeData.email || ''),
      department: employeeData.department || '',
      position: employeeData.position || '',
      brand_number: employeeData.brand_number || '',
      rfid_uid: employeeData.rfid_uid || '',
      status: employeeData.status || 'active'
    };
    try {
      field === 'phone' ? setSavingPhone(true) : setSavingEmail(true);
      const updated = await api.put(`/api/employees/${employeeData.id}`, payload);
      setEmployeeData(updated);
      setPhoneInput(updated?.phone || '');
      setEmailInput(updated?.email || '');
      toast.success(t('employees.updatedSuccess'));
    } catch (err) {
      toast.error(err?.message || t('common.error'));
    } finally {
      field === 'phone' ? setSavingPhone(false) : setSavingEmail(false);
    }
  };

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('userSettings.changePassword.title')}</h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('userSettings.changePassword.current')}</label>
            <input
              type="password"
              id="current-password"
              name="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Wpisz aktualne hasło"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('userSettings.changePassword.new')}</label>
            <input
              type="password"
              id="new-password"
              name="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Wpisz nowe hasło"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('userSettings.changePassword.confirm')}</label>
            <input
              type="password"
              id="confirm-password"
              name="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Powtórz nowe hasło"
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('common.saveChanges')}
                </>
              )}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('userSettings.changePassword.notice')}</span>
          </div>
        </form>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      {/* Sound notifications */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('userSettings.notifications.title')}</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notifSoundEnabled}
              onChange={(e) => toggleNotifSound(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">{t('userSettings.notifications.enableSound')}</span>
          </label>
          <div>
            <button
              type="button"
              onClick={playNotifTest}
              className="inline-flex items-center px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {t('userSettings.notifications.playTest')}
            </button>
          </div>
        </div>
      </div>

      {/* Push notifications */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Powiadomienia Push</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={pushLoading}
                onChange={(e) => handleTogglePush(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {pushLoading ? t('common.loading') : 'Włącz powiadomienia Push'}
              </span>
            </label>
          </div>
          
          {pushEnabled && (
            <div>
              <button
                type="button"
                onClick={sendTestPush}
                className="inline-flex items-center px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Wyślij testowe powiadomienie
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 p-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-200">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('userSettings.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">{t('userSettings.subtitle')}</p>
        </div>
      </div>
      {saved && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 transition-colors duration-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-5 w-5 text-green-400 dark:text-green-300" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('userSettings.toast.passwordSaved')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('userSettings.profile.title')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.username')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{employeeData?.login || user?.username || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.firstName')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{employeeData?.first_name || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.lastName')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{employeeData?.last_name || '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.phone')}</span>
                  <div className="flex items-center gap-2">
                    <div>
                      <input
                        type="text"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        className={`w-48 px-3 py-1.5 text-sm border rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 ${isPhoneValid ? 'border-slate-300 dark:border-slate-600' : 'border-red-500 dark:border-red-500'}`}
                        placeholder="-"
                      />
                      {!isPhoneValid && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t('userSettings.profile.validation.phoneInvalid')}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveEmployeeField('phone', phoneInput)}
                      disabled={savingPhone || !employeeData?.id || !isPhoneValid || phoneUnchanged}
                      className="text-xs px-3 py-1.5 rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {t('common.saveChanges')}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.email')}</span>
                  <div className="flex items-start gap-2">
                    <div>
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        className={`w-48 px-3 py-1.5 text-sm border rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 ${isEmailValid ? 'border-slate-300 dark:border-slate-600' : 'border-red-500 dark:border-red-500'}`}
                        placeholder="-"
                      />
                      {!isEmailValid && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t('userSettings.profile.validation.emailInvalid')}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveEmployeeField('email', emailInput)}
                      disabled={savingEmail || !employeeData?.id || !isEmailValid || emailUnchanged}
                      className="text-xs px-3 py-1.5 rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {t('common.saveChanges')}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.department')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{employeeData?.department || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.position')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{employeeData?.position || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.status')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{getStatusLabel(employeeData?.status)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.createdAt')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{employeeData?.created_at ? formatDateOnly(employeeData.created_at) : '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.brandNumber')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">{employeeData?.brand_number || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('userSettings.profile.labels.rfidUid')}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">{employeeData?.rfid_uid || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <nav className="flex items-center gap-2" aria-label="Tabs">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`${
                        isActive
                          ? 'bg-indigo-600 dark:bg-indigo-700 text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400'
                      } px-4 py-2 rounded-lg transition-colors flex items-center gap-2`}
                    >
                      <span aria-hidden="true">{tab.icon}</span>
                      <span className="text-sm font-medium">{tab.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="p-6">
              {activeTab === 'security' && renderSecurityTab()}
              {activeTab === 'notifications' && renderNotificationsTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default UserSettingsScreen;
