import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { revenueService } from '../../services/revenue.service';
import { ApiClientError } from '../../types/api.types';
import { getISTParts } from '../../utils/formatDate';
import { SummaryCard } from '../../components/cards/SummaryCard';
import { TransactionItem, type TransactionListItem } from '../../components/cards/TransactionItem';
import { TransactionDetailModal } from '../../components/modals/TransactionDetailModal';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

const PAGE_SIZE = 20;
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const isWeb = Platform.OS === 'web';

/** Ledger row shape from investor revenue transactions API */
type RevenueLedgerRow = {
  transaction_id: string;
  date: string;
  description: string;
  credit_amount: number;
  debit_amount: number;
  type: string;
  is_backdated?: boolean;
  is_reversed?: boolean;
  balance?: number;
};

type ListMeta = {
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

function currentIstMonthYear(): { month: number; year: number } {
  const parts = getISTParts(new Date());
  return { month: parts.month, year: parts.year };
}

function yearOptions(): number[] {
  const { year } = currentIstMonthYear();
  const years: number[] = [];
  for (let y = year; y >= 2020; y -= 1) {
    years.push(y);
  }
  return years;
}

function toListItem(row: RevenueLedgerRow): TransactionListItem {
  const credit = Math.round(Number(row.credit_amount) || 0);
  const debit = Math.round(Number(row.debit_amount) || 0);
  const isDebit = debit > 0;
  const rawDescription = row.description || 'Revenue entry';
  const description = /\bbackdated?\b/i.test(rawDescription)
    ? 'Revenue Credit'
    : rawDescription;
  return {
    id: row.transaction_id,
    transactionId: row.transaction_id,
    date: row.date,
    description,
    amount: isDebit ? debit : credit,
    direction: isDebit ? 'debit' : 'credit',
  };
}

function extractRows(data: {
  transactions?: RevenueLedgerRow[];
  entries?: RevenueLedgerRow[];
}): RevenueLedgerRow[] {
  const list = data.transactions || data.entries || [];
  return list.filter((row) => Boolean(row?.transaction_id));
}

function extractMeta(data: {
  meta?: ListMeta;
  nextCursor?: string | null;
}): ListMeta {
  const meta: ListMeta = data.meta ?? { total: 0 };
  return {
    total: Math.round(Number(meta.total) || 0),
    page: meta.page,
    limit: meta.limit,
    totalPages: meta.totalPages,
    nextCursor: meta.nextCursor ?? data.nextCursor ?? null,
    hasMore: Boolean(meta.hasMore),
  };
}

export default function RevenueScreen() {
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const initial = useMemo(() => currentIstMonthYear(), []);
  const [filterMonth, setFilterMonth] = useState(initial.month);
  const [filterYear, setFilterYear] = useState(initial.year);
  const [picker, setPicker] = useState<'month' | 'year' | null>(null);

  const [summary, setSummary] = useState<{
    monthly_total: number;
    overall_total: number;
    total_withdrawn: number;
  } | null>(null);
  const [rows, setRows] = useState<RevenueLedgerRow[]>([]);
  const [meta, setMeta] = useState<ListMeta>({ total: 0, hasMore: false });
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<RevenueLedgerRow | null>(null);

  const loadSummary = useCallback(async () => {
    const data = await revenueService.getSummary();
    const monthly =
      filterMonth === data.month && filterYear === data.year
        ? Math.round(Number(data.monthly_total) || 0)
        : undefined;

    if (monthly === undefined) {
      const monthlyData = await revenueService.getMonthly({
        month: filterMonth,
        year: filterYear,
        page: 1,
        limit: 1,
      });
      setSummary({
        monthly_total: Math.round(Number(monthlyData.total) || 0),
        overall_total: Math.round(Number(data.overall_total) || 0),
        total_withdrawn: Math.round(Number(data.total_withdrawn) || 0),
      });
      return;
    }

    setSummary({
      monthly_total: monthly,
      overall_total: Math.round(Number(data.overall_total) || 0),
      total_withdrawn: Math.round(Number(data.total_withdrawn) || 0),
    });
  }, [filterMonth, filterYear]);

  const loadPage = useCallback(
    async (opts: {
      pageNum?: number;
      cursor?: string | null;
      append?: boolean;
      isRefresh?: boolean;
    }) => {
      const { pageNum = 1, cursor, append = false, isRefresh = false } = opts;

      if (isRefresh) {
        setRefreshing(true);
      } else if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params: {
          month: number;
          year: number;
          limit: number;
          page?: number;
          cursor?: string;
        } = {
          month: filterMonth,
          year: filterYear,
          limit: PAGE_SIZE,
        };

        if (isWeb) {
          params.page = pageNum;
        } else if (cursor) {
          params.cursor = cursor;
        } else {
          params.page = 1;
        }

        const data = await revenueService.getTransactions(params);
        const nextRows = extractRows(data as {
          transactions?: RevenueLedgerRow[];
          entries?: RevenueLedgerRow[];
        });
        const nextMeta = extractMeta(data as {
          meta?: ListMeta;
          nextCursor?: string | null;
        });

        setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
        setMeta(nextMeta);
        setPage(pageNum);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load revenue transactions'
        );
        if (!append) {
          setRows([]);
          setMeta({ total: 0, hasMore: false });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filterMonth, filterYear]
  );

  const reload = useCallback(
    async (isRefresh = false) => {
      try {
        await Promise.all([
          loadSummary(),
          loadPage({ pageNum: 1, append: false, isRefresh }),
        ]);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load revenue'
        );
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadSummary, loadPage]
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
    if (!meta.hasMore || !meta.nextCursor) {
      return;
    }
    void loadPage({
      cursor: meta.nextCursor,
      append: true,
    });
  };

  const goToPage = (nextPage: number) => {
    if (!isWeb || loading || refreshing) {
      return;
    }
    const totalPages = Math.max(1, Math.round(Number(meta.totalPages) || 1));
    if (nextPage < 1 || nextPage > totalPages) {
      return;
    }
    void loadPage({ pageNum: nextPage, append: false });
  };

  const listItems = useMemo(() => rows.map(toListItem), [rows]);

  const selectedDetail = useMemo(() => {
    if (!selected) {
      return null;
    }
    const debit = Math.round(Number(selected.debit_amount) || 0);
    const credit = Math.round(Number(selected.credit_amount) || 0);
    const isDebit = debit > 0;
    const rawDescription = selected.description || 'Revenue entry';
    const description = /\bbackdated?\b/i.test(rawDescription)
      ? 'Revenue Credit'
      : rawDescription;
    return {
      transactionId: selected.transaction_id,
      date: selected.date,
      time: null as string | null,
      type: selected.type,
      amount: isDebit ? debit : credit,
      direction: (isDebit ? 'debit' : 'credit') as 'credit' | 'debit',
      description,
      status: selected.is_reversed ? 'cancelled' : 'completed',
      balance:
        typeof selected.balance === 'number' ? selected.balance : null,
      extraRows: [
        ...(selected.is_reversed
          ? [{ label: 'Reversed', value: 'Yes' }]
          : []),
      ],
    };
  }, [selected]);

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.md }}>
      <SummaryCard
        title="Revenue Summary"
        rows={[
          {
            label: 'Monthly Total',
            value: summary?.monthly_total ?? 0,
            isAmount: true,
          },
          {
            label: 'Overall Total',
            value: summary?.overall_total ?? 0,
            isAmount: true,
          },
          {
            label: 'Total Withdrawn',
            value: summary?.total_withdrawn ?? 0,
            isAmount: true,
          },
        ]}
        style={{ marginBottom: spacing.md }}
      />

      <Text
        style={[
          typography.caption,
          { color: colors.text.secondary, marginBottom: spacing.xs },
        ]}
      >
        Filter by month / year
      </Text>
      <View style={[styles.filterRow, { gap: spacing.sm }]}>
        <Pressable
          onPress={() => setPicker('month')}
          style={[
            styles.filterChip,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: borderRadius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select month"
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>
            {MONTH_LABELS[filterMonth - 1]}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
        </Pressable>
        <Pressable
          onPress={() => setPicker('year')}
          style={[
            styles.filterChip,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: borderRadius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select year"
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>
            {filterYear}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
        </Pressable>
      </View>

      {error ? (
        <Text
          style={[
            typography.caption,
            { color: colors.error, marginTop: spacing.sm },
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
      {loading && rows.length === 0 ? (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xl,
          }}
        >
          {renderHeader()}
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={72} />
        </ScrollView>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.transactionId}
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
          renderItem={({ item, index }) => (
            <TransactionItem
              item={item}
              onPress={() => setSelected(rows[index] || null)}
              style={{ marginBottom: spacing.sm }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No revenue transactions"
              subtitle={`Nothing recorded for ${MONTH_LABELS[filterMonth - 1]} ${filterYear}.`}
            />
          }
          ListFooterComponent={
            <View style={{ marginTop: spacing.md }}>
              {!isWeb && loadingMore ? (
                <ActivityIndicator color={colors.secondary} />
              ) : null}
              {isWeb && meta.total > 0 ? (
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
                    Page {page} of {Math.max(1, Math.round(Number(meta.totalPages) || 1))}
                  </Text>
                  <Button
                    title="Next"
                    variant="secondary"
                    fullWidth={false}
                    disabled={
                      page >= Math.max(1, Math.round(Number(meta.totalPages) || 1)) ||
                      loading
                    }
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

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: colors.primary, opacity: 0.45 },
            ]}
            onPress={() => setPicker(null)}
          />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.md,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                typography.title,
                { color: colors.text.primary, marginBottom: spacing.sm },
              ]}
            >
              {picker === 'month' ? 'Select month' : 'Select year'}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {picker === 'month'
                ? MONTH_LABELS.map((label, idx) => {
                    const month = idx + 1;
                    const active = month === filterMonth;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => {
                          setFilterMonth(month);
                          setPicker(null);
                        }}
                        style={[
                          styles.optionRow,
                          {
                            backgroundColor: active
                              ? colors.surface
                              : 'transparent',
                            borderRadius: borderRadius.sm,
                            padding: spacing.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.body,
                            {
                              color: active
                                ? colors.secondary
                                : colors.text.primary,
                              fontWeight: active ? '700' : '400',
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })
                : yearOptions().map((year) => {
                    const active = year === filterYear;
                    return (
                      <Pressable
                        key={year}
                        onPress={() => {
                          setFilterYear(year);
                          setPicker(null);
                        }}
                        style={[
                          styles.optionRow,
                          {
                            backgroundColor: active
                              ? colors.surface
                              : 'transparent',
                            borderRadius: borderRadius.sm,
                            padding: spacing.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.body,
                            {
                              color: active
                                ? colors.secondary
                                : colors.text.primary,
                              fontWeight: active ? '700' : '400',
                            },
                          ]}
                        >
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <TransactionDetailModal
        visible={selected !== null}
        onClose={() => setSelected(null)}
        transaction={selectedDetail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
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
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    borderWidth: 1,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    zIndex: 1,
  },
  optionRow: {
    marginBottom: 4,
  },
});
