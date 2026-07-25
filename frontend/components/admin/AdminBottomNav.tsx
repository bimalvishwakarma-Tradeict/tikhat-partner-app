import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

export type AdminNavItem = {
  key: string;
  label: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  superAdminOnly?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/(admin)/dashboard' as Href,
    icon: 'grid-outline',
    iconFocused: 'grid',
  },
  {
    key: 'users',
    label: 'Users',
    href: '/(admin)/users' as Href,
    icon: 'people-outline',
    iconFocused: 'people',
  },
  {
    key: 'capital',
    label: 'Capital',
    href: '/(admin)/capital' as Href,
    icon: 'wallet-outline',
    iconFocused: 'wallet',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    href: '/(admin)/revenue' as Href,
    icon: 'trending-up-outline',
    iconFocused: 'trending-up',
  },
  {
    key: 'backdate',
    label: 'Backdate',
    href: '/(admin)/backdate' as Href,
    icon: 'calendar-outline',
    iconFocused: 'calendar',
  },
  {
    key: 'support',
    label: 'Support',
    href: '/(admin)/support' as Href,
    icon: 'chatbubbles-outline',
    iconFocused: 'chatbubbles',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    href: '/(admin)/notifications' as Href,
    icon: 'notifications-outline',
    iconFocused: 'notifications',
  },
  {
    key: 'reports',
    label: 'Reports',
    href: '/(admin)/reports' as Href,
    icon: 'bar-chart-outline',
    iconFocused: 'bar-chart',
  },
  {
    key: 'logs',
    label: 'Logs',
    href: '/(admin)/logs' as Href,
    icon: 'list-outline',
    iconFocused: 'list',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/(admin)/settings' as Href,
    icon: 'settings-outline',
    iconFocused: 'settings',
  },
  {
    key: 'admins',
    label: 'Admin Management',
    href: '/(admin)/admins' as Href,
    icon: 'shield-checkmark-outline',
    iconFocused: 'shield-checkmark',
    superAdminOnly: true,
  },
];

const PRIMARY_TAB_KEYS = ['dashboard', 'users', 'capital', 'revenue'] as const;

export type AdminBottomNavProps = {
  isSuperAdmin: boolean;
  onMorePress: () => void;
  testID?: string;
};

function pathMatches(pathname: string, href: string): boolean {
  const normalized = pathname.replace(/\/$/, '');
  const target = href.replace('/(admin)', '').replace(/\/$/, '') || '/dashboard';
  if (target === '/dashboard') {
    return (
      normalized.endsWith('/dashboard') ||
      normalized === '/(admin)' ||
      normalized.endsWith('/(admin)')
    );
  }
  return normalized.includes(target);
}

/**
 * Admin mobile bottom navigation — primary tabs + More.
 */
export function AdminBottomNav({
  isSuperAdmin,
  onMorePress,
  testID,
}: AdminBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();

  const primaryItems = useMemo(() => {
    return ADMIN_NAV_ITEMS.filter((item) =>
      (PRIMARY_TAB_KEYS as readonly string[]).includes(item.key)
    );
  }, []);

  const moreActive = useMemo(() => {
    const moreKeys = ADMIN_NAV_ITEMS.filter(
      (item) =>
        !(PRIMARY_TAB_KEYS as readonly string[]).includes(item.key) &&
        (!item.superAdminOnly || isSuperAdmin)
    );
    return moreKeys.some((item) => pathMatches(pathname, String(item.href)));
  }, [pathname, isSuperAdmin]);

  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 6),
        },
      ]}
    >
      {primaryItems.map((item) => {
        const focused = pathMatches(pathname, String(item.href));
        const color = focused ? colors.primary : colors.text.secondary;
        return (
          <Pressable
            key={item.key}
            onPress={() => router.push(item.href)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
          >
            <Ionicons
              name={focused ? item.iconFocused : item.icon}
              size={22}
              color={color}
            />
            <Text
              style={[
                typography.caption,
                {
                  color,
                  fontWeight: focused ? '700' : '500',
                  fontSize: 10,
                },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onMorePress}
        style={styles.item}
        accessibilityRole="button"
        accessibilityState={{ selected: moreActive }}
      >
        <Ionicons
          name={moreActive ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'}
          size={22}
          color={moreActive ? colors.primary : colors.text.secondary}
        />
        <Text
          style={[
            typography.caption,
            {
              color: moreActive ? colors.primary : colors.text.secondary,
              fontWeight: moreActive ? '700' : '500',
              fontSize: 10,
            },
          ]}
        >
          More
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
  },
});
