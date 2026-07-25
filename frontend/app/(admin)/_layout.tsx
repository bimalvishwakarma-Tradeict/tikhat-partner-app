import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, Stack, usePathname, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { APP_NAME } from '../../constants';
import { notificationService } from '../../services/notification.service';
import {
  ADMIN_NAV_ITEMS,
  AdminBottomNav,
} from '../../components/admin/AdminBottomNav';
import Logo from '@/assets/logo.png';

const LOGIN_HREF = '/(auth)/login' as Href;
const PARTNER_DASHBOARD_HREF = '/(partner)/dashboard' as Href;

function roleLabel(role: string | undefined): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return role || 'Admin';
}

function pathMatches(pathname: string, href: string): boolean {
  const normalized = pathname.replace(/\/$/, '');
  const target = href.replace('/(admin)', '').replace(/\/$/, '') || '/dashboard';
  return normalized.includes(target);
}

export default function AdminLayout() {
  const { colors, spacing, typography, borderRadius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const {
    isAuthenticated,
    isHydrated,
    isAdmin,
    isInvestor,
    isSuperAdmin,
    user,
    logout,
  } = useAuth();

  const [moreMounted, setMoreMounted] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const sheetProgress = useSharedValue(0);

  const closeMoreMenu = useCallback(() => {
    sheetProgress.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(setMoreMounted)(false);
      }
    });
  }, [sheetProgress]);

  const openMoreMenu = useCallback(() => {
    setMoreMounted(true);
    sheetProgress.value = 0;
    sheetProgress.value = withSpring(1, {
      damping: 18,
      stiffness: 220,
      mass: 0.85,
      overshootClamping: false,
    });
  }, [sheetProgress]);

  const sheetBackdropStyle = useAnimatedStyle(() => ({
    opacity: sheetProgress.value * 0.45,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: (1 - sheetProgress.value) * 420,
      },
    ],
  }));

  const loadPending = useCallback(async () => {
    try {
      const counts = await notificationService.getAdminPendingCounts();
      const total =
        (counts.capital_requests || 0) +
        (counts.withdrawal_requests || 0) +
        (counts.profile_updates || 0) +
        (counts.new_registrations || 0);
      setPendingCount(Math.max(0, Math.round(total)));
    } catch {
      // Keep last known count
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      return;
    }
    void loadPending();
    const id = setInterval(() => {
      void loadPending();
    }, 30000);
    return () => clearInterval(id);
  }, [isAuthenticated, isAdmin, loadPending]);

  const moreItems = useMemo(
    () =>
      ADMIN_NAV_ITEMS.filter(
        (item) =>
          !['dashboard', 'users', 'capital', 'revenue'].includes(item.key) &&
          (!item.superAdminOnly || isSuperAdmin)
      ),
    [isSuperAdmin]
  );

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href={LOGIN_HREF} />;
  }

  if (isInvestor) {
    return <Redirect href={PARTNER_DASHBOARD_HREF} />;
  }

  if (!isAdmin) {
    return <Redirect href={LOGIN_HREF} />;
  }

  const badgeLabel = pendingCount > 99 ? '99+' : String(pendingCount);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.primary,
            borderBottomColor: colors.secondary,
          },
        ]}
      >
        <View style={styles.topBarMain}>
          <Image
            source={Logo}
            style={styles.headerLogo}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                typography.title,
                styles.topBarTitle,
                { color: colors.text.inverse },
              ]}
            >
              {APP_NAME} Admin
            </Text>
            <Text
              style={[typography.caption, { color: colors.secondary }]}
              numberOfLines={1}
            >
              {user?.fullName || 'Admin'} · {roleLabel(user?.role)}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/(admin)/notifications' as Href)}
            hitSlop={10}
            style={styles.bellWrap}
            accessibilityRole="button"
            accessibilityLabel={
              pendingCount > 0
                ? `Notifications, ${pendingCount} pending`
                : 'Notifications'
            }
          >
            <Ionicons
              name={
                pendingCount > 0 ? 'notifications' : 'notifications-outline'
              }
              size={24}
              color={colors.text.inverse}
            />
            {pendingCount > 0 ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: colors.error,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: colors.text.inverse,
                      fontSize: 10,
                      lineHeight: 12,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {badgeLabel}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={openMoreMenu}
            hitSlop={10}
            style={{ marginLeft: spacing.sm }}
          >
            <Ionicons
              name="menu-outline"
              size={26}
              color={colors.text.inverse}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
            animationDuration: 300,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            presentation: 'card',
          }}
        >
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="users" />
          <Stack.Screen name="capital" />
          <Stack.Screen name="revenue" />
          <Stack.Screen name="backdate" />
          <Stack.Screen name="support" />
          <Stack.Screen
            name="notifications"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              animationDuration: 300,
            }}
          />
          <Stack.Screen name="reports" />
          <Stack.Screen name="logs" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="admins" />
        </Stack>
      </View>

      <AdminBottomNav
        isSuperAdmin={isSuperAdmin}
        onMorePress={openMoreMenu}
      />

      <Modal
        visible={moreMounted}
        animationType="none"
        transparent
        onRequestClose={closeMoreMenu}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMoreMenu}>
            <Animated.View
              style={[
                styles.sheetBackdropFill,
                { backgroundColor: colors.primary },
                sheetBackdropStyle,
              ]}
            />
          </Pressable>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + spacing.md,
                borderTopLeftRadius: borderRadius.lg,
                borderTopRightRadius: borderRadius.lg,
              },
              sheetStyle,
            ]}
          >
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: colors.border },
              ]}
            />
            <Text
              style={[
                typography.title,
                {
                  color: colors.text.primary,
                  marginBottom: spacing.md,
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              Admin menu
            </Text>
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingHorizontal: spacing.md }}
            >
              {moreItems.map((item) => {
                const focused = pathMatches(pathname, String(item.href));
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      closeMoreMenu();
                      router.push(item.href);
                    }}
                    style={[
                      styles.menuRow,
                      {
                        backgroundColor: focused
                          ? colors.surface
                          : 'transparent',
                        borderRadius: borderRadius.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name={focused ? item.iconFocused : item.icon}
                      size={22}
                      color={focused ? colors.secondary : colors.text.primary}
                    />
                    <Text
                      style={[
                        typography.body,
                        {
                          color: focused
                            ? colors.secondary
                            : colors.text.primary,
                          fontWeight: focused ? '700' : '500',
                          flex: 1,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.text.secondary}
                    />
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => {
                  closeMoreMenu();
                  void logout();
                }}
                style={[
                  styles.menuRow,
                  {
                    marginTop: spacing.sm,
                    borderRadius: borderRadius.md,
                    borderWidth: 1,
                    borderColor: colors.error,
                  },
                ]}
              >
                <Ionicons
                  name="log-out-outline"
                  size={22}
                  color={colors.error}
                />
                <Text
                  style={[
                    typography.body,
                    { color: colors.error, fontWeight: '600', flex: 1 },
                  ]}
                >
                  Logout
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 3,
  },
  topBarMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    height: 64,
    width: 160,
    resizeMode: 'contain',
    marginRight: 10,
  },
  topBarTitle: {
    fontSize: 16,
  },
  bellWrap: {
    position: 'relative',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  content: {
    flex: 1,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
});
