import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import { zodResolver } from '../../../utils/validationSchemas';
import { FormDatePicker } from '../../../components/forms/FormDatePicker';
import { FormInput } from '../../../components/forms/FormInput';
import { FormTextArea } from '../../../components/forms/FormTextArea';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { toast } from '../../../components/ui/Toast';

const SUCCESS_MSG =
  'Backdate request submitted for Super Admin approval';

type BackdateType =
  | 'single_revenue'
  | 'bulk_revenue'
  | 'capital'
  | 'new_investor';

type InvestorOption = {
  id: string;
  full_name: string;
  email: string;
};

type PreviewRow = {
  date: string;
  amount: number;
  amount_formatted?: string;
};

const TYPES: Array<{ key: BackdateType; label: string }> = [
  { key: 'single_revenue', label: 'Single Revenue' },
  { key: 'bulk_revenue', label: 'Bulk Revenue' },
  { key: 'capital', label: 'Capital Entry' },
  { key: 'new_investor', label: 'New Investor' },
];

const singleSchema = z.object({
  date: z.string().min(1, 'Date required'),
  amount: z.string().optional(),
  roi_percentage: z.string().optional(),
  remark: z.string().optional(),
});

const bulkSchema = z.object({
  start_date: z.string().min(1, 'Start date required'),
  end_date: z.string().min(1, 'End date required'),
  roi_percentage: z.string().optional(),
  remark: z.string().optional(),
});

const capitalSchema = z.object({
  date: z.string().min(1, 'Date required'),
  amount: z.string().min(1, 'Amount required'),
  utr_number: z.string().min(1, 'UTR required'),
  remark: z.string().optional(),
});

const newInvestorSchema = z.object({
  full_name: z.string().min(3, 'Full name required'),
  email: z.string().email('Valid email required'),
  mobile: z.string().min(10, 'Mobile required'),
  password: z.string().min(8, 'Password min 8 characters'),
  joining_date: z.string().min(1, 'Joining date required'),
  initial_capital: z.string().min(1, 'Initial capital required'),
  roi_percentage: z.string().min(1, 'ROI required'),
  pan_number: z.string().optional(),
  aadhar_number: z.string().optional(),
  address: z.string().optional(),
});

