import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 3px golden accent line at the top (featured cards) */
  accent?: boolean;
  padded?: boolean;
  testID?: string;
};

export function Card({
  children,
  style,
  accent = false,
  padded = true,
  testID,
}: CardProps) {
  const { colors, spacing, borderRadius, isDark } = useTheme();

  return (
    <Animated.View
      testID={testID}
      entering={FadeIn.duration(220)}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderRadius: borderRadius.lg,
          padding: padded ? spacing.md : 0,
          shadowColor: colors.primary,
          borderColor: isDark ? colors.border : 'transparent',
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
        },
        style,
      ]}
    >
      {accent ? (
        <View
          style={[
            styles.accent,
            {
              backgroundColor: colors.secondary,
              borderTopLeftRadius: borderRadius.lg,
              borderTopRightRadius: borderRadius.lg,
            },
          ]}
        />
      ) : null}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    // Consistent card shadow: 0 2px 8px @ 8% (Task 25.4)
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
