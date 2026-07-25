import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Card } from '../ui/Card';
import { AmountDisplay } from '../common/AmountDisplay';
import { Divider } from '../ui/Divider';

export type SummaryRow = {
  label: string;
  value: string | number;
  /** When value is numeric, render as ₹ amount */
  isAmount?: boolean;
};

export type SummaryCardProps = {
  title?: string;
  rows?: SummaryRow[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SummaryCard({
  title,
  rows = [],
  style,
  testID,
}: SummaryCardProps) {
  const { colors, typography, spacing } = useTheme();
  const safeRows = (rows ?? []).filter(
    (row): row is SummaryRow => row != null
  );

  return (
    <Card accent style={style} testID={testID}>
      {title ? (
        <>
          <Text
            style={[
              typography?.title,
              { color: colors?.text?.primary, marginBottom: spacing?.sm },
            ]}
          >
            {title}
          </Text>
          <Divider spacing={spacing?.sm} />
        </>
      ) : null}

      {(safeRows ?? []).map((row, index) => (
        <View
          key={`${row?.label ?? 'row'}-${index}`}
          style={[
            styles.row,
            {
              marginTop: index === 0 && !title ? 0 : spacing?.sm,
            },
          ]}
        >
          <Text
            style={[
              typography?.body,
              { color: colors?.text?.secondary, flex: 1 },
            ]}
          >
            {row?.label ?? ''}
          </Text>
          {row?.isAmount && typeof row?.value === 'number' ? (
            <AmountDisplay amount={row.value} size="sm" />
          ) : (
            <Text
              style={[
                typography?.title,
                { color: colors?.text?.primary, textAlign: 'right' },
              ]}
            >
              {String(row?.value ?? '')}
            </Text>
          )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
