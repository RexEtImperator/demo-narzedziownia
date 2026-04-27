const getLanguage = () => {
  const lang = typeof window !== 'undefined' ? window.localStorage.getItem('language') : null;
  return lang === 'en' || lang === 'de' || lang === 'cz' ? lang : 'pl';
};

const getLocale = (lang) => {
  switch (lang) {
    case 'en':
      return 'en-GB';
    case 'de':
      return 'de-DE';
    case 'cz':
      return 'cs-CZ';
    default:
      return 'pl-PL';
  }
};

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

const pluralCategoryPl = (n) => {
  if (n === 1) return 'one';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'few';
  return 'many';
};

const formatUnit = (lang, unit, count) => {
  if (lang === 'pl') {
    const cat = pluralCategoryPl(count);
    if (unit === 'minutes') {
      if (cat === 'one') return `${count} minuta temu`;
      if (cat === 'few') return `${count} minuty temu`;
      return `${count} minut temu`;
    }
    if (unit === 'hours') {
      if (cat === 'one') return `${count} godzina temu`;
      if (cat === 'few') return `${count} godziny temu`;
      return `${count} godzin temu`;
    }
    if (unit === 'days') {
      if (cat === 'one') return `${count} dzień temu`;
      return `${count} dni temu`;
    }
  }
  if (lang === 'en') {
    const isOne = count === 1;
    if (unit === 'minutes') return `${count} ${isOne ? 'minute' : 'minutes'} ago`;
    if (unit === 'hours') return `${count} ${isOne ? 'hour' : 'hours'} ago`;
    if (unit === 'days') return `${count} ${isOne ? 'day' : 'days'} ago`;
  }
  if (lang === 'cz') {
    if (unit === 'minutes') return `před ${count} minutami`;
    if (unit === 'hours') return `před ${count} hodinami`;
    if (unit === 'days') return `před ${count} dny`;
  }
  // de
  if (unit === 'minutes') return `vor ${count} ${count === 1 ? 'Minute' : 'Minuten'}`;
  if (unit === 'hours') return `vor ${count} ${count === 1 ? 'Stunde' : 'Stunden'}`;
  if (unit === 'days') return `vor ${count} ${count === 1 ? 'Tag' : 'Tagen'}`;
  return '';
};

const getTimeZone = () => {
  const tz = typeof window !== 'undefined' ? window.localStorage.getItem('timezone') : null;
  return tz || 'Europe/Warsaw';
};

const getDateFormat = () => {
  const fmt = typeof window !== 'undefined' ? window.localStorage.getItem('dateFormat') : null;
  return fmt || 'DD/MM/YYYY HH:mm:ss';
};

const getDateParts = (date, lang, timeZone) => {
  const locale = getLocale(lang);
  try {
    const dtf = new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const monthLong = new Intl.DateTimeFormat(locale, { timeZone, month: 'long' }).format(date);
    map.monthLong = monthLong;
    return map;
  } catch (_) {
    const pad = (n) => String(n).padStart(2, '0');
    return {
      year: String(date.getFullYear()),
      month: pad(date.getMonth() + 1),
      day: pad(date.getDate()),
      hour: pad(date.getHours()),
      minute: pad(date.getMinutes()),
      second: pad(date.getSeconds()),
      monthLong: date.toLocaleDateString(locale, { month: 'long' })
    };
  }
};

const applyDateFormat = (date, format, lang, timeZone) => {
  const p = getDateParts(date, lang, timeZone);
  const replacements = {
    MMMM: p.monthLong,
    YYYY: p.year,
    DD: p.day,
    MM: p.month,
    HH: p.hour,
    mm: p.minute,
    ss: p.second
  };
  return String(format || '')
    .replace(/MMMM|YYYY|DD|MM|HH|mm|ss/g, (token) => (replacements[token] ?? token));
};

const isIsoDateOnly = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

