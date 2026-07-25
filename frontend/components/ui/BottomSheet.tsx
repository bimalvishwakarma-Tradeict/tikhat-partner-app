import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  Dimensions,
  Modal as RNModal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Sheet height as fraction of screen (0–1). Default 0.55 */
  heightRatio?: number;
  closeOnBackdrop?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

/**
 * Bottom sheet with drag handle and blurred/dimmed backdrop.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  heightRatio = 0.55,
  closeOnBackdrop = true,
  style,
  testID,
}: BottomSheetProps) {
  const { colors, spacing, borderRadius, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const sheetHeight = Math.min(
    SCREEN_HEIGHT * heightRatio,
    SCREEN_HEIGHT - insets.top - 24
  );

  useEffect(() => {
    if (visible) {
      progress.value = withSpring(1, {
        damping: 17,
        stiffness: 210,
        mass: 0.8,
        overshootClamping: false,
      });
    } else {
      progress.value = withTiming(0, { duration: 220 });
    }
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (isDark ? 0.72 : 0.45),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetHeight }],
  }));

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View testID={testID} style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (closeOnBackdrop) {
              onClose();
            }
          }}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.primary,
              },
              Platform.OS === 'web'
                ? ({
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                  } as unknown as ViewStyle)
                : null,
              backdropStyle,
            ]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              backgroundColor: colors.card,
              borderTopLeftRadius: borderRadius.xl,
              borderTopRightRadius: borderRadius.xl,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
              paddingBottom: spacing.md + insets.bottom,
              shadowColor: colors.primary,
            },
            sheetStyle,
            style,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  content: {
    flex: 1,
  },
});
