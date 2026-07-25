import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTheme } from '../../hooks/useTheme';
import { profileService } from '../../services/profile.service';
import { ApiClientError } from '../../types/api.types';
import {
  emailSchema,
  mobileSchema,
  zodResolver,
} from '../../utils/validationSchemas';
import { FormInput } from '../forms/FormInput';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { PROFILE_SUCCESS_MESSAGE } from './EditProfileModal';

export type EditContactMode = 'email' | 'mobile';

export type EditContactModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  mode: EditContactMode;
  currentValue?: string | null;
  testID?: string;
};

const emailFormSchema = z.object({
  new_email: emailSchema,
});

const mobileFormSchema = z.object({
  new_mobile: mobileSchema,
});

type EmailFormValues = z.infer<typeof emailFormSchema>;
type MobileFormValues = z.infer<typeof mobileFormSchema>;

/**
 * Email / mobile change request sheet (pending admin approval).
 */
export function EditContactModal({
  visible,
  onClose,
  onSuccess,
  mode,
  currentValue,
  testID,
}: EditContactModalProps) {
  const { colors, typography, spacing } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [successMessage, setSuccessMessage] = useState(PROFILE_SUCCESS_MESSAGE);

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { new_email: '' },
  });

  const mobileForm = useForm<MobileFormValues>({
    resolver: zodResolver(mobileFormSchema),
    defaultValues: { new_mobile: '' },
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setApiError(null);
    setSucceeded(false);
    setSubmitting(false);
    setSuccessMessage(PROFILE_SUCCESS_MESSAGE);
    emailForm.reset({ new_email: '' });
    mobileForm.reset({ new_mobile: '' });
  }, [visible, emailForm, mobileForm]);

  const finishSuccess = () => {
    setSucceeded(false);
    onClose();
    onSuccess?.();
  };

  const submitEmail = emailForm.handleSubmit(async (values) => {
    setApiError(null);
    setSubmitting(true);
    try {
      await profileService.requestEmailChange(values.new_email.trim());
      setSuccessMessage(PROFILE_SUCCESS_MESSAGE);
      setSucceeded(true);
    } catch (err) {
      setApiError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to submit email change request'
      );
    } finally {
      setSubmitting(false);
    }
  });

  const submitMobile = mobileForm.handleSubmit(async (values) => {
    setApiError(null);
    setSubmitting(true);
    try {
      await profileService.requestMobileChange(values.new_mobile.trim());
      setSuccessMessage(PROFILE_SUCCESS_MESSAGE);
      setSucceeded(true);
    } catch (err) {
      setApiError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to submit mobile change request'
      );
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (submitting) return;
        if (succeeded) {
          finishSuccess();
          return;
        }
        onClose();
      }}
      heightRatio={0.55}
      testID={testID}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.md }}
      >
        {succeeded ? (
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Request submitted
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {successMessage}
            </Text>
            <Button title="Done" variant="golden" onPress={finishSuccess} />
          </View>
        ) : (
          <>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              {mode === 'email' ? 'Change email' : 'Change mobile'}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Current: {currentValue || '—'}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              {mode === 'mobile'
                ? 'Your new mobile will be verified by admin before it is updated on your account.'
                : 'Your new email will be reviewed by admin before it is updated on your account.'}
            </Text>

            {mode === 'email' ? (
              <FormInput
                control={emailForm.control}
                name="new_email"
                label="New email"
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <FormInput
                control={mobileForm.control}
                name="new_mobile"
                label="New mobile"
                placeholder="10-digit mobile"
                keyboardType="phone-pad"
              />
            )}

            {apiError ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {apiError}
              </Text>
            ) : null}

            <View style={[styles.actions, { gap: spacing.sm }]}>
              <Button
                title="Cancel"
                variant="secondary"
                fullWidth={false}
                disabled={submitting}
                onPress={onClose}
                style={styles.actionBtn}
              />
              <Button
                title="Submit request"
                variant="golden"
                fullWidth={false}
                loading={submitting}
                onPress={() => {
                  if (mode === 'email') {
                    void submitEmail();
                  } else {
                    void submitMobile();
                  }
                }}
                style={styles.actionBtn}
              />
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
});
