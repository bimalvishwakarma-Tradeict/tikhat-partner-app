import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Capital deposit / withdrawal / admin entry notification.
 */
export default function CapitalTransactionEmail({
  investorName = 'Tikhat Partner',
  amount,
  transactionType = 'Capital transaction',
  status = 'Processed',
  transactionId,
  message,
}) {
  return (
    <BaseEmail
      preview={`${transactionType}: ${amount || ''}`}
      title="Capital Transaction"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>
        {message ||
          'There is an update on your capital transaction with Tikhat Partner.'}
      </Text>
      <Section style={styles.card}>
        <Text style={styles.meta}>
          <span style={styles.label}>Type:</span> {transactionType}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Amount:</span> {amount}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Status:</span> {status}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Transaction ID:</span> {transactionId}
        </Text>
      </Section>
      <Text style={styles.body}>
        Open the Fund section in your account for full details.
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
