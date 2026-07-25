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
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from 'victory-native';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { formatIndianNumber } from '../../utils/indianNumber';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

export type CapitalGrowthPoint = {
  date: string | Date;
  amount: number;
};

export type CapitalGrowthChartProps = {
  data?: CapitalGrowthPoint[] | null;
  loading?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function yTickLabel(value: number): string {
  const rounded = Math.round(value || 0);
  return `₹${formatIndianNumber(rounded)}`;
}

function shortDateLabel(date: string | Date | null | undefined): string {
  if (date == null) {
    return '';
  }
  try {
    const formatted = formatDate(date);
    const parts = (formatted ?? '').split(' ');
    if ((parts ?? []).length >= 3) {
      return `${parts[1] ?? ''} ${(parts[2] ?? '').slice(-2)}`.trim();
    }
    return formatted;
  } catch {
    return String(date);
  }
}

/**
 * Line chart — capital balance over time. Dark blue line, accent points.
 */
export function CapitalGrowthChart({
  data = [],
  loading = false,
  height = 240,
  style,
  testID,
}: CapitalGrowthChartProps) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(320);

  const chartData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return (safeData ?? [])
      .filter((point): point is CapitalGrowthPoint => point != null)
      .map((point, index) => ({
        x: index + 1,
        y: Math.round(Number(point?.amount) || 0),
        dateLabel: shortDateLabel(point?.date),
        label: `${shortDateLabel(point?.date)}\n${formatCurrency(Math.round(Number(point?.amount) || 0))}`,
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
          title="No capital growth data"
          subtitle="Capital balance over time will appear after deposits."
        />
      </View>
    );
  }

  const chartWidth = Math.max(280, Math.min(width, 420));
  const tickValues = (chartData ?? []).map((d) => d?.x).filter((x) => x != null);
  const tickFormat = (tick: number) => {
    const point = (chartData ?? []).find((d) => d?.x === tick);
    return point?.dateLabel || '';
  };
  const chartTheme = VictoryTheme?.material;

  return (
    <View testID={testID} style={[styles.wrap, style]} onLayout={onLayout}>
      <VictoryChart
        width={chartWidth}
        height={height}
        padding={{ top: 24, bottom: 44, left: 64, right: 16 }}
        {...(chartTheme ? { theme: chartTheme } : {})}
      >
        <VictoryAxis
          tickValues={tickValues ?? []}
          tickFormat={tickFormat}
          style={{
            axis: { stroke: colors?.border },
            tickLabels: {
              fill: colors?.text?.secondary,
              fontSize: 10,
              padding: 6,
              angle: (chartData?.length ?? 0) > 6 ? -30 : 0,
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
        <VictoryLine
          data={chartData ?? []}
          interpolation="monotoneX"
          style={{
            data: {
              stroke: colors?.primary,
              strokeWidth: 2.5,
            },
          }}
        />
        <VictoryScatter
          data={chartData ?? []}
          size={5}
          style={{
            data: {
              fill: colors?.secondary,
              stroke: colors?.primary,
              strokeWidth: 1,
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
