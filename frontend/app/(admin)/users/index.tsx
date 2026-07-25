import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { notificationService } from '../../../services/notification.service';
import { ApiClientError } from '../../../types/api.types';
import type { Investor } from '../../../types/models.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';

type StatusFilter =
  | 'all'
  | 'active'
  | 'pending'
  | 'paused'
  | 'locked'
  | 'self_deactivated';

type InvestorRow = Investor & {
  capital_amount?: number;
  locked_reason?: string | null;
};

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'paused', label: 'Paused' },
  { key: 'locked', label: 'Locked' },
  { key: 'self_deactivated', label: 'Self-Deactivated' },
];

export default function AdminUsersScreen() {
  const router = useRouter();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingProfileCount, setPendingProfileCount] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const [listData, pending] = await Promise.all([
          adminService.listInvestors({
            status: filter === 'all' ? undefined : filter,
            search: debouncedSearch || undefined,
            page: 1,
            limit: 50,
            sort_by: 'joining_date',
            sort_order: 'desc',
          }),
          notificationService.getAdminPendingCounts().catch(() => null),
        ]);
        setInvestors((listData.investors || []) as InvestorRow[]);
        setPendingProfileCount(
          Math.max(0, Math.round(Number(pending?.profile_updates) || 0))
        );
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load investors'
        );
        setInvestors([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, debouncedSearch]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const header = useMemo(
    () => (
      <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
        <View style={styles.titleRow}>
          <Text style={[typography.h2, { color: colors.text.primary, flex: 1 }]}>
            Users
          </Text>
          {pendingProfileCount > 0 ? (
            <Badge
              label={`${pendingProfileCount} profile updates`}
              variant="warning"
            />
          ) : null}
        </View>

        <View
          style={[
            styles.searchBox,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.text.secondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email, mobile"
            placeholderTextColor={colors.text.secondary}
            style={[
              typography.body,
              { flex: 1, color: colors.text.primary, paddingVertical: 10 },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[
                  styles.filterChip,
                  {
                    borderColor: active ? colors.secondary : colors.border,
                    backgroundColor: active ? colors.surface : colors.background,
                    borderRadius: borderRadius.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: active ? colors.secondary : colors.text.secondary,
                      fontWeight: active ? '700' : '500',
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>
    ),
    [
      borderRadius.full,
      borderRadius.md,
      colors,
      error,
      filter,
      pendingProfileCount,
      search,
      spacing,
      typography,
    ]
  );

  if (loading && investors.length === 0) {
    return (
      <View style={{ padding: spacing.md }}>
        {header}
        <Skeleton height={88} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={88} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={88} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={investors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.xl,
          flexGrow: 1,
        }}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load(true);
            }}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        renderItem={({ item }) => {
          const capital = Math.round(Number(item.capital_amount) || 0);
          const locked = String(item.status).toLowerCase() === 'locked';
          return (
            <Pressable
              onPress={() =>
                router.push(`/(admin)/users/${item.id}` as Href)
              }
              style={[
                styles.rowCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <View style={styles.rowTop}>
                <Text
                  style={[
                    typography.body,
                    { color: colors.text.primary, fontWeight: '700', flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {item.full_name}
                </Text>
                <StatusChip status={item.status} />
              </View>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
                numberOfLines={1}
              >
                {item.email}
              </Text>
              <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
                <Text style={[typography.subtitle, { color: colors.secondary }]}>
                  {formatCurrency(capital)}
                </Text>
                <StatusChip status={item.kyc_status} label={`KYC ${String(item.kyc_status).replace(/_/g, ' ')}`} />
              </View>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: spacing.xs },
                ]}
              >
                Joined:{' '}
                {item.joining_date_formatted ||
                  (item.joining_date ? item.joining_date : '—')}
              </Text>
              {locked ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Badge
                    label={
                      item.locked_reason
                        ? `Locked: ${item.locked_reason}`
                        : 'Locked'
                    }
                    variant="error"
                  />
                </View>
              ) : null}
              {String(item.status).toLowerCase() === 'self_deactivated' ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Badge label="Self-Deactivated" variant="warning" />
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No investors found"
            subtitle="Try a different search or filter."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  filterChip: { borderWidth: 1 },
  rowCard: { borderWidth: 1 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
