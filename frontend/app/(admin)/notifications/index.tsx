import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { notificationService } from '../../../services/notification.service';
import { ApiClientError } from '../../../types/api.types';
import type { AdminPendingCountsData } from '../../../types/api.types';
import { formatDate, formatTime } from '../../../utils/formatDate';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toast } from '../../../components/ui/Toast';

type TargetType = 'single' | 'selected' | 'all';

type InvestorOption = {
  id: string;
  full_name: string;
  email: string;
};

type AdminNotification = {
  id: string;
  title: string;
  body: string;
  type?: string;
  is_read?: boolean;
  created_at?: string;
};

type SystemAlerts = {
  email_failures: number;
  backup_failures: number;
  cron_failures: number;
};

const EMPTY_COUNTS: AdminPendingCountsData = {
  capital_requests: 0,
  withdrawal_requests: 0,
  profile_updates: 0,
  new_registrations: 0,
  open_tickets: 0,
};

/**
 * Admin notification center — pending counts, alerts, broadcast.
 */
export default function AdminNotificationsScreen() {
  const router = useRouter();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [counts, setCounts] = useState<AdminPendingCountsData>(EMPTY_COUNTS);
  const [alerts, setAlerts] = useState<SystemAlerts>({
    email_failures: 0,
    backup_failures: 0,
    cron_failures: 0,
  });
  const [recent, setRecent] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [target, setTarget] = useState<TargetType>('single');
  const [search, setSearch] = useState('');
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [singleInvestor, setSingleInvestor] = useState<InvestorOption | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, InvestorOption>>(
    {}
  );
  const [allChecked, setAllChecked] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [pending, summary, list, failedEmails, failedCrons] =
        await Promise.all([
          notificationService.getAdminPendingCounts(),
          notificationService.getAdminSummary().catch(() => null),
          notificationService.listAdmin({ page: 1, limit: 20 }),
          adminService.listFailedEmailLogs({ page: 1, limit: 1 }),
          adminService.listCronLogs({
            status: 'failed',
            page: 1,
            limit: 20,
          }),
        ]);

      setCounts({
        capital_requests: Math.round(Number(pending.capital_requests) || 0),
        withdrawal_requests: Math.round(
          Number(pending.withdrawal_requests) || 0
        ),
        profile_updates: Math.round(Number(pending.profile_updates) || 0),
        new_registrations: Math.round(Number(pending.new_registrations) || 0),
        open_tickets: Math.round(Number(pending.open_tickets) || 0),
      });

      const emailMeta = (failedEmails as { meta?: { total?: number }; logs?: unknown[] })
        ?.meta;
      const emailCount =
        Math.round(Number(emailMeta?.total) || 0) ||
        ((failedEmails as { logs?: unknown[] })?.logs || []).length;

      const cronFailed = failedCrons.logs || [];
      const backupFail = cronFailed.filter((row) =>
        String(row.job_name || '')
          .toLowerCase()
          .includes('backup')
      ).length;

      const summaryObj = summary as {
        summary?: Record<string, number>;
      } | null;
      const summaryAlerts = summaryObj?.summary || summaryObj || {};

      setAlerts({
        email_failures: Math.round(
          Number(
            (summaryAlerts as Record<string, number>).email_failures ??
              emailCount
          ) || emailCount
        ),
        backup_failures: Math.round(
          Number(
            (summaryAlerts as Record<string, number>).backup_failures ??
              backupFail
          ) || backupFail
        ),
        cron_failures: Math.round(
          Number(
            (summaryAlerts as Record<string, number>).cron_failures ??
              cronFailed.length
          ) || cronFailed.length
        ),
      });

      setRecent((list.notifications || []) as AdminNotification[]);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load notification center'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  useEffect(() => {
    if (target === 'all') return;
    const q = search.trim();
    if (q.length < 2) {
      setInvestors([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
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
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [search, target]);

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

  const pendingRow = (
    label: string,
    count: number,
    href: Href
  ) => (
    <View
      style={[
        styles.pendingRow,
        {
          borderColor: colors.border,
          borderRadius: borderRadius.md,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            typography.body,
            { color: colors.text.primary, fontWeight: '600' },
          ]}
        >
          {label}
        </Text>
        <Text style={[typography.h3, { color: colors.secondary }]}>
          {count}
        </Text>
      </View>
      <Button
        title="View"
        variant="secondary"
        fullWidth={false}
        style={{ minWidth: 88, paddingHorizontal: 16 }}
        onPress={() => router.push(href)}
      />
    </View>
  );

  const toggleSelected = (inv: InvestorOption) => {
    setSelectedIds((prev) => {
      if (prev.includes(inv.id)) {
        return prev.filter((id) => id !== inv.id);
      }
      return [...prev, inv.id];
    });
    setSelectedMap((prev) => {
      if (prev[inv.id]) {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      }
      return { ...prev, [inv.id]: inv };
    });
  };

  const validateBroadcast = (): string | null => {
    if (!title.trim() || !body.trim()) {
      return 'Title and body are required';
    }
    if (target === 'single' && !singleInvestor) {
      return 'Select an investor';
    }
    if (target === 'selected' && selectedIds.length === 0) {
      return 'Select at least one investor';
    }
    if (target === 'all' && !allChecked) {
      return 'Confirm All Investors by checking the box';
    }
    return null;
  };

  const openPreview = () => {
    const err = validateBroadcast();
    if (err) {
      toast.error(err);
      return;
    }
    setPreviewOpen(true);
  };

  const confirmSend = () => {
    setPreviewOpen(false);
    Alert.alert(
      'Send broadcast?',
      target === 'all'
        ? 'Send to all Tikhat Partners?'
        : target === 'selected'
          ? `Send to ${selectedIds.length} selected investors?`
          : `Send to ${singleInvestor?.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            void sendBroadcast();
          },
        },
      ]
    );
  };

  const sendBroadcast = async () => {
    setSending(true);
    try {
      await notificationService.broadcast({
        target_type: target,
        target_ids:
          target === 'single' && singleInvestor
            ? [singleInvestor.id]
            : target === 'selected'
              ? selectedIds
              : undefined,
        title: title.trim(),
        body: body.trim(),
        send_email: sendEmail,
      });
      toast.success('Broadcast sent');
      setTitle('');
      setBody('');
      setSendEmail(false);
      setSingleInvestor(null);
      setSelectedIds([]);
      setSelectedMap({});
      setAllChecked(false);
      setSearch('');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to send broadcast'
      );
    } finally {
      setSending(false);
    }
  };

  const targetLabel =
    target === 'all'
      ? 'All Investors'
      : target === 'selected'
        ? `${selectedIds.length} selected`
        : singleInvestor?.full_name || 'One investor';

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.md,
        }}
      >
        <Skeleton height={40} style={{ marginBottom: 12 }} />
        <Skeleton height={120} style={{ marginBottom: 12 }} />
        <Skeleton height={160} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.md,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.secondary}
          colors={[colors.secondary]}
        />
      }
    >
      <Text style={[typography.h2, { color: colors.text.primary }]}>
        Notifications
      </Text>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          Pending approvals
        </Text>
        <View style={{ gap: spacing.sm }}>
          {pendingRow(
            'Capital requests',
            counts.capital_requests,
            '/(admin)/capital/requests' as Href
          )}
          {pendingRow(
            'Withdrawal requests',
            counts.withdrawal_requests,
            '/(admin)/capital/requests' as Href
          )}
          {pendingRow(
            'Profile updates',
            counts.profile_updates,
            '/(admin)/users' as Href
          )}
          {pendingRow(
            'New registrations',
            counts.new_registrations,
            '/(admin)/users' as Href
          )}
          {pendingRow(
            'Open tickets',
            counts.open_tickets,
            '/(admin)/support' as Href
          )}
        </View>
      </Card>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          System alerts
        </Text>
        <View style={styles.alertGrid}>
          <View
            style={[
              styles.alertCard,
              {
                borderColor:
                  alerts.email_failures > 0 ? colors.error : colors.border,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Email failures
            </Text>
            <Text
              style={[
                typography.h2,
                {
                  color:
                    alerts.email_failures > 0
                      ? colors.error
                      : colors.text.primary,
                },
              ]}
            >
              {alerts.email_failures}
            </Text>
          </View>
          <View
            style={[
              styles.alertCard,
              {
                borderColor:
                  alerts.backup_failures > 0 ? colors.error : colors.border,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Backup failures
            </Text>
            <Text
              style={[
                typography.h2,
                {
                  color:
                    alerts.backup_failures > 0
                      ? colors.error
                      : colors.text.primary,
                },
              ]}
            >
              {alerts.backup_failures}
            </Text>
          </View>
          <View
            style={[
              styles.alertCard,
              {
                borderColor:
                  alerts.cron_failures > 0 ? colors.error : colors.border,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Cron failures
            </Text>
            <Text
              style={[
                typography.h2,
                {
                  color:
                    alerts.cron_failures > 0
                      ? colors.error
                      : colors.text.primary,
                },
              ]}
            >
              {alerts.cron_failures}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          Recent notifications
        </Text>
        {recent.length === 0 ? (
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            No recent notifications
          </Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {recent.map((n) => (
              <View
                key={n.id}
                style={[
                  styles.recentRow,
                  {
                    borderColor: colors.border,
                    borderRadius: borderRadius.md,
                    backgroundColor: n.is_read
                      ? colors.card
                      : colors.surface,
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
                    {n.title}
                  </Text>
                  {n.type ? <Badge label={n.type} variant="default" /> : null}
                </View>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: 4 },
                  ]}
                  numberOfLines={3}
                >
                  {n.body}
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: 4 },
                  ]}
                >
                  {n.created_at
                    ? `${formatDate(n.created_at)} · ${formatTime(n.created_at)}`
                    : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          Custom broadcast
        </Text>

        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginBottom: spacing.sm },
          ]}
        >
          Target
        </Text>
        <View style={styles.chipRow}>
          {chip('Single Investor', target === 'single', () => {
            setTarget('single');
            setAllChecked(false);
          })}
          {chip('Selected Investors', target === 'selected', () => {
            setTarget('selected');
            setAllChecked(false);
            setSingleInvestor(null);
          })}
          {chip('All Investors', target === 'all', () => {
            setTarget('all');
            setSingleInvestor(null);
            setSelectedIds([]);
            setSelectedMap({});
          })}
        </View>

        {target === 'all' ? (
          <Pressable
            onPress={() => setAllChecked((v) => !v)}
            style={[styles.checkRow, { marginTop: spacing.md }]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: colors.border,
                  backgroundColor: allChecked
                    ? colors.secondary
                    : colors.background,
                },
              ]}
            />
            <Text style={[typography.body, { color: colors.text.primary }]}>
              Confirm send to all Tikhat Partners
            </Text>
          </Pressable>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {target === 'single' && singleInvestor ? (
              <View
                style={[
                  styles.selectedBox,
                  {
                    borderColor: colors.border,
                    borderRadius: borderRadius.md,
                    backgroundColor: colors.surface,
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
                    {singleInvestor.full_name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {singleInvestor.email}
                  </Text>
                </View>
                <Pressable onPress={() => setSingleInvestor(null)}>
                  <Text style={[typography.caption, { color: colors.error }]}>
                    Clear
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={
                    target === 'single'
                      ? 'Search investor…'
                      : 'Search to multi-select…'
                  }
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
                {investors.map((inv) => {
                  const checked = selectedIds.includes(inv.id);
                  return (
                    <Pressable
                      key={inv.id}
                      onPress={() => {
                        if (target === 'single') {
                          setSingleInvestor(inv);
                          setSearch('');
                          setInvestors([]);
                        } else {
                          toggleSelected(inv);
                        }
                      }}
                      style={[
                        styles.investorRow,
                        {
                          borderColor: colors.border,
                          borderRadius: borderRadius.md,
                          backgroundColor:
                            checked || singleInvestor?.id === inv.id
                              ? colors.surface
                              : colors.background,
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
                  );
                })}
              </>
            )}

            {target === 'selected' && selectedIds.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Selected ({selectedIds.length})
                </Text>
                {selectedIds.map((id) => (
                  <Text
                    key={id}
                    style={[typography.caption, { color: colors.text.primary }]}
                  >
                    • {selectedMap[id]?.full_name || id}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        )}

        <View style={{ marginTop: spacing.md }}>
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginBottom: 4 },
            ]}
          >
            Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Notification title"
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
        </View>

        <View style={{ marginTop: spacing.sm }}>
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginBottom: 4 },
            ]}
          >
            Body
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="Notification message…"
            placeholderTextColor={colors.text.secondary}
            style={[
              typography.body,
              styles.textarea,
              {
                borderColor: colors.border,
                color: colors.text.primary,
                borderRadius: borderRadius.md,
                minHeight: 100,
              },
            ]}
          />
        </View>

        <View style={[styles.switchRow, { marginVertical: spacing.md }]}>
          <Text
            style={[
              typography.body,
              { color: colors.text.primary, flex: 1, fontWeight: '600' },
            ]}
          >
            Send Email
          </Text>
          <Switch
            value={sendEmail}
            onValueChange={setSendEmail}
            trackColor={{ false: colors.border, true: colors.secondary }}
            thumbColor={colors.background}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Preview"
              variant="secondary"
              onPress={openPreview}
              disabled={sending}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Send"
              variant="golden"
              loading={sending}
              disabled={sending}
              onPress={() => {
                const err = validateBroadcast();
                if (err) {
                  toast.error(err);
                  return;
                }
                confirmSend();
              }}
            />
          </View>
        </View>
      </Card>

      <Modal visible={previewOpen} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPreviewOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Broadcast preview
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: spacing.sm },
              ]}
            >
              Target: {targetLabel}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: 4 },
              ]}
            >
              Email: {sendEmail ? 'Yes' : 'No'}
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.primary,
                  fontWeight: '700',
                  marginTop: spacing.md,
                },
              ]}
            >
              {title.trim()}
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.primary, marginTop: spacing.sm },
              ]}
            >
              {body.trim()}
            </Text>
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <Button title="Confirm & Send" variant="golden" onPress={confirmSend} />
              <Button
                title="Close"
                variant="secondary"
                onPress={() => setPreviewOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  pendingRow: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  alertCard: {
    borderWidth: 1,
    padding: 12,
    minWidth: '30%',
    flexGrow: 1,
  },
  recentRow: { borderWidth: 1, padding: 12 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  textarea: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderRadius: 4 },
  selectedBox: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  investorRow: { borderWidth: 1, padding: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { padding: 16 },
});
