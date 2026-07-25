import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/authStore';

export type ThemeToggleProps = {
  testID?: string;
};

/**
 * Sun/Moon header control — toggles light/dark preference instantly.
 */
export function ThemeToggle({ testID }: ThemeToggleProps) {
  const { colors, isDark, spacing } = useTheme();
  const toggleTheme = useAuthStore((s) => s.toggleTheme);

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        void toggleTheme();
      }}
      hitSlop={10}
      style={[styles.wrap, { marginRight: spacing.sm }]}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Ionicons
        name={isDark ? 'sunny' : 'moon'}
        size={22}
        color={colors.text.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
});
