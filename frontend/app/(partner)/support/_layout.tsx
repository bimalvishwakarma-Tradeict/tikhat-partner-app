import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { NotificationBell } from '../../../components/common/NotificationBell';
import { ThemeToggle } from '../../../components/common/ThemeToggle';

function SupportHeaderRight() {
  return (
    <View style={styles.headerRight}>
      <ThemeToggle />
      <NotificationBell />
    </View>
  );
}

export default function SupportStackLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <SupportHeaderRight />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Support' }} />
      <Stack.Screen name="[ticketId]" options={{ title: 'Ticket Detail' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
