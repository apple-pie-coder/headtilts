import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// The visitor's chosen preference. 'system' follows the OS setting live.
export type ThemeMode = 'system' | 'light' | 'dark';
// The actual theme applied to the document (never 'system').
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  /** Resolved theme currently applied ('light' | 'dark'). */
  theme: ResolvedTheme;
  /** Visitor preference ('system' | 'light' | 'dark'). */
  mode: ThemeMode;
  /** Set the preference. */
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  mode: 'system',
  setMode: () => {},
});

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemTheme() : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const m = getInitialMode();
    document.documentElement.dataset.theme = resolveTheme(m);
    return m;
  });
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(getInitialMode()));

  // Apply the resolved theme + persist the preference whenever mode changes.
  useEffect(() => {
    const resolved = resolveTheme(mode);
    setTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // While following the system, react to live OS changes.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
