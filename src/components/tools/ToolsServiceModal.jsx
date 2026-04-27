import React from 'react';

const ToolsServiceModal = ({
  isOpen,
  onClose,
  editingTool,
  serviceFormData,
  setServiceFormData,
  handleSendToService,
  modalRef,
  t
}) => {
  if (!isOpen || !editingTool) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="service-title" aria-describedby="service-desc" className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 id="service-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 sharp-text">{t('tools.service.modal.title')}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>
          <div id="service-desc" className="text-sm text-slate-600 dark:text-slate-300 mb-3 sharp-text">{t('tools.service.modalDescription')}</div>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 sharp-text">{t('tools.common.toolIssued')}: <span className="font-medium">{editingTool.name}</span></p>
            
            {/* Status Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 sharp-text">{t('tools.details.status')}</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setServiceFormData(prev => ({ ...prev, status: 'service' }))}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border sharp-text ${
                    serviceFormData.status === 'service'
                      ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700'
                  }`}
                >
                  {t('tools.filters.saved.service') || 'Serwis'}
                </button>
                <button
                  type="button"
                  onClick={() => setServiceFormData(prev => ({ ...prev, status: 'damaged' }))}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border sharp-text ${
                    serviceFormData.status === 'damaged'
                      ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700'
                  }`}
                >
                  {t('tools.filters.saved.damaged') || 'Uszkodzone'}
                </button>
              </div>
            </div>

            {serviceFormData.status === 'service' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300 sharp-text">{t('tools.service.available')}: <span className="font-medium">{(editingTool.quantity || 0) - (editingTool.service_quantity || 0)}</span> szt.</p>
                <div>
                  <label htmlFor="service-quantity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">{t('tools.service.quantityLabel')}</label>
                  <input
                    id="service-quantity"
                    type="number"
                    min={1}
                    max={(editingTool.quantity || 0) - (editingTool.service_quantity || 0)}
                    value={serviceFormData.quantity}
                    onChange={(e) => setServiceFormData(prev => ({ ...prev, quantity: parseInt(e.target.value || '1', 10) }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 sharp-text placeholder-slate-500 dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label htmlFor="service-order" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">{t('tools.service.orderNumber')}</label>
                  <input
                    id="service-order"
                    type="text"
                    value={serviceFormData.orderNumber}
                    onChange={(e) => setServiceFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                    placeholder={t('tools.service.orderNumberPlaceholder')}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 sharp-text placeholder-slate-500 dark:placeholder-slate-500"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg">
                <p className="text-sm text-orange-700 dark:text-orange-300 flex items-start gap-2">
                  <span className="text-lg">⚠️</span>
                  {t('tools.service.markAsDamagedWarning') || 'Narzędzie zostanie oznaczone jako uszkodzone.'}
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 sharp-text focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSendToService}
              className={`px-3 py-1.5 text-white rounded-lg text-sm sharp-text focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                serviceFormData.status === 'damaged'
                  ? 'bg-orange-600 dark:bg-orange-700 hover:bg-orange-700 dark:hover:bg-orange-800 focus:ring-orange-500'
                  : 'bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800 focus:ring-red-500'
              }`}
            >
              {serviceFormData.status === 'damaged' ? (t('common.save') || 'Zapisz') : t('tools.service.sendButton')}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsServiceModal;
