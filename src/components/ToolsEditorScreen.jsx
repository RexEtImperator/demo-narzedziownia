import React, { useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTools, useAddTool, useUpdateTool, useCategories, useAppConfig, useToolDetails, useToolSuggestions, useToolSlings } from '../hooks/useTools';
import { useToolsManagement } from '../hooks/useToolsManagement';
import { notifyError, notifySuccess, notifyInfo } from '../utils/notify';
import ToolsForm from './tools/ToolsForm';
import { PERMISSIONS, hasPermission } from '../constants';
import Preloader from './Preloader';

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
    <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {id ? (t('tools.actions.edit') || 'Edytuj narzędzie') : (t('tools.actions.add') || 'Dodaj narzędzie')}
            </h1>
            <button
                onClick={() => navigate('/tools')}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors"
            >
                {t('common.cancel') || 'Anuluj'}
            </button>
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
