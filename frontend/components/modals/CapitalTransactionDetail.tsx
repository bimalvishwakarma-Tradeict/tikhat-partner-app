import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { capitalService } from '../../services/capital.service';
import { ApiClientError } from '../../types/api.types';
import type { CapitalTransaction } from '../../types/models.types';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatTime } from '../../utils/formatDate';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { StatusChip } from '../ui/StatusChip';
import { toast } from '../ui/Toast';

export const CAPITAL_STATUS_TIMELINE = [
  'submitted',
  'under_review',
  'approved',
  'processed',
  'completed',
] as const;

export type CapitalTransactionDetailProps = {
  visible: boolean;
  onClose: () => void;
  transaction: CapitalTransaction | null;
  onCancelled?: (transaction: CapitalTransaction) => void;
  testID?: string;
};

function humanize(value: string): string {
  return String(value || '—')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isCancelableStatus(status: string): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'submitted' || s === 'under_review';
}

function isWithdrawalType(type: string): boolean {
  return String(type || '').toLowerCase() === 'withdrawal';
}

function isDebitType(type: string): boolean {
  const t = String(type || '').toLowerCase();
  return t === 'withdrawal' || t === 'admin_debit';
}

function timelineIndex(status: string): number {
  const s = String(status || '').toLowerCase();
  if (s === 'cancelled' || s === 'rejected' || s === 'failed') {
    return -1;
  }
  return CAPITAL_STATUS_TIMELINE.indexOf(
    s as (typeof CAPITAL_STATUS_TIMELINE)[number]
  );
}

function shouldShowUtr(status: string, utr: string | null | undefined): boolean {
  if (!utr) {
    return false;
  }
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'processed' || s === 'approved';
}

export function StatusTimeline({ status }: { status: string }) {
  const { colors, typography, spacing } = useTheme();
  const current = timelineIndex(status);
  const normalized = String(status || '').toLowerCase();
  const isTerminalFail =
    normalized === 'cancelled' ||
    normalized === 'rejected' ||
    normalized === 'failed';

  return (
    <View style={{ gap: spacing.sm }}>
      {CAPITAL_STATUS_TIMELINE.map((step, index) => {
        const reached = current >= 0 && index <= current;
        const isCurrent = current >= 0 && index === current;
        return (
          <View key={step} style={styles.timelineRow}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: reached ? colors.success : colors.border,
                  borderColor: isCurrent ? colors.secondary : 'transparent',
                  borderWidth: isCurrent ? 2 : 0,
                },
              ]}
            />
            <Text
              style={[
                typography.body,
                {
                  color: reached ? colors.text.primary : colors.text.secondary,
                  fontWeight: isCurrent ? '700' : '400',
                },
              ]}
            >
              {humanize(step)}
            </Text>
          </View>
        );
      })}
      {isTerminalFail ? (
        <Text style={[typography.caption, { color: colors.error }]}>
          Final status: {humanize(normalized)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Capital transaction detail bottom sheet with status timeline and cancel.
 */
export function CapitalTransactionDetail({
  visible,
  onClose,
  transaction,
  onCancelled,
  testID,
}: CapitalTransactionDetailProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel =
    Boolean(transaction) &&
    isWithdrawalType(transaction?.type || '') &&
    isCancelableStatus(String(transaction?.status || ''));

  const copyId = async () => {
    if (!transaction?.transaction_id) {
      return;
    }
    await Clipboard.setStringAsync(transaction.transaction_id);
    toast.success('Transaction ID copied');
  };

  const performCancel = async () => {
    if (!transaction) {
      return;
    }
    setError(null);
    setCancelling(true);
    try {
      try {
        await capitalService.cancelWithdrawal(transaction.id);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'USER_NOT_FOUND') {
          const list = await capitalService.getWithdrawals({
            account_type: 'capital',
            page: 1,
            limit: 100,
          });
          const match = (list.withdrawals || []).find(
            (w) => w.transaction_id === transaction.transaction_id
          );
          if (!match?.id) {
            throw err;
          }
          await capitalService.cancelWithdrawal(match.id);
        } else {
          throw err;
        }
      }

      toast.success('Withdrawal cancelled');
      onCancelled?.({ ...transaction, status: 'cancelled' });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to cancel request'
      );
    } finally {
      setCancelling(false);
    }
  };

  const confirmCancel = () => {
    const message =
      'Cancel this pending withdrawal request? The amount will be restored to your balance.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) {
        void performCancel();
      }
      return;
    }
    Alert.alert('Cancel request', message, [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () => {
          void performCancel();
        },
      },
    ]);
  };

  const debit = transaction ? isDebitType(transaction.type) : false;
  const amount = Math.round(Number(transaction?.amount) || 0);
  const utr = transaction?.utr_number;
  const dateValue = transaction?.transfer_date || transaction?.created_at;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.78}
      testID={testID}
    >
      {transaction ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.md }}
        >
          <Text style={[typography.h3, { color: colors.text.primary }]}>
            Transaction details
          </Text>

          <Card accent>
            <View style={styles.idRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Transaction ID
                </Text>
                <Text
                  style={[
                    typography.body,
                    {
                      color: colors.text.primary,
                      fontWeight: '600',
                      marginTop: 2,
                    },
                  ]}
                  selectable
                >
                  {transaction.transaction_id}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void copyId();
                }}
                style={[
                  styles.copyBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: borderRadius.md,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <Ionicons
                  name="copy-outline"
                  size={16}
                  color={colors.secondary}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.secondary, fontWeight: '600' },
                  ]}
                >
                  Copy
                </Text>
              </Pressable>
            </View>

            <Divider spacing={spacing.md} />

            <DetailLine
              label="Amount"
              value={`${debit ? '-' : '+'}${formatCurrency(amount)}`}
              valueColor={debit ? colors.error : colors.success}
            />
            <DetailLine label="Type" value={humanize(transaction.type)} />
            <DetailLine
              label="Date"
              value={dateValue ? formatDate(dateValue) : '—'}
            />
            {transaction.created_at ? (
              <DetailLine
                label="Time"
                value={formatTime(transaction.created_at)}
              />
            ) : null}

            <View style={{ marginTop: spacing.sm }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginBottom: spacing.xs },
                ]}
              >
                Status
              </Text>
              <StatusChip status={transaction.status} />
            </View>

            {shouldShowUtr(String(transaction.status), utr) ? (
              <DetailLine label="UTR" value={String(utr)} />
            ) : null}

            {transaction.remark ? (
              <DetailLine label="Remark" value={transaction.remark} />
            ) : null}
            {transaction.admin_remark ? (
              <DetailLine label="Admin remark" value={transaction.admin_remark} />
            ) : null}

            <Divider spacing={spacing.md} />

            <Text
              style={[
                typography.label,
                { color: colors.text.primary, marginBottom: spacing.sm },
              ]}
            >
              Status timeline
            </Text>
            <StatusTimeline status={String(transaction.status)} />
          </Card>

          {error ? (
            <Text style={[typography.caption, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}

          {canCancel ? (
            <Button
              title="Cancel request"
              variant="secondary"
              loading={cancelling}
              onPress={confirmCancel}
            />
          ) : null}

          <Button title="Close" variant="golden" onPress={onClose} />
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}

function DetailLine({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text
        style={[
          typography.body,
          { color: valueColor || colors.text.primary, marginTop: 2 },
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  idRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
