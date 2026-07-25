import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME, COMPANY_NAME } from '../constants';
import { lightColors } from '../theme';
import Logo from '@/assets/logo.png';

export type SplashScreenProps = {
  /** 1 = fully visible, 0 = faded out */
  opacity?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Branded splash — dark blue background, logo, accent line.
 * Used as a boot overlay and available at `/splash`.
 */
export function SplashScreen({ opacity, style, testID }: SplashScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = lightColors;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity ? opacity.value : 1,
  }));

  return (
    <Animated.View
      testID={testID}
      entering={opacity ? undefined : FadeIn.duration(300)}
      style={[
        styles.root,
        {
          backgroundColor: colors.primary,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        animatedStyle,
        style,
      ]}
    >
      <View style={styles.center}>
        <Image
          source={Logo}
          style={{ height: 180, width: 280, resizeMode: 'contain' }}
        />

        <View
          style={[styles.accentLine, { backgroundColor: colors.secondary }]}
        />

        <Text style={[styles.title, { color: colors.text.inverse }]}>
          {APP_NAME}
        </Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>
          {COMPANY_NAME}
        </Text>
      </View>

      <Text style={[styles.footer, { color: colors.text.secondary }]}>
        Partner investment platform
      </Text>
    </Animated.View>
  );
}

/** Expo Router screen — splash route (boot overlay is primary path). */
export default function SplashRoute() {
  return <SplashScreen testID="splash-route" />;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  center: {
    alignItems: 'center',
  },
  accentLine: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    fontSize: 12,
  },
});
