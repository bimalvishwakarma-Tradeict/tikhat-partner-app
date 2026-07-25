import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Daily revenue credit notification.
 * Amounts and dates should be pre-formatted (₹ Indian / DD MMM YYYY).
 */
export default function RevenueCreditEmail({
  investorName = 'Tikhat Partner',
  amount,
  creditDate,
  runningBalance,
  transactionId,
}) {
  return (
    <BaseEmail
      preview={`Revenue credited: ${amount || ''}`}
      title="Revenue Credited"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>
        Your daily revenue has been credited to your Tikhat Partner account.
      </Text>
      <Section style={styles.card}>
        <Text style={styles.amountLabel}>Amount credited</Text>
        <Text style={styles.amount}>{amount}</Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Date:</span> {creditDate}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Running revenue balance:</span>{' '}
          {runningBalance}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Transaction ID:</span> {transactionId}
        </Text>
      </Section>
      <Text style={styles.body}>
        Log in to your account to view full revenue history.
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
  amountLabel: {
    color: COLORS.textSecondary,
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    margin: '0 0 4px',
  },
  amount: {
    color: COLORS.primary,
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 16px',
  },
  meta: {
    color: COLORS.textPrimary,
    fontSize: '14px',
    margin: '0 0 8px',
  },
  label: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
};
