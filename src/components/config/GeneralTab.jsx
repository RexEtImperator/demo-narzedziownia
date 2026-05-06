import React, { useState, useEffect, useCallback, Suspense } from 'react';
import GeneralSettings from './GeneralSettings';
import LogoSection from './LogoSection';
import SystemLogs from './SystemLogs';
import ConfirmationModal from '../ConfirmationModal';

const GeneralTab = ({
  config,
  updateConfig,
  apiClient,
  t,
  notifySuccess,
  notifyError,
  errors,
  user
}) => {
  const MIN_LOGO_WIDTH = 64;
  const MIN_LOGO_HEIGHT = 64;
  const MAX_LOGO_WIDTH = 1024;
  const MAX_LOGO_HEIGHT = 1024;

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoTs, setLogoTs] = useState(() => 0);
  const [logoHistory, setLogoHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showLogoDeleteModal, setShowLogoDeleteModal] = useState(false);
  const [logoDeleteFilename, setLogoDeleteFilename] = useState(null);
  const [logoDeleteLoading, setLogoDeleteLoading] = useState(false);

  const loadLogoHistory = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/config/logo/history');
      setLogoHistory(Array.isArray(data?.versions) ? data.versions : []);
    } catch (err) {
      console.warn('Failed to load logo history:', err?.message || err);
    }
  }, [apiClient]);

  useEffect(() => {
    Promise.resolve().then(() => { loadLogoHistory(); });
  }, [loadLogoHistory]);

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (file.type !== 'image/png') {
      notifyError(t('appConfig.logo.onlyPng'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notifyError(t('appConfig.logo.fileTooLarge'));
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      if (
        w < MIN_LOGO_WIDTH || h < MIN_LOGO_HEIGHT ||
        w > MAX_LOGO_WIDTH || h > MAX_LOGO_HEIGHT
      ) {
        notifyError(
          t('appConfig.logo.dimensionsOutOfRange')
            .replace('{minW}', MIN_LOGO_WIDTH)
            .replace('{minH}', MIN_LOGO_HEIGHT)
            .replace('{maxW}', MAX_LOGO_WIDTH)
            .replace('{maxH}', MAX_LOGO_HEIGHT)
            .replace('{w}', w)
            .replace('{h}', h)
        );
        URL.revokeObjectURL(previewUrl);
        return;
      }
      setLogoFile(file);
      setLogoPreview(previewUrl);
    };
    img.onerror = () => {
      notifyError(t('appConfig.logo.invalidImageFile'));
      URL.revokeObjectURL(previewUrl);
    };
    img.src = previewUrl;
  };

  const handleLogoUpload = async () => {
    if (!logoFile) {
      notifyError(t('appConfig.logo.selectPng'));
      return;
    }
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('logo', logoFile);
      const resp = await apiClient.postForm('/api/config/logo', formData);
      notifySuccess(t('appConfig.logo.updated'));
      setLogoTs((resp && resp.timestamp) || Date.now());
      setLogoFile(null);
      setLogoPreview(null);
      loadLogoHistory();
    } catch (error) {
      let msg = t('appConfig.logo.uploadError');
      if (error && typeof error.message === 'string') {
        try {
          const parsed = JSON.parse(error.message);
          msg = parsed.error || parsed.message || msg;
        } catch (_) {
          msg = error.message || msg;
        }
      }
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoRollback = async (filename) => {
    if (!filename) return;
    try {
      setLoading(true);
      await apiClient.post('/api/config/logo/rollback', { filename });
      notifySuccess(t('appConfig.logo.rollbackSuccess'));
      setLogoTs(Date.now());
    } catch (error) {
      let msg = t('appConfig.logo.rollbackError');
      if (error && typeof error.message === 'string') {
        try { const parsed = JSON.parse(error.message); msg = parsed.error || parsed.message || msg; } catch (_) { msg = error.message || msg; }
      }
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoDelete = async (filename) => {
    if (!filename) return;
    try {
      setLogoDeleteLoading(true);
      await apiClient.delete(`/api/config/logo/${encodeURIComponent(filename)}`);
      notifySuccess(t('appConfig.logo.deleteSuccess'));
      await loadLogoHistory();
    } catch (error) {
      let msg = t('appConfig.logo.deleteError');
      if (error && typeof error.message === 'string') {
        try { const parsed = JSON.parse(error.message); msg = parsed.error || parsed.message || msg; } catch (_) { msg = error.message || msg; }
      }
      notifyError(msg);
    } finally {
      setLogoDeleteLoading(false);
      setShowLogoDeleteModal(false);
      setLogoDeleteFilename(null);
    }
  };

  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
        <GeneralSettings config={config} updateConfig={updateConfig} t={t} errors={errors} />
      </Suspense>

      <Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
        <LogoSection
          logoPreview={logoPreview}
          logoTs={logoTs}
          logoFile={logoFile}
          handleLogoChange={handleLogoChange}
          handleLogoUpload={handleLogoUpload}
          setLogoFile={setLogoFile}
          setLogoPreview={setLogoPreview}
          logoHistory={logoHistory}
          handleLogoRollback={handleLogoRollback}
          setLogoDeleteFilename={setLogoDeleteFilename}
          setShowLogoDeleteModal={setShowLogoDeleteModal}
          loading={loading}
          t={t}
          MIN_LOGO_WIDTH={MIN_LOGO_WIDTH}
          MIN_LOGO_HEIGHT={MIN_LOGO_HEIGHT}
          MAX_LOGO_WIDTH={MAX_LOGO_WIDTH}
          MAX_LOGO_HEIGHT={MAX_LOGO_HEIGHT}
        />
      </Suspense>

      {user?.role === 'administrator' && (
        <Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
          <SystemLogs apiClient={apiClient} t={t} />
        </Suspense>
      )}

      <ConfirmationModal
        isOpen={showLogoDeleteModal}
        onClose={() => { if (!logoDeleteLoading) { setShowLogoDeleteModal(false); setLogoDeleteFilename(null); } }}
        onConfirm={() => logoDeleteFilename && handleLogoDelete(logoDeleteFilename)}
        title={t('appConfig.logo.deleteTitle')}
        message={logoDeleteFilename ? `${t('appConfig.logo.deleteMessagePrefix')} ${logoDeleteFilename}?` : t('appConfig.logo.deleteMessage')}
        confirmText={t('common.remove')}
        cancelText={t('common.cancel')}
        type="danger"
        loading={logoDeleteLoading}
      />
    </div>
  );
};

export default GeneralTab;
