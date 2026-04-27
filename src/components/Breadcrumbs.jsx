import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';

const Breadcrumbs = () => {
  const location = useLocation();
  const { t } = useLanguage();
  
  // Don't show breadcrumbs on dashboard
  if (location.pathname === '/dashboard' || location.pathname === '/') {
    return null;
  }

  const pathnames = location.pathname.split('/').filter((x) => x);

  const getBreadcrumbName = (name) => {
    // Try to match with known screen names from i18n
    const key = `screens.${name}`;
    const translated = t(key);
    
    // If translation returns key (meaning no translation found) or if it's an ID (simple heuristic)
    if (translated === key) {
      // Check if it's a known static route that might map differently
      const staticMap = {
        'app-config': t('screens.config'),
        'user-settings': t('screens.user-settings'),
        'db-viewer': t('screens.db-viewer'),
      };
      if (staticMap[name]) return staticMap[name];
      
      // If it looks like an ID (long string or numbers), maybe truncate or show "Szczegóły"
      // For now, just capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    
    return translated;
  };

  return (
    <nav className="shrink-0 flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4 px-4 pt-2">
      <Link 
        to="/dashboard" 
        className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center"
      >
        <HomeIcon className="w-4 h-4" />
      </Link>
      
      {pathnames.map((value, index) => {
        const last = index === pathnames.length - 1;
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const name = getBreadcrumbName(value);

        return (
          <div key={to} className="flex items-center">
            <ChevronRightIcon className="w-4 h-4 mx-1 text-gray-400" />
            {last ? (
              <span className="font-medium text-gray-900 dark:text-gray-200">
                {name}
              </span>
            ) : (
              <Link 
                to={to} 
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {name}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
