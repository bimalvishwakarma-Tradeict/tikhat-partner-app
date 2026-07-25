import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Approval notification (registration, profile, withdrawal, etc.)
 */
export default function ApprovalEmail({
  investorName = 'Tikhat Partner',
  actionLabel = 'Your request',
  message = 'Your request has been approved.',
  referenceId,
  details,
}) {
  return (
    <BaseEmail
      preview={`${actionLabel} approved`}
      title="Request Approved"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>{message}</Text>
      <Section style={styles.badgeWrap}>
        <Text style={styles.badge}>APPROVED</Text>
      </Section>
      {actionLabel ? (
        <Text style={styles.row}>
          <span style={styles.label}>Action:</span> {actionLabel}
        </Text>
      ) : null}
      {referenceId ? (
        <Text style={styles.row}>
          <span style={styles.label}>Reference:</span> {referenceId}
        </Text>
      ) : null}
      {details ? <Text style={styles.body}>{details}</Text> : null}
      <Text style={styles.body}>
        You can view the latest status in your Tikhat Partner account.
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
    backgroundColor: '#10B981',
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
