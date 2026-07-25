import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Capital or revenue withdrawal status email.
 */
export default function WithdrawalEmail({
  investorName = 'Tikhat Partner',
  amount,
  transferMode = 'Bank Transfer',
  status = 'Processing',
  utr,
  transactionId,
  withdrawalType = 'Withdrawal',
}) {
  return (
    <BaseEmail
      preview={`${withdrawalType} ${status}: ${amount || ''}`}
      title="Withdrawal Update"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>
        Here is the latest update on your {withdrawalType.toLowerCase()}{' '}
        request.
      </Text>
      <Section style={styles.card}>
        <Text style={styles.meta}>
          <span style={styles.label}>Amount:</span> {amount}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Transfer mode:</span> {transferMode}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Status:</span> {status}
        </Text>
        {utr ? (
          <Text style={styles.meta}>
            <span style={styles.label}>UTR:</span> {utr}
          </Text>
        ) : null}
        {transactionId ? (
          <Text style={styles.meta}>
            <span style={styles.label}>Transaction ID:</span> {transactionId}
          </Text>
        ) : null}
      </Section>
      <Text style={styles.body}>
        Funds typically reflect as per your bank or UPI provider timelines.
      </Text>
    </BaseEmail>
  );
}

const styles = {
  greeting: {
    color: COLORS.textPrimary,
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px',
  },
  body: {
    color: COLORS.textSecondary,
    fontSize: '15px',
    lineHeight: '22px',
    margin: '0 0 16px',
  },
  card: {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    padding: '20px',
    margin: '0 0 20px',
  },
  meta: {
    color: COLORS.textPrimary,
    fontSize: '14px',
    margin: '0 0 10px',
  },
  label: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
};