const dateFromIsoDateOnly = (isoDateOnly) => {
  const [y, m, d] = isoDateOnly.trim().split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return isValidDate(dt) ? dt : null;
};

const normalizeDbDateTimeToIso = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/);
  if (!m) return null;
  const datePart = m[1];
  const timePart = m[2];
  const ms = m[3] ? String(m[3]).padEnd(3, '0') : null;
  const tzRaw = m[4] ? String(m[4]) : null;
  const tz = tzRaw
    ? (tzRaw === 'Z' ? 'Z' : (tzRaw.includes(':') ? tzRaw : `${tzRaw.slice(0, 3)}:${tzRaw.slice(3)}`))
    : 'Z';
  return `${datePart}T${timePart}${ms ? `.${ms}` : ''}${tz}`;
};

const parseDateFlexible = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isValidDate(value) ? value : null;
  if (isIsoDateOnly(value)) return dateFromIsoDateOnly(value);
  const iso = normalizeDbDateTimeToIso(value);
  const d = iso ? new Date(iso) : new Date(value);
  return isValidDate(d) ? d : null;
};

export const formatTimeAgo = (dateString) => {
  const lang = getLanguage();
  if (!dateString) return lang === 'en' ? 'Unknown date' : lang === 'de' ? 'Unbekanntes Datum' : lang === 'cz' ? 'Neznámé datum' : 'Nieznana data';

  const now = new Date();
  const date = parseDateFlexible(dateString);
  if (!isValidDate(date)) return lang === 'en' ? 'Unknown date' : lang === 'de' ? 'Unbekanntes Datum' : lang === 'cz' ? 'Neznámé datum' : 'Nieznana data';

  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return lang === 'en' ? 'Just now' : lang === 'de' ? 'Gerade eben' : lang === 'cz' ? 'Právě teď' : 'Przed chwilą';
  } else if (diffInMinutes < 60) {
    return formatUnit(lang, 'minutes', diffInMinutes);
  } else if (diffInHours < 24) {
    return formatUnit(lang, 'hours', diffInHours);
  } else if (diffInDays < 7) {
    return formatUnit(lang, 'days', diffInDays);
  } else {
    const timeZone = isIsoDateOnly(dateString) ? 'UTC' : getTimeZone();
    const dateOnlyFormat = getDateFormat().split(' ')[0] || 'DD/MM/YYYY';
    return applyDateFormat(date, dateOnlyFormat, lang, timeZone);
  }
};

export const formatDate = (dateString) => {
  const lang = getLanguage();
  if (!dateString) return lang === 'en' ? 'Unknown date' : lang === 'de' ? 'Unbekanntes Datum' : lang === 'cz' ? 'Neznámé datum' : 'Nieznana data';

  const date = parseDateFlexible(dateString);
  if (!isValidDate(date)) return lang === 'en' ? 'Unknown date' : lang === 'de' ? 'Unbekanntes Datum' : lang === 'cz' ? 'Neznámé datum' : 'Nieznana data';
  const format = getDateFormat();
  const timeZone = getTimeZone();
  return applyDateFormat(date, format, lang, timeZone);
};

export const formatDateOnly = (dateString) => {
  const lang = getLanguage();
  if (!dateString) return lang === 'en' ? 'Unknown date' : lang === 'de' ? 'Unbekanntes Datum' : lang === 'cz' ? 'Neznámé datum' : 'Nieznana data';

  const date = parseDateFlexible(dateString);
  if (!isValidDate(date)) return lang === 'en' ? 'Unknown date' : lang === 'de' ? 'Unbekanntes Datum' : lang === 'cz' ? 'Neznámé datum' : 'Nieznana data';
  const dateOnlyFormat = getDateFormat().split(' ')[0] || 'DD/MM/YYYY';
  const timeZone = isIsoDateOnly(dateString) ? 'UTC' : getTimeZone();
  return applyDateFormat(date, dateOnlyFormat, lang, timeZone);
};

export const toDbTimestampUtc = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!isValidDate(date)) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ') + '+00';
};
