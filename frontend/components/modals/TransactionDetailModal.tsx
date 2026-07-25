import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatTime } from '../../utils/formatDate';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { StatusChip } from '../ui/StatusChip';
import { toast } from '../ui/Toast';

export type TransactionDetailData = {
  transactionId: string;
  date: string | Date;
  /** ISO datetime preferred; omit or date-only → time shown as — */
  time?: string | Date | null;
  type: string;
  amount: number;
  direction?: 'credit' | 'debit';
  description: string;
  status?: string;
  balance?: number | null;
  extraRows?: Array<{ label: string; value: string }>;
};

export type TransactionDetailModalProps = {
  visible: boolean;
  onClose: () => void;
  transaction: TransactionDetailData | null;
  testID?: string;
};

function hasClockTime(value: string | Date | null | undefined): boolean {
  if (value == null) {
    return false;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  const s = String(value);
  return /T|\d{1,2}:\d{2}/.test(s);
}

function humanizeType(type: string): string {
  return String(type || '—')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Revenue (and reusable) transaction detail bottom sheet.
 */
export function TransactionDetailModal({
  visible,
  onClose,
  transaction,
  testID,
}: TransactionDetailModalProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  const copyId = async () => {
    if (!transaction?.transactionId) {
      return;
    }
    await Clipboard.setStringAsync(transaction.transactionId);
    toast.success('Transaction ID copied');
  };

  const direction = transaction?.direction || 'credit';
  const amountColor =
    direction === 'debit' ? colors.error : colors.success;
  const amountPrefix = direction === 'debit' ? '-' : '+';
  const absolute = Math.abs(Math.round(transaction?.amount || 0));

  const timeValue =
    transaction && hasClockTime(transaction.time ?? transaction.date)
      ? formatTime(transaction.time ?? transaction.date)
      : '—';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.58}
      testID={testID}
    >
      {transaction ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.md }}
        >
          <Text
            style={[
              typography.h3,
              { color: colors.text.primary, marginBottom: spacing.sm },
            ]}
          >
            Transaction details
          </Text>

          <Card accent padded>
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
                  {transaction.transactionId}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void copyId();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Copy transaction ID"
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

            <DetailLine label="Date" value={formatDate(transaction.date)} />
            <DetailLine label="Time" value={timeValue} />
            <DetailLine label="Type" value={humanizeType(transaction.type)} />
            <DetailLine
              label="Description"
              value={transaction.description || '—'}
            />

            <View style={[styles.amountBlock, { marginTop: spacing.sm }]}>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Amount
              </Text>
              <Text
                style={[
                  typography.amount,
                  { color: amountColor, fontWeight: '700', marginTop: 2 },
                ]}
              >
                {amountPrefix}
                {formatCurrency(absolute)}
              </Text>
            </View>

            {transaction.status ? (
              <View style={{ marginTop: spacing.md }}>
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
            ) : null}

            {typeof transaction.balance === 'number' ? (
              <DetailLine
                label="Running balance"
                value={formatCurrency(transaction.balance)}
              />
            ) : null}

            {(transaction.extraRows || []).map((row) => (
              <DetailLine
                key={`${row.label}-${row.value}`}
                label={row.label}
                value={row.value}
              />
            ))}
          </Card>

          <Button
            title="Close"
            variant="secondary"
            onPress={onClose}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.text.primary, marginTop: 2 },
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
  amountBlock: {},
});
