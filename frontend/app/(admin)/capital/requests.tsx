import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import { AmountDisplay } from '../../../components/common/AmountDisplay';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { toast } from '../../../components/ui/Toast';

type TabKey = 'deposit' | 'withdrawal';

type CapitalRequest = {
  id: string;
  transaction_id?: string;
  investor_id: string;
  investor_name?: string;
  investor_email?: string;
  request_type?: string;
  amount: number;
  original_requested_amount?: number | null;
  status: string;
  utr_number?: string | null;
  transfer_date?: string | null;
  account_type?: string;
  transfer_mode?: string;
  created_at?: string;
  payment_screenshot_url?: string | null;
};

type InvestorBank = {
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  upi_id?: string | null;
};

/**
 * Admin capital request queue — deposits & withdrawals.
 */
export default function AdminCapitalRequestsScreen() {
  const { colors, spacing, typography, borderRadius } = useTheme();
  const [tab, setTab] = useState<TabKey>('deposit');
  const [requests, setRequests] = useState<CapitalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<CapitalRequest | null>(null);
  const [approveAmount, setApproveAmount] = useState('');

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<CapitalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<CapitalRequest | null>(
    null
  );
  const [completeUtr, setCompleteUtr] = useState('');
  const [completeDate, setCompleteDate] = useState('');

  const [bankMap, setBankMap] = useState<Record<string, InvestorBank>>({});

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = (await adminService.listCapitalRequests({
          type: tab,
          page: 1,
          limit: 100,
        })) as { requests?: CapitalRequest[] };
        const rows = data.requests || [];
        setRequests(rows);
        setSelected({});

        if (tab === 'withdrawal') {
          const ids = [...new Set(rows.map((r) => r.investor_id))];
          const next: Record<string, InvestorBank> = {};
          await Promise.all(
            ids.slice(0, 20).map(async (id) => {
              try {
                const detail = (await adminService.getInvestor(id)) as {
                  investor?: InvestorBank;
                };
                next[id] = detail.investor || {};
              } catch {
                next[id] = {};
              }
            })
          );
          setBankMap(next);
        }
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load capital requests'
        );
        setRequests([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const downloadScreenshot = async (item: CapitalRequest) => {
    setBusyId(item.id);
    try {
      let fileRef = item.payment_screenshot_url;
      if (!fileRef) {
        const full = (await adminService.getInvestorCapitalFull(
          item.investor_id
        )) as { transactions?: Array<{ id: string; payment_screenshot_url?: string }> };
        const tx = (full.transactions || []).find((t) => t.id === item.id);
        fileRef = tx?.payment_screenshot_url || null;
      }
      if (!fileRef) {
        toast.error('No payment screenshot available');
        return;
      }

      const looksLikeUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          fileRef
        );

      if (looksLikeUuid) {
        const file = await adminService.downloadFile(fileRef);
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const blob = new Blob([file.data], {
            type: file.contentType || 'application/octet-stream',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.filename || 'payment-screenshot';
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Download started');
          return;
        }
      }

      const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
      const uri = /^https?:\/\//i.test(fileRef)
        ? fileRef
        : `${base}/uploads/${String(fileRef).replace(/^\/+/, '').replace(/^uploads\//, '')}`;
      await Linking.openURL(uri);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Could not download screenshot'
      );
    } finally {
      setBusyId(null);
    }
  };

  const openApproveDeposit = (item: CapitalRequest) => {
    setApproveTarget(item);
    setApproveAmount(
      String(
        Math.round(
          Number(item.original_requested_amount || item.amount) || 0
        )
      )
    );
    setApproveOpen(true);
  };

  const confirmApproveDeposit = async () => {
    if (!approveTarget) return;
    const amount = Math.round(Number(approveAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid approval amount');
      return;
    }
    const original = Math.round(
      Number(
        approveTarget.original_requested_amount || approveTarget.amount
      ) || 0
    );
    const msg = `Approve deposit for ${approveTarget.investor_name}? Original: ${formatCurrency(original)} → Approved: ${formatCurrency(amount)}`;
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(msg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Approve deposit', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Approve', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;

    setBusyId(approveTarget.id);
    try {
      await adminService.approveDeposit(approveTarget.id, { amount });
      toast.success('Deposit approved');
      setApproveOpen(false);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Approve failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Rejection reason is required');
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      if (tab === 'deposit') {
        await adminService.rejectDeposit(rejectTarget.id, reason);
      } else {
        await adminService.rejectWithdrawal(rejectTarget.id, reason);
      }
      toast.success('Request rejected');
      setRejectOpen(false);
      setRejectReason('');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Reject failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const approveWithdrawal = async (item: CapitalRequest) => {
    const msg = `Approve withdrawal of ${formatCurrency(Math.round(item.amount))} for ${item.investor_name}?`;
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(msg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Approve withdrawal', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Approve', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await adminService.approveWithdrawal(item.id);
      toast.success('Withdrawal approved');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Approve failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const processWithdrawal = async (item: CapitalRequest) => {
    setBusyId(item.id);
    try {
      await adminService.processWithdrawal(item.id);
      toast.success('Marked as processed');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Process failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const submitComplete = async () => {
    if (!completeTarget) return;
    const utr = completeUtr.trim().toUpperCase();
    if (!utr) {
      toast.error('Payment UTR is required');
      return;
    }
    setBusyId(completeTarget.id);
    try {
      await adminService.completeWithdrawal(completeTarget.id, {
        payment_utr: utr,
        payment_date: completeDate.trim() || undefined,
      });
      toast.success('Withdrawal completed');
      setCompleteOpen(false);
      setCompleteUtr('');
      setCompleteDate('');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Complete failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const bulkApprove = async () => {
    if (selectedIds.length === 0) {
      toast.error('Select withdrawals to approve');
      return;
    }
    const msg = `Bulk approve ${selectedIds.length} withdrawal(s)?`;
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(msg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Bulk approve', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Approve all', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    setBusyId('bulk');
    try {
      await adminService.bulkApproveWithdrawals(selectedIds);
      toast.success('Bulk approve completed');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Bulk approve failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleLockFromRequest = async (item: CapitalRequest) => {
    const msg =
      'Lock this investor capital? Pending withdrawals will be auto-cancelled.';
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(msg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Lock capital', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Lock', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await adminService.lockCapital(item.investor_id);
      toast.success('Capital locked');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Lock failed'
      );
    }
  };

  const header = (
    <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
      <View style={styles.tabs}>
        {(['deposit', 'withdrawal'] as TabKey[]).map((key) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[
                styles.tab,
                {
                  borderColor: active ? colors.secondary : colors.border,
                  backgroundColor: active ? colors.surface : colors.background,
                  borderRadius: borderRadius.md,
                },
              ]}
            >
              <Text
                style={[
                  typography.subtitle,
                  {
                    color: active ? colors.secondary : colors.text.secondary,
                    fontWeight: active ? '700' : '500',
                  },
                ]}
              >
                {key === 'deposit' ? 'Deposit Requests' : 'Withdrawal Requests'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'withdrawal' ? (
        <Button
          title={`Bulk approve selected (${selectedIds.length})`}
          variant="golden"
          loading={busyId === 'bulk'}
          onPress={() => void bulkApprove()}
        />
      ) : null}

      {error ? (
        <Text style={[typography.caption, { color: colors.error }]}>{error}</Text>
      ) : null}
    </View>
  );

  if (loading && requests.length === 0) {
    return (
      <View style={{ padding: spacing.md }}>
        {header}
        <Skeleton height={100} style={{ marginBottom: 8 }} />
        <Skeleton height={100} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={requests}
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
            onRefresh={() => void load(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        renderItem={({ item }) => {
          const bank = bankMap[item.investor_id];
          const status = String(item.status).toLowerCase();
          const isWdr = tab === 'withdrawal';
          return (
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {isWdr ? (
                    <Pressable
                      onPress={() =>
                        setSelected((prev) => ({
                          ...prev,
                          [item.id]: !prev[item.id],
                        }))
                      }
                      style={[
                        styles.check,
                        {
                          borderColor: colors.border,
                          backgroundColor: selected[item.id]
                            ? colors.secondary
                            : colors.surface,
                        },
                      ]}
                    >
                      {selected[item.id] ? (
                        <Text style={{ color: colors.primary, fontWeight: '700' }}>
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        typography.body,
                        { color: colors.text.primary, fontWeight: '700' },
                      ]}
                    >
                      {item.investor_name || 'Investor'}
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.text.secondary },
                      ]}
                      selectable
                    >
                      {item.transaction_id || item.id}
                    </Text>
                  </View>
                </View>
                <StatusChip status={item.status} />
              </View>

              <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
                <AmountDisplay amount={Math.round(Number(item.amount) || 0)} />
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {item.created_at ? formatDate(item.created_at) : '—'}
                </Text>
              </View>

              {!isWdr ? (
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    UTR: {item.utr_number || '—'}
                  </Text>
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    Transfer date:{' '}
                    {item.transfer_date ? formatDate(item.transfer_date) : '—'}
                  </Text>
                  {item.original_requested_amount != null ? (
                    <Text
                      style={[typography.caption, { color: colors.text.secondary }]}
                    >
                      Original:{' '}
                      {formatCurrency(
                        Math.round(Number(item.original_requested_amount) || 0)
                      )}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    Account: {item.account_type || '—'} · Mode:{' '}
                    {item.transfer_mode || '—'}
                  </Text>
                  {bank ? (
                    <>
                      <Text
                        style={[typography.caption, { color: colors.text.secondary }]}
                      >
                        Bank: {bank.bank_name || '—'} / {bank.bank_account_name || '—'}
                      </Text>
                      <Text
                        style={[typography.caption, { color: colors.text.secondary }]}
                        selectable
                      >
                        A/C: {bank.bank_account_number || '—'} · IFSC:{' '}
                        {bank.bank_ifsc || '—'}
                      </Text>
                      <Text
                        style={[typography.caption, { color: colors.text.secondary }]}
                        selectable
                      >
                        UPI: {bank.upi_id || '—'}
                      </Text>
                    </>
                  ) : null}
                </View>
              )}

              <View style={[styles.actions, { marginTop: spacing.md }]}>
                {!isWdr ? (
                  <>
                    <Pressable
                      onPress={() => void downloadScreenshot(item)}
                      disabled={busyId === item.id}
                    >
                      <Text style={{ color: colors.secondary, fontWeight: '700' }}>
                        Screenshot
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => openApproveDeposit(item)}>
                      <Text style={{ color: colors.success, fontWeight: '700' }}>
                        Approve
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setRejectTarget(item);
                        setRejectReason('');
                        setRejectOpen(true);
                      }}
                    >
                      <Text style={{ color: colors.error, fontWeight: '700' }}>
                        Reject
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    {(status === 'submitted' || status === 'under_review') && (
                      <Pressable onPress={() => void approveWithdrawal(item)}>
                        <Text style={{ color: colors.success, fontWeight: '700' }}>
                          Approve
                        </Text>
                      </Pressable>
                    )}
                    {status === 'approved' && (
                      <Pressable onPress={() => void processWithdrawal(item)}>
                        <Text style={{ color: colors.secondary, fontWeight: '700' }}>
                          Process
                        </Text>
                      </Pressable>
                    )}
                    {(status === 'approved' || status === 'processed') && (
                      <Pressable
                        onPress={() => {
                          setCompleteTarget(item);
                          setCompleteUtr('');
                          setCompleteDate('');
                          setCompleteOpen(true);
                        }}
                      >
                        <Text style={{ color: colors.secondary, fontWeight: '700' }}>
                          Complete
                        </Text>
                      </Pressable>
                    )}
                    {(status === 'submitted' ||
                      status === 'under_review' ||
                      status === 'approved') && (
                      <Pressable
                        onPress={() => {
                          setRejectTarget(item);
                          setRejectReason('');
                          setRejectOpen(true);
                        }}
                      >
                        <Text style={{ color: colors.error, fontWeight: '700' }}>
                          Reject
                        </Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => void toggleLockFromRequest(item)}>
                      <Text style={{ color: colors.warning, fontWeight: '700' }}>
                        Lock capital
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No requests"
            subtitle={`No pending ${tab} requests.`}
          />
        }
      />

      <Modal visible={approveOpen} transparent animationType="fade">
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
              Approve deposit
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: 4 },
              ]}
            >
              Original:{' '}
              {formatCurrency(
                Math.round(
                  Number(
                    approveTarget?.original_requested_amount ||
                      approveTarget?.amount
                  ) || 0
                )
              )}
            </Text>
            <TextInput
              value={approveAmount}
              onChangeText={(v) => setApproveAmount(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="Approved amount"
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
            <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setApproveOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Approve"
                  variant="golden"
                  loading={busyId === approveTarget?.id}
                  onPress={() => void confirmApproveDeposit()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={rejectOpen} transparent animationType="fade">
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
              Reject request
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason"
              placeholderTextColor={colors.text.secondary}
              multiline
              style={[
                typography.body,
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text.primary,
                  marginTop: spacing.md,
                  minHeight: 80,
                  textAlignVertical: 'top',
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setRejectOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Reject"
                  variant="golden"
                  onPress={() => void submitReject()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={completeOpen} transparent animationType="fade">
        <View style={styles.backdrop}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              padding: 24,
            }}
            keyboardShouldPersistTaps="handled"
          >
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
                Complete withdrawal
              </Text>
              <TextInput
                value={completeUtr}
                onChangeText={setCompleteUtr}
                placeholder="Payment UTR (required)"
                autoCapitalize="characters"
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
                value={completeDate}
                onChangeText={setCompleteDate}
                placeholder="Payment date YYYY-MM-DD (optional)"
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
                    onPress={() => setCompleteOpen(false)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Complete"
                    variant="golden"
                    loading={busyId === completeTarget?.id}
                    onPress={() => void submitComplete()}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  check: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.45)',
    justifyContent: 'center',
  },
  modalCard: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
