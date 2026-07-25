import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, type Href } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import type { Admin } from '../../../types/models.types';
import { formatDate } from '../../../utils/formatDate';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toast } from '../../../components/ui/Toast';

const DASHBOARD_HREF = '/(admin)/dashboard' as Href;

function settingString(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback = ''
): string {
  const value = settings?.[key];
  if (value == null) return fallback;
  return String(value);
}

function parseMaintenance(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const s = String(value || '').toLowerCase();
  return s === 'on' || s === 'true' || s === '1';
}

/**
 * Super Admin system settings, legal docs, backup, admin management.
 */
export default function AdminSettingsScreen() {
  const { isSuperAdmin } = useAuth();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  const [creditHour, setCreditHour] = useState('18');
  const [creditMinute, setCreditMinute] = useState('0');
  const [minCapital, setMinCapital] = useState('10000');
  const [maxCapital, setMaxCapital] = useState('1000000');
  const [upiLimit, setUpiLimit] = useState('100000');
  const [withdrawalFreq, setWithdrawalFreq] = useState('1');
  const [maintenance, setMaintenance] = useState(false);

  const [terms, setTerms] = useState('');
  const [privacy, setPrivacy] = useState('');
  const [termsBusy, setTermsBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newMobile, setNewMobile] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [settingsData, maintenanceData, termsData, privacyData, adminsData] =
        await Promise.all([
          adminService.getSettings(),
          adminService.getMaintenanceMode(),
          adminService.getTerms(),
          adminService.getPrivacy(),
          adminService.listAdmins(),
        ]);

      const map = (settingsData.settings || {}) as Record<string, unknown>;
      setCreditHour(
        String(
          settingsData.revenue_credit_hour ??
            settingString(map, 'revenue_credit_hour', '18')
        )
      );
      setCreditMinute(
        String(
          settingsData.revenue_credit_minute ??
            settingString(map, 'revenue_credit_minute', '0')
        )
      );
      setMinCapital(settingString(map, 'min_capital_deposit', '10000'));
      setMaxCapital(settingString(map, 'max_capital_deposit', '1000000'));
      setUpiLimit(settingString(map, 'upi_transfer_limit', '100000'));
      setWithdrawalFreq(
        settingString(map, 'default_withdrawal_frequency', '1')
      );
      setMaintenance(
        Boolean(maintenanceData.enabled) ||
          parseMaintenance(maintenanceData.maintenance_mode) ||
          parseMaintenance(settingsData.maintenance_mode)
      );

      const termsObj = termsData as { content?: string };
      const privacyObj = privacyData as { content?: string };
      setTerms(termsObj.content || '');
      setPrivacy(privacyObj.content || '');
      setAdmins(adminsData.admins || []);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load settings'
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

  if (!isSuperAdmin) {
    return <Redirect href={DASHBOARD_HREF} />;
  }

  const roundMoney = (raw: string): number => {
    return Math.round(Number(String(raw).replace(/,/g, '')) || 0);
  };

  const saveSettings = async () => {
    const hour = Math.round(Number(creditHour));
    const minute = Math.round(Number(creditMinute));
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      toast.error('Credit time must be a valid hour (0–23) and minute (0–59)');
      return;
    }
    const min = roundMoney(minCapital);
    const max = roundMoney(maxCapital);
    const upi = roundMoney(upiLimit);
    const freq = Math.round(Number(withdrawalFreq) || 0);
    if (min < 1 || max < min) {
      toast.error('Check capital min/max values');
      return;
    }
    if (upi < 1) {
      toast.error('UPI limit must be a positive amount');
      return;
    }
    if (freq < 0) {
      toast.error('Withdrawal frequency must be 0 or greater');
      return;
    }

    setSaving(true);
    try {
      await adminService.updateSettings({
        revenue_credit_hour: hour,
        revenue_credit_minute: minute,
        min_capital_deposit: String(min),
        max_capital_deposit: String(max),
        upi_transfer_limit: String(upi),
        default_withdrawal_frequency: String(freq),
      });
      toast.success('Settings saved');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to save settings'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleMaintenance = async (next: boolean) => {
    setMaintenance(next);
    try {
      await adminService.setMaintenanceMode(next);
      toast.success(next ? 'Maintenance mode enabled' : 'Maintenance mode off');
    } catch (err) {
      setMaintenance(!next);
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update maintenance mode'
      );
    }
  };

  const runBackup = async () => {
    setBackupBusy(true);
    try {
      await adminService.triggerBackup();
      toast.success('Backup started successfully');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to trigger backup'
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const saveTerms = async () => {
    setTermsBusy(true);
    try {
      await adminService.updateTerms(terms);
      toast.success('Terms & Conditions updated');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Failed to update T&C'
      );
    } finally {
      setTermsBusy(false);
    }
  };

  const savePrivacy = async () => {
    setPrivacyBusy(true);
    try {
      await adminService.updatePrivacy(privacy);
      toast.success('Privacy Policy updated');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update Privacy Policy'
      );
    } finally {
      setPrivacyBusy(false);
    }
  };

  const createAdmin = async () => {
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 8) {
      toast.error('Name, email, and password (min 8) are required');
      return;
    }
    setAdminBusy(true);
    try {
      await adminService.createAdmin({
        full_name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        mobile: newMobile.trim() || undefined,
        role: 'admin',
      });
      toast.success('Admin created');
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewMobile('');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to create admin'
      );
    } finally {
      setAdminBusy(false);
    }
  };

  const toggleSuspend = (admin: Admin) => {
    const suspended =
      admin.is_suspended === true ||
      String(admin.status || '').toLowerCase() === 'suspended';
    Alert.alert(
      suspended ? 'Unsuspend admin' : 'Suspend admin',
      `${suspended ? 'Unsuspend' : 'Suspend'} ${admin.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: suspended ? 'Unsuspend' : 'Suspend',
          style: suspended ? 'default' : 'destructive',
          onPress: () => {
            void (async () => {
              setAdminBusy(true);
              try {
                if (suspended) {
                  await adminService.unsuspendAdmin(admin.id);
                  toast.success('Admin unsuspended');
                } else {
                  await adminService.suspendAdmin(admin.id);
                  toast.success('Admin suspended');
                }
                await load(true);
              } catch (err) {
                toast.error(
                  err instanceof ApiClientError
                    ? err.message
                    : 'Failed to update admin'
                );
              } finally {
                setAdminBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const deleteAdmin = (admin: Admin) => {
    Alert.alert(
      'Delete admin',
      `Permanently delete ${admin.full_name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setAdminBusy(true);
              try {
                await adminService.deleteAdmin(admin.id);
                toast.success('Admin deleted');
                await load(true);
              } catch (err) {
                toast.error(
                  err instanceof ApiClientError
                    ? err.message
                    : 'Failed to delete admin'
                );
              } finally {
                setAdminBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { keyboardType?: 'default' | 'numeric'; secure?: boolean }
  ) => (
    <View style={{ marginBottom: spacing.sm }}>
      <Text
        style={[
          typography.caption,
          { color: colors.text.secondary, marginBottom: 4 },
        ]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={opts?.keyboardType || 'default'}
        secureTextEntry={opts?.secure}
        placeholderTextColor={colors.text.secondary}
        style={[
          typography.body,
          styles.input,
          {
            borderColor: colors.border,
            color: colors.text.primary,
            borderRadius: borderRadius.md,
          },
        ]}
      />
    </View>
  );

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.md,
        }}
      >
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
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.secondary}
          colors={[colors.secondary]}
        />
      }
    >
      <Text style={[typography.h2, { color: colors.text.primary }]}>
        Settings
      </Text>
      <Text style={[typography.body, { color: colors.text.secondary }]}>
        Super Admin system configuration
      </Text>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          Global settings
        </Text>
        {field('Revenue credit hour (0–23)', creditHour, setCreditHour, {
          keyboardType: 'numeric',
        })}
        {field('Revenue credit minute (0–59)', creditMinute, setCreditMinute, {
          keyboardType: 'numeric',
        })}
        {field('Minimum capital (₹)', minCapital, setMinCapital, {
          keyboardType: 'numeric',
        })}
        {field('Maximum capital (₹)', maxCapital, setMaxCapital, {
          keyboardType: 'numeric',
        })}
        {field('UPI transfer limit (₹)', upiLimit, setUpiLimit, {
          keyboardType: 'numeric',
        })}
        {field(
          'Default withdrawal frequency',
          withdrawalFreq,
          setWithdrawalFreq,
          { keyboardType: 'numeric' }
        )}

        <View style={[styles.switchRow, { marginVertical: spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                typography.body,
                { color: colors.text.primary, fontWeight: '700' },
              ]}
            >
              Maintenance mode
            </Text>
            <Text
              style={[typography.caption, { color: colors.text.secondary }]}
            >
              When on, investor APIs return 503
            </Text>
          </View>
          <Switch
            value={maintenance}
            onValueChange={(v) => {
              void toggleMaintenance(v);
            }}
            trackColor={{ false: colors.border, true: colors.secondary }}
            thumbColor={colors.background}
          />
        </View>

        <Button
          title="Save settings"
          variant="golden"
          loading={saving}
          disabled={saving}
          onPress={() => {
            void saveSettings();
          }}
        />

        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Run manual backup"
            variant="secondary"
            loading={backupBusy}
            disabled={backupBusy}
            onPress={() => {
              void runBackup();
            }}
          />
        </View>
      </Card>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.sm },
          ]}
        >
          Terms & Conditions
        </Text>
        <TextInput
          value={terms}
          onChangeText={setTerms}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
          placeholder="Terms content…"
          placeholderTextColor={colors.text.secondary}
          style={[
            typography.body,
            styles.textarea,
            {
              borderColor: colors.border,
              color: colors.text.primary,
              borderRadius: borderRadius.md,
              minHeight: 140,
            },
          ]}
        />
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title="Save T&C"
            variant="secondary"
            loading={termsBusy}
            disabled={termsBusy}
            onPress={() => {
              void saveTerms();
            }}
          />
        </View>
      </Card>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.sm },
          ]}
        >
          Privacy Policy
        </Text>
        <TextInput
          value={privacy}
          onChangeText={setPrivacy}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
          placeholder="Privacy Policy content…"
          placeholderTextColor={colors.text.secondary}
          style={[
            typography.body,
            styles.textarea,
            {
              borderColor: colors.border,
              color: colors.text.primary,
              borderRadius: borderRadius.md,
              minHeight: 140,
            },
          ]}
        />
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title="Save Privacy Policy"
            variant="secondary"
            loading={privacyBusy}
            disabled={privacyBusy}
            onPress={() => {
              void savePrivacy();
            }}
          />
        </View>
      </Card>

      <Card>
        <Text
          style={[
            typography.h3,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          Admin management
        </Text>

        {field('Full name', newName, setNewName)}
        {field('Email', newEmail, setNewEmail)}
        {field('Mobile (optional)', newMobile, setNewMobile, {
          keyboardType: 'numeric',
        })}
        {field('Password', newPassword, setNewPassword, { secure: true })}
        <Button
          title="Create admin"
          variant="golden"
          loading={adminBusy}
          disabled={adminBusy}
          onPress={() => {
            void createAdmin();
          }}
        />

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {admins.map((admin) => {
            const suspended =
              admin.is_suspended === true ||
              String(admin.status || '').toLowerCase() === 'suspended';
            return (
              <View
                key={admin.id}
                style={[
                  styles.adminRow,
                  {
                    borderColor: colors.border,
                    borderRadius: borderRadius.md,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.primary, fontWeight: '700' },
                    ]}
                  >
                    {admin.full_name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {admin.email}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Badge
                      label={admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      variant="golden"
                    />
                    {suspended ? (
                      <Badge label="Suspended" variant="error" />
                    ) : (
                      <Badge label="Active" variant="success" />
                    )}
                  </View>
                  {admin.created_at ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.text.secondary },
                      ]}
                    >
                      Joined {formatDate(admin.created_at)}
                    </Text>
                  ) : null}
                </View>
                {admin.role !== 'super_admin' ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => toggleSuspend(admin)}
                      disabled={adminBusy}
                    >
                      <Text
                        style={[
                          typography.caption,
                          {
                            color: suspended
                              ? colors.success
                              : colors.warning,
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {suspended ? 'Unsuspend' : 'Suspend'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteAdmin(admin)}
                      disabled={adminBusy}
                    >
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.error, fontWeight: '700' },
                        ]}
                      >
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminRow: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
  },
});
