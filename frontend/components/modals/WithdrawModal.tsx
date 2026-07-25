import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm, useWatch } from 'react-hook-form';
import { useTheme } from '../../hooks/useTheme';
import { UPI_TRANSFER_LIMIT } from '../../constants';
import { capitalService } from '../../services/capital.service';
import { ApiClientError } from '../../types/api.types';
import {
  capitalWithdrawSchema,
  type CapitalWithdrawFormValues,
  zodResolver,
} from '../../utils/validationSchemas';
import { formatCurrency } from '../../utils/formatCurrency';
import { FormAmountInput } from '../forms/FormAmountInput';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';

const SUCCESS_MESSAGE =
  'Your withdrawal request has been submitted. Processing within 24-48 hours. Thank you for your request.';

const LOCK_WARNING =
  'Your capital withdrawal is currently locked. Please contact support.';

const UPI_TOOLTIP = 'UPI transfers limited to ₹1,00,000';

export type WithdrawModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isCapitalLocked?: boolean;
  capitalBalance?: number;
  revenueBalance?: number;
  testID?: string;
};

/**
 * Withdrawal request form (bottom sheet) for capital or revenue account.
 */
export function WithdrawModal({
  visible,
  onClose,
  onSuccess,
  isCapitalLocked = false,
  capitalBalance = 0,
  revenueBalance = 0,
  testID,
}: WithdrawModalProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
  } = useForm<CapitalWithdrawFormValues>({
    resolver: zodResolver(capitalWithdrawSchema),
    defaultValues: {
      amount: undefined as unknown as number,
      account_type: 'capital',
      transfer_mode: 'bank',
    },
  });

  const amount = useWatch({ control, name: 'amount' });
  const accountType = useWatch({ control, name: 'account_type' });
  const transferMode = useWatch({ control, name: 'transfer_mode' });

  const amountValue = Math.round(Number(amount) || 0);
  const upiDisabled = amountValue > UPI_TRANSFER_LIMIT;
  const showCapitalLockWarning =
    accountType === 'capital' && Boolean(isCapitalLocked);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setApiError(null);
    setSucceeded(false);
    setSubmitting(false);
    reset({
      amount: undefined as unknown as number,
      account_type: 'capital',
      transfer_mode: 'bank',
    });
  }, [visible, reset]);

  useEffect(() => {
    if (upiDisabled && getValues('transfer_mode') === 'upi') {
      setValue('transfer_mode', 'bank');
    }
  }, [upiDisabled, getValues, setValue]);

  const finishSuccess = () => {
    setSucceeded(false);
    onClose();
    onSuccess?.();
  };

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);

    if (values.account_type === 'capital' && isCapitalLocked) {
      setApiError(LOCK_WARNING);
      return;
    }

    const whole = Math.round(values.amount);
    if (values.account_type === 'capital' && whole > Math.round(capitalBalance)) {
      setApiError(
        `Insufficient capital balance. Available: ${formatCurrency(capitalBalance)}`
      );
      return;
    }
    if (values.account_type === 'revenue' && whole > Math.round(revenueBalance)) {
      setApiError(
        `Insufficient revenue balance. Available: ${formatCurrency(revenueBalance)}`
      );
      return;
    }

    setSubmitting(true);
    try {
      if (values.account_type === 'revenue') {
        await capitalService.withdrawRevenue({
          amount: whole,
          transfer_mode: values.transfer_mode,
        });
      } else {
        await capitalService.withdraw({
          amount: whole,
          account_type: values.account_type,
          transfer_mode: values.transfer_mode,
        });
      }
      setSucceeded(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'WITHDRAWAL_FREQUENCY_EXCEEDED') {
          setApiError(err.message);
        } else if (err.code === 'CAPITAL_LOCKED') {
          setApiError(LOCK_WARNING);
        } else {
          setApiError(err.message);
        }
      } else {
        setApiError('Failed to submit withdrawal request');
      }
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
      heightRatio={0.78}
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
              Withdrawal submitted
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {SUCCESS_MESSAGE}
            </Text>
            <Button title="Done" variant="golden" onPress={finishSuccess} />
          </View>
        ) : (
          <>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Withdraw
            </Text>

            <FormAmountInput
              control={control}
              name="amount"
              label="Amount"
              placeholder="1,000"
            />

            <View>
              <Text
                style={[
                  typography.label,
                  { color: colors.text.primary, marginBottom: spacing.xs },
                ]}
              >
                Account
              </Text>
              <View style={[styles.optionRow, { gap: spacing.sm }]}>
                {(
                  [
                    { value: 'capital' as const, label: 'Capital A/C' },
                    { value: 'revenue' as const, label: 'Revenue A/C' },
                  ] as const
                ).map((opt) => {
                  const active = accountType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setValue('account_type', opt.value)}
                      style={[
                        styles.chip,
                        {
                          flex: 1,
                          borderColor: active
                            ? colors.secondary
                            : colors.border,
                          backgroundColor: active
                            ? colors.surface
                            : colors.background,
                          borderRadius: borderRadius.md,
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color: active
                              ? colors.secondary
                              : colors.text.primary,
                            fontWeight: active ? '700' : '500',
                            textAlign: 'center',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {showCapitalLockWarning ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.warning, marginTop: spacing.sm },
                  ]}
                >
                  {LOCK_WARNING}
                </Text>
              ) : null}
            </View>

            <View>
              <Text
                style={[
                  typography.label,
                  { color: colors.text.primary, marginBottom: spacing.xs },
                ]}
              >
                Transfer Mode
              </Text>
              <View style={[styles.optionRow, { gap: spacing.sm }]}>
                {(
                  [
                    { value: 'bank' as const, label: 'Bank Transfer' },
                    { value: 'upi' as const, label: 'UPI Transfer' },
                  ] as const
                ).map((opt) => {
                  const isUpi = opt.value === 'upi';
                  const disabled = isUpi && upiDisabled;
                  const active = transferMode === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      disabled={disabled}
                      onPress={() => {
                        if (!disabled) {
                          setValue('transfer_mode', opt.value);
                        }
                      }}
                      style={[
                        styles.chip,
                        {
                          flex: 1,
                          borderColor:
                            active && !disabled
                              ? colors.secondary
                              : colors.border,
                          backgroundColor:
                            active && !disabled
                              ? colors.surface
                              : colors.background,
                          borderRadius: borderRadius.md,
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                          opacity: disabled ? 0.45 : 1,
                        },
                      ]}
                      accessibilityState={{ disabled }}
                      accessibilityHint={disabled ? UPI_TOOLTIP : undefined}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color:
                              active && !disabled
                                ? colors.secondary
                                : colors.text.primary,
                            fontWeight: active && !disabled ? '700' : '500',
                            textAlign: 'center',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {upiDisabled ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: spacing.sm },
                  ]}
                >
                  {UPI_TOOLTIP}
                </Text>
              ) : null}
            </View>

            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Available — Capital: {formatCurrency(capitalBalance)} · Revenue:{' '}
              {formatCurrency(revenueBalance)}
            </Text>

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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
});
