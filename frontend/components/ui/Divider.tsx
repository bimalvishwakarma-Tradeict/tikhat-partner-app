import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type DividerProps = {
  vertical?: boolean;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Divider({
  vertical = false,
  spacing = 0,
  style,
  testID,
}: DividerProps) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        vertical ? styles.vertical : styles.horizontal,
        {
          backgroundColor: colors.border,
          marginVertical: vertical ? 0 : spacing,
          marginHorizontal: vertical ? spacing : 0,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    alignSelf: 'stretch',
  },
  vertical: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    minHeight: 16,
  },
});
