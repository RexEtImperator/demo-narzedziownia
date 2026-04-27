import React from 'react';
import { formatDate } from '../../utils/dateUtils';

const EmployeeTooltip = ({ 
  hoveredEmployeeId, 
  employee, 
  tooltipPos, 
  issuedToolsByEmployee, 
  issuedBhpByEmployee, 
  issuedSlingsByEmployee = {},
  t 
}) => {
  if (hoveredEmployeeId !== employee.id) return null;

  const toolsEntry = issuedToolsByEmployee[Number(employee.id)] || { loading: false, items: [] };
  const bhpEntry = issuedBhpByEmployee[Number(employee.id)] || { loading: false, items: [] };
  const slingsEntry = issuedSlingsByEmployee[Number(employee.id)] || { loading: false, items: [] };
  const loading = toolsEntry.loading || bhpEntry.loading || slingsEntry.loading;

  const handleNavigate = (screen, q) => {
    try {
       window.dispatchEvent(new CustomEvent('navigate', { detail: { screen, q } }));
    } catch (_) { /* noop */ }
  };

  return (
    <div className="fixed w-[38rem] max-w-[42rem] p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl"
         style={{ top: tooltipPos.top, left: tooltipPos.left, zIndex: 9999 }}>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {t('employees.tooltip.title')}
      </div>
      {loading ? (
        <div className="text-xs text-slate-600 dark:text-slate-300">{t('employees.tooltip.loading')}</div>
      ) : (
        (() => {
          const toolItems = Array.isArray(toolsEntry.items) ? toolsEntry.items : [];
          const slingItems = Array.isArray(slingsEntry.items) ? slingsEntry.items : [];
          
          // Merge tools and slings
          const allToolItems = [
            ...toolItems.map(item => ({
              ...item,
              _id: `tool-${item.id}`,
              displaySku: item.tool_sku,
              category: item.tool_category || '-',
              qty: item.quantity
            })),
            ...slingItems.map(item => ({
              ...item,
              _id: `sling-${item.item_id}-${item.issue_id}`,
              displaySku: item.sku,
              category: item.category || '-',
              qty: 1
            }))
          ].sort((a, b) => new Date(b.issued_at || 0) - new Date(a.issued_at || 0));

          const bhpItems = Array.isArray(bhpEntry.items) ? bhpEntry.items : [];
          
          if (allToolItems.length === 0 && bhpItems.length === 0) {
            return <div className="text-xs text-slate-600 dark:text-slate-300">{t('employees.tooltip.none')}</div>;
          }
          return (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('employees.tooltip.toolsTitle')}</div>
                {allToolItems.length === 0 ? (
                  <div className="text-xs text-slate-600 dark:text-slate-300">{t('employees.tooltip.none')}</div>
                ) : (
                  <div>
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.toolsTitle')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.categoryLabel')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.skuLabel')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.issuedLabel')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.issuedByLabel')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.qtyLabel')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                        {allToolItems.map((it) => (
                          <tr
                            key={it._id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                            onClick={() => handleNavigate('tools', it.displaySku || '')}
                          >
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{it.tool_name || t('employees.tooltip.unknown')}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.category}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.displaySku || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.issued_at ? formatDate(it.issued_at) : '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.issued_by_user_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{typeof it.qty === 'number' ? it.qty : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('employees.tooltip.bhpTitle')}</div>
                {bhpItems.length === 0 ? (
                  <div className="text-xs text-slate-600 dark:text-slate-300">{t('employees.tooltip.none')}</div>
                ) : (
                  <div>
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.bhpTitle')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.inventoryLabel')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.issuedLabel')}</th>
                          <th className="px-3 py-2 text-left text-slate-700 dark:text-slate-200">{t('employees.tooltip.issuedByLabel')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                        {bhpItems.map((it) => (
                          <tr
                            key={`${it.id || ''}-${it.bhp_id || ''}-${it.issued_at || ''}`}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                            onClick={() => handleNavigate('bhp', it.bhp_inventory_number || it.bhp_model || '')}
                          >
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{it.bhp_model || t('employees.tooltip.unknown')}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.bhp_inventory_number || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.issued_at ? formatDate(it.issued_at) : '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{it.issued_by_user_name || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};

export default EmployeeTooltip;
