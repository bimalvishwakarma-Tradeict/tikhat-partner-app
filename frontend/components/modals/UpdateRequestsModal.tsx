import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { profileService } from '../../services/profile.service';
import { ApiClientError } from '../../types/api.types';
import type { ProfileUpdateRequest } from '../../types/models.types';
import { formatDate } from '../../utils/formatDate';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { StatusChip } from '../ui/StatusChip';

export type UpdateRequestsModalProps = {
  visible: boolean;
  onClose: () => void;
  testID?: string;
};

function humanizeField(field: string): string {
  return String(field || 'field')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusBorderColor(
  status: string,
  colors: {
    warning: string;
    success: string;
    error: string;
    border: string;
  }
): string {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return colors.warning;
  if (s === 'approved') return colors.success;
  if (s === 'rejected') return colors.error;
  return colors.border;
}

/**
 * Profile update request history bottom sheet.
 */
export function UpdateRequestsModal({
  visible,
  onClose,
  testID,
}: UpdateRequestsModalProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [items, setItems] = useState<ProfileUpdateRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileService.getUpdateRequests();
      const list = data.requests || data.all || data.pending || [];
      setItems(list);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load update requests'
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void load();
    }
  }, [visible, load]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.82}
      testID={testID}
    >
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text style={[typography.h3, { color: colors.text.primary }]}>
          Update requests
        </Text>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>
          History of profile change requests submitted for admin approval.
        </Text>

        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.secondary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingBottom: spacing.md,
              flexGrow: 1,
              gap: spacing.sm,
            }}
            ListEmptyComponent={
              <EmptyState
                title="No update requests"
                subtitle="Edits you submit will appear here."
              />
            }
            renderItem={({ item }) => {
              const status = String(item.status || '').toLowerCase();
              const border = statusBorderColor(status, colors);
              return (
                <View
                  style={[
                    styles.card,
                    {
                      borderColor: border,
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.md,
                      padding: spacing.md,
                      borderLeftWidth: 4,
                    },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text
                      style={[
                        typography.subtitle,
                        {
                          color: colors.text.primary,
                          fontWeight: '700',
                          flex: 1,
                        },
                      ]}
                    >
                      {humanizeField(item.field_name)}
                    </Text>
                    <StatusChip status={item.status} />
                  </View>

                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.secondary, marginTop: spacing.xs },
                    ]}
                  >
                    Submitted: {formatDate(item.created_at)}
                  </Text>

                  <View style={{ marginTop: spacing.sm, gap: 4 }}>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.text.secondary },
                      ]}
                    >
                      Old value
                    </Text>
                    <Text
                      style={[typography.body, { color: colors.text.primary }]}
                      selectable
                    >
                      {item.old_value || '—'}
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.text.secondary, marginTop: 4 },
                      ]}
                    >
                      New value
                    </Text>
                    <Text
                      style={[typography.body, { color: colors.text.primary }]}
                      selectable
                    >
                      {item.new_value || '—'}
                    </Text>
                  </View>

                  {status === 'rejected' && item.rejection_reason ? (
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.error,
                          marginTop: spacing.sm,
                        },
                      ]}
                    >
                      Reason: {item.rejection_reason}
                    </Text>
                  ) : null}
                </View>
              );
            }}
          />
        )}

        <Button title="Close" variant="secondary" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
