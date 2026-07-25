import { Stack } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';

export default function AdminCapitalLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="requests" options={{ title: 'Capital Requests' }} />
    </Stack>
  );
}
