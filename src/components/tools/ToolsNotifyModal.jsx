import React from 'react';

const ToolsNotifyModal = ({
  isOpen,
  onClose,
  tool,
  onConfirm,
  isSending,
  modalRef,
  t
}) => {
  if (!isOpen || !tool) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        ref={modalRef} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="notify-title" 
        aria-describedby="notify-desc" 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-1">
            <h2 id="notify-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100 sharp-text">
              {t('tools.actions.notifyReturn')}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
            >
              <span className="text-2xl leading-none">&times;</span>
            </button>
          </div>
          <div id="notify-desc" className="text-sm text-slate-500 dark:text-slate-400 mb-6 sharp-text">
            {t('tools.actions.notifyReturnDesc')}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                {t('tools.common.toolIssued')}
              </p>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700">
                <div className="font-medium text-slate-900 dark:text-slate-100 text-base mb-2">
                  {tool.name}
                </div>
                <div className="inline-block px-2.5 py-1 bg-slate-200 dark:bg-slate-800 rounded text-sm font-mono text-slate-600 dark:text-slate-400 tracking-wide">
                  {t('tools.labels.sku')}: {tool.sku || '-'}
                </div>
              </div>
            </div>
            <div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700 flex items-center gap-3">
                 <div className="flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                      {t('common.employee')}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      [{tool.employee_brand_number}] {tool.employee_first_name} {tool.employee_last_name}
                    </span>
                 </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={isSending}
              className="px-4 py-2.5 bg-indigo-600 dark:bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm shadow-indigo-500/30"
            >
              {t('common.sendReminder')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsNotifyModal;
