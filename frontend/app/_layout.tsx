import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Slot, useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Easing,
  runOnJS,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { QueryClientProvider } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { ThemeProvider } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { AppLoader } from '../components/common/AppLoader';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { OfflineBanner } from '../components/common/OfflineBanner';
import { SplashScreen } from './splash';
import { Toast } from '../components/ui/Toast';
import { queryClient } from '../utils/queryClient';
import { markDataSynced } from '../utils/lastSynced';

const HOME_HREF = '/(auth)/' as Href;
const PARTNER_DASHBOARD_HREF = '/(partner)/dashboard' as Href;
const ADMIN_DASHBOARD_HREF = '/(admin)/dashboard' as Href;
const SPLASH_FADE_MS = 420;
const SPLASH_SHOWN_KEY = 'splashShown';

/**
 * Session splash flag.
 * Web: sessionStorage — survives refresh, clears when tab/window closes (cold start).
 * Also writes AsyncStorage key `splashShown` for tracking.
 * Native: always show on BootRoot mount (cold start only; nav does not remount root).
 */
async function hasSplashBeenShownThisSession(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(SPLASH_SHOWN_KEY) === 'true';
  }
  return false;
}

async function markSplashShownThisSession(): Promise<void> {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SPLASH_SHOWN_KEY, 'true');
  }
  try {
    await AsyncStorage.setItem(SPLASH_SHOWN_KEY, 'true');
  } catch {
    // Non-fatal
  }
}

/**
 * Returns true when JWT is present and not expired.
 */
function isAccessTokenValid(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }

  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return false;
    }

    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const atobFn = globalThis.atob;
    if (typeof atobFn !== 'function') {
      return Boolean(token);
    }

    const json = JSON.parse(atobFn(pad)) as { exp?: number };
    if (typeof json.exp !== 'number') {
      return true;
    }

    return json.exp * 1000 > Date.now() + 3000;
  } catch {
    return false;
  }
}

function AuthGate({
  children,
  bootComplete,
}: {
  children: ReactNode;
  bootComplete: boolean;
}) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const {
    isAuthenticated,
    isHydrated,
    isInvestor,
    isAdmin,
  } = useAuth();

  useEffect(() => {
    if (!bootComplete || !isHydrated) {
      return;
    }

    const group = segments[0];
    const inAuthGroup = group === '(auth)';
    const inPartnerGroup = group === '(partner)';
    const inAdminGroup = group === '(admin)';
    const onSplash = group === 'splash';

    if (!isAuthenticated) {
      if (inPartnerGroup || inAdminGroup || onSplash || !group) {
        router.replace(HOME_HREF);
      }
      return;
    }

    if (isInvestor && (inAuthGroup || inAdminGroup || onSplash || !group)) {
      router.replace(PARTNER_DASHBOARD_HREF);
      return;
    }

    if (isAdmin && (inAuthGroup || inPartnerGroup || onSplash || !group)) {
      router.replace(ADMIN_DASHBOARD_HREF);
    }
  }, [
    bootComplete,
    isAuthenticated,
    isHydrated,
    segments,
    isInvestor,
    isAdmin,
    router,
  ]);

  if (!bootComplete || !isHydrated) {
    return <AppLoader message="Loading your session…" />;
  }

  return <>{children}</>;
}

function BootRoot() {
  const { colors, isDark } = useTheme();
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);

  const [splashGate, setSplashGate] = useState<'loading' | 'show' | 'skip'>(
    'loading'
  );
  const [showSplash, setShowSplash] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const splashOpacity = useSharedValue(1);
  const started = useRef(false);
  const hydrateDone = useRef(false);
  const videoDone = useRef(false);
  const dismissing = useRef(false);

  const finishSplash = useCallback(() => {
    setShowSplash(false);
    setBootComplete(true);
  }, []);

  const tryDismissSplash = useCallback(() => {
    if (dismissing.current) {
      return;
    }
    if (!hydrateDone.current || !videoDone.current) {
      return;
    }
    dismissing.current = true;
    void markSplashShownThisSession();
    splashOpacity.value = withTiming(
      0,
      { duration: SPLASH_FADE_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(finishSplash)();
        }
      }
    );
  }, [splashOpacity, finishSplash]);

  const onSplashVideoComplete = useCallback(() => {
    videoDone.current = true;
    tryDismissSplash();
  }, [tryDismissSplash]);

  // Decide whether to show splash this session (skip on web refresh)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const alreadyShown = await hasSplashBeenShownThisSession();
      if (cancelled) {
        return;
      }
      if (alreadyShown) {
        setSplashGate('skip');
        setShowSplash(false);
        videoDone.current = true;
      } else {
        setSplashGate('show');
        setShowSplash(true);
      }
    })().catch(() => {
      if (!cancelled) {
        setSplashGate('show');
        setShowSplash(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (started.current) {
      return;
    }
    if (splashGate === 'loading') {
      return;
    }
    started.current = true;

    (async () => {
      await hydrate();

      const currentToken = useAuthStore.getState().token;
      if (currentToken && !isAccessTokenValid(currentToken)) {
        await logout();
      }

      hydrateDone.current = true;

      if (splashGate === 'skip') {
        finishSplash();
        return;
      }

      tryDismissSplash();
    })().catch(() => {
      hydrateDone.current = true;
      videoDone.current = true;
      finishSplash();
    });
  }, [
    splashGate,
    hydrate,
    logout,
    tryDismissSplash,
    finishSplash,
  ]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected === true && state.isInternetReachable !== false;
      if (connected) {
        markDataSynced();
      }
    });
    void NetInfo.fetch().then((state) => {
      const connected =
        state.isConnected === true && state.isInternetReachable !== false;
      if (connected) {
        markDataSynced();
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // Keep token in deps unused intentionally — read via getState after hydrate.
  void token;

  if (splashGate === 'loading') {
    return (
      <View style={[styles.flex, { backgroundColor: colors.primary }]}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={showSplash || isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <AuthGate bootComplete={bootComplete}>
        <Slot />
      </AuthGate>
      <Toast />
      {showSplash ? (
        <SplashScreen
          opacity={splashOpacity}
          onComplete={onSplashVideoComplete}
          testID="boot-splash"
        />
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });

  // Proceed if fonts loaded OR if loading failed (avoid hard crash)
  if (!fontsLoaded && !fontError) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AppLoader message="Loading fonts…" />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <BootRoot />
            </ThemeProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
