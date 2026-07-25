import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Button, type ButtonVariant } from './Button';

export type EmptyStateProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  ctaLabel?: string;
  onCtaPress?: () => void;
  ctaVariant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function EmptyState({
  title,
  subtitle,
  icon,
  ctaLabel,
  onCtaPress,
  ctaVariant = 'primary',
  style,
  testID,
}: EmptyStateProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  return (
    <View testID={testID} style={[styles.container, { padding: spacing.lg }, style]}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: colors.surface,
            borderRadius: borderRadius.full,
            marginBottom: spacing.md,
          },
        ]}
      >
        {icon ?? (
          <View
            style={[
              styles.fallbackIcon,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          />
        )}
      </View>

      <Text
        style={[
          typography.h3,
          { color: colors.text.primary, textAlign: 'center', marginBottom: spacing.xs },
        ]}
      >
        {title}
      </Text>

      {subtitle ? (
        <Text
          style={[
            typography.body,
            {
              color: colors.text.secondary,
              textAlign: 'center',
              marginBottom: spacing.lg,
              maxWidth: 320,
            },
          ]}
        >
          {subtitle}
        </Text>
      ) : (
        <View style={{ height: spacing.lg }} />
      )}

      {ctaLabel && onCtaPress ? (
        <View style={styles.cta}>
          <Button
            title={ctaLabel}
            onPress={onCtaPress}
            variant={ctaVariant}
            fullWidth
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  cta: {
    width: '100%',
    maxWidth: 280,
  },
});
