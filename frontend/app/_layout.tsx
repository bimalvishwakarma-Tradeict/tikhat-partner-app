import { useEffect, type ReactNode } from 'react';
import { Slot, useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
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
import { Toast } from '../components/ui/Toast';
import { queryClient } from '../utils/queryClient';
import { markDataSynced } from '../utils/lastSynced';

const HOME_HREF = '/(auth)/' as Href;
const PARTNER_DASHBOARD_HREF = '/(partner)/dashboard' as Href;
const ADMIN_DASHBOARD_HREF = '/(admin)/dashboard' as Href;

function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const {
    isAuthenticated,
    isHydrated,
    isInvestor,
    isAdmin,
  } = useAuth();

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const group = segments[0];
    const inAuthGroup = group === '(auth)';
    const inPartnerGroup = group === '(partner)';
    const inAdminGroup = group === '(admin)';

    if (!isAuthenticated) {
      if (inPartnerGroup || inAdminGroup || !group) {
        router.replace(HOME_HREF);
      }
      return;
    }

    if (isInvestor && (inAuthGroup || inAdminGroup || !group)) {
      router.replace(PARTNER_DASHBOARD_HREF);
      return;
    }

    if (isAdmin && (inAuthGroup || inPartnerGroup || !group)) {
      router.replace(ADMIN_DASHBOARD_HREF);
    }
  }, [
    isAuthenticated,
    isHydrated,
    segments,
    isInvestor,
    isAdmin,
    router,
  ]);

  if (!isHydrated) {
    return <AppLoader message="Loading your session…" />;
  }

  return <>{children}</>;
}

function BootRoot() {
  const { colors, isDark } = useTheme();
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <AuthGate>
        <Slot />
      </AuthGate>
      <Toast />
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
