import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';
import { useForm } from 'react-hook-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  APP_NAME,
  MAX_LOGIN_ATTEMPTS,
  OTP_EXPIRY_MINUTES,
} from '../../constants';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { FormInput } from '../../components/forms/FormInput';
import { authService } from '../../services/auth.service';
import {
  loginSchema,
  zodResolver,
  type LoginFormValues,
} from '../../utils/validationSchemas';
import { ApiClientError } from '../../types/api.types';
import Logo from '@/assets/logo.png';

const REGISTER_HREF = '/(auth)/register' as Href;
const FORGOT_HREF = '/(auth)/forgot-password' as Href;
const RESEND_COOLDOWN_SEC = 60;

type AuthMode = 'partner' | 'admin';
type Step = 'credentials' | 'otp';

function getDeviceType(): 'mobile' | 'web' {
  return Platform.OS === 'web' ? 'web' : 'mobile';
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const { login: completeLogin } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('partner');
  const [step, setStep] = useState<Step>('credentials');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_EXPIRY_MINUTES * 60);
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN_SEC);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      device_type: getDeviceType(),
    },
  });

  useEffect(() => {
    if (step !== 'otp') {
      return;
    }
    const id = setInterval(() => {
      setOtpSecondsLeft((v) => Math.max(0, v - 1));
      setResendSeconds((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const startOtpStep = (email: string, expiresMinutes?: number) => {
    setOtpEmail(email);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError(null);
    setOtpSecondsLeft((expiresMinutes || OTP_EXPIRY_MINUTES) * 60);
    setResendSeconds(RESEND_COOLDOWN_SEC);
    setStep('otp');
    setTimeout(() => otpRefs.current[0]?.focus(), 200);
  };

  const handleAuthError = (error: unknown) => {
    if (!(error instanceof ApiClientError)) {
      setFormError('Something went wrong. Please try again.');
      return;
    }

    if (error.code === 'MAINTENANCE_MODE' || error.status === 503) {
      setMaintenance(true);
      return;
    }

    if (error.code === 'AUTH_ACCOUNT_LOCKED' || error.status === 423) {
      setLocked(true);
      setFormError(error.message);
      return;
    }

    const msg = error.message || 'Login failed';
    if (
      error.code === 'AUTH_FORBIDDEN' &&
      msg.toLowerCase().includes('pending')
    ) {
      setPendingMessage('Your account is pending approval');
      setFormError(null);
      return;
    }

    if (error.code === 'AUTH_INVALID_CREDENTIALS') {
      setFailedAttempts((n) => {
        const next = n + 1;
        const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - next);
        setFormError(
          remaining > 0
            ? `${msg} ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lock.`
            : msg
        );
        return next;
      });
      return;
    }

    setFormError(msg);
  };

  const onCredentialsSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setPendingMessage(null);
    setLocked(false);

    const payload = {
      email: values.email.trim().toLowerCase(),
      password: values.password,
      device_type: getDeviceType(),
    };

    try {
      const result =
        authMode === 'admin'
          ? await authService.adminLogin(payload)
          : await authService.login(payload);

      startOtpStep(
        result.email || payload.email,
        result.expires_in_minutes || OTP_EXPIRY_MINUTES
      );
    } catch (error) {
      handleAuthError(error);
    }
  });

  const otpValue = otpDigits.join('');

  const submitOtp = useCallback(async () => {
    if (otpValue.length !== 6) {
      setOtpError('Enter the 6-digit OTP');
      return;
    }
    setOtpSubmitting(true);
    setOtpError(null);
    try {
      const payload = {
        email: otpEmail,
        otp: otpValue,
        device_type: getDeviceType(),
      };
      const data =
        authMode === 'admin'
          ? await authService.adminVerifyOtp(payload)
          : await authService.verifyOtp(payload);

      await completeLogin(
        {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.full_name,
          role: data.user.role,
        },
        data.accessToken
      );
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'MAINTENANCE_MODE' || error.status === 503) {
          setMaintenance(true);
          return;
        }
        setOtpError(error.message || 'Invalid OTP');
        return;
      }
      setOtpError('OTP verification failed');
    } finally {
      setOtpSubmitting(false);
    }
  }, [otpValue, otpEmail, authMode, completeLogin]);

  useEffect(() => {
    if (step === 'otp' && otpValue.length === 6 && !otpSubmitting) {
      void submitOtp();
    }
  }, [otpValue, step, otpSubmitting, submitOtp]);

  const onResendOtp = async () => {
    if (resendSeconds > 0) {
      return;
    }
    setOtpError(null);
    try {
      const result =
        authMode === 'admin'
          ? await authService.adminResendOtp(otpEmail)
          : await authService.resendOtp(otpEmail);
      setOtpSecondsLeft(
        (result.expires_in_minutes || OTP_EXPIRY_MINUTES) * 60
      );
      setResendSeconds(RESEND_COOLDOWN_SEC);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setOtpError(error.message);
        return;
      }
      setOtpError('Could not resend OTP');
    }
  };

  const setOtpDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  if (maintenance) {
    return (
      <View
        style={[
          styles.center,
          {
            backgroundColor: colors.primary,
            padding: spacing.lg,
            paddingTop: insets.top + spacing.lg,
          },
        ]}
      >
        <Text style={[typography.h2, { color: colors.secondary }]}>
          Under Maintenance
        </Text>
        <Text
          style={[
            typography.body,
            {
              color: colors.text.inverse,
              marginTop: spacing.md,
              textAlign: 'center',
            },
          ]}
        >
          The Tikhat Partner app is temporarily unavailable. Please try again
          later.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'credentials' ? (
          <>
            <View style={styles.logoWrap}>
              <Image
                source={Logo}
                style={{ height: 50, resizeMode: 'contain' }}
              />
            </View>
            <Text style={[typography.h1, { color: colors.text.primary }]}>
              Login
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginTop: spacing.xs,
                  marginBottom: spacing.lg,
                },
              ]}
            >
              Sign in to {APP_NAME}
            </Text>

            <View
              style={[
                styles.modeRow,
                {
                  backgroundColor: colors.surface,
                  borderRadius: borderRadius.md,
                  marginBottom: spacing.lg,
                },
              ]}
            >
              {(['partner', 'admin'] as AuthMode[]).map((mode) => {
                const active = authMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setAuthMode(mode)}
                    style={[
                      styles.modeBtn,
                      {
                        backgroundColor: active
                          ? colors.primary
                          : 'transparent',
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.subtitle,
                        {
                          color: active
                            ? colors.text.inverse
                            : colors.text.secondary,
                          fontWeight: '600',
                          textTransform: 'capitalize',
                        },
                      ]}
                    >
                      {mode}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: spacing.md }}>
              <FormInput
                control={control}
                name="email"
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
              />

              <View>
                <FormInput
                  control={control}
                  name="password"
                  label="Password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  placeholder="Your password"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={{ alignSelf: 'flex-end', marginTop: spacing.xs }}
                >
                  <Text style={[typography.caption, { color: colors.secondary }]}>
                    {showPassword ? 'Hide password' : 'Show password'}
                  </Text>
                </Pressable>
              </View>

              <Pressable onPress={() => router.push(FORGOT_HREF)}>
                <Text
                  style={[
                    typography.subtitle,
                    { color: colors.secondary, textAlign: 'right' },
                  ]}
                >
                  Forgot password?
                </Text>
              </Pressable>

              {pendingMessage ? (
                <View
                  style={[
                    styles.banner,
                    {
                      backgroundColor: `${colors.warning}22`,
                      borderColor: colors.warning,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                >
                  <Text style={[typography.body, { color: colors.warning }]}>
                    {pendingMessage}
                  </Text>
                </View>
              ) : null}

              {locked ? (
                <View
                  style={[
                    styles.banner,
                    {
                      backgroundColor: `${colors.error}18`,
                      borderColor: colors.error,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                >
                  <Text style={[typography.body, { color: colors.error }]}>
                    {formError ||
                      'Account locked. Unlock via email OTP or wait till midnight.'}
                  </Text>
                  <Pressable
                    onPress={() => router.push(FORGOT_HREF)}
                    style={{ marginTop: spacing.sm }}
                  >
                    <Text
                      style={[
                        typography.subtitle,
                        { color: colors.secondary, fontWeight: '700' },
                      ]}
                    >
                      Reset Password
                    </Text>
                  </Pressable>
                </View>
              ) : formError ? (
                <Text style={[typography.body, { color: colors.error }]}>
                  {formError}
                </Text>
              ) : failedAttempts > 0 ? (
                <Text
                  style={[typography.caption, { color: colors.warning }]}
                >
                  Warning: {MAX_LOGIN_ATTEMPTS} failed attempts will lock your
                  account.
                </Text>
              ) : null}

              <Button
                title="Continue"
                onPress={onCredentialsSubmit}
                loading={isSubmitting}
                disabled={isSubmitting || locked}
                variant="golden"
              />

              <Link href={REGISTER_HREF} asChild>
                <Pressable style={{ alignItems: 'center', marginTop: spacing.sm }}>
                  <Text style={[typography.body, { color: colors.text.secondary }]}>
                    Create an account
                  </Text>
                </Pressable>
              </Link>
            </View>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => {
                setStep('credentials');
                setOtpError(null);
                setFormError(null);
              }}
              hitSlop={8}
            >
              <Text style={[typography.subtitle, { color: colors.secondary }]}>
                ← Back
              </Text>
            </Pressable>

            <Text
              style={[
                typography.h2,
                { color: colors.text.primary, marginTop: spacing.md },
              ]}
            >
              Enter OTP
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginTop: spacing.xs,
                  marginBottom: spacing.lg,
                },
              ]}
            >
              We sent a 6-digit code to {otpEmail || getValues('email')}
            </Text>

            <View style={styles.otpRow}>
              {otpDigits.map((digit, index) => (
                <TextInput
                  key={`otp-${index}`}
                  ref={(ref) => {
                    otpRefs.current[index] = ref;
                  }}
                  value={digit}
                  onChangeText={(text) => setOtpDigit(index, text)}
                  onKeyPress={({ nativeEvent }) => {
                    if (
                      nativeEvent.key === 'Backspace' &&
                      !otpDigits[index] &&
                      index > 0
                    ) {
                      otpRefs.current[index - 1]?.focus();
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={1}
                  style={[
                    styles.otpBox,
                    typography.h3,
                    {
                      borderColor: otpError ? colors.error : colors.border,
                      color: colors.text.primary,
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                  textAlign="center"
                />
              ))}
            </View>

            <Text
              style={[
                typography.subtitle,
                {
                  color: otpSecondsLeft === 0 ? colors.error : colors.text.secondary,
                  marginTop: spacing.md,
                  textAlign: 'center',
                },
              ]}
            >
              OTP expires in {formatTimer(otpSecondsLeft)}
            </Text>

            {otpError ? (
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.error,
                    marginTop: spacing.sm,
                    textAlign: 'center',
                  },
                ]}
              >
                {otpError}
              </Text>
            ) : null}

            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              <Button
                title="Verify OTP"
                onPress={submitOtp}
                loading={otpSubmitting}
                disabled={otpSubmitting || otpValue.length !== 6}
                variant="golden"
              />
              <Button
                title={
                  resendSeconds > 0
                    ? `Resend OTP (${resendSeconds}s)`
                    : 'Resend OTP'
                }
                onPress={onResendOtp}
                disabled={resendSeconds > 0}
                variant="secondary"
              />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderWidth: 1,
    padding: 12,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
  },
});
