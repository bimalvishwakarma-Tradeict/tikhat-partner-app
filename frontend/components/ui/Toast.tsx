import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastShowOptions = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastListener = (options: ToastShowOptions) => void;

const DEFAULT_DURATION_MS = 3000;
const listeners = new Set<ToastListener>();

function emitToast(options: ToastShowOptions): void {
  listeners.forEach((listener) => listener(options));
}

/** Imperative toast API — requires `<Toast />` mounted in the tree. */
export const toast = {
  show(options: ToastShowOptions | string): void {
    if (typeof options === 'string') {
      emitToast({ message: options, variant: 'info' });
      return;
    }
    emitToast(options);
  },
  success(message: string): void {
    emitToast({ message, variant: 'success' });
  },
  error(message: string): void {
    emitToast({ message, variant: 'error' });
  },
  warning(message: string): void {
    emitToast({ message, variant: 'warning' });
  },
  info(message: string): void {
    emitToast({ message, variant: 'info' });
  },
};

export type ToastProps = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Toast host — top of screen, 3s auto-dismiss, 4 variants.
 * Mount once near the app root: `<Toast />`
 */
export function Toast({ style, testID }: ToastProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('info');
  const progress = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    progress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
      }
    });
  }, [progress]);

  const show = useCallback(
    (options: ToastShowOptions) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      setMessage(options.message);
      setVariant(options.variant || 'info');
      setVisible(true);
      progress.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      const duration = options.durationMs ?? DEFAULT_DURATION_MS;
      hideTimer.current = setTimeout(() => {
        hide();
      }, duration);
    },
    [hide, progress]
  );

  useEffect(() => {
    listeners.add(show);
    return () => {
      listeners.delete(show);
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [show]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -16 }],
  }));

  const tone = {
    success: {
      background: colors.success,
      text: colors.text.inverse,
      icon: '✓',
    },
    error: {
      background: colors.error,
      text: colors.text.inverse,
      icon: '✕',
    },
    warning: {
      background: colors.warning,
      text: colors.primary,
      icon: '!',
    },
    info: {
      background: colors.primary,
      text: colors.text.inverse,
      icon: 'i',
    },
  }[variant];

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      testID={testID}
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          top: insets.top + spacing.sm,
          paddingHorizontal: spacing.md,
        },
        animatedStyle,
        style,
      ]}
    >
      <Pressable
        onPress={hide}
        style={[
          styles.toast,
          {
            backgroundColor: tone.background,
            borderRadius: borderRadius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            shadowColor: colors.primary,
          },
        ]}
      >
        <View
          style={[
            styles.iconCircle,
            {
              borderColor: tone.text,
            },
          ]}
        >
          <Text style={[typography.caption, { color: tone.text, fontWeight: '700' }]}>
            {tone.icon}
          </Text>
        </View>
        <Text
          style={[
            typography.body,
            { color: tone.text, flex: 1, fontWeight: '500' },
          ]}
        >
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
