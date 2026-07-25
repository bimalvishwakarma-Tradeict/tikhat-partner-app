import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { CURRENCY_SYMBOL } from '../../constants';
import { formatIndianNumber } from '../../utils/indianNumber';

export type FormAmountInputProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

function digitsOnly(text: string): string {
  return text.replace(/[^\d]/g, '');
}

export function FormAmountInput<T extends FieldValues>({
  control,
  name,
  label = 'Amount',
  placeholder = '0',
  disabled = false,
  containerStyle,
  testID,
}: FormAmountInputProps<T>) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
        const numeric =
          typeof value === 'number' && Number.isFinite(value)
            ? Math.round(value)
            : null;
        const display =
          numeric === null || numeric === 0
            ? value === 0
              ? '0'
              : ''
            : formatIndianNumber(numeric);
        const hasError = Boolean(error?.message);

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

            <View
              style={[
                styles.row,
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
                    color: colors.text.primary,
                    fontWeight: '600',
                    marginRight: spacing.xs,
                  },
                ]}
              >
                {CURRENCY_SYMBOL}
              </Text>
              <TextInput
                editable={!disabled}
                keyboardType="number-pad"
                placeholder={placeholder}
                placeholderTextColor={colors.text.secondary}
                value={display}
                onBlur={onBlur}
                onChangeText={(text) => {
                  const raw = digitsOnly(text);
                  if (!raw) {
                    onChange(undefined);
                    return;
                  }
                  const next = Math.round(Number(raw));
                  onChange(Number.isFinite(next) ? next : undefined);
                }}
                style={[
                  styles.input,
                  typography.body,
                  { color: colors.text.primary },
                ]}
              />
            </View>

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
  row: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
});
