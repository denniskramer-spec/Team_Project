import { useCallback, useEffect, useState } from 'react';
import { load, save } from './storage.js';

// Dark (the default) or light, like Discord's two themes. The choice lives in
// this browser only (localStorage) and is applied to <html data-theme>.
const KEY = 'bm.theme';

export const getTheme = () => (load(KEY, 'dark') === 'light' ? 'light' : 'dark');

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => {
    applyTheme(theme);
    save(KEY, theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}
