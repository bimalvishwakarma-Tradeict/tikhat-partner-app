import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { toast } from '../../../components/ui/Toast';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'executed' | 'all';

type BackdateRequest = {
  id: string;
  type?: string;
  status?: string;
  investor_name?: string;
  investor_email?: string;
  submitted_by_name?: string;
  start_date?: string;
  end_date?: string;
  roi_percentage?: number | null;
  details?: Record<string, unknown>;
  execution_log?: unknown;
  created_at?: string;
};

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'executed', label: 'Executed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function typeLabel(type?: string): string {
  switch (String(type || '')) {
    case 'single_revenue':
      return 'Single Revenue';
    case 'bulk_revenue':
      return 'Bulk Revenue';
    case 'capital':
      return 'Capital Entry';
    case 'new_investor':
      return 'New Investor';
    default:
      return type || 'Backdate';
  }
}

/**
 * Backdate approval queue — Super Admin can approve/reject.
 */
export default function AdminBackdateRequestsScreen() {
  const { colors, spacing, typography, borderRadius } = useTheme();
  const { isSuperAdmin } = useAuth();

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<BackdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<BackdateRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [logTitle, setLogTitle] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = (await adminService.listBackdateRequests({
          status,
        })) as { requests?: BackdateRequest[] };
        setRequests(data.requests || []);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load backdate requests'
        );
        setRequests([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [status]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const approve = async (item: BackdateRequest) => {
    const msg = `Approve ${typeLabel(item.type)} for ${item.investor_name || 'investor'}?`;
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.confirm(msg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Approve request', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Approve', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await adminService.approveBackdateRequest(item.id);
      toast.success('Backdate request approved');
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
      await adminService.rejectBackdateRequest(rejectTarget.id, reason);
      toast.success('Backdate request rejected');
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

  const openLog = async (item: BackdateRequest) => {
    setLogTitle(`${typeLabel(item.type)} · ${item.investor_name || ''}`);
    setBusyId(item.id);
    try {
      const data = (await adminService.getBackdateRequestLog(item.id)) as {
        execution_log?: unknown;
        request?: { execution_log?: unknown; details?: unknown };
        details?: unknown;
      };
      const log =
        data.execution_log ??
        data.request?.execution_log ??
        item.execution_log ??
        data.request?.details ??
        data.details ??
        item.details;
      setLogText(
        typeof log === 'string' ? log : JSON.stringify(log ?? {}, null, 2)
      );
      setLogOpen(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Could not load log'
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading && requests.length === 0) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <Skeleton height={40} />
        <Skeleton height={100} />
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
            {!isSuperAdmin ? (
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                Showing your submitted requests. Only Super Admin can approve.
              </Text>
            ) : (
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                Super Admin approval queue
              </Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {FILTERS.map((f) => {
                  const active = status === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setStatus(f.key)}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? colors.secondary : colors.border,
                          backgroundColor: active
                            ? colors.surface
                            : colors.background,
                          borderRadius: borderRadius.full,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.caption,
                          {
                            color: active
                              ? colors.secondary
                              : colors.text.secondary,
                            fontWeight: active ? '700' : '500',
                          },
                        ]}
                      >
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {error ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const st = String(item.status || '').toLowerCase();
          const canAct = isSuperAdmin && st === 'pending';
          return (
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={styles.rowBetween}>
                <Badge label={typeLabel(item.type)} variant="golden" />
                <StatusChip status={item.status || 'pending'} />
              </View>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.primary,
                    fontWeight: '700',
                    marginTop: spacing.sm,
                  },
                ]}
              >
                {item.investor_name || 'Investor / New'}
              </Text>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                {item.investor_email || ''}
                {item.submitted_by_name
                  ? ` · By ${item.submitted_by_name}`
                  : ''}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: 4 },
                ]}
              >
                {item.start_date ? formatDate(item.start_date) : '—'}
                {item.end_date && item.end_date !== item.start_date
                  ? ` → ${formatDate(item.end_date)}`
                  : ''}
                {item.roi_percentage != null ? ` · ROI ${item.roi_percentage}%` : ''}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: 2 },
                ]}
              >
                Submitted:{' '}
                {item.created_at ? formatDate(item.created_at) : '—'}
              </Text>

              <View style={[styles.actions, { marginTop: spacing.md }]}>
                {canAct ? (
                  <>
                    <Pressable
                      onPress={() => void approve(item)}
                      disabled={busyId === item.id}
                    >
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
                ) : null}
                <Pressable onPress={() => void openLog(item)}>
                  <Text style={{ color: colors.secondary, fontWeight: '700' }}>
                    {st === 'executed' || st === 'approved' || st === 'rejected'
                      ? 'View log'
                      : 'View details'}
                  </Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No backdate requests"
            subtitle="Submitted requests will appear here."
          />
        }
      />

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
              Reject backdate
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason"
              placeholderTextColor={colors.text.secondary}
              multiline
              style={[
                typography.body,
                {
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                  padding: spacing.md,
                  marginTop: spacing.md,
                  minHeight: 80,
                  color: colors.text.primary,
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
                  loading={busyId === rejectTarget?.id}
                  onPress={() => void submitReject()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={logOpen} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.md,
                maxHeight: '80%',
              },
            ]}
          >
            <Text style={[typography.title, { color: colors.text.primary }]}>
              {logTitle || 'Execution log'}
            </Text>
            <ScrollView style={{ marginTop: spacing.md, maxHeight: 360 }}>
              <Text
                selectable
                style={[
                  typography.caption,
                  { color: colors.text.primary, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
                ]}
              >
                {logText || 'No log available'}
              </Text>
            </ScrollView>
            <View style={{ marginTop: spacing.md }}>
              <Button
                title="Close"
                variant="golden"
                onPress={() => setLogOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', maxWidth: 440, alignSelf: 'center' },
});
