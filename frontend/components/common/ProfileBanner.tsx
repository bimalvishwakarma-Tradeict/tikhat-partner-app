import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  Layout,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

export type ProfileBannerProps = {
  message?: string;
  onPress?: () => void;
  onDismiss?: () => void | Promise<void>;
  /** Controlled visibility; when omitted, manages local dismiss state */
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Red profile-completion banner — dismissible with arrow link.
 */
export function ProfileBanner({
  message = 'Complete your profile',
  onPress,
  onDismiss,
  visible,
  style,
  testID,
}: ProfileBannerProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [internalVisible, setInternalVisible] = useState(true);
  const isVisible = visible ?? internalVisible;

  useEffect(() => {
    if (typeof visible === 'boolean') {
      setInternalVisible(visible);
    }
  }, [visible]);

  if (!isVisible) {
    return null;
  }

  const handleDismiss = async () => {
    setInternalVisible(false);
    await onDismiss?.();
  };

  return (
    <Animated.View
      testID={testID}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(180)}
      layout={Layout}
      style={[
        styles.banner,
        {
          backgroundColor: colors.error,
          borderRadius: borderRadius.md,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
        },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={styles.content}
        accessibilityRole="button"
        accessibilityLabel={message}
      >
        <Text
          style={[
            typography.body,
            { color: colors.text.inverse, flex: 1, fontWeight: '600' },
          ]}
        >
          {message}
        </Text>
        <Text style={[typography.body, { color: colors.text.inverse }]}>→</Text>
      </Pressable>

      <Pressable
        onPress={handleDismiss}
        hitSlop={10}
        accessibilityLabel="Dismiss banner"
        style={styles.dismiss}
      >
        <Text style={{ color: colors.text.inverse, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dismiss: {
    paddingLeft: 4,
  },
});
