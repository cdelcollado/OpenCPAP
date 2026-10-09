import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'night'; date: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]!;
  const [head, arg] = path.split('/');
  if (head === 'import') return { name: 'import' };
  if (head === 'settings') return { name: 'settings' };
  if (head === 'night' && arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return { name: 'night', date: arg };
  return { name: 'dashboard' };
}

export const href = {
  dashboard: '#/',
  import: '#/import',
  settings: '#/settings',
  night: (date: string) => `#/night/${date}`,
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
