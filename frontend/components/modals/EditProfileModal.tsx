import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useTheme } from '../../hooks/useTheme';
import { profileService } from '../../services/profile.service';
import { ApiClientError } from '../../types/api.types';
import type { Investor } from '../../types/models.types';
import {
  aadharSchema,
  fullNameSchema,
  panSchema,
  zodResolver,
} from '../../utils/validationSchemas';
import { FormDatePicker } from '../forms/FormDatePicker';
import { FormInput } from '../forms/FormInput';
import { FormTextArea } from '../forms/FormTextArea';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export const PROFILE_SUCCESS_MESSAGE =
  'Your details will be updated within 24-48 hours after admin approval. Thank you for your request.';

export type EditProfileSection = 'personal' | 'kyc' | 'bank' | 'upi';

export type EditProfileModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  section: EditProfileSection;
  profile: Investor | null;
  testID?: string;
};

const personalSchema = z.object({
  full_name: fullNameSchema,
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  address: z.string().trim().min(5, 'Address is too short'),
});

const kycSchema = z
  .object({
    pan_number: panSchema.optional().or(z.literal('')),
    aadhar_number: aadharSchema.optional().or(z.literal('')),
  })
  .refine(
    (data) =>
      Boolean(data.pan_number && String(data.pan_number).trim()) ||
      Boolean(data.aadhar_number && String(data.aadhar_number).trim()),
    { message: 'Update at least one KYC field' }
  );

const bankSchema = z.object({
  bank_account_number: z
    .string()
    .trim()
    .min(9, 'Enter a valid account number')
    .max(18, 'Enter a valid account number'),
  bank_ifsc: z
    .string()
    .trim()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Enter a valid IFSC code'),
  bank_account_name: z.string().trim().min(3, 'Enter account holder name'),
  bank_name: z.string().trim().min(2, 'Enter bank name'),
});

const upiSchema = z.object({
  upi_id: z
    .string()
    .trim()
    .regex(/^[\w.-]+@[\w.-]+$/, 'Enter a valid UPI ID'),
});

type FormValues = Record<string, string | undefined>;

function sectionTitle(section: EditProfileSection): string {
  switch (section) {
    case 'personal':
      return 'Edit personal details';
    case 'kyc':
      return 'Edit KYC details';
    case 'bank':
      return 'Edit bank details';
    case 'upi':
      return 'Edit UPI ID';
    default:
      return 'Edit profile';
  }
}

/**
 * Profile field edit sheet — submits update requests for admin approval.
 */
