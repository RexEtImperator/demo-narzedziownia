import React from 'react';

function SkeletonRow({ cols = 4 }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 animate-pulse"
          style={{ animationDuration: '1.2s' }}
        />
      ))}
    </div>
  );
}

export default function SkeletonList({ rows = 8, cols = 4, className = '' }) {
  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 p-4 ${className}`}>
      <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4 animate-pulse" style={{ animationDuration: '1.2s' }} />
      {Array.from({ length: rows }).map((_, idx) => (
        <SkeletonRow key={idx} cols={cols} />
      ))}
    </div>
  );
}