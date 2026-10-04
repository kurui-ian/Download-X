import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('dlx-theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function applyTheme(mode: ThemeMode): boolean {
  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && isSystemDark);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  localStorage.setItem('dlx-theme', mode);

  if (window.electronAPI?.setNativeTheme) {
    window.electronAPI.setNativeTheme(mode).catch(() => {});
  }

  return isDark;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [isEffectiveDark, setIsEffectiveDark] = useState<boolean>(() => {
    const isSystemDark = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
    const initial = getStoredTheme();
    return initial === 'dark' || (initial === 'system' && isSystemDark);
  });

  const setTheme = useCallback((newMode: ThemeMode) => {
    setThemeState(newMode);
    const dark = applyTheme(newMode);
    setIsEffectiveDark(dark);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const dark = applyTheme('system');
        setIsEffectiveDark(dark);
      }
    };

    applyTheme(theme);

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    const next: ThemeMode = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, setTheme, isEffectiveDark, cycleTheme };
}
