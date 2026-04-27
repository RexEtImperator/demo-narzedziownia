import React from 'react';
import { QuestionMarkCircleIcon, XMarkIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';
import { ROLES } from '../constants';

export const HelpButton = ({ onClick, ...props }) => {
  const { t } = useLanguage();
  return (
    <button 
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" 
      onClick={onClick}
      title={t('common.help.title') || 'Pomoc'}
      {...props}
    >
      <QuestionMarkCircleIcon className="w-6 h-6 text-gray-500 dark:text-gray-300" />
    </button>
  );
};

export const HelpPanel = ({ isOpen, onClose, user }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const articles = [
    {
      id: 1,
      title: 'Wprowadzenie do systemu',
      description: 'Przewodnik.',
      category: 'Pracownik',
      roles: [ROLES.ADMIN, ROLES.EMPLOYEE]
    },
    {
      id: 2,
      title: 'Jak wydać narzędzie?',
      description: 'Przewodnik krok po kroku jak wydać narzędzie pracownikowi przez komputer.',
      category: 'Narzędziownia',
      roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TOOLSMASTER]
    },
    {
      id: 3,
      title: 'Jak wydać narzędzie?',
      description: 'Przewodnik krok po kroku jak wydać narzędzie pracownikowi przez telefon.',
      category: 'Narzędziownia',
      roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TOOLSMASTER]
    },
    {
      id: 4,
      title: 'Jak dodać pracownika?',
      description: 'Instrukcja dodawania nowego pracownika do systemu.',
      category: 'Pracownicy',
      roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TOOLSMASTER, ROLES.HR]
    },
    {
      id: 5,
      title: 'Generowanie raportów',
      description: 'Jak wygenerować raport PDF w różnych częściach systemu.',
      category: 'Raporty',
      roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TOOLSMASTER]
    },
    {
      id: 6,
      title: 'Skanowanie kodów QR/kreskowych',
      description: 'Rozwiązywanie problemów ze skanerem kodów.',
      category: 'Sprzęt',
      roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TOOLSMASTER]
    }
  ];

  const normalizeRole = (role) => {
    const r = String(role || '').toLowerCase();
    if (r === 'administrator' || r === 'admin') return ROLES.ADMIN;
    if (r === 'manager') return ROLES.MANAGER;
    if (r === 'toolsmaster') return ROLES.TOOLSMASTER;
    if (r === 'hr') return ROLES.HR;
    if (r === 'supervisor') return ROLES.SUPERVISOR;
    if (r === 'engineer') return ROLES.ENGINEER;
    if (r === 'employee') return ROLES.EMPLOYEE;
    if (r === 'user') return ROLES.USER;
    return r;
  };

  const effectiveRole = normalizeRole(user?.role || ROLES.USER);
  const visibleArticles = articles.filter((article) => {
    if (!Array.isArray(article.roles)) return true;
    return article.roles.includes(effectiveRole);
  });

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]" 
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 w-120 h-screen bg-white dark:bg-gray-800 shadow-2xl p-6 z-[61] transform transition-transform duration-300 ease-in-out border-l border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpenIcon className="w-5 h-5 text-indigo-500" />
            {t('common.help.title') || 'Pomoc'}
          </h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {visibleArticles.length > 0 ? (
            visibleArticles.map(article => (
              <article 
                key={article.id} 
                className="p-3 bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all group"
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {article.title}
                  </h4>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">
                      {article.category}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {article.description}
                </p>
              </article>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              {t('common.noResults') || 'Brak artykułów pomocy dla Twojej roli'}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            {t('common.help.helpMore') || 'Potrzebujesz więcej pomocy?'}<br/>
            {t('common.help.contactAdmin') || 'Skontaktuj się z administratorem'}
          </p>
        </div>
      </aside>
    </>
  );
};
