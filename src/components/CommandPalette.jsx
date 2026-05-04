import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  MagnifyingGlassIcon, 
  WrenchScrewdriverIcon, 
  ShieldCheckIcon, 
  UserGroupIcon, 
  HomeIcon,
  XMarkIcon,
  Cog6ToothIcon,
  ArrowRightIcon,
  CommandLineIcon,
  ArrowsUpDownIcon,
  UserCircleIcon,
  FlagIcon
} from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';
import { PERMISSIONS, hasPermission } from '../constants';

const CommandPalette = ({ 
  isOpen, 
  onClose, 
  tools = [], 
  employees = [], 
  bhpItems = [], 
  user,
  onNavigate 
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Track open state for reset
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }

  // Handle focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredResults = useMemo(() => {
    const pages = [
      { type: 'page', id: 'dashboard', title: t('sidebar.dashboard') || 'Strona główna', icon: HomeIcon, path: 'dashboard' },
      { type: 'page', id: 'report', title: t('sidebar.report') || 'Zgłoszenia', icon: FlagIcon, path: 'report' },
      { type: 'page', id: 'tools', title: t('sidebar.tools') || 'Narzędzia', icon: WrenchScrewdriverIcon, path: 'tools' },
      { type: 'page', id: 'bhp', title: t('sidebar.bhp') || 'BHP', icon: ShieldCheckIcon, path: 'bhp' },
      { type: 'page', id: 'user-settings', title: t('sidebar.userSettings') || 'Ustawienia użytkownika', icon: UserCircleIcon, path: 'user-settings' },
    ];

    if (hasPermission(user, PERMISSIONS.VIEW_EMPLOYEES)) {
      pages.push({ type: 'page', id: 'employees', title: t('sidebar.employees') || 'Pracownicy', icon: UserGroupIcon, path: 'employees' });
    }

    if (hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS)) {
      pages.push({ type: 'page', id: 'settings', title: t('sidebar.settings') || 'Ustawienia', icon: Cog6ToothIcon, path: 'settings' });
    }

    if (!query.trim()) {
      return pages;
    }

    const q = query.toLowerCase();
    const results = [];
    
    pages.forEach(page => {
      if (page.title.toLowerCase().includes(q)) {
        results.push(page);
      }
    });

    // Tools
    tools.slice(0, 50).forEach(tool => {
      if (
        (tool.name && tool.name.toLowerCase().includes(q)) ||
        (tool.model && tool.model.toLowerCase().includes(q)) ||
        (tool.inventory_number && tool.inventory_number.toLowerCase().includes(q))
      ) {
        results.push({
          type: 'tool',
          id: tool.id,
          title: `${tool.name} ${tool.model || ''}`,
          subtitle: tool.inventory_number,
          icon: WrenchScrewdriverIcon,
          data: tool
        });
      }
    });

    // BHP
    bhpItems.slice(0, 50).forEach(item => {
      if (
        (item.manufacturer && item.manufacturer.toLowerCase().includes(q)) ||
        (item.model && item.model.toLowerCase().includes(q)) ||
        (item.inventory_number && item.inventory_number.toLowerCase().includes(q))
      ) {
        results.push({
          type: 'bhp',
          id: item.id,
          title: `${item.manufacturer} ${item.model || ''}`,
          subtitle: item.inventory_number,
          icon: ShieldCheckIcon,
          data: item
        });
      }
    });

    // Employees
    if (hasPermission(user, PERMISSIONS.VIEW_EMPLOYEES)) {
      employees.slice(0, 50).forEach(emp => {
        const fullName = `${emp.first_name} ${emp.last_name}`;
        if (
          (fullName.toLowerCase().includes(q)) ||
          (emp.brand_number && emp.brand_number.toLowerCase().includes(q))
        ) {
          results.push({
            type: 'employee',
            id: emp.id,
            title: fullName,
            subtitle: emp.brand_number,
            icon: UserGroupIcon,
            data: emp
          });
        }
      });
    }

    return results.slice(0, 20); // Limit total results
  }, [query, tools, employees, bhpItems, t, user]);

  const handleSelect = useCallback((item) => {
    if (item.type === 'page') {
      onNavigate(item.path);
    } else if (item.type === 'tool') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'tools', q: item.subtitle || item.title } }));
    } else if (item.type === 'bhp') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'bhp', q: item.subtitle || item.title } }));
    } else if (item.type === 'employee') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'employees', q: item.subtitle || item.title } }));
    }
    onClose();
  }, [onNavigate, onClose]);

  // Handle keyboard navigation for list
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % filteredResults.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + filteredResults.length) % filteredResults.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredResults[activeIndex]) {
          handleSelect(filteredResults[activeIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredResults, activeIndex, handleSelect]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && listRef.current.children[activeIndex]) {
      listRef.current.children[activeIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto p-4 sm:p-6 md:p-20" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-500 bg-opacity-25 dark:bg-black dark:bg-opacity-50 transition-opacity backdrop-blur-sm" 
        onClick={onClose}
      />

      <div className="mx-auto max-w-xl transform divide-y divide-gray-100 dark:divide-slate-700 overflow-hidden rounded-xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-3.5 left-4 h-5 w-5 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-0 sm:text-sm"
            placeholder={t('common.search') || 'Szukaj...'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
          />
          <div className="absolute top-3.5 right-4 flex items-center gap-2">
             <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 dark:border-gray-600 px-1 font-sans text-xs text-gray-400 dark:text-gray-500">Esc</kbd>
             <button onClick={onClose} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <XMarkIcon className="h-5 w-5" />
             </button>
          </div>
        </div>

        {filteredResults.length > 0 && (
          <ul ref={listRef} className="max-h-80 scroll-py-2 overflow-y-auto py-2 text-sm text-gray-800 dark:text-gray-200" id="options" role="listbox">
            {filteredResults.map((item, index) => (
              <li
                key={`${item.type}-${item.id}`}
                className={`cursor-default select-none px-4 py-2 ${
                  index === activeIndex ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => handleSelect(item)}
              >
                <div className="flex items-center">
                  <item.icon className={`h-6 w-6 flex-none ${index === activeIndex ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`} aria-hidden="true" />
                  <div className="ml-3 flex-auto truncate">
                    <span className={`truncate font-medium ${index === activeIndex ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className={`ml-2 truncate ${index === activeIndex ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                  {index === activeIndex && (
                    <ArrowRightIcon className="h-5 w-5 flex-none text-white" />
                  )}
                  {item.type === 'page' && index !== activeIndex && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t('common.jumpTo') || 'Przejdź'}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {query !== '' && filteredResults.length === 0 && (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">{t('common.noResults') || 'Brak wyników.'}</p>
        )}

        <div className="flex flex-wrap items-center bg-gray-50 dark:bg-slate-900 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-400 gap-2 border-t border-gray-100 dark:border-gray-700">
           <span className="flex items-center gap-1"><CommandLineIcon className="w-5 h-5"/> <span>{t('topbar.searchBar.type') || 'Type to search'}</span></span>
           <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
           <span className="flex items-center gap-1"><kbd className="font-sans border rounded px-1 border-gray-300 dark:border-gray-600"><ArrowsUpDownIcon className="w-4 h-4"/></kbd> <span>{t('topbar.searchBar.navigate') || 'Navigate'}</span></span>
           <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
           <span className="flex items-center gap-1"><kbd className="font-sans border rounded px-1 border-gray-300 dark:border-gray-600">Enter</kbd> <span>{t('topbar.searchBar.select') || 'Select'}</span></span>
           <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
           <span className="flex items-center gap-1"><kbd className="font-sans border rounded px-1 border-gray-300 dark:border-gray-600">Esc</kbd> <span>{t('topbar.searchBar.close') || 'Close'}</span></span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;
