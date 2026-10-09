import { useEffect, useState } from 'react';

export type DateRange = [from: string, to: string];

export type Route =
  | { name: 'dashboard' }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'equipment' }
  | { name: 'night'; date: string }
  | { name: 'compare'; a?: DateRange; b?: DateRange }
  | { name: 'report'; range?: DateRange };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-01-01..2026-01-30" → ['2026-01-01', '2026-01-30'] (validated, ordered), otherwise undefined. */
export function parseRange(value: string | null): DateRange | undefined {
  const m = value?.split('..');
  if (!m || m.length !== 2 || !DATE.test(m[0]!) || !DATE.test(m[1]!)) return undefined;
  return m[0]! <= m[1]! ? [m[0]!, m[1]!] : [m[1]!, m[0]!];
}
const rangeParam = (r: DateRange) => `${r[0]}..${r[1]}`;

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [head, arg] = path.split('/');
  const q = new URLSearchParams(query);
  if (head === 'import') return { name: 'import' };
  if (head === 'settings') return { name: 'settings' };
  if (head === 'equipment') return { name: 'equipment' };
  if (head === 'compare') return { name: 'compare', a: parseRange(q.get('a')), b: parseRange(q.get('b')) };
  if (head === 'report') return { name: 'report', range: parseRange(q.get('range')) };
  if (head === 'night' && arg && DATE.test(arg)) return { name: 'night', date: arg };
  return { name: 'dashboard' };
}

export const href = {
  dashboard: '#/',
  import: '#/import',
  settings: '#/settings',
  equipment: '#/equipment',
  night: (date: string) => `#/night/${date}`,
  compare: (a?: DateRange, b?: DateRange) => {
    const q = new URLSearchParams();
    if (a) q.set('a', rangeParam(a));
    if (b) q.set('b', rangeParam(b));
    return `#/compare${q.size ? `?${q}` : ''}`;
  },
  report: (range?: DateRange) => `#/report${range ? `?range=${rangeParam(range)}` : ''}`,
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
