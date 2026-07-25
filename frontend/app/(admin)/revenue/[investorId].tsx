import { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
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
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTheme } from '../../../hooks/useTheme';
import { revenueService } from '../../../services/revenue.service';
import { ApiClientError } from '../../../types/api.types';
import type { CreditSettings, RoiTerm } from '../../../types/models.types';
import { formatCurrency, formatRoiPercent } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import { zodResolver } from '../../../utils/validationSchemas';
import { FormDatePicker } from '../../../components/forms/FormDatePicker';
import { FormInput } from '../../../components/forms/FormInput';
import { FormTextArea } from '../../../components/forms/FormTextArea';
import { AmountDisplay } from '../../../components/common/AmountDisplay';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { toast } from '../../../components/ui/Toast';

type LedgerRow = {
  id: string;
  transaction_id?: string;
  credit_date?: string;
  credit_amount?: number;
  debit_amount?: number;
  amount?: number;
  credit_type?: string;
  remark?: string | null;
  is_reversed?: boolean;
  description?: string;
};

type SummaryData = {
  investor?: { id: string; full_name: string; email?: string; status?: string };
  revenue_balance?: number;
  monthly_total?: number;
  overall_total?: number;
  roi?: {
    activePercentage?: number;
    defaultRoi?: { roi_percentage?: number } | number | null;
    terms?: RoiTerm[];
  };
  creditSettings?: CreditSettings;
};

const defaultRoiSchema = z.object({
  percentage: z.coerce.number().positive('Enter a positive ROI %'),
});

const termSchema = z.object({
  percentage: z.coerce.number().positive('Enter a positive ROI %'),
  start_date: z.string().min(1, 'Start date required'),
  end_date: z.string().min(1, 'End date required'),
});

const manualSchema = z.object({
  amount: z.coerce.number().positive('Enter a valid amount'),
  date: z.string().min(1, 'Date required'),
  remark: z.string().optional(),
});

const settingsSchema = z.object({
  credit_frequency: z.string().min(1),
  withdrawal_frequency: z.string().min(1),
  credit_time_hour: z.coerce.number().min(0).max(23),
  credit_time_minute: z.coerce.number().min(0).max(59),
});

type DefaultRoiForm = z.infer<typeof defaultRoiSchema>;
type TermForm = z.infer<typeof termSchema>;
type ManualForm = z.infer<typeof manualSchema>;
type SettingsForm = z.infer<typeof settingsSchema>;

function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', onPress: () => resolve(true) },
    ]);
  });
}

function roiPercent(value: SummaryData['roi']): string {
  const def = value?.defaultRoi;
  if (def == null) return '—';
  if (typeof def === 'number') return formatRoiPercent(def);
  if (typeof def === 'object' && def.roi_percentage != null) {
    return formatRoiPercent(def.roi_percentage);
  }
  return '—';
}

function termRoiValue(term: RoiTerm & { roi_percentage?: number }): number {
  return Number.parseFloat(
    String(term.percentage ?? term.roi_percentage ?? NaN)
  );
}

/**
 * Per-investor admin revenue controls.
 */
