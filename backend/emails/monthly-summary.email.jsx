import React from 'react';
import { Text, Section, Row, Column, Hr } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * Monthly account summary for the previous month.
 * Monetary fields must be pre-formatted (₹ Indian format).
 */
export default function MonthlySummaryEmail({
  investorName = 'Tikhat Partner',
  monthLabel = '',
  totalRevenueCredited,
  capitalBalance,
  revenueWithdrawn,
  capitalWithdrawn,
  closingRevenueBalance,
}) {
  return (
    <BaseEmail
      preview={`Monthly summary — ${monthLabel}`}
      title="Monthly Summary"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>
        Here is your Tikhat Partner statement for {monthLabel}.
      </Text>
      <Section style={styles.table}>
        <Row style={styles.tableHeader}>
          <Column>
            <Text style={styles.th}>Item</Text>
          </Column>
          <Column>
            <Text style={{ ...styles.th, textAlign: 'right' }}>Amount</Text>
          </Column>
        </Row>
        <Hr style={styles.hr} />
        <SummaryRow label="Revenue credited" value={totalRevenueCredited} />
        <SummaryRow label="Revenue withdrawn" value={revenueWithdrawn} />
        <SummaryRow label="Capital withdrawn" value={capitalWithdrawn} />
        <SummaryRow label="Capital balance" value={capitalBalance} />
        <SummaryRow
          label="Closing revenue balance"
          value={closingRevenueBalance}
          last
        />
      </Section>
      <Text style={styles.body}>
        This is an automated statement. Log in for day-wise details.
      </Text>
    </BaseEmail>
  );
}

function SummaryRow({ label, value, last }) {
  return (
    <>
      <Row>
        <Column>
          <Text style={styles.td}>{label}</Text>
        </Column>
        <Column>
          <Text style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>
            {value}
          </Text>
        </Column>
      </Row>
      {!last ? <Hr style={styles.hr} /> : null}
    </>
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
  table: {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    padding: '8px 16px',
    margin: '0 0 20px',
  },
  tableHeader: {
    marginBottom: '4px',
  },
  th: {
    color: COLORS.textSecondary,
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    margin: '8px 0',
  },
  td: {
    color: COLORS.textPrimary,
    fontSize: '14px',
    margin: '10px 0',
  },
  hr: {
    borderColor: COLORS.border,
    margin: '0',
  },
};
