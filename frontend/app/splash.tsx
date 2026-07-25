import { useCallback, useEffect, useRef, useState } from 'react';
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
const FALLBACK_TIMEOUT_MS = 15000;
const SPLASH_BG = '#0A1628';

export type SplashScreenProps = {
  /** 1 = fully visible, 0 = faded out (boot overlay from root layout) */
  opacity?: SharedValue<number>;
  /** Called when video finishes (or fallback timeout) — used by boot overlay */
  onComplete?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Full-screen splash video. Plays completely before navigation / onComplete.
 */
export function SplashScreen({
  opacity,
  onComplete,
  style,
  testID,
}: SplashScreenProps) {
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const isNavigatingRef = useRef(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const navigateNext = useCallback(() => {
    if (isNavigatingRef.current) {
      return;
    }
    isNavigatingRef.current = true;
    setIsNavigating(true);

    if (onCompleteRef.current) {
      onCompleteRef.current();
      return;
    }

    try {
      router.replace(HOME_HREF);
    } catch {
      // Ignore if already transitioning
    }
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      navigateNext();
    }, FALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [navigateNext]);

  const handlePlaybackUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (
        status.isLoaded &&
        status.didJustFinish === true &&
        !isNavigating
      ) {
        navigateNext();
      }
    },
    [isNavigating, navigateNext]
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
          ref={videoRef}
          source={require('@/assets/Splash.mp4')}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping={false}
          isMuted
          onPlaybackStatusUpdate={handlePlaybackUpdate}
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
