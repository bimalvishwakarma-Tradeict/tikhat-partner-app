import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency } from '../../utils/formatCurrency';
import { Card } from '../ui/Card';

export type PortfolioCardProps = {
  totalInvested: number;
  totalEarned: number;
  effectiveRoi: number | null | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function PortfolioCard({
  totalInvested = 0,
  totalEarned = 0,
  effectiveRoi,
  style,
  testID,
}: PortfolioCardProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const roi =
    effectiveRoi === null || effectiveRoi === undefined
      ? '—'
      : `${Number(effectiveRoi).toFixed(2)}%`;

  return (
    <Card accent style={style} testID={testID}>
      <Text
        style={[
          typography?.title,
          { color: colors?.text?.primary, marginBottom: spacing?.md },
        ]}
      >
        Portfolio
      </Text>

      <View style={styles.grid}>
        <View style={styles.cell}>
          <Text style={[typography?.caption, { color: colors?.text?.secondary }]}>
            Total Invested
          </Text>
          <Text
            style={[
              typography?.title,
              { color: colors?.text?.primary, marginTop: spacing?.xs },
            ]}
          >
            {formatCurrency(Math.round(totalInvested || 0))}
          </Text>
        </View>

        <View
          style={[
            styles.cell,
            {
              borderLeftWidth: StyleSheet.hairlineWidth,
              borderLeftColor: colors?.border,
              paddingLeft: spacing?.md,
            },
          ]}
        >
          <Text style={[typography?.caption, { color: colors?.text?.secondary }]}>
            Total Earned
          </Text>
          <Text
            style={[
              typography?.title,
              { color: colors?.success, marginTop: spacing?.xs },
            ]}
          >
            {formatCurrency(Math.round(totalEarned || 0))}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.roiBox,
          {
            backgroundColor: colors?.surface,
            borderRadius: borderRadius?.md,
            marginTop: spacing?.md,
            padding: spacing?.md,
          },
        ]}
      >
        <Text style={[typography?.caption, { color: colors?.text?.secondary }]}>
          Effective ROI
        </Text>
        <Text
          style={[
            typography?.amount,
            { color: colors?.secondary, marginTop: spacing?.xs },
          ]}
        >
          {roi}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
  },
  roiBox: {
    alignItems: 'flex-start',
  },
});
