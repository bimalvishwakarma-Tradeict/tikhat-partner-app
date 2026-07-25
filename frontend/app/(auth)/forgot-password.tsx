import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OTP_EXPIRY_MINUTES } from '../../constants';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../../components/ui/Button';
import { FormInput } from '../../components/forms/FormInput';
import { authService } from '../../services/auth.service';
import {
  emailSchema,
  otpCodeSchema,
  passwordSchema,
  zodResolver,
} from '../../utils/validationSchemas';
import { ApiClientError } from '../../types/api.types';

const LOGIN_HREF = '/(auth)/login' as Href;
const RESEND_COOLDOWN_SEC = 60;

const emailStepSchema = z.object({
  email: emailSchema,
});

const resetStepSchema = z
  .object({
    otp: otpCodeSchema,
    new_password: passwordSchema,
    confirm_password: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type EmailStepValues = z.infer<typeof emailStepSchema>;
type ResetStepValues = z.infer<typeof resetStepSchema>;

type Step = 'email' | 'reset' | 'done';

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_EXPIRY_MINUTES * 60);
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN_SEC);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  const emailForm = useForm<EmailStepValues>({
    resolver: zodResolver(emailStepSchema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  const resetForm = useForm<ResetStepValues>({
    resolver: zodResolver(resetStepSchema),
    mode: 'onChange',
    defaultValues: {
      otp: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const otpJoined = otpDigits.join('');
  useEffect(() => {
    resetForm.setValue('otp', otpJoined, { shouldValidate: otpJoined.length === 6 });
  }, [otpJoined, resetForm]);

  useEffect(() => {
    if (step !== 'reset') {
      return;
    }
    const id = setInterval(() => {
      setOtpSecondsLeft((v) => Math.max(0, v - 1));
      setResendSeconds((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const watchedPassword = useWatch({
    control: resetForm.control,
    name: 'new_password',
  });

  const strengthLabel = useMemo(() => {
    const password = watchedPassword || '';
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score >= 3) return 'strong';
    if (score >= 2) return 'medium';
    return 'weak';
  }, [watchedPassword]);

  const onSendOtp = emailForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await authService.forgotPassword(
        values.email.trim().toLowerCase()
      );
      setEmail(result.email || values.email.trim().toLowerCase());
      setOtpDigits(['', '', '', '', '', '']);
      setOtpSecondsLeft((result.expires_in_minutes || OTP_EXPIRY_MINUTES) * 60);
      setResendSeconds(RESEND_COOLDOWN_SEC);
      setStep('reset');
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
        return;
      }
      setFormError('Could not send reset OTP');
    }
  });

  const onResend = async () => {
    if (resendSeconds > 0) return;
    setFormError(null);
    try {
      const result = await authService.forgotPassword(email);
      setOtpSecondsLeft((result.expires_in_minutes || OTP_EXPIRY_MINUTES) * 60);
      setResendSeconds(RESEND_COOLDOWN_SEC);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
        return;
      }
      setFormError('Could not resend OTP');
    }
  };

  const onReset = resetForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authService.resetPassword({
        email,
        otp: values.otp,
        new_password: values.new_password,
      });
      setStep('done');
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'AUTH_OTP_INVALID' || error.code === 'AUTH_OTP_EXPIRED') {
          resetForm.setError('otp', { message: error.message });
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Password reset failed');
    }
  });

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

  if (step === 'done') {
    return (
      <View
        style={[
          styles.flex,
          {
            backgroundColor: colors.background,
            padding: spacing.lg,
            paddingTop: insets.top + spacing.lg,
            justifyContent: 'center',
          },
        ]}
      >
        <Text style={[typography.h2, { color: colors.text.primary }]}>
          Password updated
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.text.secondary, marginTop: spacing.md },
          ]}
        >
          Your password has been reset. You can now login with your new
          password.
        </Text>
        <View style={{ marginTop: spacing.xl }}>
          <Button title="Go to Login" onPress={() => router.replace(LOGIN_HREF)} />
        </View>
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
        <Pressable
          onPress={() => {
            if (step === 'reset') {
              setStep('email');
              setFormError(null);
              return;
            }
            router.back();
          }}
          hitSlop={8}
        >
          <Text style={[typography.subtitle, { color: colors.secondary }]}>
            ← Back
          </Text>
        </Pressable>

        <Text
          style={[
            typography.h1,
            { color: colors.text.primary, marginTop: spacing.md },
          ]}
        >
          Forgot password
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
          {step === 'email'
            ? 'Enter your registered email to receive a reset OTP.'
            : `Enter the OTP sent to ${email} and choose a new password.`}
        </Text>

        {step === 'email' ? (
          <View style={{ gap: spacing.md }}>
            <FormInput
              control={emailForm.control}
              name="email"
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            {formError ? (
              <Text style={[typography.body, { color: colors.error }]}>
                {formError}
              </Text>
            ) : null}
            <Button
              title="Send OTP"
              onPress={onSendOtp}
              loading={emailForm.formState.isSubmitting}
              disabled={emailForm.formState.isSubmitting}
              variant="golden"
            />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.label, { color: colors.text.primary }]}>
              OTP
            </Text>
            <View style={styles.otpRow}>
              {otpDigits.map((digit, index) => (
                <TextInput
                  key={`fp-otp-${index}`}
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
                      borderColor: resetForm.formState.errors.otp
                        ? colors.error
                        : colors.border,
                      color: colors.text.primary,
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                  textAlign="center"
                />
              ))}
            </View>
            {resetForm.formState.errors.otp?.message ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {resetForm.formState.errors.otp.message}
              </Text>
            ) : null}

            <Text
              style={[
                typography.subtitle,
                {
                  color:
                    otpSecondsLeft === 0 ? colors.error : colors.text.secondary,
                  textAlign: 'center',
                },
              ]}
            >
              OTP expires in {formatTimer(otpSecondsLeft)}
            </Text>

            <View>
              <FormInput
                control={resetForm.control}
                name="new_password"
                label="New Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={{ alignSelf: 'flex-end', marginTop: spacing.xs }}
              >
                <Text style={[typography.caption, { color: colors.secondary }]}>
                  {showPassword ? 'Hide password' : 'Show password'}
                </Text>
              </Pressable>
              {watchedPassword ? (
                <Text
                  style={[
                    typography.caption,
                    {
                      color:
                        strengthLabel === 'strong'
                          ? colors.success
                          : strengthLabel === 'medium'
                            ? colors.warning
                            : colors.error,
                      marginTop: spacing.xs,
                    },
                  ]}
                >
                  Password strength: {strengthLabel}
                </Text>
              ) : null}
            </View>

            <FormInput
              control={resetForm.control}
              name="confirm_password"
              label="Confirm Password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            {formError ? (
              <Text style={[typography.body, { color: colors.error }]}>
                {formError}
              </Text>
            ) : null}

            <Button
              title="Reset Password"
              onPress={onReset}
              loading={resetForm.formState.isSubmitting}
              disabled={resetForm.formState.isSubmitting}
              variant="golden"
            />
            <Button
              title={
                resendSeconds > 0
                  ? `Resend OTP (${resendSeconds}s)`
                  : 'Resend OTP'
              }
              onPress={onResend}
              disabled={resendSeconds > 0}
              variant="secondary"
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
