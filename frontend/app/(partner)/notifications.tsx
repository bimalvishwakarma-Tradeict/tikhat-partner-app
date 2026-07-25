import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { useTheme } from '../../hooks/useTheme';
import { notificationService } from '../../services/notification.service';
import type { Notification } from '../../types/models.types';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { ApiClientError } from '../../types/api.types';

function resolveNotificationHref(item: Notification): Href {
  const ref = String(item.reference_type || item.type || '').toLowerCase();

  if (ref.includes('support') || ref.includes('ticket')) {
    return '/(partner)/support' as Href;
  }
  if (ref.includes('revenue')) {
    return '/(partner)/revenue' as Href;
  }
  if (
    ref.includes('capital') ||
    ref.includes('withdraw') ||
    ref.includes('deposit') ||
    ref.includes('transaction')
  ) {
    return '/(partner)/fund' as Href;
  }
  if (ref.includes('profile') || ref.includes('kyc') || ref.includes('request')) {
    return '/(partner)/profile' as Href;
  }
  return '/(partner)/dashboard' as Href;
}

function formatRelativeTime(value: string): string {
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return value;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography } = useTheme();

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await notificationService.list({ page: 1, limit: 50 });
      setItems(result.notifications || []);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load notifications'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const onOpen = async (item: Notification) => {
    if (!item.is_read) {
      try {
        await notificationService.markRead(item.id);
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, is_read: true } : n
          )
        );
      } catch {
        // Still navigate
      }
    }
    router.push(resolveNotificationHref(item));
  };

  const onMarkAll = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not mark all as read'
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = items.filter((n) => !n.is_read).length;

  if (loading && items.length === 0) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.background, padding: spacing.md },
        ]}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`skel-${i}`} style={{ marginBottom: spacing.md, gap: 8 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="30%" height={10} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {items.length > 0 ? (
        <View
          style={[
            styles.toolbar,
            {
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Text style={[typography.subtitle, { color: colors.text.secondary }]}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
          <View style={{ minWidth: 140 }}>
            <Button
              title="Mark all as read"
              variant="secondary"
              fullWidth
              loading={markingAll}
              disabled={markingAll || unreadCount === 0}
              onPress={onMarkAll}
              style={{ height: 40 }}
            />
          </View>
        </View>
      ) : null}

      {error ? (
        <Text
          style={[
            typography.body,
            { color: colors.error, padding: spacing.md },
          ]}
        >
          {error}
        </Text>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xl,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No notifications yet"
            subtitle="Updates about capital, revenue, and support will appear here."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void onOpen(item)}
            style={[
              styles.row,
              {
                borderBottomColor: colors.border,
                backgroundColor: item.is_read
                  ? colors.background
                  : colors.surface,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
              },
            ]}
          >
            <View style={styles.rowMain}>
              <View style={styles.titleRow}>
                {!item.is_read ? (
                  <View
                    style={[
                      styles.unreadDot,
                      { backgroundColor: colors.completed },
                    ]}
                  />
                ) : (
                  <View style={styles.unreadSpacer} />
                )}
                <Text
                  style={[
                    typography.title,
                    {
                      color: colors.text.primary,
                      flex: 1,
                      fontWeight: item.is_read ? '500' : '700',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
              </View>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.secondary,
                    marginTop: spacing.xs,
                    marginLeft: 14,
                  },
                ]}
                numberOfLines={3}
              >
                {item.body}
              </Text>
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.text.secondary,
                    marginTop: spacing.sm,
                    marginLeft: 14,
                  },
                ]}
              >
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  unreadSpacer: {
    width: 8,
  },
});
