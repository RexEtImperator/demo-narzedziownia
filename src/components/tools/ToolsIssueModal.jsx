import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'react-toastify';

const ToolsIssueModal = ({ isOpen, onClose, tool, employees, onConfirm, showQuantity = false }) => {
  const { t } = useLanguage();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const maxQuantity = showQuantity
    ? Math.max(1, Number(tool?.available_quantity ?? tool?.availableQuantity ?? tool?.quantity ?? 1))
    : 1;

  const filteredEmployees = useMemo(() => {
    let result = (employees || []).filter(emp => emp.status !== 'Zawieszony');
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(emp => {
        const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        const brandNumber = emp.brand_number ? String(emp.brand_number) : '';
        // Allow matching the full formatted string too
        const formatted = `${emp.brand_number ? ` [${emp.brand_number}]` : ''} ${emp.first_name} ${emp.last_name}`.toLowerCase();
        
        return brandNumber.includes(lowerSearch) || 
               fullName.includes(lowerSearch) ||
               formatted.includes(lowerSearch);
      });
    }

    // Always sort
    return result.sort((a, b) => {
      const bnA = a.brand_number ? String(a.brand_number) : '';
      const bnB = b.brand_number ? String(b.brand_number) : '';
      
      // Primary sort: Brand Number (numeric)
      const brandCompare = bnA.localeCompare(bnB, undefined, { numeric: true });
      if (brandCompare !== 0) return brandCompare;
      
      // Secondary sort: Last Name
      return (a.last_name || '').localeCompare(b.last_name || '');
    });
  }, [employees, searchTerm]);

  const handleSelectEmployee = (emp) => {
    setSelectedEmployeeId(emp.id);
    setSearchTerm(`${emp.brand_number ? ` [${emp.brand_number}]` : ''} ${emp.first_name} ${emp.last_name}`);
    setShowDropdown(false);
  };

  const handleSubmit = () => {
    if (!selectedEmployeeId) {
      toast.error(t('tools.issueModal.selectEmployee'));
      return;
    }
    const q = Math.min(Math.max(1, Number(quantity) || 1), maxQuantity);
    onConfirm(tool.id, selectedEmployeeId, isPermanent, q);
  };

  if (!isOpen || !tool) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-xl">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.issueModal.title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{tool.name} ({tool.sku || tool.inventory_number})</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <label htmlFor="issueEmployeeSearch" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('tools.issueModal.selectEmployee')}</label>
            <input
              id="issueEmployeeSearch"
              name="issueEmployeeSearch"
              type="text"
              placeholder={t('tools.issueModal.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedEmployeeId('');
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {showDropdown && (
              <ul className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg">
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map(emp => (
                    <li
                      key={emp.id}
                      onClick={() => handleSelectEmployee(emp)}
                      className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-slate-700 dark:text-slate-200"
                    >
                      {(emp.brand_number !== null && emp.brand_number !== undefined && String(emp.brand_number).trim() !== '') ? (
                        <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white dark:bg-indigo-500 mr-2">
                          {String(emp.brand_number).trim()}
                        </span>
                      ) : null}
                      {emp.first_name} {emp.last_name}
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-2 text-slate-500 dark:text-slate-400">{t('common.noResults')}</li>
                )}
              </ul>
            )}
          </div>
          {showQuantity && maxQuantity > 1 && (
            <div>
              <label htmlFor="issueToolQuantity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('common.quantity')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="issueToolQuantity"
                  name="issueToolQuantity"
                  type="number"
                  min={1}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-28 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {t('tools.issueModal.available')}: {maxQuantity}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="issuePermanentTool"
              checked={isPermanent}
              onChange={(e) => setIsPermanent(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-700"
            />
            <label htmlFor="issuePermanentTool" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              {t('tools.issueModal.permanent')}
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors">{t('common.issue')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsIssueModal;
