import React from 'react';
import { Text, Section } from '@react-email/components';
import { BaseEmail, COLORS } from './base.email.jsx';

/**
 * OTP email — urgent, OTP shown prominently with expiry.
 */
export default function OtpEmail({
  investorName = 'Tikhat Partner',
  otp,
  purpose = 'verification',
  expiresInMinutes = 10,
}) {
  return (
    <BaseEmail
      preview={`Your OTP is ${otp || '******'} — expires in ${expiresInMinutes} minutes`}
      title="One-Time Password"
    >
      <Text style={styles.greeting}>Dear {investorName},</Text>
      <Text style={styles.body}>
        Use this one-time password for {purpose}. Do not share it with anyone.
      </Text>
      <Section style={styles.otpBox}>
        <Text style={styles.otpLabel}>Your OTP</Text>
        <Text style={styles.otp}>{otp}</Text>
        <Text style={styles.expiry}>
          {`Expires in ${expiresInMinutes} minutes`}
        </Text>
      </Section>
      <Text style={styles.warning}>
        If you did not request this code, ignore this email and secure your
        account immediately.
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
    margin: '0 0 20px',
  },
  otpBox: {
    backgroundColor: COLORS.primary,
    borderRadius: '8px',
    padding: '24px 16px',
    textAlign: 'center',
    margin: '0 0 20px',
  },
  otpLabel: {
    color: COLORS.secondary,
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    margin: '0 0 8px',
  },
  otp: {
    color: '#FFFFFF',
    fontSize: '36px',
    fontWeight: '700',
    letterSpacing: '8px',
    margin: '0 0 12px',
    fontFamily: 'monospace',
  },
  expiry: {
    color: '#FFFFFF',
    fontSize: '13px',
    margin: '0',
    opacity: 0.9,
  },
  warning: {
    color: '#EF4444',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0',
  },
};
