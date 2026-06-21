import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeMode     = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type AccentColor   = 'blue' | 'purple' | 'pink' | 'orange' | 'green' | 'teal' | 'violet' | 'mint' | 'amber' | 'rose';

interface AccentTokens {
  accent: string;
  accentH: string;
  accentBg: string;
  ring: string;
  navActive: string;
}

export interface AccentPreset {
  label: string;
  swatch: string;
  light: AccentTokens;
  dark: AccentTokens;
}

export const ACCENT_PRESETS: Record<AccentColor, AccentPreset> = {
  blue: {
    label: 'Blue',   swatch: '#0071e3',
    light: { accent: '#0071e3', accentH: '#0080ff', accentBg: 'rgba(0,113,227,0.10)',   ring: '0 0 0 3px rgba(0,113,227,0.20)',   navActive: 'rgba(0,113,227,0.10)'   },
    dark:  { accent: '#0a84ff', accentH: '#409cff', accentBg: 'rgba(10,132,255,0.15)',  ring: '0 0 0 3px rgba(10,132,255,0.25)',  navActive: 'rgba(10,132,255,0.12)'  },
  },
  purple: {
    label: 'Purple', swatch: '#8e8ce4',
    light: { accent: '#5856d6', accentH: '#6260dc', accentBg: 'rgba(88,86,214,0.10)',   ring: '0 0 0 3px rgba(88,86,214,0.20)',   navActive: 'rgba(88,86,214,0.10)'   },
    dark:  { accent: '#7d7aff', accentH: '#9290ff', accentBg: 'rgba(125,122,255,0.15)', ring: '0 0 0 3px rgba(125,122,255,0.25)', navActive: 'rgba(125,122,255,0.12)' },
  },
  pink: {
    label: 'Pink',   swatch: '#ff375f',
    light: { accent: '#ff375f', accentH: '#ff6482', accentBg: 'rgba(255,55,95,0.10)',   ring: '0 0 0 3px rgba(255,55,95,0.20)',   navActive: 'rgba(255,55,95,0.10)'   },
    dark:  { accent: '#ff375f', accentH: '#ff6482', accentBg: 'rgba(255,55,95,0.12)',   ring: '0 0 0 3px rgba(255,55,95,0.22)',   navActive: 'rgba(255,55,95,0.10)'   },
  },
  orange: {
    label: 'Orange', swatch: '#ff9500',
    light: { accent: '#ff9500', accentH: '#ff9f0a', accentBg: 'rgba(255,149,0,0.10)',   ring: '0 0 0 3px rgba(255,149,0,0.20)',   navActive: 'rgba(255,149,0,0.10)'   },
    dark:  { accent: '#ff9f0a', accentH: '#ffb340', accentBg: 'rgba(255,159,10,0.12)',  ring: '0 0 0 3px rgba(255,159,10,0.22)',  navActive: 'rgba(255,159,10,0.10)'  },
  },
  green: {
    label: 'Green',  swatch: '#34c759',
    light: { accent: '#34c759', accentH: '#30d158', accentBg: 'rgba(52,199,89,0.10)',   ring: '0 0 0 3px rgba(52,199,89,0.20)',   navActive: 'rgba(52,199,89,0.10)'   },
    dark:  { accent: '#30d158', accentH: '#40e070', accentBg: 'rgba(48,209,88,0.12)',   ring: '0 0 0 3px rgba(48,209,88,0.22)',   navActive: 'rgba(48,209,88,0.10)'   },
  },
  teal: {
    label: 'Teal',   swatch: '#32ade6',
    light: { accent: '#32ade6', accentH: '#4cc8f2', accentBg: 'rgba(50,173,230,0.10)',  ring: '0 0 0 3px rgba(50,173,230,0.20)',  navActive: 'rgba(50,173,230,0.10)'  },
    dark:  { accent: '#64d2ff', accentH: '#80daff', accentBg: 'rgba(100,210,255,0.12)', ring: '0 0 0 3px rgba(100,210,255,0.22)', navActive: 'rgba(100,210,255,0.10)' },
  },
  violet: {
    label: 'Violet', swatch: '#bf5af2',
    light: { accent: '#8944ab', accentH: '#9e52c5', accentBg: 'rgba(137,68,171,0.10)',  ring: '0 0 0 3px rgba(137,68,171,0.20)',  navActive: 'rgba(137,68,171,0.10)'  },
    dark:  { accent: '#bf5af2', accentH: '#d07ffa', accentBg: 'rgba(191,90,242,0.15)',  ring: '0 0 0 3px rgba(191,90,242,0.25)',  navActive: 'rgba(191,90,242,0.12)'  },
  },
  mint: {
    label: 'Mint',   swatch: '#00c7be',
    light: { accent: '#00897b', accentH: '#00a49a', accentBg: 'rgba(0,137,123,0.10)',   ring: '0 0 0 3px rgba(0,137,123,0.20)',   navActive: 'rgba(0,137,123,0.10)'   },
    dark:  { accent: '#63e6e2', accentH: '#80ebe8', accentBg: 'rgba(99,230,226,0.12)',  ring: '0 0 0 3px rgba(99,230,226,0.22)',  navActive: 'rgba(99,230,226,0.10)'  },
  },
  amber: {
    label: 'Amber',  swatch: '#f59e0b',
    light: { accent: '#d97706', accentH: '#b45309', accentBg: 'rgba(217,119,6,0.10)',   ring: '0 0 0 3px rgba(217,119,6,0.20)',   navActive: 'rgba(217,119,6,0.10)'   },
    dark:  { accent: '#fbbf24', accentH: '#fcd34d', accentBg: 'rgba(251,191,36,0.12)',  ring: '0 0 0 3px rgba(251,191,36,0.22)',  navActive: 'rgba(251,191,36,0.10)'  },
  },
  rose: {
    label: 'Rose',   swatch: '#f43f5e',
    light: { accent: '#e11d48', accentH: '#be123c', accentBg: 'rgba(225,29,72,0.10)',   ring: '0 0 0 3px rgba(225,29,72,0.20)',   navActive: 'rgba(225,29,72,0.10)'   },
    dark:  { accent: '#fb7185', accentH: '#fda4af', accentBg: 'rgba(251,113,133,0.12)', ring: '0 0 0 3px rgba(251,113,133,0.22)', navActive: 'rgba(251,113,133,0.10)' },
  },
};

