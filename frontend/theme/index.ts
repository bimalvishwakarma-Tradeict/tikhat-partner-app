import {
  createContext,
  createElement,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { darkColors, lightColors, type ThemeColors } from './colors';
import { borderRadius, spacing } from './spacing';
import { fonts, typography } from './typography';
import { useAuthStore } from '../store/authStore';

export type AppTheme = {
  colors: ThemeColors;
  fonts: typeof fonts;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  isDark: boolean;
};

export const ThemeContext = createContext<AppTheme | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themePreference = useAuthStore((s) => s.themePreference);
  const hydrateTheme = useAuthStore((s) => s.hydrateTheme);
  const isThemeHydrated = useAuthStore((s) => s.isThemeHydrated);

  useEffect(() => {
    if (!isThemeHydrated) {
      void hydrateTheme();
    }
  }, [hydrateTheme, isThemeHydrated]);

  const isDark = themePreference === 'dark';

  const theme = useMemo<AppTheme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      fonts,
      typography,
      spacing,
      borderRadius,
      isDark,
    }),
    [isDark]
  );

  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export { lightColors, darkColors } from './colors';
export type { ThemeColors } from './colors';
export { fonts, typography } from './typography';
export { spacing, borderRadius } from './spacing';
