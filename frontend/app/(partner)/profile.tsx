import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { profileService } from '../../services/profile.service';
import { ApiClientError } from '../../types/api.types';
import type { Investor, ProfileUpdateRequest } from '../../types/models.types';
import { formatDate } from '../../utils/formatDate';
import {
  EditContactModal,
  type EditContactMode,
} from '../../components/modals/EditContactModal';
import {
  EditProfileModal,
  type EditProfileSection,
} from '../../components/modals/EditProfileModal';
import { KYCUploadModal } from '../../components/modals/KYCUploadModal';
import { UpdateRequestsModal } from '../../components/modals/UpdateRequestsModal';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusChip } from '../../components/ui/StatusChip';
import { toast } from '../../components/ui/Toast';

function maskPan(pan: string | null | undefined, lockedOrVerified: boolean): string {
  if (!pan) {
    return '—';
  }
  const value = String(pan).toUpperCase();
  if (!lockedOrVerified || value.length < 10) {
    return value;
  }
  return `XXXXX${value.slice(5)}`;
}

function maskAccount(account: string | null | undefined): string {
  if (!account) {
    return '—';
  }
  const value = String(account);
  if (value.length <= 4) {
    return value;
  }
  return `${'X'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function resolveMediaUri(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith('file:')) {
    return raw;
  }
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!base) {
    return null;
  }
  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }
  if (raw.includes('/')) {
    return `${base}/${raw}`;
  }
  return null;
}

function pendingFields(requests: ProfileUpdateRequest[]): Set<string> {
  const set = new Set<string>();
  for (const req of requests) {
    if (String(req.status).toLowerCase() === 'pending') {
      set.add(String(req.field_name));
    }
  }
  return set;
}

function PendingTag({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return <Badge label="Pending Approval" variant="warning" />;
}

type DocPreview = {
  title: string;
  uri: string | null;
  hasFile: boolean;
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const { logout } = useAuth();

  const [profile, setProfile] = useState<Investor | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingReqs, setPendingReqs] = useState<ProfileUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editSection, setEditSection] = useState<EditProfileSection | null>(
    null
  );
  const [contactMode, setContactMode] = useState<EditContactMode | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocPreview | null>(null);
  const [kycUploadOpen, setKycUploadOpen] = useState(false);
  const [kycUploadTab, setKycUploadTab] = useState<'documents' | 'photo'>(
    'documents'
  );
  const [requestsOpen, setRequestsOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [data, updates] = await Promise.all([
        profileService.getProfile(),
        profileService.getUpdateRequests().catch(
          (): { pending: ProfileUpdateRequest[]; requests?: ProfileUpdateRequest[] } => ({
            pending: [],
          })
        ),
      ]);
      setProfile(data.profile);
      setPendingCount(Math.round(Number(data.pending_update_count) || 0));
      const pending =
        updates.pending ||
        (updates.requests || []).filter(
          (r: ProfileUpdateRequest) =>
            String(r.status).toLowerCase() === 'pending'
        ) ||
        [];
      setPendingReqs(pending);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load profile'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const pending = useMemo(() => pendingFields(pendingReqs), [pendingReqs]);

  const photoUri = resolveMediaUri(profile?.profile_photo_url);
  const kycVerified =
    String(profile?.kyc_status || '').toLowerCase() === 'verified';
  const panLocked = Boolean(profile?.pan_locked) || kycVerified;
  const aadharLocked = Boolean(profile?.aadhar_locked) || kycVerified;

  const partnerSince = profile?.joining_date_formatted
    ? profile.joining_date_formatted
    : profile?.joining_date
      ? formatDate(profile.joining_date)
      : profile?.created_at
        ? formatDate(profile.created_at)
        : null;

  const openKycUpload = (tab: 'documents' | 'photo') => {
    setKycUploadTab(tab);
    setKycUploadOpen(true);
  };

  const openDoc = (title: string, raw: string | null | undefined) => {
    setPreviewDoc({
      title,
      uri: resolveMediaUri(raw),
      hasFile: Boolean(raw),
    });
  };

  const sectionHeader = (
    title: string,
    opts?: {
      onEdit?: () => void;
      pending?: boolean;
      editLabel?: string;
      hideEdit?: boolean;
    }
  ) => (
    <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[typography.title, { color: colors.text.primary }]}>
          {title}
        </Text>
        <PendingTag show={Boolean(opts?.pending)} />
      </View>
      {opts?.onEdit && !opts.hideEdit ? (
        <Pressable onPress={opts.onEdit} hitSlop={8}>
          <Text
            style={[
              typography.subtitle,
              { color: colors.secondary, fontWeight: '600' },
            ]}
          >
            {opts.editLabel || 'Edit'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const fieldRow = (label: string, value: string, locked = false) => (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>
          {label}
        </Text>
        {locked ? (
          <Ionicons name="lock-closed" size={12} color={colors.warning} />
        ) : null}
      </View>
      <Text
        style={[
          typography.body,
          { color: colors.text.primary, marginTop: 2 },
        ]}
        selectable
      >
        {value || '—'}
      </Text>
    </View>
  );

  const docThumb = (label: string, raw: string | null | undefined) => {
    const uri = resolveMediaUri(raw);
    const hasFile = Boolean(raw);
    return (
      <Pressable
        onPress={() => openDoc(label, raw)}
        style={[
          styles.docThumb,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: borderRadius.md,
          },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.docImage} resizeMode="cover" />
        ) : (
          <View style={styles.docPlaceholder}>
            <Ionicons
              name={hasFile ? 'document-text' : 'image-outline'}
              size={22}
              color={hasFile ? colors.secondary : colors.text.secondary}
            />
          </View>
        )}
        <Text
          style={[
            typography.caption,
            {
              color: colors.text.secondary,
              marginTop: spacing.xs,
              textAlign: 'center',
            },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  if (loading && !profile) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, padding: spacing.md },
        ]}
      >
        <Skeleton height={88} style={{ marginBottom: spacing.md }} />
        <Skeleton height={140} style={{ marginBottom: spacing.md }} />
        <Skeleton height={140} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.xl,
          gap: spacing.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load(true);
            }}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
      >
        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>
            {error}
          </Text>
        ) : null}

        {pendingCount > 0 ? (
          <Card>
            <Text style={[typography.body, { color: colors.warning }]}>
              You have {pendingCount} profile update
              {pendingCount === 1 ? '' : 's'} pending admin approval.
            </Text>
            <Pressable
              onPress={() => setRequestsOpen(true)}
              style={{ marginTop: spacing.sm }}
            >
              <Text
                style={[
                  typography.subtitle,
                  { color: colors.secondary, fontWeight: '600' },
                ]}
              >
                View update requests →
              </Text>
            </Pressable>
          </Card>
        ) : (
          <Pressable onPress={() => setRequestsOpen(true)}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.secondary, fontWeight: '600' },
              ]}
            >
              View update requests →
            </Text>
          </Pressable>
        )}

        <Card accent>
          <View style={styles.photoRow}>
            <Avatar
              name={profile?.full_name}
              uri={photoUri}
              size={84}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={[
                  typography.h3,
                  { color: colors.text.primary },
                ]}
              >
                {profile?.full_name || 'Tikhat Partner'}
              </Text>
              {partnerSince ? (
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Partner Since: {partnerSince}
                </Text>
              ) : null}
              <Button
                title="Change photo"
                variant="secondary"
                fullWidth={false}
                onPress={() => openKycUpload('photo')}
                style={{ alignSelf: 'flex-start', minWidth: 140 }}
              />
            </View>
          </View>
        </Card>

        <Card>
          {sectionHeader('Personal details', {
            onEdit: () => setEditSection('personal'),
            pending:
              pending.has('full_name') ||
              pending.has('date_of_birth') ||
              pending.has('address'),
          })}
          {fieldRow('Name', profile?.full_name || '—')}
          {fieldRow(
            'Date of birth',
            profile?.date_of_birth
              ? formatDate(profile.date_of_birth)
              : '—'
          )}
          {fieldRow('Address', profile?.address || '—')}
        </Card>

        <Card>
          {sectionHeader('Contact', {
            pending: pending.has('email') || pending.has('mobile'),
            hideEdit: true,
          })}
          <View style={styles.contactRow}>
            <View style={{ flex: 1 }}>
              {fieldRow('Mobile', profile?.mobile || '—')}
            </View>
            <Pressable onPress={() => setContactMode('mobile')} hitSlop={8}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.secondary, fontWeight: '600' },
                ]}
              >
                Change
              </Text>
            </Pressable>
          </View>
          <View style={styles.contactRow}>
            <View style={{ flex: 1 }}>
              {fieldRow('Email', profile?.email || '—')}
            </View>
            <Pressable onPress={() => setContactMode('email')} hitSlop={8}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.secondary, fontWeight: '600' },
                ]}
              >
                Change
              </Text>
            </Pressable>
          </View>
        </Card>

        <Card>
          {sectionHeader('KYC', {
            onEdit: () => setEditSection('kyc'),
            hideEdit: panLocked && aadharLocked,
            pending: pending.has('pan_number') || pending.has('aadhar_number'),
          })}
          <View style={{ marginBottom: spacing.sm }}>
            <StatusChip
              status={profile?.kyc_status || 'pending'}
              label={`KYC: ${String(profile?.kyc_status || 'pending')
                .split('_')
                .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ')}`}
            />
          </View>
          {fieldRow(
            'PAN number',
            maskPan(profile?.pan_number, panLocked),
            panLocked
          )}
          {fieldRow(
            'Aadhar number',
            aadharLocked && profile?.aadhar_number
              ? `XXXXXXXX${String(profile.aadhar_number).slice(-4)}`
              : profile?.aadhar_number || '—',
            aadharLocked
          )}
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            Documents
          </Text>
          <View style={[styles.docGrid, { gap: spacing.sm }]}>
            {docThumb('PAN front', profile?.pan_front_url)}
            {docThumb('PAN back', profile?.pan_back_url)}
            {docThumb('Aadhar front', profile?.aadhar_front_url)}
            {docThumb('Aadhar back', profile?.aadhar_back_url)}
          </View>
          <Button
            title="Upload KYC documents"
            variant="golden"
            onPress={() => openKycUpload('documents')}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <Card>
          {sectionHeader('Bank details', {
            onEdit: () => setEditSection('bank'),
            pending:
              pending.has('bank_account_number') ||
              pending.has('bank_ifsc') ||
              pending.has('bank_account_name') ||
              pending.has('bank_name'),
          })}
          {fieldRow(
            'Account number',
            maskAccount(profile?.bank_account_number)
          )}
          {fieldRow('IFSC', profile?.bank_ifsc || '—')}
          {fieldRow('Account name', profile?.bank_account_name || '—')}
          {fieldRow('Bank name', profile?.bank_name || '—')}
        </Card>

        <Card>
          {sectionHeader('UPI ID', {
            onEdit: () => setEditSection('upi'),
            pending: pending.has('upi_id'),
          })}
          {fieldRow('UPI ID', profile?.upi_id || '—')}
        </Card>

        <Pressable
          onPress={() => router.push('/(partner)/account-settings' as Href)}
        >
          <Text
            style={[
              typography.subtitle,
              { color: colors.secondary, fontWeight: '600' },
            ]}
          >
            Account settings →
          </Text>
        </Pressable>

        <Button
          title="Logout"
          variant="secondary"
          onPress={() => {
            void logout();
          }}
        />
      </ScrollView>

      <EditProfileModal
        visible={editSection !== null}
        section={editSection || 'personal'}
        profile={profile}
        onClose={() => setEditSection(null)}
        onSuccess={() => {
          setEditSection(null);
          void load(true);
        }}
      />

      <EditContactModal
        visible={contactMode !== null}
        mode={contactMode || 'mobile'}
        currentValue={
          contactMode === 'email' ? profile?.email : profile?.mobile
        }
        onClose={() => setContactMode(null)}
        onSuccess={() => {
          setContactMode(null);
          void load(true);
        }}
      />

      <KYCUploadModal
        visible={kycUploadOpen}
        initialTab={kycUploadTab}
        profile={profile}
        onClose={() => setKycUploadOpen(false)}
        onSuccess={() => {
          void load(true);
        }}
      />

      <UpdateRequestsModal
        visible={requestsOpen}
        onClose={() => setRequestsOpen(false)}
      />

      <Modal
        visible={previewDoc !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewDoc(null)}
      >
        <View style={styles.previewRoot}>
          <Pressable
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: colors.primary, opacity: 0.55 },
            ]}
            onPress={() => setPreviewDoc(null)}
          />
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                borderColor: colors.border,
                padding: spacing.md,
              },
            ]}
          >
            <Text
              style={[
                typography.title,
                { color: colors.text.primary, marginBottom: spacing.sm },
              ]}
            >
              {previewDoc?.title}
            </Text>
            {previewDoc?.uri ? (
              <Image
                source={{ uri: previewDoc.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, marginBottom: spacing.md },
                ]}
              >
                {previewDoc?.hasFile
                  ? 'Document is on file. Full preview will be available once the file is served to the app.'
                  : 'No document uploaded yet.'}
              </Text>
            )}
            <Button
              title="Close"
              variant="secondary"
              onPress={() => setPreviewDoc(null)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  docThumb: {
    width: '47%',
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  docImage: {
    width: '100%',
    height: 72,
    borderRadius: 8,
  },
  docPlaceholder: {
    width: '100%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    borderWidth: 1,
    zIndex: 1,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  previewImage: {
    width: '100%',
    height: 320,
    marginBottom: 12,
  },
});
