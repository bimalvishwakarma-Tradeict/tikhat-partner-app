import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'golden'
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export type BadgeProps = {
  label: string | number;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Badge({
  label,
  variant = 'default',
  style,
  testID,
}: BadgeProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  const tones: Record<
    BadgeVariant,
    { background: string; text: string }
  > = {
    default: {
      background: colors.surface,
      text: colors.text.primary,
    },
    primary: {
      background: colors.primary,
      text: colors.text.inverse,
    },
    golden: {
      background: colors.secondary,
      text: colors.primary,
    },
    success: {
      background: `${colors.success}22`,
      text: colors.success,
    },
    error: {
      background: `${colors.error}22`,
      text: colors.error,
    },
    warning: {
      background: `${colors.warning}22`,
      text: colors.warning,
    },
    info: {
      background: `${colors.completed}22`,
      text: colors.completed,
    },
  };

  const tone = tones[variant];

  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        {
          backgroundColor: tone.background,
          borderRadius: borderRadius.full,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
        },
        style,
      ]}
    >
      <Text style={[typography.caption, { color: tone.text, fontWeight: '600' }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
