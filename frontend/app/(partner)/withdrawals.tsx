import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { capitalService } from '../../services/capital.service';
import { ApiClientError } from '../../types/api.types';
import type { Withdrawal } from '../../types/models.types';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { StatusTimeline } from '../../components/modals/CapitalTransactionDetail';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Divider } from '../../components/ui/Divider';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusChip } from '../../components/ui/StatusChip';

type AccountFilter = 'all' | 'capital' | 'revenue';
type StatusFilter =
  | 'all'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'processed'
  | 'completed'
  | 'rejected'
  | 'cancelled';

const ACCOUNT_FILTERS: Array<{ key: AccountFilter; label: string }> = [
  { key: 'all', label: 'All accounts' },
  { key: 'capital', label: 'Capital' },
  { key: 'revenue', label: 'Revenue' },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All status' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' },
  { key: 'processed', label: 'Processed' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

function humanize(value: string): string {
  return String(value || '—')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type WithdrawalRow = Withdrawal & {
  date?: string | null;
  amount_formatted?: string;
};

export default function WithdrawalsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [items, setItems] = useState<WithdrawalRow[]>([]);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<WithdrawalRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await capitalService.getWithdrawals({
          account_type:
            accountFilter === 'all' ? undefined : accountFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
          page: 1,
          limit: 100,
        });
        setItems((data.withdrawals || []) as WithdrawalRow[]);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load withdrawals'
        );
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountFilter, statusFilter]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const renderFilters = () => (
    <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {ACCOUNT_FILTERS.map((item) => {
          const active = accountFilter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setAccountFilter(item.key)}
              style={[
                styles.chip,
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {STATUS_FILTERS.map((item) => {
          const active = statusFilter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setStatusFilter(item.key)}
              style={[
                styles.chip,
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
        <Text style={[typography.caption, { color: colors.error }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );

  const paymentUtr = selected?.payment_utr;
  const showPaymentUtr =
    Boolean(paymentUtr) &&
    ['completed', 'processed', 'approved'].includes(
      String(selected?.status || '').toLowerCase()
    );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {loading && items.length === 0 ? (
        <View style={{ padding: spacing.md }}>
          {renderFilters()}
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id || item.transaction_id}
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xl,
            flexGrow: 1,
          }}
          ListHeaderComponent={renderFilters}
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
            const dateLabel =
              item.date ||
              (item.created_at ? formatDate(item.created_at) : '—');
            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={[
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    paddingVertical: spacing.md,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={[
                      typography.subtitle,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {dateLabel}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, fontWeight: '500' },
                    ]}
                  >
                    {humanize(item.account_type)} A/C ·{' '}
                    {humanize(item.transfer_mode)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text
                    style={[
                      typography.title,
                      { color: colors.error, fontWeight: '700' },
                    ]}
                  >
                    -{formatCurrency(Math.round(Number(item.amount) || 0))}
                  </Text>
                  <StatusChip status={item.status} />
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No withdrawals"
              subtitle="Withdrawal requests will appear here."
            />
          }
        />
      )}

      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        heightRatio={0.72}
      >
        {selected ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.md, gap: spacing.md }}
          >
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Withdrawal details
            </Text>
            <Card accent>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Transaction ID
              </Text>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.primary,
                    fontWeight: '600',
                    marginTop: 2,
                  },
                ]}
                selectable
              >
                {selected.transaction_id}
              </Text>

              <Divider spacing={spacing.md} />

              <DetailLine
                label="Amount"
                value={formatCurrency(Math.round(Number(selected.amount) || 0))}
              />
              <DetailLine
                label="Account"
                value={`${humanize(selected.account_type)} A/C`}
              />
              <DetailLine
                label="Transfer mode"
                value={humanize(selected.transfer_mode)}
              />
              <DetailLine
                label="Date"
                value={
                  selected.date ||
                  (selected.created_at
                    ? formatDate(selected.created_at)
                    : '—')
                }
              />

              <View style={{ marginTop: spacing.sm }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginBottom: spacing.xs },
                  ]}
                >
                  Status
                </Text>
                <StatusChip status={selected.status} />
              </View>

              {showPaymentUtr ? (
                <DetailLine label="Payment UTR" value={String(paymentUtr)} />
              ) : null}

              <Divider spacing={spacing.md} />
              <Text
                style={[
                  typography.label,
                  { color: colors.text.primary, marginBottom: spacing.sm },
                ]}
              >
                Status timeline
              </Text>
              <StatusTimeline status={String(selected.status)} />
            </Card>
            <Button
              title="Close"
              variant="secondary"
              onPress={() => setSelected(null)}
            />
          </ScrollView>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.text.primary, marginTop: 2 },
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chip: {
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
