import { formatTimeAgo, formatDate, formatDateOnly } from '../../utils/dateUtils';

const setLang = (lang) => {
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k) => (k === 'language' ? lang : null),
      setItem: () => {}
    },
    configurable: true
  });
};

test('formatTimeAgo returns Just now in EN', () => {
  setLang('en');
  const now = new Date();
  expect(formatTimeAgo(now.toISOString())).toBe('Just now');
});

test('formatTimeAgo pluralization PL minutes', () => {
  setLang('pl');
  const now = new Date();
  const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  expect(formatTimeAgo(twoMinAgo)).toMatch('minuty temu');
  expect(formatTimeAgo(fiveMinAgo)).toMatch('minut temu');
});

test('formatTimeAgo hours PL forms', () => {
  setLang('pl');
  const oneHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const threeHours = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  expect(formatTimeAgo(oneHour)).toMatch('godzina temu');
  expect(formatTimeAgo(threeHours)).toMatch('godziny temu');
});

test('formatDateOnly unknown for invalid', () => {
  setLang('de');
  expect(formatDateOnly('not-a-date')).toBe('Unbekanntes Datum');
});

test('formatDate returns localized string', () => {
  setLang('pl');
  const s = formatDate('2020-06-01T08:30:00Z');
  expect(typeof s).toBe('string');
  expect(s.length).toBeGreaterThan(5);
});

test('formatTimeAgo days vs date boundary EN', () => {
  setLang('en');
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  expect(formatTimeAgo(sixDaysAgo)).toMatch('6 days ago');
  const formatted = formatDateOnly(eightDaysAgo);
  expect(formatTimeAgo(eightDaysAgo)).toBe(formatted);
});

test('formatTimeAgo days PL forms', () => {
  setLang('pl');
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  expect(formatTimeAgo(oneDayAgo)).toMatch('dzień temu');
  expect(formatTimeAgo(twoDaysAgo)).toMatch('dni temu');
});