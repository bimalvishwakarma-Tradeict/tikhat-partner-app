import { useMemo, useState } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { formatDate } from '../../utils/formatDate';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';

export type FormDatePickerProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Minimum selectable year (inclusive) */
  minYear?: number;
  /** Maximum selectable year (inclusive) */
  maxYear?: number;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

const MONTH_OPTIONS = [
  { label: 'Jan', value: 1 },
  { label: 'Feb', value: 2 },
  { label: 'Mar', value: 3 },
  { label: 'Apr', value: 4 },
  { label: 'May', value: 5 },
  { label: 'Jun', value: 6 },
  { label: 'Jul', value: 7 },
  { label: 'Aug', value: 8 },
  { label: 'Sep', value: 9 },
  { label: 'Oct', value: 10 },
  { label: 'Nov', value: 11 },
  { label: 'Dec', value: 12 },
] as const;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseIsoDate(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function displayValue(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return '';
  }
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return value;
  }
  return formatDate(new Date(parsed.y, parsed.m - 1, parsed.d));
}

type Draft = { y: number; m: number; d: number };

export function FormDatePicker<T extends FieldValues>({
  control,
  name,
  label,
  placeholder = 'Select date',
  disabled = false,
  minYear = 1950,
  maxYear = new Date().getFullYear() + 1,
  containerStyle,
  testID,
}: FormDatePickerProps<T>) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  });

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) {
      list.push(y);
    }
    return list;
  }, [minYear, maxYear]);

  const dayCount = daysInMonth(draft.y, draft.m);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const hasError = Boolean(error?.message);
        const shown = displayValue(value);

        const openPicker = () => {
          const parsed = parseIsoDate(value);
          if (parsed) {
            setDraft(parsed);
          } else {
            const now = new Date();
            setDraft({
              y: now.getFullYear(),
              m: now.getMonth() + 1,
              d: now.getDate(),
            });
          }
          setOpen(true);
        };

        return (
          <View style={[styles.container, containerStyle]} testID={testID}>
            {label ? (
              <Text
                style={[
                  typography.label,
                  { color: colors.text.primary, marginBottom: spacing.xs },
                ]}
              >
                {label}
              </Text>
            ) : null}

            <Pressable
              disabled={disabled}
              onPress={openPicker}
              style={[
                styles.trigger,
                {
                  backgroundColor: isDark ? colors.surface : colors.background,
                  borderColor: hasError ? colors.error : colors.border,
                  borderWidth: hasError ? 2 : 1,
                  borderRadius: borderRadius.md,
                  opacity: disabled ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.body,
                  {
                    color: shown ? colors.text.primary : colors.text.secondary,
                    flex: 1,
                  },
                ]}
              >
                {shown || placeholder}
              </Text>
            </Pressable>

            {hasError ? (
              <Text
                style={[
                  typography.caption,
                  { color: colors.error, marginTop: spacing.xs },
                ]}
              >
                {error?.message}
              </Text>
            ) : null}

            <BottomSheet visible={open} onClose={() => setOpen(false)} heightRatio={0.62}>
              <Text
                style={[
                  typography.title,
                  { color: colors.text.primary, marginBottom: spacing.md },
                ]}
              >
                {label || 'Select date'}
              </Text>

              <View style={styles.columns}>
                <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
                    <Pressable
                      key={`d-${day}`}
                      onPress={() => setDraft((prev) => ({ ...prev, d: day }))}
                      style={[
                        styles.cell,
                        {
                          backgroundColor:
                            draft.d === day ? colors.surface : 'transparent',
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color:
                              draft.d === day
                                ? colors.secondary
                                : colors.text.primary,
                            textAlign: 'center',
                            fontWeight: draft.d === day ? '700' : '400',
                          },
                        ]}
                      >
                        {String(day).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                  {MONTH_OPTIONS.map((month) => (
                    <Pressable
                      key={`m-${month.value}`}
                      onPress={() => {
                        setDraft((prev) => {
                          const maxDay = daysInMonth(prev.y, month.value);
                          return {
                            ...prev,
                            m: month.value,
                            d: Math.min(prev.d, maxDay),
                          };
                        });
                      }}
                      style={[
                        styles.cell,
                        {
                          backgroundColor:
                            draft.m === month.value
                              ? colors.surface
                              : 'transparent',
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color:
                              draft.m === month.value
                                ? colors.secondary
                                : colors.text.primary,
                            textAlign: 'center',
                            fontWeight: draft.m === month.value ? '700' : '400',
                          },
                        ]}
                      >
                        {month.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                  {years.map((year) => (
                    <Pressable
                      key={`y-${year}`}
                      onPress={() => {
                        setDraft((prev) => {
                          const maxDay = daysInMonth(year, prev.m);
                          return {
                            ...prev,
                            y: year,
                            d: Math.min(prev.d, maxDay),
                          };
                        });
                      }}
                      style={[
                        styles.cell,
                        {
                          backgroundColor:
                            draft.y === year ? colors.surface : 'transparent',
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color:
                              draft.y === year
                                ? colors.secondary
                                : colors.text.primary,
                            textAlign: 'center',
                            fontWeight: draft.y === year ? '700' : '400',
                          },
                        ]}
                      >
                        {year}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={{ marginTop: spacing.md }}>
                <Text
                  style={[
                    typography.subtitle,
                    {
                      color: colors.text.secondary,
                      textAlign: 'center',
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  {formatDate(new Date(draft.y, draft.m - 1, draft.d))}
                </Text>
                <Button
                  title="Confirm"
                  variant="golden"
                  onPress={() => {
                    onChange(toIsoDate(draft.y, draft.m, draft.d));
                    setOpen(false);
                  }}
                />
              </View>
            </BottomSheet>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  trigger: {
    height: 48,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  columns: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    minHeight: 220,
  },
  column: {
    flex: 1,
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
});
