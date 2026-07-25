import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency } from '../../utils/formatCurrency';

export type AmountDisplayProps = {
  amount: number;
  /** Show + prefix for positive amounts */
  showSign?: boolean;
  /** Force color: credit green / debit red / default theme text */
  tone?: 'default' | 'credit' | 'debit';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: StyleProp<TextStyle>;
  testID?: string;
};

/**
 * Always formats as ₹ Indian currency with whole numbers only.
 */
export function AmountDisplay({
  amount,
  showSign = false,
  tone = 'default',
  size = 'md',
  style,
  testID,
}: AmountDisplayProps) {
  const { colors, typography } = useTheme();
  const value = Math.round(Number(amount) || 0);
  const formatted = formatCurrency(value);

  let display = formatted;
  if (showSign && value > 0) {
    display = `+${formatted}`;
  }

  const color =
    tone === 'credit'
      ? colors.success
      : tone === 'debit'
        ? colors.error
        : colors.text.primary;

  const sizeStyle =
    size === 'sm'
      ? typography.subtitle
      : size === 'lg'
        ? typography.amount
        : size === 'xl'
          ? { ...typography.amount, fontSize: 28, lineHeight: 34 }
          : typography.body;

  return (
    <Text
      testID={testID}
      style={[
        sizeStyle,
        {
          color,
          fontWeight: size === 'lg' || size === 'xl' ? '700' : '600',
        },
        style,
      ]}
    >
      {display}
    </Text>
  );
}
