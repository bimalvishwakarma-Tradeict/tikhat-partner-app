import { Redirect, Tabs, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { NotificationBell } from '../../components/common/NotificationBell';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import Logo from '@/assets/logo.png';

const LOGIN_HREF = '/(auth)/login' as Href;
const ADMIN_DASHBOARD_HREF = '/(admin)/dashboard' as Href;

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  indicatorColor: string;
};

function TabIcon({ name, color, focused, indicatorColor }: TabIconProps) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={name} size={22} color={color} />
      {focused ? (
        <View style={[styles.indicator, { backgroundColor: indicatorColor }]} />
      ) : (
        <View style={styles.indicatorPlaceholder} />
      )}
    </View>
  );
}

function PartnerHeaderLeft() {
  return (
    <Image
      source={Logo}
      style={styles.headerLogo}
    />
  );
}

function PartnerHeaderRight() {
  return (
    <View style={styles.headerRight}>
      <ThemeToggle />
      <NotificationBell />
    </View>
  );
}

export default function PartnerLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isHydrated, isInvestor, isAdmin } = useAuth();

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href={LOGIN_HREF} />;
  }

  if (!isInvestor) {
    if (isAdmin) {
      return <Redirect href={ADMIN_DASHBOARD_HREF} />;
    }
    return <Redirect href={LOGIN_HREF} />;
  }

  const primaryColor = colors?.primary;
  const secondaryColor = colors?.secondary;
  const textPrimary = colors?.text?.primary;
  const textSecondary = colors?.text?.secondary;
  const cardColor = colors?.card;
  const borderColor = colors?.border;
  const backgroundColor = colors?.background;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor },
        headerTintColor: textPrimary,
        headerShadowVisible: false,
        headerLeft: () => <PartnerHeaderLeft />,
        headerRight: () => <PartnerHeaderRight />,
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: textSecondary,
        tabBarStyle: {
          height: 64 + (insets?.bottom ?? 0),
          paddingBottom: insets?.bottom ?? 0,
          paddingTop: 6,
          backgroundColor: cardColor,
          borderTopColor: borderColor,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: styles.tabLabel,
        // Smooth transitions for stacked partner screens (Expo Router / native-stack opts)
        ...({
          animation: 'slide_from_right',
          animationDuration: 300,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        } as Record<string, unknown>),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'home' : 'home-outline'}
              color={color}
              focused={focused}
              indicatorColor={secondaryColor}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="revenue"
        options={{
          title: 'Revenue',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'trending-up' : 'trending-up-outline'}
              color={color}
              focused={focused}
              indicatorColor={secondaryColor}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="fund"
        options={{
          title: 'Fund',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'wallet' : 'wallet-outline'}
              color={color}
              focused={focused}
              indicatorColor={secondaryColor}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'person' : 'person-outline'}
              color={color}
              focused={focused}
              indicatorColor={secondaryColor}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Support',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              color={color}
              focused={focused}
              indicatorColor={secondaryColor}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
          headerRight: () => <ThemeToggle />,
        }}
      />
      <Tabs.Screen
        name="withdrawals"
        options={{
          title: 'Withdrawal History',
          href: null,
        }}
      />
      <Tabs.Screen
        name="account-settings"
        options={{
          title: 'Account Settings',
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    height: 64,
    width: 160,
    resizeMode: 'contain',
    marginLeft: 12,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  indicator: {
    width: 20,
    height: 3,
    borderRadius: 9999,
  },
  indicatorPlaceholder: {
    width: 20,
    height: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
