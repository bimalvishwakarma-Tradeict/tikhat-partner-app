import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

export type SkeletonProps = {
  width?: number | `${number}%` | 'auto';
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shimmer skeleton — 1.2s loop matching content shape.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  style,
  testID,
}: SkeletonProps) {
  const { colors, borderRadius: radii } = useTheme();
  const progress = useSharedValue(0);
  const radius = borderRadius ?? radii.sm;

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0.45, 1]);
    const translateX = interpolate(progress.value, [0, 1], [-24, 24]);
    return {
      opacity,
      transform: [{ translateX }],
    };
  });

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.skeleton.background,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.skeleton.shimmer,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

export type SkeletonGroupProps = {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  gap = 8,
  style,
}: SkeletonGroupProps) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={`skeleton-line-${index}`}
          height={lineHeight}
          width={index === lines - 1 ? '68%' : '100%'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'relative',
  },
});
