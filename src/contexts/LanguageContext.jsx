import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import pl from '../i18n/pl.json';
import en from '../i18n/en.json';
import cz from '../i18n/cz.json';
import de from '../i18n/de.json';

const dictionaries = { pl, en, cz, de };

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function interpolate(template, params) {
  if (!template || typeof template !== 'string') return template;
  let result = template;
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      const re = new RegExp(`{${escapeRegExp(key)}}`, 'g');
      result = result.replace(re, String(value));
    }
  }
  return result;
}

function resolveKey(dict, key) {
  if (!dict || !key) return key;
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return key; // fallback to key when missing
    }
  }
  return typeof cur === 'string' ? cur : key;
}

const LanguageContext = createContext({
  language: 'pl',
  setLanguage: () => {},
  t: (k, params) => (params ? interpolate(k, params) : k),
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('pl');
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const stored = localStorage.getItem('language');
        if (stored && dictionaries[stored]) {
          if (mounted) setLanguageState(stored);
        }
        const hasDateFormat = !!localStorage.getItem('dateFormat');
        const hasTimezone = !!localStorage.getItem('timezone');
        if (stored && dictionaries[stored] && hasDateFormat && hasTimezone) return;
        const general = await api.get('/api/config/general', { skipAuth: true });
        const lang = general?.language;
        if (lang && dictionaries[lang]) {
          if (mounted) {
            setLanguageState(lang);
            localStorage.setItem('language', lang);
          }
        }
        if (general?.dateFormat) {
          localStorage.setItem('dateFormat', general.dateFormat);
        }
        if (general?.timezone) {
          localStorage.setItem('timezone', general.timezone);
        }
      } catch (_err) {
        // silent fallback to default 'pl'
      }
    };
    init();
    const onLangChanged = (e) => {
      const lang = e?.detail?.language;
      if (lang && dictionaries[lang]) {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
      }
    };
    window.addEventListener('language:changed', onLangChanged);
    return () => {
      mounted = false;
      window.removeEventListener('language:changed', onLangChanged);
    };
  }, []);

  // Get translation overrides from backend for current language
  useEffect(() => {
    let ignore = false;
    const loadOverrides = async () => {
      try {
        const resp = await api.get(`/api/translations/${language}`, { skipAuth: true });
        const map = resp?.translations || {};
        if (!ignore) setOverrides(map);
      } catch (_) {
        if (!ignore) setOverrides({});
      }
    };
    loadOverrides();
    return () => { ignore = true; };
  }, [language]);

  const setLanguage = (lang) => {
    if (dictionaries[lang]) {
      setLanguageState(lang);
      localStorage.setItem('language', lang);
      window.dispatchEvent(new CustomEvent('language:changed', { detail: { language: lang } }));
    }
  };

  const t = useMemo(() => {
    const dict = dictionaries[language] || dictionaries.pl;
    return (key, params) => {
      // Only use database overrides if they have a non-empty value
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
      const candidate = hasOverride ? overrides[key] : undefined;
      const candidateStr = (typeof candidate === 'string') ? candidate.trim() : undefined;
      const useOverride = candidateStr && candidateStr.length > 0 && candidateStr !== key;
      const raw = useOverride ? candidateStr : resolveKey(dict, key);
      
      // Support defaultValue if translation is missing (raw === key)
      if (raw === key && params && params.defaultValue) {
        return params.defaultValue;
      }

      return interpolate(raw, params);
    };
  }, [language, overrides]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);
  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export default LanguageContext;
