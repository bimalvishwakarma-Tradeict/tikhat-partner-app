import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { notificationService } from '../../services/notification.service';

const NOTIFICATIONS_HREF = '/(partner)/notifications' as Href;

export type NotificationBellProps = {
  testID?: string;
};

/**
 * Header notification bell with unread count badge.
 */
export function NotificationBell({ testID }: NotificationBellProps) {
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const [count, setCount] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const next = await notificationService.getUnreadCount();
      setCount(Math.max(0, Math.round(Number(next) || 0)));
    } catch {
      // Keep last known count on transient errors
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCount();
      const id = setInterval(() => {
        void loadCount();
      }, 30000);
      return () => clearInterval(id);
    }, [loadCount])
  );

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  const badgeLabel = count > 99 ? '99+' : String(count);

  return (
    <Pressable
      testID={testID}
      onPress={() => router.push(NOTIFICATIONS_HREF)}
      hitSlop={10}
      style={[styles.wrap, { marginRight: spacing.md }]}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0
          ? `Notifications, ${count} unread`
          : 'Notifications'
      }
    >
      <Ionicons
        name={count > 0 ? 'notifications' : 'notifications-outline'}
        size={24}
        color={colors.text.primary}
      />
      {count > 0 ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: colors.error,
              borderColor: colors.background,
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
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
