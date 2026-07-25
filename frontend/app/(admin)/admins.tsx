import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { adminService } from '../../services/admin.service';
import { ApiClientError } from '../../types/api.types';
import type { Admin } from '../../types/models.types';
import { formatDate } from '../../utils/formatDate';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

const DASHBOARD_HREF = '/(admin)/dashboard' as Href;

function isSuspended(admin: Admin): boolean {
  return (
    admin.is_suspended === true ||
    String(admin.status || '').toLowerCase() === 'suspended'
  );
}

function roleLabel(role: string | undefined): string {
  if (role === 'super_admin') return 'Super Admin';
  return 'Admin';
}

/**
 * Super Admin — manage admin accounts (create / suspend / unsuspend / delete).
 */
export default function AdminManagementScreen() {
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const { isSuperAdmin, user } = useAuth();

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadAdmins = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await adminService.listAdmins();
      setAdmins(Array.isArray(data?.admins) ? data.admins : []);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load admins'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isSuperAdmin) {
        void loadAdmins(false);
      }
    }, [isSuperAdmin, loadAdmins])
  );

  if (!isSuperAdmin) {
    return <Redirect href={DASHBOARD_HREF} />;
  }

  const resetCreateForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setMobile('');
    setFormError(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (busy) return;
    setCreateOpen(false);
    resetCreateForm();
  };

  const handleCreate = async () => {
    setFormError(null);
    const name = fullName.trim();
    const emailValue = email.trim().toLowerCase();
    const mobileValue = mobile.trim();

    if (!name || !emailValue || password.length < 8) {
      setFormError('Full name, email, and password (min 8 characters) are required');
      return;
    }
    if (mobileValue && !/^\d{10}$/.test(mobileValue)) {
      setFormError('Mobile must be a 10-digit number');
      return;
    }

    setBusy(true);
    try {
      await adminService.createAdmin({
        full_name: name,
        email: emailValue,
        password,
        mobile: mobileValue || undefined,
        role: 'admin',
      });
      toast.success('Admin created successfully');
      setCreateOpen(false);
      resetCreateForm();
      await loadAdmins(true);
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Failed to create admin';
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleSuspendToggle = (admin: Admin) => {
    const suspended = isSuspended(admin);
    const run = async () => {
      setBusy(true);
      try {
        if (suspended) {
          await adminService.unsuspendAdmin(admin.id);
          toast.success('Admin unsuspended');
        } else {
          await adminService.suspendAdmin(admin.id);
          toast.success('Admin suspended');
        }
        await loadAdmins(true);
      } catch (err) {
        toast.error(
          err instanceof ApiClientError
            ? err.message
            : suspended
              ? 'Failed to unsuspend admin'
              : 'Failed to suspend admin'
        );
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      const ok = globalThis.confirm?.(
        `${suspended ? 'Unsuspend' : 'Suspend'} ${admin.full_name}?`
      );
      if (ok) void run();
      return;
    }

    Alert.alert(
      suspended ? 'Unsuspend admin' : 'Suspend admin',
      `${suspended ? 'Unsuspend' : 'Suspend'} ${admin.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: suspended ? 'Unsuspend' : 'Suspend',
          style: suspended ? 'default' : 'destructive',
          onPress: () => {
            void run();
          },
        },
      ]
    );
  };

  const handleDelete = (admin: Admin) => {
    const run = async () => {
      setBusy(true);
      try {
        await adminService.deleteAdmin(admin.id);
        toast.success('Admin deleted');
        await loadAdmins(true);
      } catch (err) {
        toast.error(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to delete admin'
        );
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      const ok = globalThis.confirm?.(
        `Delete admin ${admin.full_name}? This cannot be undone.`
      );
      if (ok) void run();
      return;
    }

    Alert.alert(
      'Delete admin',
      `Delete ${admin.full_name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void run();
          },
        },
      ]
    );
  };

  const canManage = (admin: Admin): boolean => {
    if (admin.role === 'super_admin') return false;
    if (user?.id && admin.id === user.id) return false;
    return true;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadAdmins(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h2, { color: colors.text.primary }]}>
              Admin Management
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginTop: spacing.xs },
              ]}
            >
              Create and manage admin accounts. Super Admin only.
            </Text>
          </View>
        </View>

        <Button
          title="Create New Admin"
          variant="golden"
          onPress={openCreate}
          disabled={busy}
        />

        {loading && admins.length === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton width="100%" height={96} borderRadius={12} />
            <Skeleton width="100%" height={96} borderRadius={12} />
            <Skeleton width="100%" height={96} borderRadius={12} />
          </View>
        ) : null}

        {!loading && admins.length === 0 ? (
          <Card>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, textAlign: 'center' },
              ]}
            >
              No admins found.
            </Text>
          </Card>
        ) : null}

        {(admins ?? []).map((admin) => {
          const suspended = isSuspended(admin);
          const manage = canManage(admin);
          return (
            <Card key={admin.id}>
              <View style={styles.adminRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={[
                      typography.title,
                      { color: colors.text.primary },
                    ]}
                  >
                    {admin.full_name || '—'}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {admin.email}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: spacing.xs,
                    }}
                  >
                    <Badge
                      label={roleLabel(admin.role)}
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
                        {
                          color: colors.text.secondary,
                          marginTop: spacing.xs,
                        },
                      ]}
                    >
                      Created {formatDate(admin.created_at)}
                    </Text>
                  ) : null}
                </View>

                {manage ? (
                  <View style={{ gap: spacing.sm, minWidth: 110 }}>
                    <Button
                      title={suspended ? 'Unsuspend' : 'Suspend'}
                      variant={suspended ? 'primary' : 'secondary'}
                      fullWidth
                      disabled={busy}
                      onPress={() => handleSuspendToggle(admin)}
                      textStyle={{ fontSize: 13 }}
                      style={{ minHeight: 40 }}
                    />
                    <Button
                      title="Delete"
                      variant="secondary"
                      fullWidth
                      disabled={busy}
                      onPress={() => handleDelete(admin)}
                      textStyle={{ fontSize: 13, color: colors.error }}
                      style={{
                        minHeight: 40,
                        borderColor: colors.error,
                      }}
                    />
                  </View>
                ) : (
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.text.secondary,
                        alignSelf: 'center',
                        maxWidth: 100,
                        textAlign: 'right',
                      },
                    ]}
                  >
                    No actions
                  </Text>
                )}
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <Modal visible={createOpen} onClose={closeCreate}>
        <View style={{ gap: spacing.md, padding: spacing.md }}>
          <Text style={[typography.h3, { color: colors.text.primary }]}>
            Create New Admin
          </Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            Role is fixed to Admin. Super Admin cannot be created from the UI.
          </Text>

          <Input
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            placeholder="Admin full name"
            editable={!busy}
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="admin@example.com"
            editable={!busy}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Min 8 characters"
            editable={!busy}
          />
          <Input
            label="Mobile Number"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="number-pad"
            placeholder="10-digit mobile (optional)"
            maxLength={10}
            editable={!busy}
          />

          <View
            style={[
              styles.roleBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: borderRadius.md,
                padding: spacing.sm,
              },
            ]}
          >
            <Text
              style={[typography.label, { color: colors.text.secondary }]}
            >
              Role
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.primary, marginTop: 4, fontWeight: '600' },
              ]}
            >
              Admin
            </Text>
          </View>

          {formError ? (
            <Text style={[typography.body, { color: colors.error }]}>
              {formError}
            </Text>
          ) : null}

          <Button
            title="Create Admin"
            variant="golden"
            loading={busy}
            disabled={busy}
            onPress={() => {
              void handleCreate();
            }}
          />
          <Button
            title="Cancel"
            variant="secondary"
            disabled={busy}
            onPress={closeCreate}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  roleBox: {
    borderWidth: 1,
  },
});
