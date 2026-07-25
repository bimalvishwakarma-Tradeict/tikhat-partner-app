import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { capitalService } from '../../services/capital.service';
import { ApiClientError } from '../../types/api.types';
import type { CapitalBalance, CapitalTransaction } from '../../types/models.types';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { BalanceCard } from '../../components/cards/BalanceCard';
import { AddCapitalModal } from '../../components/modals/AddCapitalModal';
import { CapitalTransactionDetail } from '../../components/modals/CapitalTransactionDetail';
import { WithdrawModal } from '../../components/modals/WithdrawModal';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusChip } from '../../components/ui/StatusChip';

const PAGE_SIZE = 20;
const isWeb = Platform.OS === 'web';
const WITHDRAWALS_HREF = '/(partner)/withdrawals' as Href;

type HistoryFilter = 'all' | 'deposits' | 'withdrawals' | 'pending';

const FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'deposits', label: 'Deposits' },
  { key: 'withdrawals', label: 'Withdrawals' },
  { key: 'pending', label: 'Pending' },
];

function humanizeType(type: string): string {
  return String(type || 'transaction')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isDebitType(type: string): boolean {
  const t = String(type || '').toLowerCase();
  return t === 'withdrawal' || t === 'admin_debit';
}

function isDepositType(type: string): boolean {
  const t = String(type || '').toLowerCase();
  return t === 'deposit' || t === 'admin_credit';
}

function isWithdrawalListType(type: string): boolean {
  const t = String(type || '').toLowerCase();
  return t === 'withdrawal' || t === 'admin_debit';
}

function isPendingStatus(status: string): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'submitted' || s === 'under_review' || s === 'pending';
}

function matchesFilter(tx: CapitalTransaction, filter: HistoryFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'deposits') {
    return isDepositType(tx.type);
  }
  if (filter === 'withdrawals') {
    return isWithdrawalListType(tx.type);
  }
  return isPendingStatus(String(tx.status));
}

function showListUtr(tx: CapitalTransaction): string | null {
  const utr = tx.utr_number;
  if (!utr) {
    return null;
  }
  const s = String(tx.status || '').toLowerCase();
  if (s === 'completed' || s === 'processed' || s === 'approved') {
    return utr;
  }
  return null;
}

