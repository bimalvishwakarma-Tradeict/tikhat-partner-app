import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type AvatarProps = {
  name?: string;
  uri?: string | null;
  source?: ImageSourcePropType;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function getInitials(name?: string): string {
  if (!name?.trim()) {
    return '?';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export function Avatar({
  name,
  uri,
  source,
  size = 40,
  style,
  testID,
}: AvatarProps) {
  const { colors, typography } = useTheme();
  const imageSource = source || (uri ? { uri } : null);
  const fontSize = Math.max(12, Math.round(size * 0.36));

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.secondary,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text
          style={[
            typography.label,
            {
              color: colors.primary,
              fontSize,
              lineHeight: fontSize + 2,
              fontWeight: '700',
            },
          ]}
        >
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
