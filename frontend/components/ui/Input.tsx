import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function Input({
  label,
  error,
  containerStyle,
  inputStyle,
  labelStyle,
  onFocus,
  onBlur,
  editable = true,
  ...rest
}: InputProps) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);

  const borderColor = hasError
    ? colors.error
    : focused
      ? colors.primary
      : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text
          style={[
            typography.label,
            { color: colors.text.primary, marginBottom: spacing.xs },
            labelStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        editable={editable}
        placeholderTextColor={colors.text.secondary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          typography.body,
          {
            backgroundColor: isDark ? colors.surface : colors.background,
            color: colors.text.primary,
            borderColor,
            borderWidth: focused || hasError ? 2 : 1,
            borderRadius: borderRadius.md,
            opacity: editable ? 1 : 0.6,
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
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
  },
});
