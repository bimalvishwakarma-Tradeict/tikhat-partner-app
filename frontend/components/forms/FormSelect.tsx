import { useState } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { BottomSheet } from '../ui/BottomSheet';

export type SelectOption<V extends string = string> = {
  label: string;
  value: V;
};

export type FormSelectProps<T extends FieldValues, V extends string = string> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  options: SelectOption<V>[];
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function FormSelect<T extends FieldValues, V extends string = string>({
  control,
  name,
  label,
  placeholder = 'Select an option',
  options,
  disabled = false,
  containerStyle,
  testID,
}: FormSelectProps<T, V>) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const selected = options.find((opt) => opt.value === value);
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

            <Pressable
              disabled={disabled}
              onPress={() => setOpen(true)}
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
                    color: selected
                      ? colors.text.primary
                      : colors.text.secondary,
                    flex: 1,
                  },
                ]}
                numberOfLines={1}
              >
                {selected?.label || placeholder}
              </Text>
              <Text style={{ color: colors.text.secondary }}>▾</Text>
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

            <BottomSheet visible={open} onClose={() => setOpen(false)}>
              {label ? (
                <Text
                  style={[
                    typography.title,
                    {
                      color: colors.text.primary,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  {label}
                </Text>
              ) : null}
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => {
                  const isSelected = item.value === value;
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      style={[
                        styles.option,
                        {
                          backgroundColor: isSelected
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
                            color: isSelected
                              ? colors.secondary
                              : colors.text.primary,
                            fontWeight: isSelected ? '600' : '400',
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }}
              />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
});