function parseOptionalInt(value?: string): number | undefined {
  if (value == null || !String(value).trim()) return undefined;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : undefined;
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00+05:30`);
  const last = new Date(`${end}T00:00:00+05:30`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) {
    return out;
  }
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Deterministic 90–110% style split for preview (last day gets remainder). */
function previewDailyAmounts(monthlyTotal: number, dayCount: number): number[] {
  const total = Math.round(monthlyTotal || 0);
  const days = Math.round(dayCount || 0);
  if (total <= 0 || days <= 0) return Array.from({ length: Math.max(days, 0) }, () => 0);
  if (days === 1) return [total];
  const dailyAvg = Math.round(total / days);
  const min = Math.round(dailyAvg * 0.9);
  const max = Math.round(dailyAvg * 1.1);
  const mid = Math.round((min + max) / 2);
  const amounts: number[] = [];
  let running = 0;
  for (let i = 0; i < days - 1; i += 1) {
    amounts.push(mid);
    running += mid;
  }
  amounts.push(Math.max(0, total - running));
  return amounts;
}

/**
 * Admin backdate submission forms.
 */
export default function AdminBackdateIndexScreen() {
  const router = useRouter();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [type, setType] = useState<BackdateType>('single_revenue');
  const [sendEmail, setSendEmail] = useState(true);
  const [autoCalcRevenue, setAutoCalcRevenue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewing, setPreviewing] = useState(false);

  const [investorQuery, setInvestorQuery] = useState('');
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorOption | null>(
    null
  );
  const [searching, setSearching] = useState(false);

  const singleForm = useForm<z.infer<typeof singleSchema>>({
    resolver: zodResolver(singleSchema),
    defaultValues: { date: '', amount: '', roi_percentage: '', remark: '' },
  });
  const bulkForm = useForm<z.infer<typeof bulkSchema>>({
    resolver: zodResolver(bulkSchema),
    defaultValues: {
      start_date: '',
      end_date: '',
      roi_percentage: '',
      remark: '',
    },
  });
  const capitalForm = useForm<z.infer<typeof capitalSchema>>({
    resolver: zodResolver(capitalSchema),
    defaultValues: { date: '', amount: '', utr_number: '', remark: '' },
  });
  const newForm = useForm<z.infer<typeof newInvestorSchema>>({
    resolver: zodResolver(newInvestorSchema),
    defaultValues: {
      full_name: '',
      email: '',
      mobile: '',
      password: '',
      joining_date: '',
      initial_capital: '',
      roi_percentage: '',
      pan_number: '',
      aadhar_number: '',
      address: '',
    },
  });

  useEffect(() => {
    setPreviewRows([]);
    setPreviewTotal(0);
  }, [type]);

  const searchInvestors = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const data = await adminService.listInvestors({
        search: q.trim() || undefined,
        page: 1,
        limit: 20,
      });
      setInvestors(
        (data.investors || []).map((i) => ({
          id: i.id,
          full_name: i.full_name,
          email: i.email,
        }))
      );
    } catch {
      setInvestors([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void searchInvestors(investorQuery);
    }, 300);
    return () => clearTimeout(id);
  }, [investorQuery, searchInvestors]);

  const needsInvestor = type !== 'new_investor';

  const onSubmitSuccess = () => {
    toast.success(SUCCESS_MSG);
    setPreviewRows([]);
    setPreviewTotal(0);
  };

  const submitSingle = singleForm.handleSubmit(async (values) => {
    if (!selectedInvestor) {
      toast.error('Select an investor');
      return;
    }
    setSubmitting(true);
    try {
      await adminService.backdateRevenueSingle({
        investor_id: selectedInvestor.id,
        date: values.date,
        amount: parseOptionalInt(values.amount),
        roi_percentage: parseOptionalInt(values.roi_percentage),
        remark: values.remark?.trim() || undefined,
        send_email: sendEmail,
      });
      onSubmitSuccess();
      singleForm.reset();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  });

  const runBulkPreview = bulkForm.handleSubmit(async (values) => {
    if (!selectedInvestor) {
      toast.error('Select an investor');
      return;
    }
    if (values.start_date > values.end_date) {
      toast.error('Start date must be on or before end date');
      return;
    }
    setPreviewing(true);
    try {
      const dates = enumerateDates(values.start_date, values.end_date);
      const cap = (await adminService.getInvestorCapital(
        selectedInvestor.id
      )) as { capitalBalance?: number };
      const capital = Math.round(Number(cap.capitalBalance) || 0);
      const roi =
        parseOptionalInt(values.roi_percentage) ||
        2;
      const monthly = Math.round((capital * roi) / 100);
      // Group by month for preview estimate
      const byMonth = new Map<string, string[]>();
      for (const d of dates) {
        const key = d.slice(0, 7);
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key)!.push(d);
      }
      const rows: PreviewRow[] = [];
      let total = 0;
      for (const monthDates of byMonth.values()) {
        const daysInMonth = new Date(
          Number(monthDates[0].slice(0, 4)),
          Number(monthDates[0].slice(5, 7)),
          0
        ).getDate();
        const monthTotal = Math.round((monthly * monthDates.length) / daysInMonth);
        const amounts = previewDailyAmounts(
          Math.max(monthTotal, Math.round(monthly / daysInMonth) * monthDates.length),
          monthDates.length
        );
        monthDates.forEach((date, i) => {
          const amount = Math.round(amounts[i] || 0);
          total += amount;
          rows.push({
            date,
            amount,
            amount_formatted: formatCurrency(amount),
          });
        });
      }
      setPreviewRows(rows);
      setPreviewTotal(total);
      if (rows.length === 0) toast.error('No days in range');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Preview failed'
      );
    } finally {
      setPreviewing(false);
    }
  });

  const submitBulk = bulkForm.handleSubmit(async (values) => {
    if (!selectedInvestor) {
      toast.error('Select an investor');
      return;
    }
    setSubmitting(true);
    try {
      const result = (await adminService.backdateRevenueBulk({
        investor_id: selectedInvestor.id,
        start_date: values.start_date,
        end_date: values.end_date,
        roi_percentage: parseOptionalInt(values.roi_percentage),
        remark: values.remark?.trim() || undefined,
        send_email: sendEmail,
      })) as { preview?: { distribution?: PreviewRow[]; expected_total?: number } };

      const dist = result?.preview?.distribution;
      if (Array.isArray(dist) && dist.length) {
        setPreviewRows(
          dist.map((r) => ({
            date: r.date,
            amount: Math.round(Number(r.amount) || 0),
            amount_formatted:
              r.amount_formatted ||
              formatCurrency(Math.round(Number(r.amount) || 0)),
          }))
        );
        setPreviewTotal(Math.round(Number(result.preview?.expected_total) || 0));
      }
      onSubmitSuccess();
      bulkForm.reset();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  });

  const previewCapital = capitalForm.handleSubmit(async (values) => {
    if (!selectedInvestor) {
      toast.error('Select an investor');
      return;
    }
    setPreviewing(true);
    try {
      const data = (await adminService.previewCapitalBackdate({
        investor_id: selectedInvestor.id,
        date: values.date,
        amount: Math.round(Number(values.amount) || 0),
      })) as {
        distribution?: PreviewRow[];
        expected_total?: number;
        preview?: { distribution?: PreviewRow[]; expected_total?: number };
      };
      const dist = data.distribution || data.preview?.distribution || [];
      setPreviewRows(
        dist.map((r) => ({
          date: r.date,
          amount: Math.round(Number(r.amount) || 0),
          amount_formatted:
            r.amount_formatted ||
            formatCurrency(Math.round(Number(r.amount) || 0)),
        }))
      );
      setPreviewTotal(
        Math.round(
          Number(data.expected_total ?? data.preview?.expected_total) || 0
        )
      );
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Preview failed'
      );
    } finally {
      setPreviewing(false);
    }
  });

  const submitCapital = capitalForm.handleSubmit(async (values) => {
    if (!selectedInvestor) {
      toast.error('Select an investor');
      return;
    }
    setSubmitting(true);
    try {
      await adminService.submitCapitalBackdate({
        investor_id: selectedInvestor.id,
        date: values.date,
        amount: Math.round(Number(values.amount) || 0),
        send_email: sendEmail,
        utr_number: values.utr_number.trim().toUpperCase(),
        remark: values.remark?.trim() || undefined,
        auto_calculate_revenue: autoCalcRevenue,
      } as Parameters<typeof adminService.submitCapitalBackdate>[0] & {
        utr_number: string;
        remark?: string;
        auto_calculate_revenue?: boolean;
      });
      onSubmitSuccess();
      capitalForm.reset();
      setPreviewRows([]);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  });

  const submitNew = newForm.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await adminService.backdateNewInvestor({
        full_name: values.full_name.trim(),
        email: values.email.trim().toLowerCase(),
        mobile: values.mobile.trim(),
        password: values.password,
        joining_date: values.joining_date,
        initial_capital: Math.round(Number(values.initial_capital) || 0),
        roi_percentage: Math.round(Number(values.roi_percentage) || 0),
        pan_number: values.pan_number?.trim() || undefined,
        aadhar_number: values.aadhar_number?.trim() || undefined,
        address: values.address?.trim() || undefined,
        send_email: sendEmail,
      });
      onSubmitSuccess();
      newForm.reset();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  });

  const emailToggle = useMemo(
    () => (
      <View style={[styles.toggleRow, { marginVertical: spacing.sm }]}>
        <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>
          Email investor on approval
        </Text>
        <Switch
          value={sendEmail}
          onValueChange={setSendEmail}
          trackColor={{ false: colors.border, true: colors.secondary }}
        />
      </View>
    ),
    [colors, sendEmail, spacing.sm, typography.body]
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.md,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Text style={[typography.h2, { color: colors.text.primary, flex: 1 }]}>
          Backdate
        </Text>
        <Pressable
          onPress={() => router.push('/(admin)/backdate/requests' as Href)}
        >
          <Text style={{ color: colors.secondary, fontWeight: '700' }}>
            Requests →
          </Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {TYPES.map((item) => {
            const active = type === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setType(item.key)}
                style={[
                  styles.typeChip,
                  {
                    borderColor: active ? colors.secondary : colors.border,
                    backgroundColor: active ? colors.surface : colors.background,
                    borderRadius: borderRadius.full,
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
        </View>
      </ScrollView>

      {needsInvestor ? (
        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700' },
            ]}
          >
            Investor
          </Text>
          {selectedInvestor ? (
            <View style={[styles.selectedInvestor, { marginTop: spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typography.body,
                    { color: colors.text.primary, fontWeight: '600' },
                  ]}
                >
                  {selectedInvestor.full_name}
                </Text>
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  {selectedInvestor.email}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedInvestor(null)}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>
                  Change
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                value={investorQuery}
                onChangeText={setInvestorQuery}
                placeholder="Search name or email"
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
              {searching ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: 6 },
                  ]}
                >
                  Searching…
                </Text>
              ) : null}
              {investors.map((inv) => (
                <Pressable
                  key={inv.id}
                  onPress={() => {
                    setSelectedInvestor(inv);
                    setInvestorQuery('');
                  }}
                  style={[
                    styles.investorRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text
                    style={[typography.body, { color: colors.text.primary }]}
                  >
                    {inv.full_name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {inv.email}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
        </Card>
      ) : null}

      {type === 'single_revenue' ? (
        <Card>
          <FormDatePicker control={singleForm.control} name="date" label="Date" />
          <FormInput
            control={singleForm.control}
            name="amount"
            label="Amount (optional)"
            keyboardType="number-pad"
            placeholder="Leave blank to auto-calculate"
          />
          <FormInput
            control={singleForm.control}
            name="roi_percentage"
            label="ROI % (optional)"
            keyboardType="number-pad"
          />
          <FormTextArea
            control={singleForm.control}
            name="remark"
            label="Remark"
          />
          {emailToggle}
          <Button
            title="Submit"
            variant="golden"
            loading={submitting}
            onPress={() => void submitSingle()}
          />
        </Card>
      ) : null}

      {type === 'bulk_revenue' ? (
        <Card>
          <FormDatePicker
            control={bulkForm.control}
            name="start_date"
            label="Start date"
          />
          <FormDatePicker
            control={bulkForm.control}
            name="end_date"
            label="End date"
          />
          <FormInput
            control={bulkForm.control}
            name="roi_percentage"
            label="ROI % (optional)"
            keyboardType="number-pad"
          />
          <FormTextArea control={bulkForm.control} name="remark" label="Remark" />
          {emailToggle}
          <View style={{ gap: spacing.sm }}>
            <Button
              title="Preview"
              variant="secondary"
              loading={previewing}
              onPress={() => void runBulkPreview()}
            />
            <Button
              title="Submit"
              variant="golden"
              loading={submitting}
              onPress={() => void submitBulk()}
            />
          </View>
        </Card>
      ) : null}

      {type === 'capital' ? (
        <Card>
          <FormDatePicker
            control={capitalForm.control}
            name="date"
            label="Date"
          />
          <FormInput
            control={capitalForm.control}
            name="amount"
            label="Amount"
            keyboardType="number-pad"
          />
          <FormInput
            control={capitalForm.control}
            name="utr_number"
            label="UTR"
            autoCapitalize="characters"
          />
          <FormTextArea
            control={capitalForm.control}
            name="remark"
            label="Remark"
          />
          <View style={styles.toggleRow}>
            <Text
              style={[typography.body, { color: colors.text.primary, flex: 1 }]}
            >
              Auto-calculate revenue to date
            </Text>
            <Switch
              value={autoCalcRevenue}
              onValueChange={setAutoCalcRevenue}
              trackColor={{ false: colors.border, true: colors.secondary }}
            />
          </View>
          {emailToggle}
          <View style={{ gap: spacing.sm }}>
            <Button
              title="Preview revenue"
              variant="secondary"
              loading={previewing}
              onPress={() => void previewCapital()}
            />
            <Button
              title="Submit"
              variant="golden"
              loading={submitting}
              onPress={() => void submitCapital()}
            />
          </View>
        </Card>
      ) : null}

      {type === 'new_investor' ? (
        <Card>
          <FormInput
            control={newForm.control}
            name="full_name"
            label="Full name"
          />
          <FormInput
            control={newForm.control}
            name="email"
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <FormInput
            control={newForm.control}
            name="mobile"
            label="Mobile"
            keyboardType="phone-pad"
          />
          <FormInput
            control={newForm.control}
            name="password"
            label="Password"
            secureTextEntry
          />
          <FormDatePicker
            control={newForm.control}
            name="joining_date"
            label="Joining date"
          />
          <FormInput
            control={newForm.control}
            name="initial_capital"
            label="Initial capital"
            keyboardType="number-pad"
          />
          <FormInput
            control={newForm.control}
            name="roi_percentage"
            label="ROI %"
            keyboardType="number-pad"
          />
          <FormInput
            control={newForm.control}
            name="pan_number"
            label="PAN (optional)"
            autoCapitalize="characters"
          />
          <FormInput
            control={newForm.control}
            name="aadhar_number"
            label="Aadhar (optional)"
            keyboardType="number-pad"
          />
          <FormTextArea
            control={newForm.control}
            name="address"
            label="Address (optional)"
          />
          {emailToggle}
          <Button
            title="Submit"
            variant="golden"
            loading={submitting}
            onPress={() => void submitNew()}
          />
        </Card>
      ) : null}

      {previewRows.length > 0 ? (
        <Card accent>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700' },
            ]}
          >
            Preview — {formatCurrency(previewTotal)} total
          </Text>
          <ScrollView style={{ maxHeight: 280, marginTop: spacing.sm }}>
            {previewRows.map((row) => (
              <View
                key={row.date}
                style={[styles.previewRow, { borderBottomColor: colors.border }]}
              >
                <Text style={[typography.body, { color: colors.text.primary }]}>
                  {formatDate(row.date)}
                </Text>
                <Text
                  style={[
                    typography.subtitle,
                    { color: colors.secondary, fontWeight: '700' },
                  ]}
                >
                  {row.amount_formatted || formatCurrency(row.amount)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  investorRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectedInvestor: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
