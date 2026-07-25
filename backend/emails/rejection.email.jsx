import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Rejection notification with reason.
 */
export default function RejectionEmail({
  investorName = 'Tikhat Partner',
  actionLabel = 'Your request',
  reason = 'No reason provided.',
  fieldName,
  referenceId,
  amountRestored,
}) {
  return (
    <BaseEmail
      preview={`${actionLabel} was not approved`}
      title="Request Not Approved"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>
        {actionLabel} could not be approved at this time.
      </Text>
      <Section style={styles.badgeWrap}>
        <Text style={styles.badge}>REJECTED</Text>
      </Section>
      {fieldName ? (
        <Text style={styles.row}>
          <span style={styles.label}>Field:</span> {fieldName}
        </Text>
      ) : null}
      <Text style={styles.row}>
        <span style={styles.label}>Reason:</span> {reason}
      </Text>
      {referenceId ? (
        <Text style={styles.row}>
          <span style={styles.label}>Reference:</span> {referenceId}
        </Text>
      ) : null}
      {amountRestored ? (
        <Text style={styles.row}>
          <span style={styles.label}>Amount restored:</span> {amountRestored}
        </Text>
      ) : null}
      <Text style={styles.body}>
        If you have questions, reply via Support in the Tikhat Partner app.
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
  badgeWrap: {
    margin: '0 0 20px',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    padding: '6px 14px',
    borderRadius: '4px',
    margin: '0',
  },
  row: {
    color: COLORS.textPrimary,
    fontSize: '14px',
    margin: '0 0 8px',
  },
  label: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
};
