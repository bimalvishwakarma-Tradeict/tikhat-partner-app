import { useContext } from 'react';
import { useColorScheme } from 'react-native';
import {
  ThemeContext,
  darkColors,
  lightColors,
  fonts,
  typography,
  spacing,
  borderRadius,
  type AppTheme,
} from '../theme';

export function useTheme(): AppTheme {
  const context = useContext(ThemeContext);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (context) {
    return context;
  }

  return {
    colors: isDark ? darkColors : lightColors,
    fonts,
    typography,
    spacing,
    borderRadius,
    isDark,
  };
}
