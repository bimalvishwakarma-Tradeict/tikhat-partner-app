import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type FormCheckboxProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function FormCheckbox<T extends FieldValues>({
  control,
  name,
  label,
  disabled = false,
  containerStyle,
  testID,
}: FormCheckboxProps<T>) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const checked = Boolean(value);

        return (
          <View style={[styles.container, containerStyle]} testID={testID}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => onChange(!checked)}
              style={[styles.row, { opacity: disabled ? 0.6 : 1 }]}
            >
              <View
                style={[
                  styles.box,
                  {
                    borderColor: error ? colors.error : colors.border,
                    borderRadius: borderRadius.sm,
                    backgroundColor: checked
                      ? colors.secondary
                      : 'transparent',
                  },
                ]}
              >
                {checked ? (
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: 14,
                      fontWeight: '700',
                      lineHeight: 16,
                    }}
                  >
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.primary, flex: 1, marginLeft: spacing.sm },
                ]}
              >
                {label}
              </Text>
            </Pressable>
            {error?.message ? (
              <Text
                style={[
                  typography.caption,
                  { color: colors.error, marginTop: spacing.xs },
                ]}
              >
                {error.message}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
