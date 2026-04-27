import React, { useEffect, useState } from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon, 
  XMarkIcon 
} from '@heroicons/react/24/outline';

const getIconForType = (type) => {
  switch (type) {
    case 'success':
      return <CheckCircleIcon className="w-6 h-6" />;
    case 'error':
      return <XCircleIcon className="w-6 h-6" />;
    case 'warning':
      return <ExclamationTriangleIcon className="w-6 h-6" />;
    case 'info':
    default:
      return <InformationCircleIcon className="w-6 h-6" />;
  }
};

const getStylesForType = (type) => {
  switch (type) {
    case 'success':
      return {
        container: 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500',
        icon: 'text-green-600 dark:text-green-400',
        progress: 'bg-green-500'
      };
    case 'error':
      return {
        container: 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 animate-pulse',
        icon: 'text-red-600 dark:text-red-400',
        progress: 'bg-red-500'
      };
    case 'warning':
      return {
        container: 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500',
        icon: 'text-yellow-600 dark:text-yellow-400',
        progress: 'bg-yellow-500'
      };
    case 'info':
    default:
      return {
        container: 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500',
        icon: 'text-blue-600 dark:text-blue-400',
        progress: 'bg-blue-500'
      };
  }
};

const Toast = ({ type, title, message, action, closeToast, toastProps }) => {
  const styles = getStylesForType(type);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => {
      setProgress(0);
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  
  // Custom progress bar logic if needed, but for simplicity we might rely on CSS animation
  // Since we are inside react-toastify, we can use toastProps to get autoClose time
  
  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg shadow-lg w-full relative overflow-hidden ${styles.container}`}>
      {/* Icon */}
      <div className={`flex-shrink-0 mt-0.5 ${styles.icon}`}>
        {getIconForType(type)}
      </div>
      
      {/* Content */}
      <div className="flex-1">
        {title && <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{title}</h3>}
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{message}</p>
        {action && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            {action.label}
          </button>
        )}
      </div>
      
      {/* Close button */}
      <button 
        onClick={closeToast}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
      
      {/* Progress bar - absolute positioned at bottom */}
      {/* We can use a simple CSS animation for the progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
         <div 
           className={`h-full ${styles.progress}`} 
           style={{ 
             width: `${progress}%`,
             transition: `width ${toastProps?.autoClose || 3000}ms linear`
           }} 
         />
      </div>
    </div>
  );
};

export default Toast;