function applyAccentTokens(accent: AccentColor, theme: ResolvedTheme): void {
  const t = ACCENT_PRESETS[accent][theme];
  const s = document.documentElement.style;
  s.setProperty('--accent',     t.accent);
  s.setProperty('--accent-h',   t.accentH);
  s.setProperty('--accent-bg',  t.accentBg);
  s.setProperty('--accent-text', t.accent);
  s.setProperty('--nav-active', t.navActive);
  s.setProperty('--input-ring', t.ring);
}

const THEME_KEY  = 'theme';
const ACCENT_KEY = 'theme-accent';

interface ThemeContextType {
  theme: ResolvedTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  mode: 'system',
  setMode: () => {},
  toggleTheme: () => {},
  accent: 'blue',
  setAccent: () => {},
});

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function getInitialAccent(): AccentColor {
  const stored = localStorage.getItem(ACCENT_KEY) as AccentColor;
  return stored && stored in ACCENT_PRESETS ? stored : 'blue';
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
  const [accent, setAccentState] = useState<AccentColor>(() => {
    const a = getInitialAccent();
    applyAccentTokens(a, resolveTheme(getInitialMode()));
    return a;
  });

  // Apply resolved theme + persist whenever mode changes.
  useEffect(() => {
    const resolved = resolveTheme(mode);
    setTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem(THEME_KEY, mode);
    // Re-apply accent tokens since dark/light values differ.
    applyAccentTokens(accent, resolved);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // While following the system, react to live OS changes.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      applyAccentTokens(accent, resolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, accent]);

  // Apply accent tokens whenever accent or resolved theme changes.
  useEffect(() => {
    applyAccentTokens(accent, theme);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [accent, theme]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggleTheme = useCallback(
    () => setModeState((m) => (resolveTheme(m) === 'dark' ? 'light' : 'dark')),
    [],
  );
  const setAccent = useCallback((a: AccentColor) => setAccentState(a), []);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
