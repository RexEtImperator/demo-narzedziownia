import React, { useState, useRef, useEffect } from 'react';
import { XMarkIcon, PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../../contexts/LanguageContext';

const FilterChip = ({ label, onRemove }) => (
  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 transition-colors">
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="ml-2 inline-flex items-center justify-center rounded-full text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200 focus:outline-none"
    >
      <span className="sr-only">Remove filter</span>
      <XMarkIcon className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </span>
);

const FilterBuilder = ({
  filters = [], // [{ id, label, value, type }]
  availableFilters = [], // [{ key, label, type: 'select'|'text', options: [] }]
  onAddFilter,
  onRemoveFilter,
  onClearAll,
  savedFilters = [], // [{ id, name, filters }]
  onApplySavedFilter,
  onSaveFilter, // (name, currentFilters)
  canSaveFilters = false,
  hideTitle = false
}) => {
  const { t } = useLanguage();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const addDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(event.target)) {
        setIsAddOpen(false);
        setSelectedType(null);
        setTempValue('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTypeSelect = (filterDef) => {
    setSelectedType(filterDef);
    setTempValue(filterDef.options ? filterDef.options[0]?.value : '');
  };

  const handleAdd = () => {
    if (selectedType && tempValue) {
      // Find label for value if it's a select
      let valueLabel = tempValue;
      if (selectedType.type === 'select') {
         const opt = selectedType.options.find(o => o.value === tempValue);
         if (opt) valueLabel = opt.label;
      }

      onAddFilter({
        key: selectedType.key,
        value: tempValue,
        label: `${selectedType.label}: ${valueLabel}`
      });
      setIsAddOpen(false);
      setSelectedType(null);
      setTempValue('');
    }
  };

  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  const handleSave = () => {
    if (newFilterName.trim()) {
      onSaveFilter(newFilterName.trim());
      setNewFilterName('');
      setIsSaveOpen(false);
    }
  };

  return (
    <div className="space-y-3 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center justify-between">
        {!hideTitle && (
          <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <FunnelIcon className="w-5 h-5" />
            {t('filters.title') || 'Filtry'}
          </h3>
        )}
        <div className={`flex gap-2 ${hideTitle ? 'w-full justify-end' : ''}`}>
          {canSaveFilters && filters.length > 0 && (
             <button
               onClick={() => setIsSaveOpen(true)}
               className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
             >
               {t('filters.saveCurrent') || 'Zapisz filtr'}
             </button>
          )}
          {filters.length > 0 && (
            <button 
              onClick={onClearAll}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
            >
              {t('filters.clearAll') || 'Wyczyść wszystkie'}
            </button>
          )}
        </div>
      </div>

      {isSaveOpen && (
        <div className="flex gap-2 items-center mb-2">
          <input
             type="text"
             value={newFilterName}
             onChange={(e) => setNewFilterName(e.target.value)}
             placeholder={t('filters.filterName') || "Nazwa filtru..."}
             className="text-sm border rounded px-2 py-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
          <button onClick={handleSave} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">OK</button>
          <button onClick={() => setIsSaveOpen(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancel</button>
        </div>
      )}

      {/* Active Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {filters.map((filter, idx) => (
          <FilterChip 
            key={`${filter.key}-${filter.value}-${idx}`}
            label={filter.label}
            onRemove={() => onRemoveFilter(filter)}
          />
        ))}

        {/* Add Filter Dropdown */}
        <div className="relative" ref={addDropdownRef}>
          <button
            onClick={() => setIsAddOpen(!isAddOpen)}
            className="inline-flex items-center px-3 py-1 text-sm border border-dashed border-slate-300 dark:border-slate-600 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-all"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1" />
            {t('filters.addFilter') || 'Dodaj filtr'}
          </button>

          {isAddOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 z-10 border border-slate-100 dark:border-slate-700">
              {!selectedType ? (
                <div className="py-1">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 uppercase tracking-wider">
                    {t('filters.selectType') || 'Wybierz typ filtru'}
                  </div>
                  {availableFilters.map(f => (
                    <button
                      key={f.key}
                      onClick={() => handleTypeSelect(f)}
                      className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3">
                  <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200 flex justify-between">
                    <span>{selectedType.label}</span>
                    <button onClick={() => setSelectedType(null)} className="text-xs text-slate-500 hover:text-slate-700">
                      {t('common.back') || 'Wróć'}
                    </button>
                  </div>
                  
                  {selectedType.type === 'select' ? (
                    <select
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      className="block w-full rounded-md border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm focus:border-indigo-500 focus:ring-indigo-500 mb-3"
                    >
                      {selectedType.options.map((opt, idx) => (
                        <option key={`${opt.value}-${idx}`} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      className="block w-full rounded-md border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm focus:border-indigo-500 focus:ring-indigo-500 mb-3"
                      placeholder="Wartość..."
                    />
                  )}

                  <button
                    onClick={handleAdd}
                    className="w-full inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    {t('common.apply') || 'Zastosuj'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Saved Filters List */}
      {savedFilters.length > 0 && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
            {t('filters.savedFilters') || 'Zapisane filtry'}
          </h4>
          <div className="flex flex-wrap gap-2">
            {savedFilters.map((sf) => (
              <button
                key={sf.id}
                onClick={() => onApplySavedFilter(sf)}
                className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 gap-1.5"
              >
                {sf.color && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sf.color }} />
                )}
                {sf.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterBuilder;
