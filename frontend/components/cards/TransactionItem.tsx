import { useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { toast } from '../ui/Toast';
import { StatusChip } from '../ui/StatusChip';

export type TransactionDirection = 'credit' | 'debit';

export type TransactionListItem = {
  id: string;
  transactionId: string;
  date: string | Date;
  description: string;
  amount: number;
  direction: TransactionDirection;
  status?: string;
};

export type TransactionItemProps = {
  item: TransactionListItem;
  /** Optional list index for staggered enter (50ms steps). */
  index?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
};

/** Auto-stagger when index is not provided (batch mounts within 600ms). */
let staggerSeq = 0;
let staggerResetAt = 0;

function nextStaggerIndex(explicit?: number): number {
  if (typeof explicit === 'number' && explicit >= 0) {
    return explicit;
  }
  const now = Date.now();
  if (now - staggerResetAt > 600) {
    staggerSeq = 0;
    staggerResetAt = now;
  }
  const current = staggerSeq;
  staggerSeq += 1;
  return current;
}

export function TransactionItem({
  item,
  index,
  style,
  onPress,
  testID,
}: TransactionItemProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const isCredit = item.direction === 'credit';
  const amountColor = isCredit ? colors.success : colors.error;
  const amountPrefix = isCredit ? '+' : '-';
  const absolute = Math.abs(Math.round(item.amount || 0));
  const staggerIndex = useMemo(() => nextStaggerIndex(index), [index]);

  const copyId = async () => {
    await Clipboard.setStringAsync(item.transactionId);
    toast.success('Transaction ID copied');
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(staggerIndex * 50).duration(280)}
    >
      <Pressable
        testID={testID}
        onPress={onPress}
        style={[
          styles.row,
          {
            borderBottomColor: colors.border,
            paddingVertical: spacing.md,
          },
          style,
        ]}
      >
        <View style={styles.main}>
          <Text
            style={[typography.subtitle, { color: colors.text.secondary }]}
          >
            {formatDate(item.date)}
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.text.primary,
                marginTop: 2,
                fontWeight: '500',
              },
            ]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
          <Pressable
            onPress={copyId}
            hitSlop={6}
            style={{ marginTop: spacing.xs }}
          >
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.secondary,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: borderRadius.sm,
                  overflow: 'hidden',
                  alignSelf: 'flex-start',
                },
              ]}
            >
              {item.transactionId}  ⎘
            </Text>
          </Pressable>
        </View>

        <View style={styles.right}>
          <Text
            style={[
              typography.title,
              { color: amountColor, fontWeight: '700', textAlign: 'right' },
            ]}
          >
            {amountPrefix}
            {formatCurrency(absolute)}
          </Text>
          {item.status ? (
            <View style={{ marginTop: spacing.xs, alignItems: 'flex-end' }}>
              <StatusChip status={item.status} />
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  main: {
    flex: 1,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
});
