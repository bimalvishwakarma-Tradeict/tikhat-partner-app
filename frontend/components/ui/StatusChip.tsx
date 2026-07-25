import { useEffect } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

export type StatusChipStatus =
  | 'pending'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'active'
  | 'verified'
  | 'rejected'
  | 'failed'
  | 'locked'
  | 'completed'
  | 'processed'
  | 'cancelled'
  | string;

export type StatusChipProps = {
  status: StatusChipStatus;
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isPendingStatus(normalized: string): boolean {
  return (
    normalized === 'submitted' ||
    normalized === 'pending' ||
    normalized === 'under_review'
  );
}

export function StatusChip({
  status,
  label,
  style,
  testID,
}: StatusChipProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const normalized = String(status).toLowerCase();
  const pending = isPendingStatus(normalized);
  const pulse = useSharedValue(1);

  let color = colors.pending;
  if (pending) {
    color = colors.pending;
  } else if (
    normalized === 'approved' ||
    normalized === 'active' ||
    normalized === 'verified'
  ) {
    color = colors.approved;
  } else if (
    normalized === 'rejected' ||
    normalized === 'failed' ||
    normalized === 'locked'
  ) {
    color = colors.rejected;
  } else if (normalized === 'completed' || normalized === 'processed') {
    color = colors.completed;
  } else if (normalized === 'cancelled') {
    color = colors.cancelled;
  }

  useEffect(() => {
    if (!pending) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.5, {
        duration: 900,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [pending, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.chip,
        {
          backgroundColor: `${color}1A`,
          borderColor: color,
          borderRadius: borderRadius.full,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
        },
        pending ? pulseStyle : null,
        style,
      ]}
    >
      <Animated.View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[typography.caption, { color, fontWeight: '600' }]}>
        {label || formatStatusLabel(normalized)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
