import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm } from 'react-hook-form';
import { useTheme } from '../../hooks/useTheme';
import { adminService } from '../../services/admin.service';
import { ApiClientError } from '../../types/api.types';
import type { AdminDashboard } from '../../types/models.types';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatTime, getISTParts } from '../../utils/formatDate';
import { zodResolver } from '../../utils/validationSchemas';
import { z } from 'zod';
import { FormDatePicker } from '../../components/forms/FormDatePicker';
import { AmountDisplay } from '../../components/common/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';

type Schedule = {
  time?: string;
  investor_count?: number;
  total_amount?: number;
  total_amount_formatted?: string;
  label?: string;
};

type TopInvestor = {
  id?: string;
  full_name?: string;
  email?: string;
  capital_balance?: number;
  capital_balance_formatted?: string;
  total_earned?: number;
  effective_roi?: number;
};

type ActivityItem = {
  occurred_at?: string;
  date?: string | null;
  message?: string;
  activity_type?: string;
  amount_formatted?: string | null;
};

type DateRangeForm = {
  from: string;
  to: string;
};

const dateRangeSchema = z
  .object({
    from: z.string(),
    to: z.string(),
  })
  .refine(
    (data) => {
      const hasFrom = Boolean(data.from?.trim());
      const hasTo = Boolean(data.to?.trim());
      return hasFrom === hasTo;
    },
    { message: 'Both from and to dates are required', path: ['to'] }
  );

