import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { MAX_FILE_SIZE_MB } from '../../../constants';
import { supportService } from '../../../services/support.service';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import type {
  FileUploadAsset,
  SupportMessage,
  SupportTicket,
} from '../../../types/models.types';
import { formatDate, formatTime } from '../../../utils/formatDate';
import {
  AttachmentViewer,
  type AttachmentViewerItem,
} from '../../../components/modals/AttachmentViewer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { toast } from '../../../components/ui/Toast';

const MAX_ATTACHMENTS = 5;
const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|pdf)$/i;

const STATUS_OPTIONS: Array<{
  key: 'in_progress' | 'resolved' | 'closed';
  label: string;
}> = [
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

type TicketDetail = SupportTicket & {
  ticket_id?: string;
  category_label?: string;
  assigned_admin_name?: string | null;
  is_escalated?: boolean;
};

type AdminOption = { id: string; full_name: string };

type AttachmentRow = {
  id?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  uri?: string;
  name?: string;
  type?: string;
};

type MessageRow = SupportMessage & {
  sender_name?: string | null;
  attachments?: AttachmentRow[] | string[] | null;
};

type DraftFile = FileUploadAsset & { size?: number };

function ticketCode(ticket: TicketDetail | null): string {
  if (!ticket) return 'Ticket';
  return ticket.ticket_id || ticket.ticket_code || ticket.id;
}

function categoryLabel(ticket: TicketDetail | null): string {
  if (!ticket) return '';
  if (ticket.category_label) return ticket.category_label;
  return String(ticket.category || '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeMime(mime?: string | null, name?: string): string {
  if (mime && mime !== 'application/octet-stream') {
    return mime;
  }
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return mime || 'application/octet-stream';
}

function resolveAttachmentUri(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('file:')) {
    return raw;
  }
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!base) return null;
  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }
  if (raw.startsWith('uploads/')) {
    return `${base}/${raw}`;
  }
  return `${base}/uploads/${raw}`;
}

function normalizeAttachments(
  raw: MessageRow['attachments']
): AttachmentRow[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: `str-${index}`,
        file_url: item,
        file_name: item.split('/').pop() || 'Attachment',
      };
    }
    return item;
  });
}

function isImageAttachment(att: AttachmentRow): boolean {
  const type = (att.file_type || att.type || '').toLowerCase();
  const name = att.file_name || att.name || att.file_url || '';
  return type.startsWith('image/') || /\.(jpe?g|png)$/i.test(name);
}

function senderLabel(message: MessageRow): string {
  if (message.sender_name) {
    return message.sender_name;
  }
  if (String(message.sender_type).toLowerCase() === 'investor') {
    return 'Tikhat Partner';
  }
  return 'Admin';
}

/**
 * Admin support ticket detail — conversation, assign, status.
 */
export default function AdminSupportTicketDetailScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isSuperAdmin } = useAuth();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const params = useLocalSearchParams<{ ticketId: string }>();
  const ticketId = String(params.ticketId || '');

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState<DraftFile[]>([]);
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<AttachmentViewerItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const status = String(ticket?.status || '').toLowerCase();
  const isClosed = status === 'closed';
  const escalated = Boolean(ticket?.is_escalated);
  const canReply = Boolean(ticket) && !isClosed;
  const canResolveEscalated = !escalated || isSuperAdmin;

  useEffect(() => {
    void adminService
      .listAdmins()
      .then((data) => {
        setAdmins(
          (data.admins || []).map((a) => ({
            id: a.id,
            full_name: a.full_name,
          }))
        );
      })
      .catch(() => setAdmins([]));
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!ticketId) {
        setError('Ticket not found');
        setLoading(false);
        return;
      }
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await supportService.getAdminTicket(ticketId);
        setTicket(data.ticket as TicketDetail);
        setMessages((data.messages || []) as MessageRow[]);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load ticket'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ticketId]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: ticket ? ticketCode(ticket) : 'Ticket Detail',
    });
  }, [navigation, ticket]);

  const addReplyFiles = (files: DraftFile[]) => {
    const next = [...replyFiles];
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS) {
        toast.error(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
        break;
      }
      const mime = file.type.toLowerCase();
      const okMime =
        mime === 'image/jpeg' ||
        mime === 'image/jpg' ||
        mime === 'image/png' ||
        mime === 'application/pdf' ||
        ALLOWED_EXT.test(file.name);
      if (!okMime) {
        toast.error('Only JPG, PNG, or PDF files are allowed');
        continue;
      }
      if (typeof file.size === 'number' && file.size > MAX_BYTES) {
        toast.error(`Each file must be ${MAX_FILE_SIZE_MB}MB or smaller`);
        continue;
      }
      next.push(file);
    }
    setReplyFiles(next);
  };

  const pickFromLibrary = async () => {
    setPickerOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to attach images.'
      );
      return;
    }
    const remaining = MAX_ATTACHMENTS - replyFiles.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    addReplyFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name:
          asset.fileName ||
          `image-${Date.now()}.${asset.uri.split('.').pop() || 'jpg'}`,
        type: normalizeMime(asset.mimeType, asset.fileName || asset.uri),
        size: asset.fileSize,
      }))
    );
  };

  const pickDocuments = async () => {
    setPickerOpen(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    addReplyFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        type: normalizeMime(asset.mimeType, asset.name),
        size: asset.size,
      }))
    );
  };

  const openAttachmentGallery = (
    atts: AttachmentRow[],
    start: AttachmentRow
  ) => {
    const items: AttachmentViewerItem[] = [];
    let startIndex = 0;
    atts.forEach((att, i) => {
      const uri = resolveAttachmentUri(att.file_url || att.uri);
      if (!uri) {
        return;
      }
      const startKey = start.file_url || start.uri || start.id;
      const attKey = att.file_url || att.uri || att.id;
      if (att === start || (startKey && attKey === startKey)) {
        startIndex = items.length;
      }
      items.push({
        id: att.id || `att-${i}`,
        uri,
        name: att.file_name || att.name || `Attachment ${i + 1}`,
        mimeType: att.file_type || att.type,
      });
    });
    if (items.length === 0) {
      toast.error('Could not load attachment');
      return;
    }
    setViewerItems(items);
    setViewerIndex(startIndex);
    setViewerOpen(true);
  };

  const sendReply = async () => {
    const message = replyText.trim();
    if (message.length < 1) {
      toast.error('Enter a reply message');
      return;
    }
    setSending(true);
    try {
      await supportService.adminReply(ticketId, {
        message,
        attachments: replyFiles.length
          ? replyFiles.map((f) => ({
              uri: f.uri,
              name: f.name,
              type: f.type,
            }))
          : undefined,
      });
      setReplyText('');
      setReplyFiles([]);
      toast.success('Reply sent');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Failed to send reply'
      );
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (next: 'in_progress' | 'resolved' | 'closed') => {
    if (
      (next === 'resolved' || next === 'closed') &&
      escalated &&
      !isSuperAdmin
    ) {
      toast.error(
        'Only Super Admin can resolve or close escalated tickets'
      );
      setStatusModal(false);
      return;
    }
    setStatusBusy(true);
    try {
      await supportService.updateTicketStatus(ticketId, next);
      toast.success(
        next === 'resolved'
          ? 'Ticket marked resolved'
          : next === 'closed'
            ? 'Ticket closed'
            : 'Status updated'
      );
      setStatusModal(false);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update status'
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const assignTo = async (adminId: string) => {
    setAssignBusy(true);
    try {
      await supportService.assignTicket(ticketId, adminId);
      toast.success('Ticket assigned');
      setAssignModal(false);
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to assign ticket'
      );
    } finally {
      setAssignBusy(false);
    }
  };

  const renderMessage = ({ item }: { item: MessageRow }) => {
    const isInvestor =
      String(item.sender_type).toLowerCase() === 'investor';
    const atts = normalizeAttachments(item.attachments);
    const bubbleBg = isInvestor ? colors.surface : colors.secondary;
    const bubbleFg = isInvestor ? colors.text.primary : colors.primary;
    const metaColor = isInvestor
      ? colors.text.secondary
      : colors.primary;

    return (
      <View
        style={[
          styles.messageRow,
          { alignItems: isInvestor ? 'flex-start' : 'flex-end' },
        ]}
      >
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: bubbleBg,
              borderRadius: borderRadius.lg,
              maxWidth: '82%',
              borderBottomLeftRadius: isInvestor ? 4 : borderRadius.lg,
              borderBottomRightRadius: isInvestor ? borderRadius.lg : 4,
            },
          ]}
        >
          <Text
            style={[
              typography.caption,
              { color: metaColor, fontWeight: '700', marginBottom: 4 },
            ]}
          >
            {senderLabel(item)}
          </Text>
          <Text style={[typography.body, { color: bubbleFg }]}>
            {item.message}
          </Text>

          {atts.length > 0 ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              {atts.map((att, index) => {
                const name =
                  att.file_name || att.name || `Attachment ${index + 1}`;
                const uri = resolveAttachmentUri(att.file_url || att.uri);
                return (
                  <Pressable
                    key={att.id || `${name}-${index}`}
                    onPress={() => {
                      openAttachmentGallery(atts, att);
                    }}
                    style={[
                      styles.attChip,
                      {
                        backgroundColor: isInvestor
                          ? colors.card
                          : colors.primary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    {isImageAttachment(att) && uri ? (
                      <Image
                        source={{ uri }}
                        style={styles.attThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons
                        name="document-attach-outline"
                        size={18}
                        color={colors.secondary}
                      />
                    )}
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: isInvestor
                            ? colors.text.primary
                            : colors.text.inverse,
                          flex: 1,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text
            style={[
              typography.caption,
              { color: metaColor, marginTop: spacing.xs, opacity: 0.85 },
            ]}
          >
            {item.created_at
              ? `${formatDate(item.created_at)} · ${formatTime(item.created_at)}`
              : ''}
          </Text>
        </View>
      </View>
    );
  };

  if (loading && !ticket) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, padding: spacing.md },
        ]}
      >
        <Skeleton height={96} style={{ marginBottom: spacing.md }} />
        <Skeleton height={64} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={64} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.md,
          flexGrow: 1,
          gap: spacing.sm,
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
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
            {error ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}

            <View
              style={[
                styles.headerCard,
                {
                  borderColor: escalated ? colors.error : colors.border,
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  borderWidth: escalated ? 2 : 1,
                  padding: spacing.md,
                  gap: spacing.xs,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.secondary, fontWeight: '700' },
                  ]}
                  selectable
                >
                  {ticketCode(ticket)}
                </Text>
                <StatusChip status={ticket?.status || 'open'} />
              </View>

              {escalated ? <Badge label="ESCALATED" variant="error" /> : null}

              <Text
                style={[
                  typography.body,
                  { color: colors.text.primary, fontWeight: '700' },
                ]}
              >
                {ticket?.investor_name || 'Investor'}
              </Text>
              <Badge label={categoryLabel(ticket)} variant="default" />
              <Text style={[typography.h3, { color: colors.text.primary }]}>
                {ticket?.subject}
              </Text>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Assigned: {ticket?.assigned_admin_name || 'Unassigned'}
              </Text>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Created:{' '}
                {ticket?.created_at ? formatDate(ticket.created_at) : '—'}
                {' · '}
                Updated:{' '}
                {ticket?.updated_at ? formatDate(ticket.updated_at) : '—'}
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Change status"
                  variant="secondary"
                  onPress={() => setStatusModal(true)}
                  disabled={statusBusy || isClosed}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Assign"
                  variant="secondary"
                  onPress={() => setAssignModal(true)}
                  disabled={assignBusy || isClosed}
                />
              </View>
            </View>

            {!canResolveEscalated ? (
              <Text style={[typography.caption, { color: colors.warning }]}>
                Escalated ticket — only Super Admin can mark resolved or closed.
              </Text>
            ) : null}
          </View>
        }
        renderItem={renderMessage}
        ListEmptyComponent={
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, textAlign: 'center' },
            ]}
          >
            No messages yet
          </Text>
        }
      />

      {canReply ? (
        <View
          style={[
            styles.composer,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
            },
          ]}
        >
          {replyFiles.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {replyFiles.map((file, index) => (
                <View
                  key={`${file.uri}-${index}`}
                  style={[
                    styles.draftChip,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.sm,
                    },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.text.primary, maxWidth: 120 }]}
                    numberOfLines={1}
                  >
                    {file.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setReplyFiles((prev) => prev.filter((_, i) => i !== index))
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={16} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {pickerOpen ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs }}>
              <Pressable
                onPress={() => {
                  void pickFromLibrary();
                }}
                style={[
                  styles.pickerBtn,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.sm,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: colors.text.primary }]}>
                  Photos
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void pickDocuments();
                }}
                style={[
                  styles.pickerBtn,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.sm,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: colors.text.primary }]}>
                  Files
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPickerOpen(false)}
                style={[
                  styles.pickerBtn,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.sm,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.replyRow}>
            <Pressable
              onPress={() => setPickerOpen((v) => !v)}
              hitSlop={8}
              style={styles.attachIcon}
            >
              <Ionicons name="attach-outline" size={24} color={colors.secondary} />
            </Pressable>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type your reply…"
              placeholderTextColor={colors.text.secondary}
              multiline
              style={[
                styles.replyInput,
                {
                  color: colors.text.primary,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                },
              ]}
            />
            <Pressable
              onPress={() => {
                void sendReply();
              }}
              disabled={sending}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: colors.secondary,
                  borderRadius: borderRadius.md,
                  opacity: sending ? 0.7 : 1,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Ionicons name="send" size={18} color={colors.primary} />
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={statusModal} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setStatusModal(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Update status
            </Text>
            <ScrollView style={{ maxHeight: 280, marginTop: spacing.md }}>
              {STATUS_OPTIONS.map((opt) => {
                const locked =
                  (opt.key === 'resolved' || opt.key === 'closed') &&
                  !canResolveEscalated;
                return (
                  <Pressable
                    key={opt.key}
                    disabled={statusBusy || locked}
                    onPress={() => {
                      void changeStatus(opt.key);
                    }}
                    style={[
                      styles.modalRow,
                      {
                        borderColor: colors.border,
                        opacity: locked ? 0.45 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[typography.body, { color: colors.text.primary }]}
                    >
                      {opt.label}
                      {locked ? ' (Super Admin only)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setStatusModal(false)}
              style={{ marginTop: spacing.sm }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={assignModal} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAssignModal(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Assign to admin
            </Text>
            <ScrollView style={{ maxHeight: 320, marginTop: spacing.md }}>
              {admins.length === 0 ? (
                <Text
                  style={[typography.body, { color: colors.text.secondary }]}
                >
                  No admins available
                </Text>
              ) : (
                admins.map((admin) => (
                  <Pressable
                    key={admin.id}
                    disabled={assignBusy}
                    onPress={() => {
                      void assignTo(admin.id);
                    }}
                    style={[
                      styles.modalRow,
                      {
                        borderColor: colors.border,
                        backgroundColor:
                          ticket?.assigned_to === admin.id
                            ? colors.surface
                            : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[typography.body, { color: colors.text.primary }]}
                    >
                      {admin.full_name}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setAssignModal(false)}
              style={{ marginTop: spacing.sm }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <AttachmentViewer
        visible={viewerOpen}
        attachments={viewerItems}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerCard: {},
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionsRow: { flexDirection: 'row', gap: 8 },
  messageRow: { width: '100%' },
  bubble: { padding: 12 },
  attChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  attThumb: { width: 36, height: 36, borderRadius: 4 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth },
  draftChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pickerBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachIcon: { paddingBottom: 10 },
  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 40, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { padding: 16 },
  modalRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
});
