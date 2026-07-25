import { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryTheme,
} from 'victory-native';
import { useTheme } from '../../hooks/useTheme';
import { formatIndianNumber } from '../../utils/indianNumber';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

export type MonthlyRevenuePoint = {
  /** Short month label, e.g. "Jan" or "Jan 26" */
  month: string;
  amount: number;
  /** Mark current month for accent highlight */
  isCurrent?: boolean;
};

export type MonthlyRevenueChartProps = {
  data?: MonthlyRevenuePoint[] | null;
  loading?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function yTickLabel(value: number): string {
  const rounded = Math.round(value || 0);
  return `₹${formatIndianNumber(rounded)}`;
}

/**
 * Bar chart — last 6 months of revenue. Dark blue bars, accent current month.
 */
export function MonthlyRevenueChart({
  data = [],
  loading = false,
  height = 240,
  style,
  testID,
}: MonthlyRevenueChartProps) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(320);

  const chartData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const sliced = (safeData ?? [])
      .filter((point): point is MonthlyRevenuePoint => point != null)
      .slice(-6);
    return (sliced ?? []).map((point, index) => ({
      x: point?.month ?? `M${index + 1}`,
      y: Math.round(Number(point?.amount) || 0),
      isCurrent:
        point?.isCurrent === true ||
        (point?.isCurrent !== false && index === (sliced?.length ?? 0) - 1),
    }));
  }, [data]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event?.nativeEvent?.layout?.width ?? 0);
    if (next > 0 && next !== width) {
      setWidth(next);
    }
  };

  if (loading) {
    return (
      <View
        testID={testID}
        style={[{ padding: spacing?.sm }, style]}
        onLayout={onLayout}
      >
        <Skeleton width="100%" height={height} borderRadius={12} />
      </View>
    );
  }

  if (!(chartData ?? []).length) {
    return (
      <View testID={testID} style={style} onLayout={onLayout}>
        <EmptyState
          title="No revenue data yet"
          subtitle="Monthly revenue trends will appear once credits start."
        />
      </View>
    );
  }

  const chartWidth = Math.max(280, Math.min(width, 420));
  const chartTheme = VictoryTheme?.material;

  return (
    <View testID={testID} style={[styles.wrap, style]} onLayout={onLayout}>
      <VictoryChart
        width={chartWidth}
        height={height}
        padding={{ top: 24, bottom: 40, left: 64, right: 16 }}
        {...(chartTheme ? { theme: chartTheme } : {})}
        domainPadding={{ x: 28 }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: colors?.border },
            tickLabels: {
              fill: colors?.text?.secondary,
              fontSize: 11,
              padding: 6,
            },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(t: number) => yTickLabel(t)}
          style={{
            axis: { stroke: colors?.border },
            tickLabels: {
              fill: colors?.text?.secondary,
              fontSize: 10,
              padding: 4,
            },
            grid: { stroke: colors?.border, strokeDasharray: '4,4' },
          }}
        />
        <VictoryBar
          data={chartData ?? []}
          cornerRadius={{ top: 4 }}
          style={{
            data: {
              fill: (args?: { datum?: { isCurrent?: boolean } }) =>
                args?.datum?.isCurrent
                  ? colors?.secondary
                  : colors?.primary,
              width: 22,
            },
          }}
        />
      </VictoryChart>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
