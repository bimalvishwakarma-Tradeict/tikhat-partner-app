import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { useTheme } from '../../hooks/useTheme';
import { capitalService } from '../../services/capital.service';
import { ApiClientError } from '../../types/api.types';
import {
  capitalAddSchema,
  type CapitalAddFormValues,
  zodResolver,
} from '../../utils/validationSchemas';
import { getISTParts } from '../../utils/formatDate';
import { FormAmountInput } from '../forms/FormAmountInput';
import { FormDatePicker } from '../forms/FormDatePicker';
import { FormFilePicker } from '../forms/FormFilePicker';
import { FormInput } from '../forms/FormInput';
import { FormTextArea } from '../forms/FormTextArea';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';

const SUCCESS_MESSAGE =
  'Your request has been received. Your account will be updated within 24-48 hours upon verification. Thank you for your request.';

export type AddCapitalModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  testID?: string;
};

function todayIsoIst(): string {
  const { year, month, day } = getISTParts(new Date());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Add Capital deposit request form (bottom sheet).
 */
export function AddCapitalModal({
  visible,
  onClose,
  onSuccess,
  testID,
}: AddCapitalModalProps) {
  const { colors, typography, spacing } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
  } = useForm<CapitalAddFormValues>({
    resolver: zodResolver(capitalAddSchema),
    defaultValues: {
      amount: undefined as unknown as number,
      transfer_date: todayIsoIst(),
      utr_number: '',
      remark: '',
      payment_screenshot: undefined as unknown as CapitalAddFormValues['payment_screenshot'],
    },
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setApiError(null);
    setSucceeded(false);
    setSubmitting(false);
    reset({
      amount: undefined as unknown as number,
      transfer_date: todayIsoIst(),
      utr_number: '',
      remark: '',
      payment_screenshot: undefined as unknown as CapitalAddFormValues['payment_screenshot'],
    });
  }, [visible, reset]);

  const finishSuccess = () => {
    setSucceeded(false);
    onClose();
    onSuccess?.();
  };

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);
    setSubmitting(true);
    try {
      await capitalService.deposit({
        amount: Math.round(values.amount),
        transfer_date: values.transfer_date,
        utr_number: values.utr_number.trim(),
        remark: values.remark?.trim() || undefined,
        payment_screenshot: {
          uri: values.payment_screenshot.uri,
          name: values.payment_screenshot.name,
          type: values.payment_screenshot.type,
        },
      });
      setSucceeded(true);
    } catch (err) {
      setApiError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to submit capital deposit request'
      );
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (submitting) {
          return;
        }
        if (succeeded) {
          finishSuccess();
          return;
        }
        onClose();
      }}
      heightRatio={0.88}
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
              Request received
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {SUCCESS_MESSAGE}
            </Text>
            <Button title="Done" variant="golden" onPress={finishSuccess} />
          </View>
        ) : (
          <>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Add Capital
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Submit a deposit request with payment proof for admin verification.
            </Text>

            <FormAmountInput
              control={control}
              name="amount"
              label="Amount"
              placeholder="10,000"
            />
            <FormDatePicker
              control={control}
              name="transfer_date"
              label="Date of Transfer"
              maxYear={getISTParts(new Date()).year}
            />
            <FormInput
              control={control}
              name="utr_number"
              label="UTR / Transaction No."
              placeholder="Enter UTR number"
              autoCapitalize="characters"
            />
            <FormTextArea
              control={control}
              name="remark"
              label="Remark (optional)"
              placeholder="Any additional note"
              numberOfLines={3}
              maxLength={500}
            />
            <FormFilePicker
              control={control}
              name="payment_screenshot"
              label="Payment Screenshot"
            />

            {apiError ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {apiError}
              </Text>
            ) : null}

            <View style={[styles.actions, { gap: spacing.sm, marginTop: spacing.sm }]}>
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
});
