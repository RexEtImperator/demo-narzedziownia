import React, { createContext, useContext, useState, useLayoutEffect } from 'react';
import pl from '../i18n/pl.json';
import en from '../i18n/en.json';
import de from '../i18n/de.json';

const dictionaries = { pl, en, de };

const resolveKey = (dict, key) => {
  if (!dict || !key) return key;
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return key;
    }
  }
  return typeof cur === 'string' ? cur : key;
};

const _tImmediate = (key) => {
  try {
    const lang = localStorage.getItem('language');
    const dict = dictionaries[lang] || dictionaries.pl;
    return resolveKey(dict, key);
  } catch (_) {
    return key;
  }
};

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback instead of throwing error to prevent crashes in edge cases
    return {
      isDarkMode: false,
      toggleTheme: () => {},
      theme: 'light'
    };
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useLayoutEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const temporarilyDisableTransitions = () => {
    const root = document.documentElement;
    root.classList.add('notransition');
    setTimeout(() => {
      root.classList.remove('notransition');
    }, 50);
  };

  const toggleTheme = () => {
    temporarilyDisableTransitions();
    setIsDarkMode(prev => !prev);
  };

  const value = {
    isDarkMode,
    toggleTheme,
    theme: isDarkMode ? 'dark' : 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
