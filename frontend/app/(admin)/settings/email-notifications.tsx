import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Redirect, Stack, useFocusEffect, type Href } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { apiGet, apiPatch } from '../../../services/api';
import { ApiClientError } from '../../../types/api.types';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toast } from '../../../components/ui/Toast';

const DASHBOARD_HREF = '/(admin)/dashboard' as Href;
const EMAIL_SETTINGS_PATH = '/api/v1/admin/settings/email-notifications';

type EmailNotificationSettings = Record<string, boolean>;

type ToggleDef = {
  key: string;
  label: string;
};

type SectionDef = {
  title: string;
  toggles: ToggleDef[];
};

const SECTIONS: SectionDef[] = [
  {
    title: 'Investor Activity Emails',
    toggles: [
      { key: 'email_on_registration', label: 'Registration submitted' },
      { key: 'email_on_approval', label: 'Account approved' },
      { key: 'email_on_rejection', label: 'Account rejected' },
      {
        key: 'email_on_profile_update',
        label: 'Profile update approved/rejected',
      },
      { key: 'email_on_kyc_update', label: 'KYC update approved/rejected' },
    ],
  },
  {
    title: 'Financial Activity Emails',
    toggles: [
      { key: 'email_on_capital_deposit', label: 'Capital deposit approved' },
      {
        key: 'email_on_capital_withdrawal',
        label: 'Capital withdrawal status change',
      },
      { key: 'email_on_revenue_credit', label: 'Revenue credit (daily)' },
      {
        key: 'email_on_revenue_withdrawal',
        label: 'Revenue withdrawal status change',
      },
    ],
  },
  {
    title: 'Support Emails',
    toggles: [
      { key: 'email_on_support_ticket', label: 'Support ticket raised' },
      { key: 'email_on_support_reply', label: 'Admin replied to ticket' },
      {
        key: 'email_on_support_closed',
        label: 'Ticket resolved/closed',
      },
    ],
  },
  {
    title: 'Admin Activity Emails',
    toggles: [
      {
        key: 'email_on_account_pause',
        label: 'Account paused/resumed',
      },
    ],
  },
];

const DEFAULTS: EmailNotificationSettings = {
  email_on_registration: true,
  email_on_approval: true,
  email_on_rejection: true,
  email_on_capital_deposit: true,
  email_on_capital_withdrawal: true,
  email_on_revenue_credit: true,
  email_on_revenue_withdrawal: true,
  email_on_support_ticket: true,
  email_on_support_reply: true,
  email_on_support_closed: true,
  email_on_kyc_update: true,
  email_on_account_pause: false,
  email_on_profile_update: true,
};

function normalizeSettings(
  raw: Record<string, unknown> | undefined
): EmailNotificationSettings {
  const next: EmailNotificationSettings = { ...DEFAULTS };
  if (!raw) return next;
  for (const key of Object.keys(DEFAULTS)) {
    const value = raw[key];
    if (typeof value === 'boolean') {
      next[key] = value;
    } else if (value != null) {
      const s = String(value).toLowerCase();
      next[key] = s === 'true' || s === '1' || s === 'on' || s === 'yes';
    }
  }
  return next;
}

/**
 * Super Admin controls for automated investor emails.
 */
export default function EmailNotificationSettingsScreen() {
  const { isSuperAdmin } = useAuth();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] =
    useState<EmailNotificationSettings>(DEFAULTS);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await apiGet<{ settings?: Record<string, unknown> }>(
        EMAIL_SETTINGS_PATH
      );
      setSettings(normalizeSettings(data.settings));
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load email notification settings'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isSuperAdmin) {
        void load(false);
      }
    }, [isSuperAdmin, load])
  );

  const setToggle = useCallback((key: string, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const data = await apiPatch<{ settings?: Record<string, unknown> }>(
        EMAIL_SETTINGS_PATH,
        { settings }
      );
      setSettings(normalizeSettings(data.settings));
      toast.success('Email notification settings saved');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to save email notification settings'
      );
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const greyTrack = useMemo(
    () => colors.border || '#E5E7EB',
    [colors.border]
  );

  if (!isSuperAdmin) {
    return <Redirect href={DASHBOARD_HREF} />;
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.md,
        }}
      >
        <Stack.Screen options={{ title: 'Email Notifications' }} />
        <Skeleton height={40} style={{ marginBottom: 12 }} />
        <Skeleton height={180} style={{ marginBottom: 12 }} />
        <Skeleton height={180} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.md,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.secondary}
          colors={[colors.secondary]}
        />
      }
    >
      <Stack.Screen options={{ title: 'Email Notifications' }} />

      <Text style={[typography.h2, { color: colors.text.primary }]}>
        Email Notification Settings
      </Text>
      <Text style={[typography.body, { color: colors.text.secondary }]}>
        Control which automated emails are sent to investors
      </Text>

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <Text
            style={[
              typography.h3,
              { color: colors.text.primary, marginBottom: spacing.md },
            ]}
          >
            {section.title}
          </Text>
          <View style={{ gap: spacing.md }}>
            {section.toggles.map((toggle) => {
              const enabled = settings[toggle.key] === true;
              return (
                <View
                  key={toggle.key}
                  style={[
                    styles.row,
                    {
                      borderColor: colors.border,
                      borderRadius: borderRadius.md,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.body,
                      {
                        color: colors.text.primary,
                        flex: 1,
                        paddingRight: spacing.sm,
                      },
                    ]}
                  >
                    {toggle.label}
                  </Text>
                  <Switch
                    value={enabled}
                    onValueChange={(v) => setToggle(toggle.key, v)}
                    trackColor={{
                      false: greyTrack,
                      true: colors.success,
                    }}
                    thumbColor={colors.background}
                    ios_backgroundColor={greyTrack}
                  />
                </View>
              );
            })}
          </View>
        </Card>
      ))}

      <Button
        title="Save"
        variant="golden"
        loading={saving}
        disabled={saving}
        onPress={() => {
          void save();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
