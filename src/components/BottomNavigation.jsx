import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  HomeIcon,
  WrenchIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  FlagIcon
} from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';

const BottomNavigation = ({ onMenuToggle: _onMenuToggle, user }) => {
  const { t } = useLanguage();
  const isEmployee = String(user?.role) === 'employee';

  const navItems = [
    { path: '/dashboard', label: t('sidebar.dashboard'), icon: HomeIcon },
    { path: '/tools', label: t('sidebar.tools'), icon: WrenchIcon },
    { path: '/bhp', label: t('sidebar.bhp'), icon: ShieldCheckIcon },
    { path: '/report', label: t('sidebar.report'), icon: FlagIcon },
    // Only show employees tab if NOT an employee
    !isEmployee && { path: '/employees', label: t('sidebar.employees'), icon: UserGroupIcon },
  ].filter(Boolean);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 pb-safe">
      <nav className="flex justify-around items-center h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex flex-col items-center justify-center w-full h-full space-y-1
              ${isActive 
                ? 'text-indigo-600 dark:text-indigo-400' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}
            `}
          >
            <item.icon className="w-6 h-6" />
            <span className="text-[10px] font-medium truncate max-w-[80px]">
              {item.label}
            </span>
          </NavLink>
        ))}
        {/* 
        <button
          onClick={onMenuToggle}
          className="flex flex-col items-center justify-center w-full h-full space-y-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <Bars3Icon className="w-6 h-6" />
          <span className="text-[10px] font-medium">
            {t('sidebar.menu')}
          </span>
        </button>
        */}
      </nav>
    </div>
  );
};

export default BottomNavigation;