export default function FundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [balance, setBalance] = useState<CapitalBalance | null>(null);
  const [transactions, setTransactions] = useState<CapitalTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [selected, setSelected] = useState<CapitalTransaction | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const loadBalance = useCallback(async () => {
    const data = await capitalService.getBalance();
    setBalance({
      capitalBalance: Math.round(Number(data.capitalBalance) || 0),
      capitalBalanceFormatted:
        data.capitalBalanceFormatted ||
        formatCurrency(Math.round(Number(data.capitalBalance) || 0)),
      revenueBalance: Math.round(Number(data.revenueBalance) || 0),
      revenueBalanceFormatted:
        data.revenueBalanceFormatted ||
        formatCurrency(Math.round(Number(data.revenueBalance) || 0)),
      pendingWithdrawalAmount: Math.round(
        Number(data.pendingWithdrawalAmount) || 0
      ),
      pendingWithdrawalFormatted:
        data.pendingWithdrawalFormatted ||
        formatCurrency(Math.round(Number(data.pendingWithdrawalAmount) || 0)),
      isLocked: Boolean(data.isLocked),
      statusLabel:
        data.statusLabel ||
        (data.isLocked
          ? 'Locked for Withdrawal'
          : 'Available for Withdrawal'),
    });
  }, []);

  const loadTransactions = useCallback(
    async (opts: {
      pageNum?: number;
      append?: boolean;
      isRefresh?: boolean;
    }) => {
      const { pageNum = 1, append = false, isRefresh = false } = opts;

      if (isRefresh) {
        setRefreshing(true);
      } else if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await capitalService.getTransactions({
          page: pageNum,
          limit: PAGE_SIZE,
        });
        const rows = (data.transactions || []) as CapitalTransaction[];
        const meta = data.meta;
        const nextTotal = Math.round(Number(meta?.total) || 0);
        const nextTotalPages = Math.round(Number(meta?.totalPages) || 0);
        const nextPage = Math.round(Number(meta?.page) || pageNum);

        setTransactions((prev) => (append ? [...prev, ...rows] : rows));
        setTotal(nextTotal);
        setTotalPages(nextTotalPages);
        setPage(nextPage);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load capital transactions'
        );
        if (!append) {
          setTransactions([]);
          setTotal(0);
          setTotalPages(0);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    []
  );

  const reload = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        await loadBalance();
        await loadTransactions({ pageNum: 1, append: false, isRefresh });
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load fund details'
        );
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadBalance, loadTransactions]
  );

  useFocusEffect(
    useCallback(() => {
      void reload(false);
    }, [reload])
  );

  const onRefresh = () => {
    void reload(true);
  };

  const onEndReached = () => {
    if (isWeb || loading || loadingMore || refreshing) {
      return;
    }
    if (page >= totalPages || totalPages === 0) {
      return;
    }
    void loadTransactions({ pageNum: page + 1, append: true });
  };

  const goToPage = (nextPage: number) => {
    if (!isWeb || loading || refreshing) {
      return;
    }
    const max = Math.max(1, totalPages);
    if (nextPage < 1 || nextPage > max) {
      return;
    }
    void loadTransactions({ pageNum: nextPage, append: false });
  };

  const filteredTransactions = useMemo(
    () => transactions.filter((tx) => matchesFilter(tx, filter)),
    [transactions, filter]
  );

  const isLocked = Boolean(balance?.isLocked);
  const statusLabel =
    balance?.statusLabel ||
    (isLocked ? 'Locked for Withdrawal' : 'Available for Withdrawal');

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.md }}>
      {balance ? (
        <BalanceCard
          label="Capital Balance"
          amount={balance.capitalBalance}
          pendingWithdrawal={balance.pendingWithdrawalAmount}
          pendingNote={
            balance.pendingWithdrawalAmount > 0
              ? `Pending withdrawal: ${balance.pendingWithdrawalFormatted}`
              : undefined
          }
          style={{ marginBottom: spacing.md }}
        />
      ) : (
        <Skeleton height={120} style={{ marginBottom: spacing.md }} />
      )}

      <View
        style={[
          styles.lockRow,
          {
            backgroundColor: colors.surface,
            borderColor: isLocked ? colors.error : colors.success,
            borderRadius: borderRadius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginBottom: spacing.md,
          },
        ]}
      >
        <Ionicons
          name={isLocked ? 'lock-closed' : 'checkmark-circle'}
          size={18}
          color={isLocked ? colors.error : colors.success}
        />
        <Text
          style={[
            typography.subtitle,
            {
              color: isLocked ? colors.error : colors.success,
              fontWeight: '600',
              flex: 1,
            },
          ]}
        >
          {statusLabel}
        </Text>
      </View>

      <View style={[styles.actions, { gap: spacing.sm, marginBottom: spacing.md }]}>
        <Button
          title="Add Capital"
          variant="golden"
          fullWidth={false}
          onPress={() => setAddOpen(true)}
          style={styles.actionBtn}
        />
        <Button
          title="Withdraw"
          variant="secondary"
          fullWidth={false}
          onPress={() => setWithdrawOpen(true)}
          style={styles.actionBtn}
        />
      </View>

      <Pressable
        onPress={() => router.push(WITHDRAWALS_HREF)}
        style={{ marginBottom: spacing.lg }}
        accessibilityRole="link"
      >
        <Text
          style={[
            typography.subtitle,
            { color: colors.secondary, fontWeight: '600' },
          ]}
        >
          View withdrawal history →
        </Text>
      </Pressable>

      <Text
        style={[
          typography.title,
          { color: colors.text.primary, marginBottom: spacing.sm },
        ]}
      >
        Capital history
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.md }}
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
        <Text
          style={[
            typography.caption,
            { color: colors.error, marginBottom: spacing.sm },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
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
      {loading && transactions.length === 0 ? (
        <View style={{ padding: spacing.md }}>
          {renderHeader()}
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} />
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id || item.transaction_id}
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xl,
            flexGrow: 1,
          }}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.secondary}
              colors={[colors.secondary]}
            />
          }
          renderItem={({ item }) => {
            const debit = isDebitType(item.type);
            const amount = Math.round(Number(item.amount) || 0);
            const dateValue = item.transfer_date || item.created_at;
            const utr = showListUtr(item);

            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={[
                  styles.txRow,
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
                    {formatDate(dateValue)}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, fontWeight: '500' },
                    ]}
                  >
                    {humanizeType(item.type)}
                  </Text>
                  {utr ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.text.secondary },
                      ]}
                      numberOfLines={1}
                    >
                      UTR: {utr}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text
                    style={[
                      typography.title,
                      {
                        color: debit ? colors.error : colors.success,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {debit ? '-' : '+'}
                    {formatCurrency(amount)}
                  </Text>
                  <StatusChip status={item.status} />
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No capital transactions"
              subtitle={
                filter === 'all'
                  ? 'Deposits and withdrawals will appear here.'
                  : 'No transactions match this filter.'
              }
            />
          }
          ListFooterComponent={
            <View style={{ marginTop: spacing.md }}>
              {!isWeb && loadingMore ? (
                <ActivityIndicator color={colors.secondary} />
              ) : null}
              {isWeb && total > 0 ? (
                <View
                  style={[
                    styles.pagination,
                    { gap: spacing.sm, marginTop: spacing.sm },
                  ]}
                >
                  <Button
                    title="Previous"
                    variant="secondary"
                    fullWidth={false}
                    disabled={page <= 1 || loading}
                    onPress={() => goToPage(page - 1)}
                    style={styles.pageBtn}
                  />
                  <Text
                    style={[typography.caption, { color: colors.text.secondary }]}
                  >
                    Page {page} of {Math.max(1, totalPages)}
                  </Text>
                  <Button
                    title="Next"
                    variant="secondary"
                    fullWidth={false}
                    disabled={page >= Math.max(1, totalPages) || loading}
                    onPress={() => goToPage(page + 1)}
                    style={styles.pageBtn}
                  />
                </View>
              ) : null}
            </View>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
        />
      )}

      <AddCapitalModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false);
          void reload(true);
        }}
      />
      <WithdrawModal
        visible={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onSuccess={() => {
          setWithdrawOpen(false);
          void reload(true);
        }}
        isCapitalLocked={Boolean(balance?.isLocked)}
        capitalBalance={balance?.capitalBalance ?? 0}
        revenueBalance={balance?.revenueBalance ?? 0}
      />
      <CapitalTransactionDetail
        visible={selected !== null}
        transaction={selected}
        onClose={() => setSelected(null)}
        onCancelled={(updated) => {
          setTransactions((prev) =>
            prev.map((tx) =>
              tx.id === updated.id ||
              tx.transaction_id === updated.transaction_id
                ? { ...tx, status: updated.status }
                : tx
            )
          );
          setSelected(null);
          void reload(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
  filterChip: {
    borderWidth: 1,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtn: {
    minWidth: 110,
    paddingHorizontal: 12,
  },
});
