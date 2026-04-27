import React from 'react';
import { InboxIcon } from '@heroicons/react/24/outline';

function EmptyState({ 
  title = "Brak danych", 
  description = "Brak danych do wyświetlenia.", 
  actionLabel, 
  onAction,
  secondaryActionLabel,
  onSecondaryAction 
}) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full mb-4">
        <InboxIcon className="w-8 h-8 text-gray-400 dark:text-gray-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm mx-auto">
        {description}
      </p>
      <div className="flex gap-2 justify-center">
        {actionLabel && onAction && (
          <button 
            onClick={onAction}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {actionLabel}
          </button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <button 
            onClick={onSecondaryAction}
            className="px-4 py-2 bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default EmptyState;
