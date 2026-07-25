import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { APP_NAME } from '../../constants';

export type AppLoaderProps = {
  message?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Full-screen dark blue loader with golden spinning indicator.
 */
export function AppLoader({
  message,
  style,
  testID,
}: AppLoaderProps) {
  const { colors, typography, spacing } = useTheme();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        { backgroundColor: colors.primary },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.spinner,
          {
            borderColor: colors.secondary,
            borderTopColor: colors.primary,
          },
          spinStyle,
        ]}
      />
      <Text
        style={[
          typography.title,
          {
            color: colors.secondary,
            marginTop: spacing.lg,
            letterSpacing: 0.5,
          },
        ]}
      >
        {APP_NAME}
      </Text>
      {message ? (
        <Text
          style={[
            typography.subtitle,
            {
              color: colors.text.inverse,
              marginTop: spacing.sm,
              opacity: 0.8,
            },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
  },
});
