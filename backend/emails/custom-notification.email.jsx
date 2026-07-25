import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Admin-drafted custom notification to investors.
 */
export default function CustomNotificationEmail({
  investorName = 'Tikhat Partner',
  subjectTitle = 'Notification',
  body = '',
}) {
  return (
    <BaseEmail preview={subjectTitle} title={subjectTitle}>
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Section style={styles.card}>
        <Text style={styles.body}>{body}</Text>
      </Section>
      <Text style={styles.footerNote}>
        This message was sent by Tikhat Partner administration.
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
  card: {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    padding: '20px',
    margin: '0 0 16px',
  },
  body: {
    color: COLORS.textPrimary,
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0',
    whiteSpace: 'pre-wrap',
  },
  footerNote: {
    color: COLORS.textSecondary,
    fontSize: '13px',
    margin: '0',
  },
};
