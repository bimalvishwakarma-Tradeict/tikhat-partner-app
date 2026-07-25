import { useState } from 'react';
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
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type FormTextAreaProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function FormTextArea<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  disabled = false,
  numberOfLines = 4,
  maxLength,
  containerStyle,
  inputStyle,
  testID,
}: FormTextAreaProps<T>) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
        const hasError = Boolean(error?.message);
        const borderColor = hasError
          ? colors.error
          : focused
            ? colors.primary
            : colors.border;

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
            <TextInput
              multiline
              textAlignVertical="top"
              editable={!disabled}
              placeholder={placeholder}
              placeholderTextColor={colors.text.secondary}
              numberOfLines={numberOfLines}
              maxLength={maxLength}
              value={value == null ? '' : String(value)}
              onChangeText={onChange}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                onBlur();
              }}
              style={[
                styles.input,
                typography.body,
                {
                  minHeight: Math.max(96, numberOfLines * 22),
                  backgroundColor: isDark ? colors.surface : colors.background,
                  color: colors.text.primary,
                  borderColor,
                  borderWidth: focused || hasError ? 2 : 1,
                  borderRadius: borderRadius.md,
                  opacity: disabled ? 0.6 : 1,
                },
                inputStyle,
              ]}
            />
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
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
