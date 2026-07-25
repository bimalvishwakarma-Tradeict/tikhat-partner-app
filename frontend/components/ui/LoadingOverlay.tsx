import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type LoadingOverlayProps = {
  visible: boolean;
  message?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function LoadingOverlay({
  visible,
  message,
  style,
  testID,
}: LoadingOverlayProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View testID={testID} style={[styles.root, style]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.primary, opacity: 0.55 },
          ]}
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
            },
          ]}
        >
          <ActivityIndicator size="large" color={colors.secondary} />
          {message ? (
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.primary,
                  marginTop: spacing.md,
                  textAlign: 'center',
                },
              ]}
            >
              {message}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
