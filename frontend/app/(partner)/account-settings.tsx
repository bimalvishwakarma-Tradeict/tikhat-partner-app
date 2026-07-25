import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services/auth.service';
import { profileService } from '../../services/profile.service';
import { ApiClientError } from '../../types/api.types';
import { formatDate } from '../../utils/formatDate';
import { zodResolver } from '../../utils/validationSchemas';
import { FormInput } from '../../components/forms/FormInput';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { toast } from '../../components/ui/Toast';

const PROFILE_HREF = '/(partner)/profile' as Href;

const DEACTIVATE_MESSAGE =
  'Are you sure? Your account will be deactivated. Contact support to reactivate.';

type Strength = 'weak' | 'medium' | 'strong';

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirm_password: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

type SessionRow = {
  id: string;
  device_type: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

function getPasswordStrength(password: string): Strength {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}

export default function AccountSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const { logout } = useAuth();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const newPassword = useWatch({ control, name: 'new_password' }) || '';
  const strength = useMemo(
    () => getPasswordStrength(newPassword),
    [newPassword]
  );

  const strengthColor =
    strength === 'strong'
      ? colors.success
      : strength === 'medium'
        ? colors.warning
        : colors.error;

  const loadSessions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setSessionsError(null);
    try {
      const data = await authService.listSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      setSessionsError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load sessions'
      );
      setSessions([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSessions(false);
    }, [loadSessions])
  );

  const onChangePassword = handleSubmit(async (values) => {
    setPasswordError(null);
    setPasswordSuccess(null);
    setSavingPassword(true);
    try {
      await authService.changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      setPasswordSuccess('Password updated successfully');
      reset({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      toast.success('Password updated');
    } catch (err) {
      setPasswordError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to change password'
      );
    } finally {
      setSavingPassword(false);
    }
  });

  const confirmDeactivate = () => {
    const run = async () => {
      setDeactivating(true);
      try {
        await profileService.deactivate(true);
        toast.success('Account deactivated');
        await logout();
      } catch (err) {
        toast.error(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to deactivate account'
        );
      } finally {
        setDeactivating(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(DEACTIVATE_MESSAGE)) {
        void run();
      }
      return;
    }
    Alert.alert('Deactivate Account', DEACTIVATE_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: () => {
          void run();
        },
      },
    ]);
  };

  const mobileSession = sessions.find(
    (s) => String(s.device_type).toLowerCase() === 'mobile'
  );
  const webSession = sessions.find(
    (s) => String(s.device_type).toLowerCase() === 'web'
  );

  const renderSession = (
    label: string,
    session: SessionRow | undefined,
    icon: keyof typeof Ionicons.glyphMap
  ) => (
    <View
      style={[
        styles.sessionRow,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: borderRadius.md,
          padding: spacing.md,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={session ? colors.success : colors.text.secondary}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text.primary, fontWeight: '600' },
          ]}
        >
          {label}
        </Text>
        {session ? (
          <>
            <Text style={[typography.caption, { color: colors.success }]}>
              Active{session.is_current ? ' · This device' : ''}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Since {formatDate(session.created_at)}
            </Text>
          </>
        ) : (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            No active session
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.xl,
          gap: spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadSessions(true);
            }}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
      >
        <Pressable onPress={() => router.push(PROFILE_HREF)} hitSlop={8}>
          <Text
            style={[
              typography.subtitle,
              { color: colors.secondary, fontWeight: '600' },
            ]}
          >
            ← Back to profile
          </Text>
        </Pressable>

        <Card accent>
          <Text
            style={[
              typography.title,
              { color: colors.text.primary, marginBottom: spacing.md },
            ]}
          >
            Change password
          </Text>
          <View style={{ gap: spacing.md }}>
            <FormInput
              control={control}
              name="current_password"
              label="Current password"
              placeholder="Enter current password"
              secureTextEntry
              autoCapitalize="none"
            />
            <FormInput
              control={control}
              name="new_password"
              label="New password"
              placeholder="Enter new password"
              secureTextEntry
              autoCapitalize="none"
            />
            {newPassword ? (
              <View style={{ gap: 6 }}>
                <View
                  style={[
                    styles.strengthBar,
                    { backgroundColor: colors.border, borderRadius: 999 },
                  ]}
                >
                  <View
                    style={{
                      width:
                        strength === 'strong'
                          ? '100%'
                          : strength === 'medium'
                            ? '66%'
                            : '33%',
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: strengthColor,
                    }}
                  />
                </View>
                <Text style={[typography.caption, { color: strengthColor }]}>
                  Strength: {strength.charAt(0).toUpperCase() + strength.slice(1)}
                </Text>
              </View>
            ) : null}
            <FormInput
              control={control}
              name="confirm_password"
              label="Confirm new password"
              placeholder="Re-enter new password"
              secureTextEntry
              autoCapitalize="none"
            />
            {passwordError ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {passwordError}
              </Text>
            ) : null}
            {passwordSuccess ? (
              <Text style={[typography.caption, { color: colors.success }]}>
                {passwordSuccess}
              </Text>
            ) : null}
            <Button
              title="Update password"
              variant="golden"
              loading={savingPassword}
              onPress={() => {
                void onChangePassword();
              }}
            />
          </View>
        </Card>

        <Card>
          <Text
            style={[
              typography.title,
              { color: colors.text.primary, marginBottom: spacing.md },
            ]}
          >
            Active sessions
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            You can stay signed in on 1 mobile and 1 web session at the same time.
          </Text>
          {sessionsError ? (
            <Text
              style={[
                typography.caption,
                { color: colors.error, marginBottom: spacing.sm },
              ]}
            >
              {sessionsError}
            </Text>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            {renderSession('Mobile', mobileSession, 'phone-portrait-outline')}
            {renderSession('Web', webSession, 'desktop-outline')}
          </View>
        </Card>

        <Button
          title="Logout"
          variant="secondary"
          onPress={() => {
            void logout();
          }}
        />

        <Button
          title="Deactivate Account"
          variant="secondary"
          loading={deactivating}
          onPress={confirmDeactivate}
          textStyle={{ color: colors.error }}
          style={{ borderColor: colors.error }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  strengthBar: {
    height: 6,
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
});
