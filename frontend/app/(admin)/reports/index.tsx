import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { reportService } from '../../../services/report.service';
import { ApiClientError } from '../../../types/api.types';
import type { ReportFileResult } from '../../../types/api.types';
import { getISTParts } from '../../../utils/formatDate';
import { zodResolver } from '../../../utils/validationSchemas';
import { FormDatePicker } from '../../../components/forms/FormDatePicker';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { toast } from '../../../components/ui/Toast';

type ReportKind = 'statement' | 'capital' | 'revenue';
type ReportFormat = 'pdf' | 'excel';

type InvestorOption = {
  id: string;
  full_name: string;
  email: string;
};

type RangeForm = {
  from: string;
  to: string;
};

const rangeSchema = z
  .object({
    from: z.string().min(1, 'From date required'),
    to: z.string().min(1, 'To date required'),
  })
  .refine((d) => d.from <= d.to, {
    message: 'From date must be on or before To date',
    path: ['to'],
  });

const KINDS: Array<{ key: ReportKind; label: string }> = [
  { key: 'statement', label: 'Investor Statement' },
  { key: 'capital', label: 'Capital Report' },
  { key: 'revenue', label: 'Revenue Report' },
];

function todayIsoIst(): string {
  const { year, month, day } = getISTParts(new Date());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthStartIsoIst(): string {
  const { year, month } = getISTParts(new Date());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += alphabet[(triplet >> 18) & 63];
    result += alphabet[(triplet >> 12) & 63];
    result += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? alphabet[triplet & 63] : '=';
  }
  return result;
}

async function saveReportFile(file: ReportFileResult, fallbackName: string) {
  const filename = file.filename || fallbackName;
  if (Platform.OS === 'web') {
    const blob = new Blob([file.data], {
      type: file.contentType || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return;
  }

  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('Storage unavailable for download');
  }
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(file.data), {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Share.share({
    url: uri,
    title: filename,
    message: Platform.OS === 'ios' ? undefined : `Saved: ${filename}`,
  });
}

/**
 * Admin reports — investor statement, capital, revenue exports.
 */
export default function AdminReportsScreen() {
  const { colors, spacing, typography, borderRadius } = useTheme();
  const [kind, setKind] = useState<ReportKind>('statement');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [downloading, setDownloading] = useState(false);

  const [search, setSearch] = useState('');
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [selected, setSelected] = useState<InvestorOption | null>(null);
  const [searching, setSearching] = useState(false);

  const { control, handleSubmit, watch } = useForm<RangeForm>({
    resolver: zodResolver(rangeSchema),
    defaultValues: { from: monthStartIsoIst(), to: todayIsoIst() },
  });

  const from = watch('from');
  const to = watch('to');

  useEffect(() => {
    if (kind !== 'statement') return;
    const q = search.trim();
    if (q.length < 2) {
      setInvestors([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const data = await adminService.listInvestors({
            search: q,
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
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [search, kind]);

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
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
        {label}
      </Text>
    </Pressable>
  );

  const onDownload = handleSubmit(async (values) => {
    if (kind === 'statement' && !selected) {
      toast.error('Select an investor for the statement');
      return;
    }
    setDownloading(true);
    try {
      const params = {
        from: values.from,
        to: values.to,
        format,
      };
      let file: ReportFileResult;
      let fallback = `report-${values.from}-${values.to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      if (kind === 'statement' && selected) {
        file = await reportService.getInvestorStatement(selected.id, params);
        fallback = `statement-${selected.full_name.replace(/\s+/g, '-')}-${values.from}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      } else if (kind === 'capital') {
        file = await reportService.getCapitalReport(params);
        fallback = `capital-report-${values.from}-${values.to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      } else {
        file = await reportService.getRevenueReport(params);
        fallback = `revenue-report-${values.from}-${values.to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      }
      await saveReportFile(file, fallback);
      toast.success('Report downloaded');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to download report'
      );
    } finally {
      setDownloading(false);
    }
  });

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
      <Text style={[typography.h2, { color: colors.text.primary }]}>
        Reports
      </Text>
      <Text style={[typography.body, { color: colors.text.secondary }]}>
        Generate investor statements and capital/revenue exports.
      </Text>

      <Card>
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginBottom: spacing.sm },
          ]}
        >
          Report type
        </Text>
        <View style={styles.chipRow}>
          {KINDS.map((k) =>
            chip(k.label, kind === k.key, () => {
              setKind(k.key);
              if (k.key !== 'statement') {
                setSelected(null);
                setSearch('');
              }
            })
          )}
        </View>

        <Text
          style={[
            typography.caption,
            {
              color: colors.text.secondary,
              marginTop: spacing.md,
              marginBottom: spacing.sm,
            },
          ]}
        >
          Format
        </Text>
        <View style={styles.chipRow}>
          {chip('PDF', format === 'pdf', () => setFormat('pdf'))}
          {chip('Excel', format === 'excel', () => setFormat('excel'))}
        </View>

        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <FormDatePicker control={control} name="from" label="From" />
          <FormDatePicker control={control} name="to" label="To" />
        </View>

        {kind === 'statement' ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Investor
            </Text>
            {selected ? (
              <View
                style={[
                  styles.selectedRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.md,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, fontWeight: '700' },
                    ]}
                  >
                    {selected.full_name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {selected.email}
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)}>
                  <Text
                    style={[typography.caption, { color: colors.error }]}
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search investor by name or email"
                  placeholderTextColor={colors.text.secondary}
                  style={[
                    typography.body,
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: colors.text.primary,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                />
                {searching ? (
                  <ActivityIndicator color={colors.secondary} />
                ) : null}
                {investors.map((inv) => (
                  <Pressable
                    key={inv.id}
                    onPress={() => {
                      setSelected(inv);
                      setSearch('');
                      setInvestors([]);
                    }}
                    style={[
                      styles.investorRow,
                      {
                        borderColor: colors.border,
                        borderRadius: borderRadius.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.body,
                        { color: colors.text.primary, fontWeight: '600' },
                      ]}
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
          </View>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            title={
              downloading
                ? 'Downloading…'
                : `Download ${format.toUpperCase()}`
            }
            variant="golden"
            loading={downloading}
            disabled={downloading}
            onPress={() => {
              void onDownload();
            }}
          />
        </View>

        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginTop: spacing.sm },
          ]}
        >
          Range: {from || '—'} → {to || '—'}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 12,
  },
  investorRow: {
    borderWidth: 1,
    padding: 12,
  },
});
