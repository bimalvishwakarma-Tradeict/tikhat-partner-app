import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Support ticket confirmation / reply / closure email.
 */
export default function SupportEmail({
  investorName = 'Tikhat Partner',
  ticketId,
  category = 'General',
  messagePreview = '',
  eventLabel = 'Support update',
}) {
  const previewText =
    messagePreview.length > 80
      ? `${messagePreview.slice(0, 80)}…`
      : messagePreview;

  return (
    <BaseEmail preview={`${eventLabel}: ${ticketId || ''}`} title="Support">
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>{eventLabel} for your support ticket.</Text>
      <Section style={styles.card}>
        <Text style={styles.meta}>
          <span style={styles.label}>Ticket ID:</span> {ticketId}
        </Text>
        <Text style={styles.meta}>
          <span style={styles.label}>Category:</span> {category}
        </Text>
        {previewText ? (
          <Text style={styles.meta}>
            <span style={styles.label}>Message:</span> {previewText}
          </Text>
        ) : null}
      </Section>
      <Text style={styles.body}>
        Open Support in the Tikhat Partner app to view the full conversation.
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
