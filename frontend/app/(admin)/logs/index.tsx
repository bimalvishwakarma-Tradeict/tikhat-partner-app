import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import type { AuditLog, CronJobLog } from '../../../types/models.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate, formatTime } from '../../../utils/formatDate';
import { zodResolver } from '../../../utils/validationSchemas';
import { FormDatePicker } from '../../../components/forms/FormDatePicker';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';

type TabKey = 'activity' | 'cron';

type DateFilterForm = {
  start_date: string;
  end_date: string;
};

const dateFilterSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

type AuditRow = AuditLog & {
  investor_name?: string | null;
  entity_label?: string | null;
};

function investorAffected(log: AuditRow): string {
  if (log.investor_name) return log.investor_name;
  if (log.entity_label) return log.entity_label;
  if (log.entity_type && log.entity_id) {
    return `${log.entity_type} · ${String(log.entity_id).slice(0, 8)}…`;
  }
  if (log.entity_type) return log.entity_type;
  return '—';
}

/**
 * Admin activity + cron logs.
 */
export default function AdminLogsScreen() {
  const { colors, spacing, typography, borderRadius } = useTheme();
  const [tab, setTab] = useState<TabKey>('activity');
  const [actionFilter, setActionFilter] = useState('');
  const [cronStatus, setCronStatus] = useState('');
  const [cronJob, setCronJob] = useState('');

  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [cronLogs, setCronLogs] = useState<CronJobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<DateFilterForm>({
    resolver: zodResolver(dateFilterSchema),
    defaultValues: { start_date: '', end_date: '' },
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        if (tab === 'activity') {
          const data = await adminService.listAuditLogs({
            action: actionFilter.trim() || undefined,
            start_date: dateFrom || undefined,
            end_date: dateTo || undefined,
            page: 1,
            limit: 50,
          });
          setAuditLogs((data.logs || []) as AuditRow[]);
        } else {
          const data = await adminService.listCronLogs({
            job_name: cronJob.trim() || undefined,
            status: cronStatus || undefined,
            start_date: dateFrom || undefined,
            end_date: dateTo || undefined,
            page: 1,
            limit: 50,
          });
          setCronLogs(data.logs || []);
        }
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load logs'
        );
        setAuditLogs([]);
        setCronLogs([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab, actionFilter, cronJob, cronStatus, dateFrom, dateTo]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const applyDates = handleSubmit((values) => {
    setDateFrom(values.start_date?.trim() || '');
    setDateTo(values.end_date?.trim() || '');
  });

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

  const header = useMemo(
    () => (
      <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text.primary }]}>
          Logs
        </Text>

        <View style={styles.chipRow}>
          {chip('Activity Logs', tab === 'activity', () => setTab('activity'))}
          {chip('Cron Logs', tab === 'cron', () => setTab('cron'))}
        </View>

        <Card>
          <FormDatePicker
            control={control}
            name="start_date"
            label="From (optional)"
          />
          <View style={{ height: spacing.sm }} />
          <FormDatePicker
            control={control}
            name="end_date"
            label="To (optional)"
          />
          <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Apply dates"
                variant="secondary"
                onPress={() => {
                  void applyDates();
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Clear"
                variant="secondary"
                onPress={() => {
                  reset({ start_date: '', end_date: '' });
                  setDateFrom('');
                  setDateTo('');
                }}
              />
            </View>
          </View>
        </Card>

        {tab === 'activity' ? (
          <TextInput
            value={actionFilter}
            onChangeText={setActionFilter}
            placeholder="Filter by action text"
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
        ) : (
          <View style={{ gap: spacing.sm }}>
            <TextInput
              value={cronJob}
              onChangeText={setCronJob}
              placeholder="Filter by job name"
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {chip('All status', cronStatus === '', () => setCronStatus(''))}
                {chip('Success', cronStatus === 'success', () =>
                  setCronStatus('success')
                )}
                {chip('Failed', cronStatus === 'failed', () =>
                  setCronStatus('failed')
                )}
                {chip('Running', cronStatus === 'running', () =>
                  setCronStatus('running')
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>
            {error}
          </Text>
        ) : null}
      </View>
    ),
    [
      actionFilter,
      applyDates,
      borderRadius.full,
      borderRadius.md,
      colors,
      control,
      cronJob,
      cronStatus,
      error,
      reset,
      spacing,
      tab,
      typography,
    ]
  );

  if (loading && auditLogs.length === 0 && cronLogs.length === 0) {
    return (
      <View style={{ padding: spacing.md }}>
        {header}
        <Skeleton height={88} style={{ marginBottom: 8 }} />
        <Skeleton height={88} />
      </View>
    );
  }

  if (tab === 'activity') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          data={auditLogs}
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
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <Text
                style={[
                  typography.body,
                  { color: colors.text.primary, fontWeight: '700' },
                ]}
              >
                {item.admin_name || 'Admin'}
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.primary, marginTop: 4 },
                ]}
              >
                {item.action}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: 4 },
                ]}
              >
                Investor / entity: {investorAffected(item)}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: 4 },
                ]}
              >
                {item.created_at
                  ? `${formatDate(item.created_at)} · ${formatTime(item.created_at)}`
                  : '—'}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No activity logs"
              subtitle="Try adjusting filters."
            />
          }
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={cronLogs}
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
          const when = item.started_at || item.created_at;
          const amount =
            item.total_amount_formatted ||
            formatCurrency(Math.round(Number(item.total_amount) || 0));
          return (
            <View
              style={[
                styles.row,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <Text
                  style={[
                    typography.body,
                    { color: colors.text.primary, fontWeight: '700', flex: 1 },
                  ]}
                >
                  {item.job_name}
                </Text>
                <StatusChip status={String(item.status || 'unknown')} />
              </View>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: 6 },
                ]}
              >
                {when
                  ? `${formatDate(when)} · ${formatTime(when)}`
                  : '—'}
              </Text>
              <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
                <Badge
                  label={`Count ${Math.round(Number(item.processed_count) || 0)}`}
                  variant="default"
                />
                <Badge label={amount} variant="golden" />
                {Number(item.failed_count) > 0 ? (
                  <Badge
                    label={`Failed ${Math.round(Number(item.failed_count) || 0)}`}
                    variant="error"
                  />
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState title="No cron logs" subtitle="No executions found." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  row: { borderWidth: 1 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
