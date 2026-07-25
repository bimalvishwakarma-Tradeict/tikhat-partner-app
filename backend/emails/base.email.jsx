import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Img,
} from '@react-email/components';

const COLORS = {
  primary: '#0A1628',
  secondary: '#C9A84C',
  background: '#FFFFFF',
  surface: '#F8F9FA',
  textPrimary: '#0A1628',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
};

/**
 * Base layout for all Tikhat Partner emails.
 */
export function BaseEmail({ preview, title, children }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview || title || 'Tikhat Partner'}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Img
              src="https://tikhatpartner.online/assets/logo.png"
              height="50"
              alt="Tikhat Partner"
            />
            <Text style={styles.brandName}>Tikhat Partner</Text>
            <Text style={styles.brandSub}>Tikhat Foods</Text>
            {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
          </Section>

          <Section style={styles.content}>{children}</Section>

          <Hr style={styles.hr} />

          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Need help? Contact support at{' '}
              <a href="mailto:support@tikhatpartner.online" style={styles.link}>
                support@tikhatpartner.online
              </a>
            </Text>
            <Text style={styles.footerSite}>tikhatpartner.online</Text>
            <Text style={styles.footerFine}>
              This email was sent by Tikhat Partner. Please do not reply to this
              message.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: COLORS.surface,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: '0',
    padding: '24px 12px',
  },
  container: {
    backgroundColor: COLORS.background,
    borderRadius: '8px',
    border: `1px solid ${COLORS.border}`,
    maxWidth: '560px',
    margin: '0 auto',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: '28px 24px 24px',
    textAlign: 'center',
  },
  logo: {
    margin: '0 auto 12px',
    borderRadius: '8px',
    backgroundColor: COLORS.secondary,
  },
  brandName: {
    color: COLORS.background,
    fontSize: '22px',
    fontWeight: '700',
    margin: '0 0 4px',
    letterSpacing: '0.3px',
  },
  brandSub: {
    color: COLORS.secondary,
    fontSize: '13px',
    fontWeight: '500',
    margin: '0 0 16px',
  },
  headerTitle: {
    color: COLORS.background,
    fontSize: '16px',
    fontWeight: '600',
    margin: '0',
  },
  content: {
    padding: '28px 24px',
  },
  hr: {
    borderColor: COLORS.border,
    margin: '0',
  },
  footer: {
    padding: '20px 24px 24px',
    textAlign: 'center',
    backgroundColor: COLORS.surface,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 8px',
  },
  footerSite: {
    color: COLORS.primary,
    fontSize: '13px',
    fontWeight: '600',
    margin: '0 0 8px',
  },
  footerFine: {
    color: COLORS.textSecondary,
    fontSize: '11px',
    lineHeight: '16px',
    margin: '0',
  },
  link: {
    color: COLORS.secondary,
    textDecoration: 'underline',
  },
};

export { COLORS };
export default BaseEmail;
