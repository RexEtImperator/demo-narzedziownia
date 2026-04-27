import React from 'react';
import { ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

import { useLanguage } from '../contexts/LanguageContext';

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title,
  message,
  confirmText,
  cancelText,
  type = 'danger', // 'danger', 'warning', 'info', 'success'
  loading = false
}) => {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('confirmation.title');
  const resolvedMessage = message ?? t('confirmation.message');
  const resolvedConfirmText = confirmText ?? t('confirmation.confirm');
  const resolvedCancelText = cancelText ?? t('confirmation.cancel');
  
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: (<ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" aria-hidden="true" />),
          iconBg: 'bg-red-100 dark:bg-red-900/30',
          buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800 dark:focus:ring-red-400',
          subText: 'Ta czynność może być nieodwracalna.'
        };
      case 'warning':
        return {
          icon: (<ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />),
          iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
          buttonClass: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 dark:bg-yellow-700 dark:hover:bg-yellow-800 dark:focus:ring-yellow-400',
          subText: 'Zachowaj ostrożność.'
        };
      case 'info':
        return {
          icon: (<InformationCircleIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />),
          iconBg: 'bg-blue-100 dark:bg-blue-900/30',
          buttonClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 dark:bg-blue-700 dark:hover:bg-blue-800 dark:focus:ring-blue-400',
          subText: 'Informacja.'
        };
      case 'success':
        return {
          icon: (<CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" aria-hidden="true" />),
          iconBg: 'bg-green-100 dark:bg-green-900/30',
          buttonClass: 'bg-green-600 hover:bg-green-700 focus:ring-green-500 dark:bg-green-700 dark:hover:bg-green-800 dark:focus:ring-green-400',
          subText: 'Operacja powiodła się.'
        };
      default:
        return {
          icon: (<ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" aria-hidden="true" />),
          iconBg: 'bg-red-100 dark:bg-red-900/30',
          buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800 dark:focus:ring-red-400',
          subText: ''
        };
    }
  };

  const typeStyles = getTypeStyles();

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (loading) return;
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      onConfirm();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-gray-500/75 dark:bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={handleBackdropClick}
        ></div>

        {/* Modal panel */}
        <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 transform transition-all overflow-hidden">
            {/* Header z ikoną */}
            <div className="flex items-center gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
              <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${typeStyles.iconBg}`}>
                {typeStyles.icon}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white text-lg">{resolvedTitle}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{typeStyles.subText}</p>
              </div>
              <button 
                onClick={onClose}
                disabled={loading}
                className="ml-auto text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-50"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 text-gray-700 dark:text-gray-300">
              {resolvedMessage}
            </div>
            
            {/* Footer z akcjami */}
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800/50">
              <button 
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors disabled:opacity-50"
              >
                {resolvedCancelText}
              </button>
              <button 
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium shadow-sm transition-colors flex justify-center items-center ${typeStyles.buttonClass} disabled:opacity-70`}
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {resolvedConfirmText}
              </button>
            </div>
        </div>
    </div>
  );
};

export default ConfirmationModal;