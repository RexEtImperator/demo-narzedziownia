import React from 'react';

export default function Preloader({ fullscreen = true, label = 'Ładowanie…' }) {
  const containerClass = fullscreen ? 'min-h-screen' : 'min-h-[50vh]';
  return (
    <div className={`grid place-items-center ${containerClass}`}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-2">
          <div className="w-3 h-3 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm animate-pulse">{label}</span>
      </div>
    </div>
  );
}