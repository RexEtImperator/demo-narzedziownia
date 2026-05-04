import React, { useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTools, useAddTool, useUpdateTool, useCategories, useAppConfig, useToolDetails, useToolSuggestions, useToolSlings } from '../hooks/useTools';
import { useToolsManagement } from '../hooks/useToolsManagement';
import { notifyError, notifySuccess, notifyInfo } from '../utils/notify';
import ToolsForm from './tools/ToolsForm';
import { PERMISSIONS, hasPermission } from '../constants';
import Preloader from './Preloader';
import { WrenchScrewdriverIcon, XMarkIcon } from '@heroicons/react/24/outline';

const ToolsEditorScreen = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  
  const canManageTools = hasPermission(user, PERMISSIONS.MANAGE_TOOLS);

  const { data: tools = [] } = useTools({ enabled: canManageTools });
  const { data: toolDetails, isLoading: isDetailsLoading } = useToolDetails(id);
  const { isLoading: isSlingsLoading } = useToolSlings(id);
  const { data: availableCategories = [] } = useCategories(canManageTools);
  const { data: appConfig = {}, isLoading: configLoading } = useAppConfig(canManageTools);

  const { mutateAsync: addTool, isPending: isAdding } = useAddTool();
  const { mutateAsync: updateTool, isPending: isUpdating } = useUpdateTool();
  
  const isSubmitting = isAdding || isUpdating;

  // Dummy functions for unused features
  const dummyMutation = async () => {};

  const {
    formData,
    handleInputChange,
    handleSubmit,
    errors,
    handleOpenModal,
    slingItems,
    setSlingItems,
    socketItems,
    setSocketItems,
    detectorsItems,
    setDetectorsItems,
    generateSkuWithPrefix,
    setFormData
  } = useToolsManagement({
    t,
    tools,
    addTool,
    updateTool,
    deleteTool: dummyMutation,
    sendToService: dummyMutation,
    receiveFromService: dummyMutation,
    notifyReturn: dummyMutation,
    notifySuccess,
    notifyError,
    notifyInfo,
    toolsCodePrefix: appConfig?.toolsCodePrefix,
    toolCategoryPrefixes: appConfig?.toolCategoryPrefixes,
    canManageTools,
    onSuccess: () => navigate('/tools')
  });

  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (configLoading || isInitializedRef.current) return;

    if (id) {
      if (toolDetails) {
        handleOpenModal(toolDetails);
        isInitializedRef.current = true;
      }
    } else {
      handleOpenModal(null);
      if (location.state?.sku) {
        setFormData(prev => ({ ...prev, sku: location.state.sku }));
      }
      isInitializedRef.current = true;
    }
  }, [id, toolDetails, handleOpenModal, configLoading, location.state, setFormData]);

  // Suggestions
  const { data: suggestionsData } = useToolSuggestions(
    ['elektronarzędzia', 'akumulatorowe'].includes((formData.category || '').toLowerCase()) 
      ? (formData.category || '').trim() 
      : ''
  );
  
  const suggestions = useMemo(() => ({
    manufacturer: suggestionsData?.manufacturer || [],
    model: suggestionsData?.model || [],
    production_year: suggestionsData?.production_year || [],
    location: suggestionsData?.location || [],
    inventory_number: suggestionsData?.inventory_number || []
  }), [suggestionsData]);

  if ((id && (isDetailsLoading || isSlingsLoading)) || configLoading) {
    return <Preloader />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* HEADER */}
      <div className="rounded-lg shadow-xl dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-start justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-600/10 flex items-center justify-center">
              <WrenchScrewdriverIcon className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h2 id="edit-title" className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {id ? (t('tools.actions.edit') || 'Edytuj narzędzie') : (t('tools.actions.add') || 'Dodaj narzędzie')}
              </h2>
              <p id="edit-desc" className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t('tools.edit.modalDescription')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/tools')}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            <XMarkIcon className="h-5 w-5" />
            {t('common.cancel') || 'Anuluj'}
          </button>
        </div>
      </div>

      <ToolsForm
        isOpen={true}
        isPage={true}
        onClose={() => navigate('/tools')}
        editingTool={id ? toolDetails : null}
        formData={formData}
        errors={errors}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        availableCategories={availableCategories}
        suggestions={suggestions}
        t={t}
        generateSkuWithPrefix={generateSkuWithPrefix}
        slingItems={slingItems}
        setSlingItems={setSlingItems}
        socketItems={socketItems}
        setSocketItems={setSocketItems}
        detectorsItems={detectorsItems}
        setDetectorsItems={setDetectorsItems}
      />
    </div>
  );
};

export default ToolsEditorScreen;
