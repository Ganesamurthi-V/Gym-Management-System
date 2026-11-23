import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { themeColors, type ThemeColors } from './tokens';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gymflow_theme_preference';

type ThemeContextValue = {
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(v: string | null): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  // Default is light (dark is opt-in), like the web admin.
  const [preference, setPreferenceState] = useState<ThemePreference>('light');

  useEffect(() => {
    setColorScheme('light');
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        if (isPreference(stored)) {
          setPreferenceState(stored);
          setColorScheme(stored);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      setColorScheme(p);
      AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
    },
    [setColorScheme],
  );

  const scheme: 'light' | 'dark' = colorScheme === 'dark' ? 'dark' : 'light';
  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, preference, setPreference, colors: themeColors[scheme] }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside ThemeProvider');
  return ctx;
}
