import { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME, DOMAIN } from '../../constants';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../../components/ui/Button';
import { FormInput } from '../../components/forms/FormInput';
import { authService } from '../../services/auth.service';
import {
  registrationSchema,
  zodResolver,
  type RegistrationFormValues,
} from '../../utils/validationSchemas';
import { ApiClientError } from '../../types/api.types';
import Logo from '@/assets/logo.png';

const LOGIN_HREF = '/(auth)/login' as Href;

const SUCCESS_MESSAGE =
  "Registration successful! Your account is under review. You'll receive an email once approved.";

type Strength = 'weak' | 'medium' | 'strong';

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

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [legalBody, setLegalBody] = useState('Loading…');
  const [legalLoading, setLegalLoading] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    mode: 'onChange',
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      mobile: '',
      accept_terms: false,
    },
  });

  const passwordValue = useWatch({ control, name: 'password' }) || '';
  const strength = useMemo(
    () => getPasswordStrength(passwordValue),
    [passwordValue]
  );

  const strengthColor =
    strength === 'strong'
      ? colors.success
      : strength === 'medium'
        ? colors.warning
        : colors.error;

  const openLegal = async (type: 'terms' | 'privacy') => {
    setLegalModal(type);
    setLegalLoading(true);
    setLegalBody('Loading…');
    try {
      const data =
        type === 'terms'
          ? await authService.getTerms()
          : await authService.getPrivacy();
      const text =
        typeof data === 'string'
          ? data
          : typeof data === 'object' && data && 'content' in data
            ? String((data as { content?: string }).content || '')
            : JSON.stringify(data, null, 2);
      setLegalBody(text || 'Content unavailable.');
    } catch {
      setLegalBody(
        `Unable to load document. Visit https://${DOMAIN} or contact support.`
      );
    } finally {
      setLegalLoading(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authService.register({
        full_name: values.full_name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        mobile: values.mobile.trim(),
      });
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiClientError) {
        const message = error.message || 'Registration failed';
        const lower = message.toLowerCase();
        if (lower.includes('email') || error.code === 'DUPLICATE_EMAIL') {
          setError('email', { message });
          return;
        }
        if (lower.includes('mobile')) {
          setError('mobile', { message });
          return;
        }
        setFormError(message);
        return;
      }
      setFormError('Registration failed. Please try again.');
    }
  });

  if (success) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            padding: spacing.lg,
            paddingTop: insets.top + spacing.lg,
          },
        ]}
      >
        <Text style={[typography.h2, { color: colors.text.primary }]}>
          You're almost in
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.text.secondary, marginTop: spacing.md },
          ]}
        >
          {SUCCESS_MESSAGE}
        </Text>
        <View style={{ marginTop: spacing.xl }}>
          <Button title="Back to Login" onPress={() => router.replace(LOGIN_HREF)} />
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
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[typography.subtitle, { color: colors.secondary }]}>
            ← Back
          </Text>
        </Pressable>

        <View style={styles.logoWrap}>
          <Image
            source={Logo}
            style={{ height: 50, resizeMode: 'contain' }}
          />
        </View>

        <Text
          style={[
            typography.h1,
            { color: colors.text.primary, marginTop: spacing.md },
          ]}
        >
          Create account
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.text.secondary, marginTop: spacing.xs, marginBottom: spacing.lg },
          ]}
        >
          Join {APP_NAME}. Your account will be reviewed before activation.
        </Text>

        <View style={{ gap: spacing.md }}>
          <FormInput
            control={control}
            name="full_name"
            label="Full Name"
            autoCapitalize="words"
            placeholder="Your full name"
          />
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
              placeholder="Min 8 chars, upper, lower, number"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={{ alignSelf: 'flex-end', marginTop: spacing.xs }}
            >
              <Text style={[typography.caption, { color: colors.secondary }]}>
                {showPassword ? 'Hide password' : 'Show password'}
              </Text>
            </Pressable>

            {passwordValue.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <View
                  style={[
                    styles.strengthTrack,
                    { backgroundColor: colors.border, borderRadius: borderRadius.full },
                  ]}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: borderRadius.full,
                      width:
                        strength === 'strong'
                          ? '100%'
                          : strength === 'medium'
                            ? '66%'
                            : '33%',
                      backgroundColor: strengthColor,
                    }}
                  />
                </View>
                <Text
                  style={[
                    typography.caption,
                    { color: strengthColor, marginTop: spacing.xs },
                  ]}
                >
                  Password strength: {strength}
                </Text>
              </View>
            ) : null}
          </View>

          <FormInput
            control={control}
            name="mobile"
            label="Mobile Number"
            keyboardType="phone-pad"
            placeholder="10-digit Indian mobile"
          />

          <Controller
            control={control}
            name="accept_terms"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <View>
                <Pressable
                  onPress={() => onChange(!value)}
                  style={styles.termsRow}
                >
                  <View
                    style={[
                      styles.checkBox,
                      {
                        borderColor: error ? colors.error : colors.border,
                        backgroundColor: value ? colors.secondary : 'transparent',
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    {value ? (
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, flex: 1, marginLeft: spacing.sm },
                    ]}
                  >
                    I accept the{' '}
                    <Text
                      style={{ color: colors.secondary, fontWeight: '600' }}
                      onPress={() => openLegal('terms')}
                    >
                      Terms & Conditions
                    </Text>{' '}
                    and{' '}
                    <Text
                      style={{ color: colors.secondary, fontWeight: '600' }}
                      onPress={() => openLegal('privacy')}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </Pressable>
                {error?.message ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.error, marginTop: spacing.xs },
                    ]}
                  >
                    {error.message}
                  </Text>
                ) : null}
              </View>
            )}
          />

          {formError ? (
            <Text style={[typography.body, { color: colors.error }]}>
              {formError}
            </Text>
          ) : null}

          <Button
            title="Create Account"
            onPress={onSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            variant="golden"
          />

          <Link href={LOGIN_HREF} asChild>
            <Pressable style={{ alignItems: 'center', marginTop: spacing.sm }}>
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                Already have an account?{' '}
                <Text style={{ color: colors.secondary, fontWeight: '600' }}>
                  Login
                </Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>

      <Modal
        visible={legalModal !== null}
        animationType="slide"
        onRequestClose={() => setLegalModal(null)}
      >
        <View
          style={[
            styles.flex,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top + spacing.md,
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <Text style={[typography.h3, { color: colors.text.primary }]}>
            {legalModal === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
          </Text>
          <ScrollView style={{ flex: 1, marginVertical: spacing.md }}>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {legalLoading ? 'Loading…' : legalBody}
            </Text>
          </ScrollView>
          <Button title="Close" onPress={() => setLegalModal(null)} />
          <Pressable
            onPress={() => Linking.openURL(`https://${DOMAIN}`)}
            style={{ marginTop: spacing.sm, alignItems: 'center' }}
          >
            <Text style={[typography.caption, { color: colors.secondary }]}>
              Open {DOMAIN}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logoWrap: {
    alignItems: 'center',
    marginTop: 16,
  },
  container: { flex: 1, justifyContent: 'center' },
  strengthTrack: { height: 6, overflow: 'hidden' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkBox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