export default function AdminRevenueDetailScreen() {
  const navigation = useNavigation();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const params = useLocalSearchParams<{ investorId: string }>();
  const investorId = String(params.investorId || '');

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [terms, setTerms] = useState<RoiTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [termOpen, setTermOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMode, setManualMode] = useState<'credit' | 'debit'>('credit');

  const defaultForm = useForm<DefaultRoiForm>({
    resolver: zodResolver(defaultRoiSchema),
    defaultValues: { percentage: undefined as unknown as number },
  });
  const termForm = useForm<TermForm>({
    resolver: zodResolver(termSchema),
    defaultValues: {
      percentage: undefined as unknown as number,
      start_date: '',
      end_date: '',
    },
  });
  const manualForm = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      amount: undefined as unknown as number,
      date: '',
      remark: '',
    },
  });
  const settingsForm = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      credit_frequency: 'daily',
      withdrawal_frequency: 'daily',
      credit_time_hour: 18,
      credit_time_minute: 0,
    },
  });

  const load = useCallback(
    async (isRefresh = false) => {
      if (!investorId) {
        setError('Investor not found');
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [sum, tx, roi] = await Promise.all([
          revenueService.getInvestorSummary(investorId) as Promise<SummaryData>,
          revenueService.getInvestorTransactions(investorId, {
            page: 1,
            limit: 40,
          }) as Promise<{ transactions?: LedgerRow[]; entries?: LedgerRow[] }>,
          revenueService.getInvestorRoi(investorId),
        ]);
        setSummary(sum);
        const rows = tx.transactions || tx.entries || [];
        setLedger(rows as LedgerRow[]);
        const termList = (
          (roi.terms as (RoiTerm & { roi_percentage?: number })[]) ||
          (sum.roi?.terms as (RoiTerm & { roi_percentage?: number })[]) ||
          []
        ).map((term) => ({
          ...term,
          percentage: Number.parseFloat(
            String(term.percentage ?? term.roi_percentage ?? 0)
          ),
        }));
        setTerms(termList);

        const def = sum.roi?.defaultRoi;
        const defPct = Number.parseFloat(
          String(
            typeof def === 'number'
              ? def
              : def && typeof def === 'object'
                ? def.roi_percentage
                : (roi as { defaultRoi?: { roi_percentage?: number } })
                    .defaultRoi?.roi_percentage
          )
        );
        if (Number.isFinite(defPct) && defPct > 0) {
          defaultForm.reset({ percentage: defPct });
        }

        const cs = sum.creditSettings;
        if (cs) {
          settingsForm.reset({
            credit_frequency: String(cs.credit_frequency || 'daily'),
            withdrawal_frequency: String(cs.withdrawal_frequency || 'daily'),
            credit_time_hour: Number(cs.credit_time_hour ?? 18),
            credit_time_minute: Number(cs.credit_time_minute ?? 0),
          });
        }
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load revenue detail'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [investorId, defaultForm, settingsForm]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: summary?.investor?.full_name || 'Revenue Detail',
    });
  }, [navigation, summary?.investor?.full_name]);

  const saveDefaultRoi = defaultForm.handleSubmit(async (values) => {
    const pct = Number.parseFloat(String(values.percentage));
    const ok = await confirmAction(
      'Update default ROI',
      `Set default ROI to ${formatRoiPercent(pct)}?`
    );
    if (!ok) return;
    setBusy('roi');
    try {
      await revenueService.setDefaultRoi(investorId, pct);
      toast.success('Default ROI updated');
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  });

  const saveTerm = termForm.handleSubmit(async (values) => {
    const pct = Number.parseFloat(String(values.percentage));
    const ok = await confirmAction(
      'Add ROI term',
      `${formatRoiPercent(pct)} from ${values.start_date} to ${values.end_date}?`
    );
    if (!ok) return;
    setBusy('term');
    try {
      await revenueService.addRoiTerm(investorId, {
        percentage: pct,
        start_date: values.start_date,
        end_date: values.end_date,
      });
      toast.success('ROI term added');
      setTermOpen(false);
      termForm.reset({
        percentage: undefined as unknown as number,
        start_date: '',
        end_date: '',
      });
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Add term failed');
    } finally {
      setBusy(null);
    }
  });

  const deleteTerm = async (termId: string) => {
    const ok = await confirmAction('Delete ROI term', 'Remove this term?');
    if (!ok) return;
    setBusy(`del-${termId}`);
    try {
      await revenueService.deleteRoiTerm(investorId, termId);
      toast.success('Term deleted');
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = settingsForm.handleSubmit(async (values) => {
    const ok = await confirmAction(
      'Save settings',
      'Update credit frequency, withdrawal frequency, and credit time?'
    );
    if (!ok) return;
    setBusy('settings');
    try {
      await revenueService.updateCreditSettings(investorId, {
        credit_frequency: values.credit_frequency,
        withdrawal_frequency: values.withdrawal_frequency,
        credit_time_hour: Math.round(values.credit_time_hour),
        credit_time_minute: Math.round(values.credit_time_minute),
      });
      toast.success('Settings saved');
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  });

  const togglePause = async () => {
    const paused = Boolean(summary?.creditSettings?.is_paused);
    const ok = await confirmAction(
      paused ? 'Resume revenue' : 'Pause revenue',
      paused
        ? 'Resume daily revenue credit for this investor?'
        : 'Pause daily revenue credit for this investor?'
    );
    if (!ok) return;
    setBusy('pause');
    try {
      if (paused) await revenueService.resumeInvestor(investorId);
      else await revenueService.pauseInvestor(investorId);
      toast.success(paused ? 'Revenue resumed' : 'Revenue paused');
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  const submitManual = manualForm.handleSubmit(async (values) => {
    const amount = Math.round(values.amount);
    const ok = await confirmAction(
      manualMode === 'credit' ? 'Manual credit' : 'Manual debit',
      `${manualMode === 'credit' ? 'Credit' : 'Debit'} ${formatCurrency(amount)} on ${values.date}?`
    );
    if (!ok) return;
    setBusy('manual');
    try {
      if (manualMode === 'credit') {
        await revenueService.creditInvestor(investorId, {
          amount,
          date: values.date,
          remark: values.remark?.trim() || undefined,
        });
      } else {
        await revenueService.debitInvestor(investorId, {
          amount,
          date: values.date,
          remark: values.remark?.trim() || undefined,
        });
      }
      toast.success(manualMode === 'credit' ? 'Credit added' : 'Debit added');
      setManualOpen(false);
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Operation failed');
    } finally {
      setBusy(null);
    }
  });

  const reverseEntry = async (entry: LedgerRow) => {
    if (entry.is_reversed) return;
    const ok = await confirmAction(
      'Reverse entry',
      `Reverse ${entry.transaction_id || entry.id}? Balance will be adjusted.`
    );
    if (!ok) return;
    setBusy(`rev-${entry.id}`);
    try {
      await revenueService.reverseEntry(entry.id, 'Reversed by admin');
      toast.success('Entry reversed');
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Reverse failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !summary) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Skeleton height={96} />
        <Skeleton height={160} />
        <Skeleton height={200} />
      </View>
    );
  }

  const paused = Boolean(summary?.creditSettings?.is_paused);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.xl,
          gap: spacing.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>{error}</Text>
        ) : null}

        <Card accent>
          <Text style={[typography.h3, { color: colors.text.primary }]}>
            {summary?.investor?.full_name || 'Investor'}
          </Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            {summary?.investor?.email}
          </Text>
          <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
            <AmountDisplay
              amount={Math.round(Number(summary?.revenue_balance) || 0)}
            />
            <StatusChip status={paused ? 'paused' : 'active'} />
          </View>
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginTop: spacing.xs },
            ]}
          >
            Active ROI:{' '}
            {summary?.roi?.activePercentage != null
              ? formatRoiPercent(summary.roi.activePercentage)
              : '—'}{' '}
            · Default: {roiPercent(summary?.roi)}
          </Text>
        </Card>

        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
            ]}
          >
            Default ROI
          </Text>
          <FormInput
            control={defaultForm.control}
            name="percentage"
            label="ROI %"
            keyboardType="decimal-pad"
            placeholder="e.g. 2.25"
          />
          <Button
            title="Save default ROI"
            variant="golden"
            loading={busy === 'roi'}
            onPress={() => void saveDefaultRoi()}
          />
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.primary, fontWeight: '700' },
              ]}
            >
              Term-based ROI
            </Text>
            <Pressable onPress={() => setTermOpen(true)}>
              <Text style={{ color: colors.secondary, fontWeight: '700' }}>
                Add term
              </Text>
            </Pressable>
          </View>
          {terms.length === 0 ? (
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: spacing.sm },
              ]}
            >
              No terms configured
            </Text>
          ) : (
            terms.map((term) => (
              <View
                key={term.id}
                style={[styles.termRow, { borderBottomColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, fontWeight: '600' },
                    ]}
                  >
                    {formatRoiPercent(termRoiValue(term))}
                  </Text>
                  <Text
                    style={[typography.caption, { color: colors.text.secondary }]}
                  >
                    {term.start_date ? formatDate(term.start_date) : '—'} →{' '}
                    {term.end_date ? formatDate(term.end_date) : '—'}
                  </Text>
                </View>
                <Pressable onPress={() => void deleteTerm(term.id)}>
                  <Text style={{ color: colors.error, fontWeight: '700' }}>
                    Delete
                  </Text>
                </Pressable>
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
            Credit & withdrawal settings
          </Text>
          <FormInput
            control={settingsForm.control}
            name="credit_frequency"
            label="Credit frequency"
            placeholder="daily / weekly / monthly"
            autoCapitalize="none"
          />
          <FormInput
            control={settingsForm.control}
            name="withdrawal_frequency"
            label="Withdrawal frequency"
            placeholder="daily / weekly / monthly"
            autoCapitalize="none"
          />
          <FormInput
            control={settingsForm.control}
            name="credit_time_hour"
            label="Credit hour (0-23 IST)"
            keyboardType="number-pad"
          />
          <FormInput
            control={settingsForm.control}
            name="credit_time_minute"
            label="Credit minute (0-59)"
            keyboardType="number-pad"
          />
          <Button
            title="Save settings"
            variant="secondary"
            loading={busy === 'settings'}
            onPress={() => void saveSettings()}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button
              title={paused ? 'Resume revenue credit' : 'Pause revenue credit'}
              variant="golden"
              loading={busy === 'pause'}
              onPress={() => void togglePause()}
            />
          </View>
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.primary, fontWeight: '700' },
              ]}
            >
              Manual credit / debit
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Credit"
                variant="golden"
                onPress={() => {
                  setManualMode('credit');
                  manualForm.reset({
                    amount: undefined as unknown as number,
                    date: '',
                    remark: '',
                  });
                  setManualOpen(true);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Debit"
                variant="secondary"
                onPress={() => {
                  setManualMode('debit');
                  manualForm.reset({
                    amount: undefined as unknown as number,
                    date: '',
                    remark: '',
                  });
                  setManualOpen(true);
                }}
              />
            </View>
          </View>
        </Card>

        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
            ]}
          >
            Revenue history
          </Text>
          {ledger.length === 0 ? (
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              No transactions yet
            </Text>
          ) : (
            ledger.map((row) => {
              const rawAmount = Math.round(Number(row.amount) || 0);
              const credit = Math.round(
                Number(
                  row.credit_amount ?? (rawAmount > 0 ? rawAmount : 0)
                ) || 0
              );
              const debit = Math.round(
                Number(
                  row.debit_amount ?? (rawAmount < 0 ? Math.abs(rawAmount) : 0)
                ) || 0
              );
              const net = credit - debit;
              return (
                <View
                  key={row.id}
                  style={[styles.termRow, { borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        typography.body,
                        { color: colors.text.primary, fontWeight: '600' },
                      ]}
                    >
                      {row.description || row.credit_type || 'Entry'}
                      {row.is_reversed ? ' (reversed)' : ''}
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.text.secondary },
                      ]}
                    >
                      {row.credit_date
                        ? formatDate(row.credit_date)
                        : '—'}{' '}
                      · {row.transaction_id || row.id}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <AmountDisplay
                      amount={net}
                      size="sm"
                      tone={net >= 0 ? 'credit' : 'debit'}
                      showSign
                    />
                    {!row.is_reversed ? (
                      <Pressable onPress={() => void reverseEntry(row)}>
                        <Text style={{ color: colors.error, fontWeight: '600', fontSize: 12 }}>
                          Reverse
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>

      <Modal visible={termOpen} transparent animationType="fade">
        <View style={styles.backdrop}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  gap: spacing.sm,
                },
              ]}
            >
              <Text style={[typography.title, { color: colors.text.primary }]}>
                Add ROI term
              </Text>
              <FormInput
                control={termForm.control}
                name="percentage"
                label="ROI %"
                keyboardType="decimal-pad"
                placeholder="e.g. 2.25"
              />
              <FormDatePicker
                control={termForm.control}
                name="start_date"
                label="Start date"
              />
              <FormDatePicker
                control={termForm.control}
                name="end_date"
                label="End date"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setTermOpen(false)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Add"
                    variant="golden"
                    loading={busy === 'term'}
                    onPress={() => void saveTerm()}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={manualOpen} transparent animationType="fade">
        <View style={styles.backdrop}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  gap: spacing.sm,
                },
              ]}
            >
              <Text style={[typography.title, { color: colors.text.primary }]}>
                {manualMode === 'credit' ? 'Manual credit' : 'Manual debit'}
              </Text>
              <FormInput
                control={manualForm.control}
                name="amount"
                label="Amount (₹)"
                keyboardType="number-pad"
              />
              <FormDatePicker
                control={manualForm.control}
                name="date"
                label="Date"
              />
              <FormTextArea
                control={manualForm.control}
                name="remark"
                label="Remark"
                placeholder="Optional remark"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setManualOpen(false)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Confirm"
                    variant="golden"
                    loading={busy === 'manual'}
                    onPress={() => void submitManual()}
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.45)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});
