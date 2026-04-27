import React from 'react';
import { formatDate } from '../../utils/dateUtils';

const ToolsTooltip = ({ 
  tool, 
  position, 
  onMouseEnter, 
  onMouseLeave 
}) => {
  if (!tool) return null;
  
  // Tooltip is only for tools that have issued items
  const eligible = ((tool.status === 'issued') || (tool.status === 'partially_issued')) &&  
                   Array.isArray(tool.issues) && 
                   tool.issues.length > 0;
                   
  if (!eligible) return null;

  const handleNavigate = (e, qParam) => {
    e.stopPropagation();
    try {
      window.dispatchEvent(new CustomEvent('navigate', { 
        detail: { url: `/employees?q=${encodeURIComponent(qParam)}` } 
      }));
    } catch (_) {
      // noop
    }
  };

  return (
    <div
      className="fixed z-50 w-[38rem] max-w-[42rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-4"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Wydania</div>
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-700">
          <tr>
            <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">Pracownik</th>
            <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">Nr służbowy</th>
            <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">Wydano</th>
            <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">Wydał</th>
            <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">Ilość</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
          {tool.issues.filter(i => i.status === 'issued').map((it) => {
            const name = `${it.employee_first_name || ''} ${it.employee_last_name || ''}`.trim();
            const brand = it.employee_brand_number || '';
            const qty = Number(it.quantity || 0) || 0;
            const qParam = name;
            
            return (
              <tr
                key={`${it.id || ''}-${it.employee_id || ''}-${it.issued_at || ''}`}
                className="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                onClick={(e) => handleNavigate(e, qParam)}
              >
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{name || '-'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{brand || '-'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.issued_at ? formatDate(it.issued_at) : '-'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.issued_by_user_name || '-'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{qty}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ToolsTooltip;
