import { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const HOME_HREF = '/(auth)' as Href;
const FALLBACK_TIMEOUT_MS = 4000;
const SPLASH_BG = '#0A1628';

export type SplashScreenProps = {
  /** 1 = fully visible, 0 = faded out (boot overlay from root layout) */
  opacity?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Full-screen splash video. Used as boot overlay and at `/splash`.
 */
export function SplashScreen({ opacity, style, testID }: SplashScreenProps) {
  const router = useRouter();
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;

    // Boot overlay: root layout dismisses via opacity fade — skip route replace.
    if (opacity) {
      return;
    }

    try {
      router.replace(HOME_HREF);
    } catch {
      // Ignore navigation errors if already transitioning.
    }
  }, [opacity, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      finish();
    }, FALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [finish]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        return;
      }
      if (status.didJustFinish) {
        finish();
      }
    },
    [finish]
  );

  const rootStyle = useAnimatedStyle(() => ({
    opacity: opacity ? opacity.value : 1,
  }));

  return (
    <Animated.View
      testID={testID}
      style={[styles.root, { backgroundColor: SPLASH_BG }, rootStyle, style]}
    >
      <View style={styles.videoWrap}>
        <Video
          source={require('@/assets/Splash.mp4')}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping={false}
          isMuted
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      </View>
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
    zIndex: 10000,
    elevation: 10000,
  },
  videoWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: SPLASH_BG,
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
