import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency } from '../../utils/formatCurrency';
import { Card } from '../ui/Card';

export type BalanceCardProps = {
  label: string;
  amount: number;
  pendingWithdrawal?: number;
  pendingNote?: string;
  onViewTransactions?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Count from 0 → target on first mount (whole rupees only).
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    const goal = Math.round(target || 0);
    if (hasRun.current) {
      setValue(goal);
      return;
    }
    hasRun.current = true;

    const durationMs = 700;
    const start = Date.now();
    let frame = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setValue(Math.round(goal * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setValue(goal);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

export function BalanceCard({
  label = '',
  amount = 0,
  pendingWithdrawal = 0,
  pendingNote,
  onViewTransactions,
  style,
  testID,
}: BalanceCardProps) {
  const { colors, typography, spacing } = useTheme();
  const pending = Math.round(pendingWithdrawal || 0);
  const displayAmount = useCountUp(amount ?? 0);
  const note =
    pendingNote ||
    (pending > 0
      ? `Pending withdrawal: ${formatCurrency(pending)}`
      : undefined);

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <Animated.View entering={ZoomIn.duration(300)}>
        <Card style={style} testID={testID} accent>
          <Text style={[typography?.label, { color: colors?.text?.secondary }]}>
            {label}
          </Text>
          <Text
            style={[
              typography?.amount,
              {
                color: colors?.secondary,
                marginTop: spacing?.xs,
                fontWeight: '700',
              },
            ]}
          >
            {formatCurrency(displayAmount)}
          </Text>

          {onViewTransactions ? (
            <Pressable
              onPress={onViewTransactions}
              hitSlop={8}
              style={{ marginTop: spacing?.sm }}
            >
              <Text
                style={[
                  typography?.subtitle,
                  { color: colors?.secondary, fontWeight: '600' },
                ]}
              >
                View Transactions →
              </Text>
            </Pressable>
          ) : null}

          {note ? (
            <Text
              style={[
                typography?.caption,
                {
                  color: colors?.text?.secondary,
                  marginTop: spacing?.sm,
                },
              ]}
            >
              {note}
            </Text>
          ) : null}
        </Card>
      </Animated.View>
    </Animated.View>
  );
}