function todayIsoIst(): string {
  const { year, month, day } = getISTParts(new Date());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthStartIsoIst(): string {
  const { year, month } = getISTParts(new Date());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  const { colors, spacing, typography, borderRadius } = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
        },
      ]}
    >
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text
        style={[
          typography.title,
          {
            color: colors.text.primary,
            fontWeight: '700',
            marginTop: 4,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {subtitle ? (
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginTop: 2 },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Admin dashboard — stats, schedule, activity, top investors, financial summary.
 */
export default function AdminDashboardScreen() {
  const { colors, spacing, typography, borderRadius } = useTheme();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});

  const { control, handleSubmit, reset, setValue } = useForm<DateRangeForm>({
    resolver: zodResolver(dateRangeSchema),
    defaultValues: { from: '', to: '' },
  });

  const load = useCallback(
    async (isRefresh = false, nextRange = range) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params =
          nextRange.from && nextRange.to
            ? { from: nextRange.from, to: nextRange.to }
            : undefined;
        const result = await adminService.getDashboard(params);
        setData(result);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load admin dashboard'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      void load(true);
    }, 30000);
    return () => clearInterval(id);
  }, [load]);

  const applyRange = handleSubmit(async (values) => {
    const next = {
      from: values.from?.trim() || undefined,
      to: values.to?.trim() || undefined,
    };
    setRange(next);
    await load(false, next);
  });

  const clearRange = async () => {
    reset({ from: '', to: '' });
    setRange({});
    await load(false, {});
  };

  const setPreset = async (from: string, to: string) => {
    setValue('from', from);
    setValue('to', to);
    const next = { from, to };
    setRange(next);
    await load(false, next);
  };

  const schedule = (data?.today_revenue_schedule || null) as Schedule | null;
  const scheduleLine = useMemo(() => {
    if (!schedule) return 'No schedule available';
    const time = schedule.time || '—';
    const count = Math.round(Number(schedule.investor_count) || 0);
    const amount =
      schedule.total_amount_formatted ||
      formatCurrency(Math.round(Number(schedule.total_amount) || 0));
    return `${time} — ${count} partners — ${amount} total`;
  }, [schedule]);

  const topCapital = (data?.top_investors_by_capital || []) as TopInvestor[];
  const topRoi = (data?.top_investors_by_roi || []) as TopInvestor[];
  const activity = (data?.recent_activity || []).slice(0, 20) as ActivityItem[];
  const finance = data?.financial_summary;

  if (loading && !data) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={120} />
        <Skeleton height={200} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.md,
      }}
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
    >
      <Text style={[typography.h2, { color: colors.text.primary }]}>
        Dashboard
      </Text>

      <Card>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
          ]}
        >
          Date range
        </Text>
        <View style={{ gap: spacing.sm }}>
          <FormDatePicker control={control} name="from" label="From" />
          <FormDatePicker control={control} name="to" label="To" />
          <View style={styles.row}>
            <Pressable
              onPress={() => {
                void setPreset(todayIsoIst(), todayIsoIst());
              }}
              style={[
                styles.chip,
                {
                  borderColor: colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
            >
              <Text style={[typography.caption, { color: colors.secondary }]}>
                Today
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void setPreset(monthStartIsoIst(), todayIsoIst());
              }}
              style={[
                styles.chip,
                {
                  borderColor: colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
            >
              <Text style={[typography.caption, { color: colors.secondary }]}>
                This month
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void clearRange();
              }}
              style={[
                styles.chip,
                {
                  borderColor: colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
            >
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                Clear
              </Text>
            </Pressable>
          </View>
          <Button
            title="Apply filter"
            variant="golden"
            onPress={() => {
              void applyRange();
            }}
          />
        </View>
      </Card>

      {error ? (
        <Text style={[typography.caption, { color: colors.error }]}>{error}</Text>
      ) : null}

      <View style={styles.statsGrid}>
        <StatCard
          label="Total Partners"
          value={String(Math.round(Number(data?.total_investors) || 0))}
        />
        <StatCard
          label="Total Capital"
          value={
            data?.total_capital_formatted ||
            formatCurrency(Math.round(Number(data?.total_capital) || 0))
          }
        />
        <StatCard
          label="Today's Revenue"
          value={
            data?.revenue_today_formatted ||
            formatCurrency(Math.round(Number(data?.revenue_today) || 0))
          }
          subtitle={range.from ? 'In selected range' : undefined}
        />
        <StatCard
          label="Pending Approvals"
          value={String(Math.round(Number(data?.pending_approvals_count) || 0))}
        />
        <StatCard
          label="Active Tickets"
          value={String(Math.round(Number(data?.active_tickets_count) || 0))}
        />
      </View>

      <Card accent>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '700' },
          ]}
        >
          Today&apos;s schedule
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.text.primary, marginTop: spacing.sm, fontWeight: '600' },
          ]}
        >
          {scheduleLine}
        </Text>
      </Card>

      <Card>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
          ]}
        >
          Financial summary
        </Text>
        <View style={{ gap: spacing.sm }}>
          <SummaryRow
            label="Total capital"
            amount={Math.round(Number(finance?.total_capital) || 0)}
          />
          <SummaryRow
            label="Monthly revenue"
            amount={Math.round(Number(finance?.monthly_revenue) || 0)}
          />
          <SummaryRow
            label="Monthly withdrawals"
            amount={Math.round(Number(finance?.monthly_withdrawals) || 0)}
          />
          <SummaryRow
            label="Net liability"
            amount={Math.round(Number(finance?.net_liability) || 0)}
            emphasize
          />
        </View>
      </Card>

      <Card>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
          ]}
        >
          Top 5 by capital
        </Text>
        {topCapital.length === 0 ? (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            No data yet
          </Text>
        ) : (
          topCapital.map((item, index) => (
            <View key={item.id || `cap-${index}`} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}
                  numberOfLines={1}
                >
                  {item.full_name || '—'}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {item.email || ''}
                </Text>
              </View>
              <AmountDisplay
                amount={Math.round(Number(item.capital_balance) || 0)}
                size="sm"
              />
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
          ]}
        >
          Top 5 by ROI earned
        </Text>
        {topRoi.length === 0 ? (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            No data yet
          </Text>
        ) : (
          topRoi.map((item, index) => (
            <View key={item.id || `roi-${index}`} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}
                  numberOfLines={1}
                >
                  {item.full_name || '—'}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  ROI {Number(item.effective_roi || 0).toFixed(2)}% · Earned{' '}
                  {formatCurrency(Math.round(Number(item.total_earned) || 0))}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
          ]}
        >
          Recent activity
        </Text>
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginBottom: spacing.sm },
          ]}
        >
          Auto-refreshes every 30 seconds
        </Text>
        {activity.length === 0 ? (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            No recent activity
          </Text>
        ) : (
          activity.map((item, index) => (
            <View
              key={`${item.occurred_at}-${index}`}
              style={[
                styles.activityRow,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[typography.body, { color: colors.text.primary }]}>
                {item.message || 'Activity'}
              </Text>
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                {item.date ||
                  (item.occurred_at
                    ? `${formatDate(item.occurred_at)} · ${formatTime(item.occurred_at)}`
                    : '')}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function SummaryRow({
  label,
  amount,
  emphasize,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.listRow}>
      <Text
        style={[
          typography.body,
          {
            color: colors.text.secondary,
            fontWeight: emphasize ? '700' : '400',
          },
        ]}
      >
        {label}
      </Text>
      <AmountDisplay amount={amount} size={emphasize ? 'md' : 'sm'} />
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 140,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  activityRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
