import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  Modal as RNModal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

export type AppModalProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When true, tapping backdrop closes the modal */
  closeOnBackdrop?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Centered dialog on web; bottom-sheet presentation on mobile.
 */
export function Modal({
  visible,
  onClose,
  children,
  closeOnBackdrop = true,
  style,
  testID,
}: AppModalProps) {
  const { colors, spacing, borderRadius, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  const sheetStyle = useAnimatedStyle(() => {
    if (isWeb) {
      return {
        opacity: progress.value,
        transform: [{ scale: 0.96 + progress.value * 0.04 }],
      };
    }
    return {
      transform: [{ translateY: (1 - progress.value) * 40 }],
      opacity: progress.value,
    };
  });

  const handleBackdrop = () => {
    if (closeOnBackdrop) {
      onClose();
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        testID={testID}
        style={[styles.root, isWeb ? styles.rootWeb : styles.rootMobile]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdrop}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.primary },
              backdropStyle,
            ]}
          />
        </Pressable>

        <Animated.View
          style={[
            isWeb ? styles.dialog : styles.sheet,
            {
              backgroundColor: colors.card,
              borderRadius: isWeb ? borderRadius.lg : borderRadius.xl,
              padding: spacing.md,
              paddingBottom: isWeb ? spacing.md : spacing.md + insets.bottom,
              shadowColor: isDark ? '#000000' : colors.primary,
              maxWidth: isWeb ? 480 : undefined,
            },
            sheetStyle,
            style,
          ]}
        >
          {!isWeb ? (
            <View
              style={[styles.handle, { backgroundColor: colors.border }]}
            />
          ) : null}
          {children}
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rootWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rootMobile: {
    justifyContent: 'flex-end',
  },
  dialog: {
    width: '100%',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  sheet: {
    width: '100%',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
});
