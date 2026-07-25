import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'golden';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  textStyle,
  testID,
}: ButtonProps) {
  const { colors, typography, borderRadius, isDark } = useTheme();
  const scale = useSharedValue(1);
  const spin = useSharedValue(0);
  const isDisabled = disabled || loading;
  const secondaryFg = isDark ? colors.text.primary : colors.primary;

  const palette = {
    primary: {
      background: colors.primary,
      text: colors.text.inverse,
      border: colors.primary,
    },
    secondary: {
      background: 'transparent',
      text: secondaryFg,
      border: secondaryFg,
    },
    golden: {
      background: colors.secondary,
      text: colors.primary,
      border: colors.secondary,
    },
  }[variant];

  useEffect(() => {
    if (loading) {
      spin.value = 0;
      spin.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [loading, spin]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        if (!isDisabled) {
          scale.value = withTiming(0.97, { duration: 100 });
        }
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 100 });
      }}
      style={[
        styles.base,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderRadius: borderRadius.md,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <Animated.View style={spinnerStyle}>
          <Ionicons name="sync" size={22} color={palette.text} />
        </Animated.View>
      ) : (
        <Text
          style={[
            typography.button,
            { color: palette.text, textAlign: 'center' },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
