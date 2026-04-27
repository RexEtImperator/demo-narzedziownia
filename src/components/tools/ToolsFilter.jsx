import React, { useMemo, useState, useEffect, useRef } from 'react';
import FilterBuilder from '../common/FilterBuilder';
import { ClockIcon, FunnelIcon } from '@heroicons/react/24/outline';

const ToolsFilter = ({
  searchTerm,
  setSearchTerm,
  setDebouncedSearch,
  selectedStatus,
  setSelectedStatus,
  selectedCategory,
  setSelectedCategory,
  categories = [],
  allToolsCount = 0,
  statuses = [],
  canExportTools,
  exportListToPDF,
  exportListToXLSX,
  t,
  searchInputRef
}) => {
  // Construct active filters
  const filters = useMemo(() => {
    const f = [];
    if (selectedStatus) {
      const statusLabel = t(`tools.filters.saved.${selectedStatus}`) || selectedStatus;
      f.push({ key: 'status', value: selectedStatus, label: `${t('tools.filters.status.label')}: ${statusLabel}` });
    }
    if (selectedCategory) {
      f.push({ key: 'category', value: selectedCategory, label: `${t('tools.filters.category.label')}: ${selectedCategory}` });
    }
    return f;
  }, [selectedStatus, selectedCategory, t]);

  // Available filters definition
  const availableFilters = useMemo(() => [
    {
      key: 'status',
      label: t('tools.filters.status.label'),
      type: 'select',
      options: statuses.map(s => ({ value: s, label: t(`tools.filters.saved.${s}`) || s }))
    },
    {
      key: 'category',
      label: t('tools.filters.category.label'),
      type: 'select',
      options: categories.map(c => ({ value: c.name, label: c.name })).sort((a, b) => a.label.localeCompare(b.label))
    }
  ], [statuses, categories, t]);

  const handleAddFilter = ({ key, value }) => {
    if (key === 'status') setSelectedStatus(value);
    if (key === 'category') setSelectedCategory(value);
  };

  const handleRemoveFilter = (filter) => {
    if (filter.key === 'status') setSelectedStatus('');
    if (filter.key === 'category') setSelectedCategory('');
  };

  const handleClearAll = () => {
    setSelectedStatus('');
    setSelectedCategory('');
  };

  // Saved filters state
  const [savedFilters, setSavedFilters] = useState(() => {
    try {
      const defaults = [
        { id: 'available', name: t('tools.filters.saved.available'), color: '#22c55e', filters: [{ key: 'status', value: 'available' }] },
        { id: 'issued', name: t('tools.filters.saved.issued'), color: '#eab308', filters: [{ key: 'status', value: 'issued' }] },
        { id: 'partially_issued', name: t('tools.filters.saved.partially_issued'), color: '#CDDC39', filters: [{ key: 'status', value: 'partially_issued' }] },
        { id: 'permanent', name: t('tools.filters.saved.permanent'), color: '#3b82f6', filters: [{ key: 'status', value: 'permanent' }] },
        { id: 'service', name: t('tools.filters.saved.service'), color: '#ef4444', filters: [{ key: 'status', value: 'service' }] },
        { id: 'damaged', name: t('tools.filters.saved.damaged'), color: '#f97316', filters: [{ key: 'status', value: 'damaged' }] }
      ];

      const saved = localStorage.getItem('tools_saved_filters_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge colors for default filters
        return parsed.map(f => {
          const def = defaults.find(d => d.id === f.id);
          return def ? { ...f, color: def.color } : f;
        });
      }
      return defaults;
    } catch (e) {
      console.error('Failed to load saved filters', e);
      return [];
    }
  });

  // Recent searches state
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tools_recent_searches') || '[]');
    } catch (e) {
      console.error('Failed to load recent searches', e);
      return [];
    }
  });

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('tools_filters_open');
      return saved === 'true';
    } catch (_e) {
      return false;
    }
  });
  const searchContainerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('tools_filters_open', isFiltersOpen);
  }, [isFiltersOpen]);

  // Close recent searches on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addToRecentSearches = (term) => {
    if (!term || term.trim().length < 2) return;
    const trimmed = term.trim();
    const newRecent = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('tools_recent_searches', JSON.stringify(newRecent));
  };

  const handleApplySavedFilter = (savedFilter) => {
    handleClearAll();
    // Handle both new format (object) and legacy format (array of filters)
    const filtersToApply = Array.isArray(savedFilter) ? savedFilter : savedFilter.filters;
    const searchTermToApply = !Array.isArray(savedFilter) && savedFilter.searchTerm ? savedFilter.searchTerm : '';
    
    setSearchTerm(searchTermToApply);
    setDebouncedSearch(searchTermToApply);
    
    if (Array.isArray(filtersToApply)) {
      filtersToApply.forEach(f => handleAddFilter(f));
    }
  };

  const handleSaveFilter = (name) => {
     if (!name) return;
     const newFilter = {
       id: Date.now().toString(),
       name,
       searchTerm: searchTerm,
       filters: filters.map(f => ({ key: f.key, value: f.value }))
     };
     const updated = [...savedFilters, newFilter];
     setSavedFilters(updated);
     localStorage.setItem('tools_saved_filters_v1', JSON.stringify(updated));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6 p-4 md:p-6">
      <div className="space-y-4">
        {/* Search Bar - kept prominent */}
        <div>
          <label htmlFor="tools-search" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 sharp-text">
            {t('tools.search.label')}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1" ref={searchContainerRef}>
              <input
                id="tools-search"
                name="tools_search"
                type="text"
                placeholder={t('tools.search.placeholder')}
                value={searchTerm}
                ref={searchInputRef}
                autoComplete="off"
                spellCheck={false}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    setSearchTerm(''); 
                    setIsSearchFocused(false);
                    return; 
                  }
                  if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    setDebouncedSearch(searchTerm);
                    addToRecentSearches(searchTerm);
                    setIsSearchFocused(false);
                  }
                }}
                className="w-full pr-12 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sharp-text placeholder-slate-500 dark:placeholder-slate-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label={t('common.clearInput')}
                  title={t('common.clearInput')}
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-4 h-4"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              
              {/* Recent Searches Dropdown */}
              {isSearchFocused && recentSearches.length > 0 && !searchTerm && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                  <div className="py-2">
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 px-3 uppercase tracking-wider">
                      {t('search.recent') || 'Ostatnie wyszukiwania'}
                    </h4>
                    <ul>
                      {recentSearches.map((term, idx) => (
                        <li key={`${term}-${idx}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchTerm(term);
                              setDebouncedSearch(term);
                              addToRecentSearches(term);
                              setIsSearchFocused(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
                          >
                            <ClockIcon className="w-4 h-4 text-slate-400" />
                            {term}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className={`px-4 py-2 rounded-lg border flex items-center gap-2 font-medium transition-colors ${
                isFiltersOpen 
                  ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              <FunnelIcon className="w-5 h-5" />
              <span>{t('filters.title') || 'Filtry'}</span>
              {filters.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-bold px-2 py-0.5 rounded-full">
                  {filters.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Category Badges */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              !selectedCategory 
                ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-600' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
            }`}
          >
            {t('tools.filters.allCategories')}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              !selectedCategory 
                ? 'bg-white/20 text-white' 
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
            }`}>
              {allToolsCount}
            </span>
          </button>
          
          {categories.filter(c => c.count > 0).map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? '' : cat.name)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                selectedCategory === cat.name
                  ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
              }`}
            >
              {cat.name}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                selectedCategory === cat.name
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Filter Builder */}
        {isFiltersOpen && (
          <FilterBuilder 
            filters={filters}
            availableFilters={availableFilters}
            onAddFilter={handleAddFilter}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAll}
            savedFilters={savedFilters}
            onApplySavedFilter={handleApplySavedFilter}
            canSaveFilters={true}
            onSaveFilter={handleSaveFilter}
            hideTitle={true}
          />
        )}
      </div>

      {canExportTools && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
          <button
            type="button"
            onClick={exportListToPDF}
            className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:opacity-90 sharp-text text-sm font-medium"
          >
            {t('common.export.PDF')}
          </button>
          <button
            type="button"
            onClick={exportListToXLSX}
            className="px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 sharp-text text-sm font-medium"
          >
            {t('common.export.EXCEL')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ToolsFilter;
