import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';
import { revenueService } from '../../../services/revenue.service';
import { ApiClientError } from '../../../types/api.types';
import { formatCurrency, formatRoiPercent } from '../../../utils/formatCurrency';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';

type Dashboard = {
  revenue_credited_today?: number;
  revenue_credited_today_formatted?: string;
  revenue_credited_this_month?: number;
  revenue_credited_this_month_formatted?: string;
  paused_investors_count?: number;
  next_scheduled_credit?: {
    time?: string;
    label?: string;
    investor_count?: number;
    total_amount_formatted?: string;
  };
};

type RevenueInvestor = {
  id: string;
  full_name: string;
  email: string;
  default_roi?: number | null;
  active_roi?: number | null;
  revenue_paused?: boolean;
  revenue_credited_this_month?: number;
  revenue_credited_this_month_formatted?: string;
  revenue_balance?: number;
  last_credit_date?: string | null;
  last_credit_amount?: number | null;
};

/**
 * Admin revenue overview + investor list.
 */
export default function AdminRevenueIndexScreen() {
  const router = useRouter();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [investors, setInvestors] = useState<RevenueInvestor[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [dash, list] = await Promise.all([
          revenueService.getAdminDashboard(),
          revenueService.getAdminInvestors({
            search: debounced || undefined,
            page: 1,
            limit: 50,
          }) as Promise<{ investors?: RevenueInvestor[] }>,
        ]);
        setDashboard(dash);
        setInvestors(list.investors || []);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load revenue data'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debounced]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const schedule = dashboard?.next_scheduled_credit;
  const scheduleLine = schedule?.label
    ? schedule.label
    : schedule?.time
      ? `${schedule.time}${
          schedule.investor_count != null
            ? ` — ${schedule.investor_count} partners`
            : ''
        }${
          schedule.total_amount_formatted
            ? ` — ${schedule.total_amount_formatted}`
            : ''
        }`
      : '—';

  if (loading && !dashboard) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={120} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={investors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.xl,
          gap: spacing.sm,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text style={[typography.h2, { color: colors.text.primary }]}>
              Revenue
            </Text>
            {error ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}

            <View style={styles.stats}>
              <Stat
                label="Today's credit"
                value={
                  dashboard?.revenue_credited_today_formatted ||
                  formatCurrency(
                    Math.round(Number(dashboard?.revenue_credited_today) || 0)
                  )
                }
              />
              <Stat
                label="This month"
                value={
                  dashboard?.revenue_credited_this_month_formatted ||
                  formatCurrency(
                    Math.round(
                      Number(dashboard?.revenue_credited_this_month) || 0
                    )
                  )
                }
              />
              <Stat
                label="Paused"
                value={String(
                  Math.round(Number(dashboard?.paused_investors_count) || 0)
                )}
              />
            </View>

            <Card accent>
              <Text
                style={[
                  typography.subtitle,
                  { color: colors.text.primary, fontWeight: '700' },
                ]}
              >
                Next scheduled credit
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.primary, marginTop: spacing.xs },
                ]}
              >
                {scheduleLine}
              </Text>
            </Card>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search investors"
              placeholderTextColor={colors.text.secondary}
              style={[
                typography.body,
                {
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  borderRadius: borderRadius.md,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text.primary,
                },
              ]}
            />
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.primary, fontWeight: '700' },
              ]}
            >
              Investors
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push(`/(admin)/revenue/${item.id}` as Href)
            }
          >
            <Card>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, fontWeight: '700' },
                    ]}
                  >
                    {item.full_name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {item.email}
                  </Text>
                </View>
                {item.revenue_paused ? (
                  <Badge label="Paused" variant="warning" />
                ) : (
                  <Badge label="Active" variant="success" />
                )}
              </View>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: spacing.sm },
                ]}
              >
                Default ROI:{' '}
                {item.default_roi != null
                  ? formatRoiPercent(item.default_roi)
                  : '—'}{' '}
                · Term ROI:{' '}
                {item.active_roi != null
                  ? formatRoiPercent(item.active_roi)
                  : '—'}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: 2 },
                ]}
              >
                This month:{' '}
                {item.revenue_credited_this_month_formatted ||
                  formatCurrency(
                    Math.round(Number(item.revenue_credited_this_month) || 0)
                  )}
                {item.last_credit_date
                  ? ` · Last: ${item.last_credit_date} (${formatCurrency(
                      Math.round(Number(item.last_credit_amount) || 0)
                    )})`
                  : ''}
              </Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState title="No investors" subtitle="Try a different search." />
        }
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors, spacing, typography, borderRadius } = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: '30%',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.sm,
      }}
    >
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text
        style={[
          typography.subtitle,
          { color: colors.text.primary, fontWeight: '700', marginTop: 4 },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
