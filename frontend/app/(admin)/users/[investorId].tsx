import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import { useAuth } from '../../../hooks/useAuth';
import { adminService } from '../../../services/admin.service';
import { apiDelete } from '../../../services/api';
import { ApiClientError } from '../../../types/api.types';
import type { Investor, ProfileUpdateRequest } from '../../../types/models.types';
import { formatDate } from '../../../utils/formatDate';
import { zodResolver } from '../../../utils/validationSchemas';
import { FormDatePicker } from '../../../components/forms/FormDatePicker';
import { AmountDisplay } from '../../../components/common/AmountDisplay';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { toast } from '../../../components/ui/Toast';

type ConcurrentEditor = {
  userId?: string;
  name?: string;
};

type CapitalSummary = {
  capital_balance?: number;
  revenue_balance?: number;
  total_balance?: number;
  pending_withdrawal?: number;
  effective_roi?: number | null;
};

type RoiInfo = {
  default_roi?: number | null;
  terms?: unknown[];
};

type InvestorDetail = Investor & {
  locked_reason?: string | null;
};

type JoiningForm = { joining_date: string };

const joiningSchema = z.object({
  joining_date: z.string().min(1, 'Joining date is required'),
});

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text
        style={[typography.body, { color: colors.text.primary, marginTop: 2 }]}
        selectable
      >
        {value && String(value).trim() ? value : '—'}
      </Text>
    </View>
  );
}

