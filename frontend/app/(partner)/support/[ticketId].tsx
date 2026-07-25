import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
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
import { MAX_FILE_SIZE_MB } from '../../../constants';
import { supportService } from '../../../services/support.service';
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

type TicketDetail = SupportTicket & {
  ticket_id?: string;
  category_label?: string;
  assigned_admin_name?: string | null;
};

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
    return 'You';
  }
  return 'Support Team';
}

export default function TicketDetailScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();
  const params = useLocalSearchParams<{ ticketId: string }>();
  const ticketId = String(params.ticketId || '');

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState<DraftFile[]>([]);
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<AttachmentViewerItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const status = String(ticket?.status || '').toLowerCase();
  const isClosed = status === 'closed';
  const isResolved = status === 'resolved';
  const canReply = Boolean(ticket) && !isClosed && !isResolved;

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
        const data = await supportService.getTicket(ticketId);
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
      await supportService.replyToTicket(ticketId, {
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

  const reopen = async () => {
    setReopening(true);
    try {
      await supportService.reopenTicket(ticketId);
      toast.success('Ticket reopened');
      await load(true);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Failed to reopen ticket'
      );
    } finally {
      setReopening(false);
    }
  };

  const assignedLabel =
    ticket?.assigned_admin_name ||
    (ticket?.assigned_to ? 'Assigned to support' : null);

  const renderMessage = ({ item }: { item: MessageRow }) => {
    const isInvestor =
      String(item.sender_type).toLowerCase() === 'investor';
    const atts = normalizeAttachments(item.attachments);
    const bubbleBg = isInvestor ? colors.secondary : colors.surface;
    const bubbleFg = isInvestor ? colors.primary : colors.text.primary;
    const metaColor = isInvestor
      ? colors.primary
      : colors.text.secondary;

    return (
      <View
        style={[
          styles.messageRow,
          { alignItems: isInvestor ? 'flex-end' : 'flex-start' },
        ]}
      >
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: bubbleBg,
              borderRadius: borderRadius.lg,
              maxWidth: '82%',
              borderBottomRightRadius: isInvestor ? 4 : borderRadius.lg,
              borderBottomLeftRadius: isInvestor ? borderRadius.lg : 4,
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
                          ? colors.primary
                          : colors.card,
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
                        color={isInvestor ? colors.secondary : colors.secondary}
                      />
                    )}
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: isInvestor
                            ? colors.text.inverse
                            : colors.text.primary,
                          flex: 1,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Ionicons
                      name="download-outline"
                      size={16}
                      color={
                        isInvestor ? colors.text.inverse : colors.text.secondary
                      }
                    />
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
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                },
              ]}
            >
              <View style={styles.headerTop}>
                <Text
                  style={[
                    typography.subtitle,
                    { color: colors.secondary, fontWeight: '700', flex: 1 },
                  ]}
                  selectable
                >
                  {ticketCode(ticket)}
                </Text>
                {ticket ? <StatusChip status={ticket.status} /> : null}
              </View>

              {ticket ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Badge label={categoryLabel(ticket)} variant="default" />
                </View>
              ) : null}

              {ticket?.subject ? (
                <Text
                  style={[
                    typography.body,
                    {
                      color: colors.text.primary,
                      fontWeight: '600',
                      marginTop: spacing.sm,
                    },
                  ]}
                >
                  {ticket.subject}
                </Text>
              ) : null}

              {assignedLabel ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: spacing.xs },
                  ]}
                >
                  Assigned: {assignedLabel}
                </Text>
              ) : null}
            </View>

            {isClosed ? (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: borderRadius.md,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    typography.subtitle,
                    { color: colors.text.secondary, fontWeight: '600' },
                  ]}
                >
                  Ticket Closed
                </Text>
              </View>
            ) : null}

            {isResolved ? (
              <Button
                title="Reopen Ticket"
                variant="golden"
                loading={reopening}
                onPress={() => {
                  void reopen();
                }}
              />
            ) : null}
          </View>
        }
        renderItem={renderMessage}
        ListEmptyComponent={
          !loading ? (
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, textAlign: 'center' },
              ]}
            >
              No messages yet.
            </Text>
          ) : null
        }
      />

      {canReply ? (
        <View
          style={[
            styles.replyBar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
            },
          ]}
        >
          {replyFiles.length > 0 ? (
            <View style={styles.replyFiles}>
              {replyFiles.map((file, index) => (
                <View
                  key={`${file.uri}-${index}`}
                  style={[
                    styles.replyFileChip,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.text.primary, flex: 1 },
                    ]}
                    numberOfLines={1}
                  >
                    {file.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setReplyFiles((prev) =>
                        prev.filter((_, i) => i !== index)
                      )
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
              <Ionicons
                name="attach-outline"
                size={24}
                color={colors.secondary}
              />
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
  container: {
    flex: 1,
  },
  headerCard: {
    borderWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  banner: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageRow: {
    width: '100%',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attThumb: {
    width: 36,
    height: 36,
    borderRadius: 4,
  },
  replyBar: {
    borderTopWidth: 1,
  },
  replyFiles: {
    gap: 6,
    marginBottom: 8,
  },
  replyFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachIcon: {
    paddingBottom: 10,
  },
  replyInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