export function EditProfileModal({
  visible,
  onClose,
  onSuccess,
  section,
  profile,
  testID,
}: EditProfileModalProps) {
  const { colors, typography, spacing } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const panLocked = Boolean(profile?.pan_locked);
  const aadharLocked = Boolean(profile?.aadhar_locked);

  const schema = useMemo(() => {
    if (section === 'personal') return personalSchema;
    if (section === 'kyc') return kycSchema;
    if (section === 'bank') return bankSchema;
    return upiSchema;
  }, [section]);

  const { control, handleSubmit, reset } = useForm<FormValues>({
    // Section-specific schemas share one form instance
    resolver: zodResolver(schema as never) as Resolver<FormValues>,
    defaultValues: {},
  });

  useEffect(() => {
    if (!visible || !profile) {
      return;
    }
    setApiError(null);
    setSucceeded(false);
    setSubmitting(false);

    if (section === 'personal') {
      reset({
        full_name: profile.full_name || '',
        date_of_birth: profile.date_of_birth
          ? String(profile.date_of_birth).slice(0, 10)
          : '',
        address: profile.address || '',
      });
    } else if (section === 'kyc') {
      reset({
        pan_number: panLocked ? '' : profile.pan_number || '',
        aadhar_number: aadharLocked ? '' : profile.aadhar_number || '',
      });
    } else if (section === 'bank') {
      reset({
        bank_account_number: profile.bank_account_number || '',
        bank_ifsc: profile.bank_ifsc || '',
        bank_account_name: profile.bank_account_name || '',
        bank_name: profile.bank_name || '',
      });
    } else {
      reset({
        upi_id: profile.upi_id || '',
      });
    }
  }, [visible, profile, section, reset, panLocked, aadharLocked]);

  const finishSuccess = () => {
    setSucceeded(false);
    onClose();
    onSuccess?.();
  };

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, string> = {};

      if (section === 'personal') {
        if (values.full_name?.trim()) payload.full_name = values.full_name.trim();
        if (values.date_of_birth?.trim()) {
          payload.date_of_birth = values.date_of_birth.trim();
        }
        if (values.address?.trim()) payload.address = values.address.trim();
      } else if (section === 'kyc') {
        if (!panLocked && values.pan_number?.trim()) {
          payload.pan_number = values.pan_number.trim().toUpperCase();
        }
        if (!aadharLocked && values.aadhar_number?.trim()) {
          payload.aadhar_number = values.aadhar_number.trim();
        }
      } else if (section === 'bank') {
        if (values.bank_account_number?.trim()) {
          payload.bank_account_number = values.bank_account_number.trim();
        }
        if (values.bank_ifsc?.trim()) {
          payload.bank_ifsc = values.bank_ifsc.trim().toUpperCase();
        }
        if (values.bank_account_name?.trim()) {
          payload.bank_account_name = values.bank_account_name.trim();
        }
        if (values.bank_name?.trim()) {
          payload.bank_name = values.bank_name.trim();
        }
      } else if (values.upi_id?.trim()) {
        payload.upi_id = values.upi_id.trim();
      }

      if (Object.keys(payload).length === 0) {
        setApiError('Update at least one field');
        setSubmitting(false);
        return;
      }

      await profileService.updateProfile(payload);
      setSucceeded(true);
    } catch (err) {
      setApiError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to submit profile update'
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
      heightRatio={0.82}
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
              {PROFILE_SUCCESS_MESSAGE}
            </Text>
            <Button title="Done" variant="golden" onPress={finishSuccess} />
          </View>
        ) : (
          <>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              {sectionTitle(section)}
            </Text>

            {section === 'personal' ? (
              <>
                <FormInput
                  control={control}
                  name="full_name"
                  label="Full name"
                  placeholder="Your full name"
                  autoCapitalize="words"
                />
                <FormDatePicker
                  control={control}
                  name="date_of_birth"
                  label="Date of birth"
                  maxYear={new Date().getFullYear()}
                />
                <FormTextArea
                  control={control}
                  name="address"
                  label="Address"
                  placeholder="Residential address"
                  numberOfLines={3}
                />
              </>
            ) : null}

            {section === 'kyc' ? (
              <>
                <View style={{ gap: spacing.xs }}>
                  <View style={styles.lockRow}>
                    <Text
                      style={[typography.label, { color: colors.text.primary }]}
                    >
                      PAN number
                    </Text>
                    {panLocked ? <Badge label="Locked" variant="warning" /> : null}
                  </View>
                  {panLocked ? (
                    <Text
                      style={[typography.body, { color: colors.text.secondary }]}
                    >
                      {profile?.pan_number || '—'} (read-only)
                    </Text>
                  ) : (
                    <FormInput
                      control={control}
                      name="pan_number"
                      placeholder="ABCDE1234F"
                      autoCapitalize="characters"
                    />
                  )}
                </View>
                <View style={{ gap: spacing.xs }}>
                  <View style={styles.lockRow}>
                    <Text
                      style={[typography.label, { color: colors.text.primary }]}
                    >
                      Aadhar number
                    </Text>
                    {aadharLocked ? (
                      <Badge label="Locked" variant="warning" />
                    ) : null}
                  </View>
                  {aadharLocked ? (
                    <Text
                      style={[typography.body, { color: colors.text.secondary }]}
                    >
                      {profile?.aadhar_number || '—'} (read-only)
                    </Text>
                  ) : (
                    <FormInput
                      control={control}
                      name="aadhar_number"
                      placeholder="12-digit Aadhar"
                      keyboardType="number-pad"
                    />
                  )}
                </View>
                {panLocked && aadharLocked ? (
                  <Text style={[typography.caption, { color: colors.warning }]}>
                    KYC identity fields are locked after verification.
                  </Text>
                ) : null}
              </>
            ) : null}

            {section === 'bank' ? (
              <>
                <FormInput
                  control={control}
                  name="bank_account_number"
                  label="Account number"
                  placeholder="Bank account number"
                  keyboardType="number-pad"
                />
                <FormInput
                  control={control}
                  name="bank_ifsc"
                  label="IFSC"
                  placeholder="HDFC0001234"
                  autoCapitalize="characters"
                />
                <FormInput
                  control={control}
                  name="bank_account_name"
                  label="Account holder name"
                  placeholder="Name as per bank"
                  autoCapitalize="words"
                />
                <FormInput
                  control={control}
                  name="bank_name"
                  label="Bank name"
                  placeholder="Bank name"
                  autoCapitalize="words"
                />
              </>
            ) : null}

            {section === 'upi' ? (
              <FormInput
                control={control}
                name="upi_id"
                label="UPI ID"
                placeholder="name@upi"
                autoCapitalize="none"
              />
            ) : null}

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
                title="Submit"
                variant="golden"
                fullWidth={false}
                loading={submitting}
                disabled={section === 'kyc' && panLocked && aadharLocked}
                onPress={() => {
                  void onSubmit();
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
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
});
