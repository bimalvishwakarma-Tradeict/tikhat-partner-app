import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { AmountDisplay } from '../../../components/common/AmountDisplay';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { toast } from '../../../components/ui/Toast';

type Dashboard = {
  total_capital_under_management?: number;
  total_capital_under_management_formatted?: string;
  pending_deposits?: { count?: number; amount?: number; amount_formatted?: string };
  pending_withdrawals?: {
    count?: number;
    amount?: number;
    amount_formatted?: string;
  };
};

type CapitalInvestor = {
  id: string;
  full_name: string;
  email: string;
  capitalBalance?: number;
  capitalBalanceFormatted?: string;
  pendingWithdrawalAmount?: number;
  is_locked?: boolean;
  statusLabel?: string;
  status?: string;
};

type MoneyForm = { amount: string; remark: string };

/**
 * Admin capital overview — stats, request queue link, investor lock/credit/debit.
 */
export default function AdminCapitalIndexScreen() {
  const router = useRouter();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [investors, setInvestors] = useState<CapitalInvestor[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [moneyOpen, setMoneyOpen] = useState(false);
  const [moneyMode, setMoneyMode] = useState<'credit' | 'debit'>('credit');
  const [moneyTarget, setMoneyTarget] = useState<CapitalInvestor | null>(null);
  const [moneyForm, setMoneyForm] = useState<MoneyForm>({ amount: '', remark: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [dash, list] = await Promise.all([
        adminService.getCapitalDashboard(),
        adminService.listCapitalInvestors({
          search: search.trim() || undefined,
          page: 1,
          limit: 40,
          sort: 'capital_desc',
        }) as Promise<{ investors?: CapitalInvestor[] }>,
      ]);
      setDashboard(dash as Dashboard);
      setInvestors(list.investors || []);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load capital data'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const toggleLock = (item: CapitalInvestor) => {
    const locked = Boolean(item.is_locked);
    const message = locked
      ? 'Unlock capital for this investor?'
      : 'Lock capital? Pending withdrawals will be auto-cancelled.';
    const run = async () => {
      try {
        if (locked) {
          await adminService.unlockCapital(item.id);
          toast.success('Capital unlocked');
        } else {
          await adminService.lockCapital(item.id);
          toast.success('Capital locked');
        }
        await load(true);
      } catch (err) {
        toast.error(
          err instanceof ApiClientError ? err.message : 'Lock update failed'
        );
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) void run();
      return;
    }
    Alert.alert(locked ? 'Unlock capital' : 'Lock capital', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: locked ? 'Unlock' : 'Lock', onPress: () => void run() },
    ]);
  };

  const openMoney = (item: CapitalInvestor, mode: 'credit' | 'debit') => {
    setMoneyTarget(item);
    setMoneyMode(mode);
    setMoneyForm({ amount: '', remark: '' });
    setMoneyOpen(true);
  };

  const submitMoney = async () => {
    if (!moneyTarget) return;
    const amount = Math.round(Number(moneyForm.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid whole-rupee amount');
      return;
    }
    const confirmMsg = `${moneyMode === 'credit' ? 'Credit' : 'Debit'} ${formatCurrency(amount)} for ${moneyTarget.full_name}?`;
    const proceed =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(confirmMsg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Confirm', confirmMsg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Confirm', onPress: () => resolve(true) },
            ]);
          });
    if (!proceed) return;

    setSaving(true);
    try {
      if (moneyMode === 'credit') {
        await adminService.creditCapital(moneyTarget.id, {
          amount,
          remark: moneyForm.remark.trim() || undefined,
        });
      } else {
        await adminService.debitCapital(moneyTarget.id, {
          amount,
          remark: moneyForm.remark.trim() || undefined,
        });
      }
      toast.success(moneyMode === 'credit' ? 'Capital credited' : 'Capital debited');
      setMoneyOpen(false);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Operation failed'
      );
    } finally {
      setSaving(false);
    }
  };

  const pendingDep = dashboard?.pending_deposits;
  const pendingWdr = dashboard?.pending_withdrawals;

  if (loading && !dashboard) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Skeleton height={80} />
        <Skeleton height={80} />
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
              Capital
            </Text>
            {error ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}

            <View style={styles.statsRow}>
              <Stat
                label="Total capital"
                value={
                  dashboard?.total_capital_under_management_formatted ||
                  formatCurrency(
                    Math.round(
                      Number(dashboard?.total_capital_under_management) || 0
                    )
                  )
                }
              />
              <Stat
                label="Pending deposits"
                value={`${Math.round(Number(pendingDep?.count) || 0)} · ${
                  pendingDep?.amount_formatted ||
                  formatCurrency(Math.round(Number(pendingDep?.amount) || 0))
                }`}
              />
              <Stat
                label="Pending withdrawals"
                value={`${Math.round(Number(pendingWdr?.count) || 0)} · ${
                  pendingWdr?.amount_formatted ||
                  formatCurrency(Math.round(Number(pendingWdr?.amount) || 0))
                }`}
              />
            </View>

            <Button
              title="Open request queue"
              variant="golden"
              onPress={() =>
                router.push('/(admin)/capital/requests' as Href)
              }
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => void load(false)}
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
            <Button
              title="Search"
              variant="secondary"
              onPress={() => void load(false)}
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
        renderItem={({ item }) => {
          const locked = Boolean(item.is_locked);
          return (
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
                    style={[typography.caption, { color: colors.text.secondary }]}
                  >
                    {item.email}
                  </Text>
                </View>
                <AmountDisplay
                  amount={Math.round(Number(item.capitalBalance) || 0)}
                  size="sm"
                />
              </View>
              <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
                <StatusChip
                  status={locked ? 'locked' : item.status || 'active'}
                  label={item.statusLabel || (locked ? 'Locked' : 'Available')}
                />
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  Pending WDR:{' '}
                  {formatCurrency(
                    Math.round(Number(item.pendingWithdrawalAmount) || 0)
                  )}
                </Text>
              </View>
              <View style={[styles.actions, { marginTop: spacing.sm }]}>
                <Pressable onPress={() => toggleLock(item)} hitSlop={6}>
                  <Text
                    style={{
                      color: locked ? colors.success : colors.warning,
                      fontWeight: '700',
                    }}
                  >
                    {locked ? 'Unlock' : 'Lock'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => openMoney(item, 'credit')} hitSlop={6}>
                  <Text style={{ color: colors.secondary, fontWeight: '700' }}>
                    Credit
                  </Text>
                </Pressable>
                <Pressable onPress={() => openMoney(item, 'debit')} hitSlop={6}>
                  <Text style={{ color: colors.error, fontWeight: '700' }}>
                    Debit
                  </Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState title="No investors" subtitle="Try a different search." />
        }
      />

      <Modal visible={moneyOpen} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.md,
              },
            ]}
          >
            <Text style={[typography.title, { color: colors.text.primary }]}>
              {moneyMode === 'credit' ? 'Credit capital' : 'Debit capital'}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: 4 },
              ]}
            >
              {moneyTarget?.full_name}
            </Text>
            <TextInput
              value={moneyForm.amount}
              onChangeText={(v) =>
                setMoneyForm((p) => ({ ...p, amount: v.replace(/[^\d]/g, '') }))
              }
              keyboardType="number-pad"
              placeholder="Amount (₹)"
              placeholderTextColor={colors.text.secondary}
              style={[
                typography.body,
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text.primary,
                  marginTop: spacing.md,
                },
              ]}
            />
            <TextInput
              value={moneyForm.remark}
              onChangeText={(v) => setMoneyForm((p) => ({ ...p, remark: v }))}
              placeholder="Remark (optional)"
              placeholderTextColor={colors.text.secondary}
              style={[
                typography.body,
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text.primary,
                  marginTop: spacing.sm,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setMoneyOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Confirm"
                  variant="golden"
                  loading={saving}
                  onPress={() => void submitMoney()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actions: { flexDirection: 'row', gap: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