export default function AdminInvestorDetailScreen() {
  const navigation = useNavigation();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const { isSuperAdmin } = useAuth();
  const params = useLocalSearchParams<{ investorId: string }>();
  const investorId = String(params.investorId || '');

  const [investor, setInvestor] = useState<InvestorDetail | null>(null);
  const [capital, setCapital] = useState<CapitalSummary | null>(null);
  const [roi, setRoi] = useState<RoiInfo | null>(null);
  const [editors, setEditors] = useState<ConcurrentEditor[]>([]);
  const [profileRequests, setProfileRequests] = useState<ProfileUpdateRequest[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [joiningOpen, setJoiningOpen] = useState(false);
  const [flushOpen, setFlushOpen] = useState(false);
  const [flushEmailConfirm, setFlushEmailConfirm] = useState('');

  const { control, handleSubmit, reset } = useForm<JoiningForm>({
    resolver: zodResolver(joiningSchema),
    defaultValues: { joining_date: '' },
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
        const [detail, requests] = await Promise.all([
          adminService.getInvestor(investorId) as Promise<{
            investor: InvestorDetail;
            capital_summary?: CapitalSummary;
            roi?: RoiInfo;
            concurrent_editors?: ConcurrentEditor[];
          }>,
          adminService.listInvestorProfileRequests(investorId).catch(() => null),
        ]);
        setInvestor(detail.investor);
        setCapital(detail.capital_summary || null);
        setRoi(detail.roi || null);
        setEditors(detail.concurrent_editors || []);
        const reqList =
          (requests as { requests?: ProfileUpdateRequest[]; pending?: ProfileUpdateRequest[] } | null)
            ?.requests ||
          (requests as { pending?: ProfileUpdateRequest[] } | null)?.pending ||
          (Array.isArray(requests) ? (requests as ProfileUpdateRequest[]) : []);
        setProfileRequests(
          (reqList || []).filter(
            (r) => String(r.status).toLowerCase() === 'pending'
          )
        );
        reset({
          joining_date: detail.investor?.joining_date
            ? String(detail.investor.joining_date).slice(0, 10)
            : '',
        });
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load investor'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [investorId, reset]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
      return () => {
        if (investorId) {
          void adminService.releaseInvestorEditLock(investorId).catch(() => undefined);
        }
      };
    }, [load, investorId])
  );

  useEffect(() => {
    if (!investorId) return;
    const id = setInterval(() => {
      void load(true);
    }, 25000);
    return () => clearInterval(id);
  }, [investorId, load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: investor?.full_name || 'Investor Detail',
    });
  }, [navigation, investor?.full_name]);

  const runAction = async (
    key: string,
    fn: () => Promise<unknown>,
    successMsg: string
  ) => {
    setActionLoading(key);
    try {
      await fn();
      toast.success(successMsg);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Action failed'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = () => {
    const message =
      'Delete this Tikhat Partner account? Data is retained but login is blocked.';
    const run = () =>
      runAction(
        'delete',
        () => adminService.softDeleteInvestor(investorId),
        'Investor deleted'
      );

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) void run();
      return;
    }
    Alert.alert('Delete investor', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void run();
        },
      },
    ]);
  };

  const openFlushConfirm = () => {
    const message =
      'This will permanently delete ALL transactions for this investor. This cannot be undone. Are you sure?';
    const proceed = () => {
      setFlushEmailConfirm('');
      setFlushOpen(true);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) proceed();
      return;
    }
    Alert.alert('Flush all transactions', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: proceed,
      },
    ]);
  };

  const submitFlush = async () => {
    const expected = String(investor?.email || '')
      .trim()
      .toLowerCase();
    const typed = flushEmailConfirm.trim().toLowerCase();
    if (!expected || typed !== expected) {
      toast.error("Email does not match. Type the investor's email to confirm.");
      return;
    }

    setFlushOpen(false);
    await runAction(
      'flush',
      () =>
        apiDelete(`/api/v1/admin/investors/${investorId}/flush-transactions`),
      'All transactions flushed'
    );
    setFlushEmailConfirm('');
  };

  const submitReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Rejection reason is required');
      return;
    }
    setRejectOpen(false);
    await runAction(
      'reject',
      () => adminService.rejectInvestor(investorId, reason),
      'Investor rejected'
    );
    setRejectReason('');
  };

  const saveJoiningDate = handleSubmit(async (values) => {
    await runAction(
      'joining',
      () => adminService.updateJoiningDate(investorId, values.joining_date),
      'Joining date updated'
    );
    setJoiningOpen(false);
  });

  const status = String(investor?.status || '').toLowerCase();
  const concurrentNames = editors
    .map((e) => e.name)
    .filter(Boolean)
    .join(', ');

  if (loading && !investor) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Skeleton height={96} />
        <Skeleton height={160} />
        <Skeleton height={120} />
      </View>
    );
  }

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
            onRefresh={() => {
              void load(true);
            }}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
      >
        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>{error}</Text>
        ) : null}

        {concurrentNames ? (
          <View
            style={[
              styles.warning,
              {
                backgroundColor: colors.surface,
                borderColor: colors.warning,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Text style={[typography.subtitle, { color: colors.warning, fontWeight: '700' }]}>
              {`${concurrentNames} is also viewing this investor`}
            </Text>
          </View>
        ) : null}

        <Card accent>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  typography.h3,
                  { color: colors.text.primary },
                ]}
              >
                {investor?.full_name || '—'}
              </Text>
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                {investor?.email}
              </Text>
            </View>
            {investor ? <StatusChip status={investor.status} /> : null}
          </View>
          {status === 'locked' ? (
            <View style={{ marginTop: spacing.sm }}>
              <Badge
                label={
                  investor?.locked_reason
                    ? `Locked: ${investor.locked_reason}`
                    : 'Locked'
                }
                variant="error"
              />
            </View>
          ) : null}
          {status === 'self_deactivated' ? (
            <View style={{ marginTop: spacing.sm }}>
              <Badge label="Self-Deactivated" variant="warning" />
            </View>
          ) : null}
        </Card>

        {profileRequests.length > 0 ? (
          <Card>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.primary, fontWeight: '700' },
              ]}
            >
              Pending profile updates ({profileRequests.length})
            </Text>
            {profileRequests.map((req) => (
              <View
                key={req.id}
                style={[styles.requestRow, { borderBottomColor: colors.border }]}
              >
                <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>
                  {req.field_name}: {req.new_value}
                </Text>
                <View style={{ gap: 6 }}>
                  <Pressable
                    onPress={() => {
                      void runAction(
                        `approve-${req.id}`,
                        () => adminService.approveProfileRequest(req.id),
                        'Profile field approved'
                      );
                    }}
                  >
                    <Text style={{ color: colors.success, fontWeight: '700' }}>
                      Approve
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void runAction(
                        `reject-${req.id}`,
                        () =>
                          adminService.rejectProfileRequest(
                            req.id,
                            'Rejected by admin'
                          ),
                        'Profile field rejected'
                      );
                    }}
                  >
                    <Text style={{ color: colors.error, fontWeight: '700' }}>
                      Reject
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
            ]}
          >
            Profile
          </Text>
          <Field label="Mobile" value={investor?.mobile} />
          <Field
            label="Date of birth"
            value={
              investor?.date_of_birth
                ? formatDate(investor.date_of_birth)
                : null
            }
          />
          <Field label="Address" value={investor?.address} />
          <Field label="PAN" value={investor?.pan_number} />
          <Field label="Aadhar" value={investor?.aadhar_number} />
          <Field label="Bank name" value={investor?.bank_name} />
          <Field label="Account name" value={investor?.bank_account_name} />
          <Field label="Account number" value={investor?.bank_account_number} />
          <Field label="IFSC" value={investor?.bank_ifsc} />
          <Field label="UPI ID" value={investor?.upi_id} />
          <Field
            label="KYC status"
            value={String(investor?.kyc_status || '—')}
          />
          <Field
            label="Joining date"
            value={
              investor?.joining_date_formatted ||
              (investor?.joining_date
                ? formatDate(investor.joining_date)
                : null)
            }
          />
          <Button
            title="Modify joining date"
            variant="secondary"
            onPress={() => setJoiningOpen(true)}
          />
        </Card>

        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
            ]}
          >
            Capital summary
          </Text>
          <Summary label="Capital" amount={capital?.capital_balance} />
          <Summary label="Revenue" amount={capital?.revenue_balance} />
          <Summary label="Total" amount={capital?.total_balance} />
          <Summary label="Pending withdrawal" amount={capital?.pending_withdrawal} />
        </Card>

        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.sm },
            ]}
          >
            ROI info
          </Text>
          <Field
            label="Default ROI"
            value={
              roi?.default_roi != null
                ? `${Number(roi.default_roi)}%`
                : capital?.effective_roi != null
                  ? `${Number(capital.effective_roi)}%`
                  : null
            }
          />
          <Field
            label="Effective ROI"
            value={
              capital?.effective_roi != null
                ? `${Number(capital.effective_roi)}%`
                : null
            }
          />
          <Field
            label="Active terms"
            value={String((roi?.terms || []).length)}
          />
        </Card>

        <Card>
          <Text
            style={[
              typography.subtitle,
              { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.md },
            ]}
          >
            Actions
          </Text>
          <View style={{ gap: spacing.sm }}>
            {status === 'pending' ? (
              <>
                <Button
                  title="Approve"
                  variant="golden"
                  loading={actionLoading === 'approve'}
                  onPress={() => {
                    void runAction(
                      'approve',
                      () => adminService.approveInvestor(investorId),
                      'Investor approved'
                    );
                  }}
                />
                <Button
                  title="Reject"
                  variant="secondary"
                  loading={actionLoading === 'reject'}
                  onPress={() => setRejectOpen(true)}
                  textStyle={{ color: colors.error }}
                  style={{ borderColor: colors.error }}
                />
              </>
            ) : null}

            {status === 'active' ? (
              <Button
                title="Pause"
                variant="secondary"
                loading={actionLoading === 'pause'}
                onPress={() => {
                  void runAction(
                    'pause',
                    () => adminService.pauseInvestor(investorId),
                    'Investor paused'
                  );
                }}
              />
            ) : null}

            {status === 'paused' ? (
              <Button
                title="Resume"
                variant="golden"
                loading={actionLoading === 'resume'}
                onPress={() => {
                  void runAction(
                    'resume',
                    () => adminService.resumeInvestor(investorId),
                    'Investor resumed'
                  );
                }}
              />
            ) : null}

            {status === 'locked' ? (
              <Button
                title="Unlock"
                variant="golden"
                loading={actionLoading === 'unlock'}
                onPress={() => {
                  void runAction(
                    'unlock',
                    () => adminService.unlockInvestor(investorId),
                    'Investor unlocked'
                  );
                }}
              />
            ) : null}

            {isSuperAdmin ? (
              <Button
                title="Flush All Transactions"
                variant="secondary"
                loading={actionLoading === 'flush'}
                onPress={openFlushConfirm}
                textStyle={{ color: colors.error }}
                style={{ borderColor: colors.error }}
              />
            ) : null}

            {status !== 'deleted' ? (
              <Button
                title="Delete"
                variant="secondary"
                loading={actionLoading === 'delete'}
                onPress={confirmDelete}
                textStyle={{ color: colors.error }}
                style={{ borderColor: colors.error }}
              />
            ) : null}
          </View>
        </Card>
      </ScrollView>

      <Modal visible={rejectOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
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
              Reject investor
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Rejection reason"
              placeholderTextColor={colors.text.secondary}
              multiline
              style={[
                typography.body,
                {
                  marginTop: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                  padding: spacing.md,
                  minHeight: 88,
                  color: colors.text.primary,
                  textAlignVertical: 'top',
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
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
                  onPress={() => {
                    void submitReject();
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={joiningOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
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
            <Text
              style={[
                typography.title,
                { color: colors.text.primary, marginBottom: spacing.md },
              ]}
            >
              Modify joining date
            </Text>
            <FormDatePicker
              control={control}
              name="joining_date"
              label="Joining date"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setJoiningOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Save"
                  variant="golden"
                  loading={actionLoading === 'joining'}
                  onPress={() => {
                    void saveJoiningDate();
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={flushOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
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
            <Text style={[typography.title, { color: colors.error }]}>
              Confirm flush
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginTop: spacing.sm,
                },
              ]}
            >
              Type the investor email to permanently delete all transactions:
            </Text>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.primary,
                  marginTop: spacing.xs,
                  fontWeight: '700',
                },
              ]}
              selectable
            >
              {investor?.email || '—'}
            </Text>
            <TextInput
              value={flushEmailConfirm}
              onChangeText={setFlushEmailConfirm}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Investor email"
              placeholderTextColor={colors.text.secondary}
              style={[
                typography.body,
                {
                  marginTop: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                  padding: spacing.md,
                  color: colors.text.primary,
                },
              ]}
            />
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                marginTop: spacing.md,
              }}
            >
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setFlushOpen(false);
                    setFlushEmailConfirm('');
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Flush permanently"
                  variant="secondary"
                  loading={actionLoading === 'flush'}
                  onPress={() => {
                    void submitFlush();
                  }}
                  textStyle={{ color: colors.error }}
                  style={{ borderColor: colors.error }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Summary({
  label,
  amount,
}: {
  label: string;
  amount?: number;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
      }}
    >
      <Text style={[typography.body, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <AmountDisplay amount={Math.round(Number(amount) || 0)} size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  warning: {
    borderWidth: 1,
    padding: 12,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});
