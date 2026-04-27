import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifyError, notifySuccess } from '../../utils/notify.jsx';
import {
  ArrowDownTrayIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ComputerDesktopIcon,
  InformationCircleIcon,
  MapIcon,
  ShieldCheckIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

const Switch = ({ id, checked, onChange }) => (
  <label htmlFor={id} className="inline-flex items-center cursor-pointer">
    <input id={id} type="checkbox" checked={!!checked} onChange={onChange} className="sr-only peer" />
    <div className="relative w-14 h-8 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:h-6 after:w-6 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-6" />
  </label>
);

const Section = ({ title, icon: Icon, children }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-600 dark:text-indigo-400">
      <Icon className="h-4 w-4" />
      <span>{title}</span>
    </div>
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="divide-y divide-slate-200 dark:divide-slate-700">{children}</div>
    </div>
  </div>
);

const FeatureRow = ({ icon: Icon, title, description, right }) => (
  <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
    <div className="flex items-start gap-3 sm:flex-1 sm:min-w-0">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-200">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-200">{title}</div>
        {description ? <div className="text-sm text-gray-500 dark:text-gray-400">{description}</div> : null}
      </div>
    </div>
    <div className="sm:shrink-0">{right}</div>
  </div>
);

const FeaturesTab = ({ config, updateConfig, t, apiClient }) => {
  const queryClient = useQueryClient();
  const reloadOnceRef = React.useRef(false);
  const features = config?.features || {};
  const auditRetentionValueRaw = Number(features.auditLogRetention);
  const auditRetentionValue = Number.isFinite(auditRetentionValueRaw) && auditRetentionValueRaw > 0 ? auditRetentionValueRaw : 90;
  const setAppConfigFlag = (key, value) => {
    queryClient.setQueryData(['appConfig'], (prev) => ({ ...(prev || {}), [key]: value }));
  };
  const reloadApp = () => {
    if (reloadOnceRef.current) return;
    reloadOnceRef.current = true;
    try {
      window.setTimeout(() => window.location.reload(), 50);
    } catch (_) {
      try { window.location.reload(); } catch (_e) { void 0; }
    }
  };
  const readMainScrollTop = () => {
    try {
      const el = document.querySelector('[data-app-scroll="main"]');
      if (!el) return null;
      return { el, top: el.scrollTop };
    } catch (_) {
      return null;
    }
  };
  const restoreMainScrollTop = (snap) => {
    if (!snap || !snap.el) return;
    try {
      snap.el.scrollTop = snap.top;
    } catch (_) { /* noop */ }
  };

  return (
    <div className="space-y-6">
      <Section title="SYSTEM" icon={ComputerDesktopIcon}>
        <FeatureRow
          icon={ChartBarIcon}
          title={t('appConfig.features.reports')}
          description={t('appConfig.features.reportsDesc')}
          right={
            <Switch
              id="enableReports"
              checked={!!features.enableReports}
              onChange={(e) => updateConfig('features', 'enableReports', !!e.target.checked)}
            />
          }
        />
        <FeatureRow
          icon={ArrowDownTrayIcon}
          title={t('appConfig.features.dataExport')}
          description={t('appConfig.features.dataExportDesc')}
          right={
            <Switch
              id="enableDataExport"
              checked={!!features.enableDataExport}
              onChange={(e) => updateConfig('features', 'enableDataExport', !!e.target.checked)}
            />
          }
        />
      </Section>

      <Section title="BEZPIECZEŃSTWO" icon={ShieldCheckIcon}>
        <FeatureRow
          icon={ShieldCheckIcon}
          title={t('appConfig.features.auditLog')}
          description={t('appConfig.features.auditLogDesc')}
          right={
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center justify-end gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span>{t('appConfig.features.auditRetention')}</span>
                <InformationCircleIcon className="h-5 w-5 text-slate-400" />
              </div>
              <div className="flex items-center justify-end gap-3">
                <Switch
                  id="enableAuditLog"
                  checked={!!features.enableAuditLog}
                  onChange={(e) => updateConfig('features', 'enableAuditLog', !!e.target.checked)}
                />
                <select
                  id="auditLogRetention"
                  name="auditLogRetention"
                  value={String(auditRetentionValue)}
                  onChange={(e) => {
                    const next = Number.parseInt(String(e.target.value), 10);
                    updateConfig('features', 'auditLogRetention', Number.isFinite(next) ? next : auditRetentionValue);
                  }}
                  className="h-10 min-w-[132px] px-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="7">7 dni</option>
                  <option value="30">30 dni</option>
                  <option value="90">90 dni</option>
                  <option value="180">180 dni</option>
                  <option value="365">365 dni</option>
                </select>
              </div>
            </div>
          }
        />
      </Section>

      <Section title="KOMUNIKACJA" icon={ChatBubbleLeftRightIcon}>
        <FeatureRow
          icon={ChatBubbleLeftRightIcon}
          title={t('appConfig.features.realtimeChat')}
          description={t('appConfig.features.realtimeChatDesc')}
          right={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Switch
                id="enableRealtimeChat"
                checked={!!features.enableRealtimeChat}
                onChange={(e) => {
                  const val = !!e.target.checked;
                  updateConfig('features', 'enableRealtimeChat', val);
                  try {
                    localStorage.setItem('feature.chat.enabled', String(val));
                    window.dispatchEvent(new CustomEvent('feature:chat:changed', { detail: { enabled: val } }));
                  } catch (_) { /* noop */ }
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const ok = window.confirm(t('appConfig.features.deleteAllChatsConfirm') || 'Czy na pewno chcesz usunąć wszystkie czaty?');
                    if (!ok) return;
                    const resp = await apiClient.delete('/api/chat/conversations/all');
                    const c = resp?.counts || {};
                    const msg = t('appConfig.features.deleteAllChatsSummary', {
                      conversations: Number(c.conversations || 0),
                      messages: Number(c.messages || 0),
                      participants: Number(c.participants || 0),
                      attachments: Number(c.attachments || 0),
                      reads: Number(c.reads || 0),
                      typing: Number(c.typing || 0),
                      blocks: Number(c.blocks || 0)
                    }) || `Usunięto czaty: rozmowy ${Number(c.conversations || 0)}, wiadomości ${Number(c.messages || 0)}, uczestnicy ${Number(c.participants || 0)}, załączniki ${Number(c.attachments || 0)}, odczyty ${Number(c.reads || 0)}, wpisy pisania ${Number(c.typing || 0)}, blokady ${Number(c.blocks || 0)}`;
                    notifySuccess(msg);
                  } catch (_err) {
                    notifyError(t('appConfig.features.deleteAllChatsError') || 'Nie udało się usunąć konwersacji');
                  }
                }}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-red-500/40 text-red-600 dark:text-red-200 bg-transparent hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <TrashIcon className="h-4 w-4" />
                <span>{t('appConfig.features.deleteAllChats') || 'Usuń wszystkie czaty'}</span>
              </button>
            </div>
          }
        />
      </Section>

      <Section title="TRYB PRACY" icon={ComputerDesktopIcon}>
        <FeatureRow
          icon={ComputerDesktopIcon}
          title={t('appConfig.features.kiosk')}
          description={t('appConfig.features.kioskDesc')}
          right={
            <Switch
              id="enableKiosk"
              checked={!!features.enableKiosk}
              onChange={async (e) => {
                const snap = readMainScrollTop();
                const val = !!e.target.checked;
                updateConfig('features', 'enableKiosk', val);
                setAppConfigFlag('enableKiosk', val);
                try {
                  window.requestAnimationFrame(() => restoreMainScrollTop(snap));
                } catch (_) { /* noop */ }
                try {
                  localStorage.setItem('feature.kiosk.enabled', String(val));
                } catch (_) { /* noop */ }
                try {
                  await apiClient.put('/api/config/kiosk', { enableKiosk: val });
                  reloadApp();
                } catch (_err) {
                  notifyError(t('common.error') || 'Błąd');
                  updateConfig('features', 'enableKiosk', !val);
                  setAppConfigFlag('enableKiosk', !val);
                  try {
                    localStorage.setItem('feature.kiosk.enabled', String(!val));
                  } catch (_) { /* noop */ }
                } finally {
                  try {
                    window.requestAnimationFrame(() => restoreMainScrollTop(snap));
                  } catch (_) { /* noop */ }
                }
              }}
            />
          }
        />
      </Section>

      <Section title="DOSTĘP" icon={MapIcon}>
        <FeatureRow
          icon={MapIcon}
          title="Mapa zakładu"
          description="Włącza/wyłącza zakładkę Mapa zakładu w menu bocznym (niezależnie od uprawnienia VIEW_MAP)."
          right={
            <Switch
              id="enableMap"
              checked={!!features.enableMap}
              onChange={async (e) => {
                const snap = readMainScrollTop();
                const val = !!e.target.checked;
                updateConfig('features', 'enableMap', val);
                setAppConfigFlag('enableMap', val);
                try {
                  window.requestAnimationFrame(() => restoreMainScrollTop(snap));
                } catch (_) { /* noop */ }
                try {
                  localStorage.setItem('feature.map.enabled', String(val));
                } catch (_) { /* noop */ }
                try {
                  await apiClient.put('/api/config/map', { enableMap: val });
                  reloadApp();
                } catch (_err) {
                  notifyError(t('common.error') || 'Błąd');
                  updateConfig('features', 'enableMap', !val);
                  setAppConfigFlag('enableMap', !val);
                  try {
                    localStorage.setItem('feature.map.enabled', String(!val));
                  } catch (_) { /* noop */ }
                } finally {
                  try {
                    window.requestAnimationFrame(() => restoreMainScrollTop(snap));
                  } catch (_) { /* noop */ }
                }
              }}
            />
          }
        />
      </Section>

      <Section title="WSPARCIE" icon={InformationCircleIcon}>
        <FeatureRow
          icon={InformationCircleIcon}
          title={t('appConfig.features.help') || 'Pomoc'}
          description={t('appConfig.features.helpDesc') || 'Włącz lub wyłącz przycisk Pomoc w górnym pasku.'}
          right={
            <Switch
              id="enableHelp"
              checked={!!features.enableHelp}
              onChange={async (e) => {
                const snap = readMainScrollTop();
                const val = !!e.target.checked;
                updateConfig('features', 'enableHelp', val);
                setAppConfigFlag('enableHelp', val);
                try {
                  window.requestAnimationFrame(() => restoreMainScrollTop(snap));
                } catch (_) { /* noop */ }
                try {
                  localStorage.setItem('feature.help.enabled', String(val));
                } catch (_) { /* noop */ }
                try {
                  await apiClient.put('/api/config/help', { enableHelp: val });
                  reloadApp();
                } catch (_err) {
                  notifyError(t('common.error') || 'Błąd');
                  updateConfig('features', 'enableHelp', !val);
                  setAppConfigFlag('enableHelp', !val);
                  try {
                    localStorage.setItem('feature.help.enabled', String(!val));
                  } catch (_) { /* noop */ }
                } finally {
                  try {
                    window.requestAnimationFrame(() => restoreMainScrollTop(snap));
                  } catch (_) { /* noop */ }
                }
              }}
            />
          }
        />
      </Section>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <InformationCircleIcon className="h-5 w-5 text-slate-400" />
          <span>{t('appConfig.features.autoSaveNote') || 'Zmiany ustawień są zapisywane automatycznie.'}</span>
        </div>
      </div>
    </div>
  );
};

export default FeaturesTab;
