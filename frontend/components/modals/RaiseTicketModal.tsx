import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { MAX_FILE_SIZE_MB } from '../../constants';
import { supportService } from '../../services/support.service';
import { ApiClientError } from '../../types/api.types';
import type { FileUploadAsset } from '../../types/models.types';
import {
  pickedFileSchema,
  type PickedFile,
  zodResolver,
} from '../../utils/validationSchemas';
import { FormInput } from '../forms/FormInput';
import { FormSelect } from '../forms/FormSelect';
import { FormTextArea } from '../forms/FormTextArea';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';

const MAX_ATTACHMENTS = 5;
const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|pdf)$/i;

const CATEGORY_OPTIONS = [
  { label: 'Capital Related', value: 'capital' },
  { label: 'Revenue Related', value: 'revenue' },
  { label: 'Withdrawal Related', value: 'withdrawal' },
  { label: 'KYC/Profile Related', value: 'kyc_profile' },
  { label: 'Technical Issue', value: 'technical' },
  { label: 'Other', value: 'other' },
] as const;

const raiseTicketSchema = z.object({
  category: z.enum(
    ['capital', 'revenue', 'withdrawal', 'kyc_profile', 'technical', 'other'],
    { required_error: 'Category is required' }
  ),
  subject: z
    .string({ required_error: 'Subject is required' })
    .trim()
    .min(1, 'Subject is required')
    .max(120, 'Subject is too long'),
  message: z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(20, 'Message must be at least 20 characters')
    .max(5000, 'Message is too long'),
  attachments: z
    .array(pickedFileSchema)
    .max(MAX_ATTACHMENTS, `Maximum ${MAX_ATTACHMENTS} attachments`)
    .optional(),
});

type RaiseTicketForm = z.infer<typeof raiseTicketSchema>;

export type RaiseTicketModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  testID?: string;
};

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

function validatePicked(file: PickedFile): string | null {
  const mime = file.type.toLowerCase();
  const okMime =
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'application/pdf' ||
    ALLOWED_EXT.test(file.name);
  if (!okMime) {
    return `Unsupported file type. Use JPG, PNG, or PDF (max ${MAX_FILE_SIZE_MB}MB).`;
  }
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    return `File too large. Max ${MAX_FILE_SIZE_MB}MB each.`;
  }
  return null;
}

function isImageFile(file: PickedFile): boolean {
  return (
    file.type.toLowerCase().startsWith('image/') ||
    /\.(jpe?g|png)$/i.test(file.name)
  );
}

function ticketCodeFromResponse(data: {
  ticket?: { ticket_id?: string; ticket_code?: string; id?: string };
}): string {
  const ticket = data.ticket;
  return ticket?.ticket_id || ticket?.ticket_code || ticket?.id || '—';
}

/**
 * Raise new support ticket — category, subject, message, attachments.
 */
export function RaiseTicketModal({
  visible,
  onClose,
  onSuccess,
  testID,
}: RaiseTicketModalProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(
    null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const { control, handleSubmit, reset, setValue, watch } =
    useForm<RaiseTicketForm>({
      resolver: zodResolver(raiseTicketSchema),
      defaultValues: {
        category: undefined as unknown as RaiseTicketForm['category'],
        subject: '',
        message: '',
        attachments: [],
      },
    });

  const attachments = watch('attachments') || [];

  useEffect(() => {
    if (!visible) {
      return;
    }
    setApiError(null);
    setAttachError(null);
    setSucceeded(false);
    setSubmittedTicketId(null);
    setSubmitting(false);
    setPickerOpen(false);
    reset({
      category: undefined as unknown as RaiseTicketForm['category'],
      subject: '',
      message: '',
      attachments: [],
    });
  }, [visible, reset]);

  const finishSuccess = () => {
    setSucceeded(false);
    setSubmittedTicketId(null);
    onClose();
    onSuccess?.();
  };

  const addFiles = (files: PickedFile[]) => {
    setAttachError(null);
    const next = [...attachments];
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS) {
        setAttachError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
        break;
      }
      const err = validatePicked(file);
      if (err) {
        setAttachError(err);
        continue;
      }
      next.push(file);
    }
    setValue('attachments', next, { shouldValidate: true });
  };

  const removeAttachment = (index: number) => {
    const next = attachments.filter((_, i) => i !== index);
    setValue('attachments', next, { shouldValidate: true });
    setAttachError(null);
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
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setAttachError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
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
    addFiles(
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
    addFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        type: normalizeMime(asset.mimeType, asset.name),
        size: asset.size,
      }))
    );
  };

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null);
    setSubmitting(true);
    try {
      const payloadAttachments: FileUploadAsset[] = (values.attachments || []).map(
        (file) => ({
          uri: file.uri,
          name: file.name,
          type: file.type,
        })
      );
      const data = await supportService.createTicket({
        category: values.category,
        subject: values.subject.trim(),
        message: values.message.trim(),
        attachments: payloadAttachments.length
          ? payloadAttachments
          : undefined,
      });
      const code = ticketCodeFromResponse(data as { ticket?: { ticket_id?: string; ticket_code?: string; id?: string } });
      setSubmittedTicketId(code);
      setSucceeded(true);
    } catch (err) {
      setApiError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to submit support ticket'
      );
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (submitting) {
          return;
        }
        if (succeeded) {
          finishSuccess();
          return;
        }
        onClose();
      }}
      heightRatio={0.92}
      testID={testID}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.md }}
      >
        {succeeded && submittedTicketId ? (
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Ticket submitted
            </Text>
            <Text
              style={[
                typography.title,
                {
                  color: colors.secondary,
                  fontWeight: '700',
                  textAlign: 'center',
                },
              ]}
              selectable
            >
              {submittedTicketId}
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {`Your ticket [${submittedTicketId}] has been submitted. We'll respond within 24-48 hours.`}
            </Text>
            <Button title="Done" variant="golden" onPress={finishSuccess} />
          </View>
        ) : (
          <>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Raise New Ticket
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Describe your issue clearly. Attachments: JPG, PNG, or PDF (max{' '}
              {MAX_FILE_SIZE_MB}MB each, up to {MAX_ATTACHMENTS} files).
            </Text>

            <FormSelect
              control={control}
              name="category"
              label="Category"
              placeholder="Select category"
              options={[...CATEGORY_OPTIONS]}
            />
            <FormInput
              control={control}
              name="subject"
              label="Subject"
              placeholder="Brief summary of your issue"
              autoCapitalize="sentences"
            />
            <FormTextArea
              control={control}
              name="message"
              label="Message"
              placeholder="Describe your issue in detail (min 20 characters)"
              numberOfLines={5}
            />

            <View style={{ gap: spacing.sm }}>
              <Text
                style={[typography.label, { color: colors.text.primary }]}
              >
                Attachments (optional)
              </Text>
              <Pressable
                disabled={submitting || attachments.length >= MAX_ATTACHMENTS}
                onPress={() => setPickerOpen(true)}
                style={[
                  styles.attachTrigger,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.md,
                    opacity:
                      submitting || attachments.length >= MAX_ATTACHMENTS
                        ? 0.6
                        : 1,
                  },
                ]}
              >
                <Ionicons
                  name="attach-outline"
                  size={20}
                  color={colors.secondary}
                />
                <Text
                  style={[typography.body, { color: colors.text.secondary }]}
                >
                  Add files ({attachments.length}/{MAX_ATTACHMENTS})
                </Text>
              </Pressable>

              {attachments.length > 0 ? (
                <View style={styles.previewGrid}>
                  {attachments.map((file, index) => (
                    <View
                      key={`${file.uri}-${index}`}
                      style={[
                        styles.previewCard,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                          borderRadius: borderRadius.md,
                        },
                      ]}
                    >
                      {isImageFile(file) ? (
                        <Image
                          source={{ uri: file.uri }}
                          style={styles.previewImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.pdfPreview,
                            { backgroundColor: colors.surface },
                          ]}
                        >
                          <Ionicons
                            name="document-text-outline"
                            size={28}
                            color={colors.secondary}
                          />
                        </View>
                      )}
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.text.primary, paddingHorizontal: 6 },
                        ]}
                        numberOfLines={1}
                      >
                        {file.name}
                      </Text>
                      <Pressable
                        onPress={() => removeAttachment(index)}
                        hitSlop={8}
                        style={styles.removeBtn}
                      >
                        <Text
                          style={[
                            typography.caption,
                            { color: colors.error, fontWeight: '600' },
                          ]}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {attachError ? (
                <Text style={[typography.caption, { color: colors.error }]}>
                  {attachError}
                </Text>
              ) : null}
            </View>

            {apiError ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {apiError}
              </Text>
            ) : null}

            <Button
              title="Submit Ticket"
              variant="golden"
              loading={submitting}
              onPress={() => {
                void onSubmit();
              }}
            />
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        heightRatio={0.36}
      >
        <Text
          style={[
            typography.title,
            { color: colors.text.primary, marginBottom: spacing.md },
          ]}
        >
          Choose source
        </Text>
        <Pressable
          onPress={() => {
            void pickFromLibrary();
          }}
          style={[
            styles.sheetAction,
            {
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>
            Photo library
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void pickDocuments();
          }}
          style={[
            styles.sheetAction,
            {
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
              marginTop: spacing.sm,
            },
          ]}
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>
            Documents (JPG / PNG / PDF)
          </Text>
        </Pressable>
      </BottomSheet>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  attachTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewCard: {
    width: '47%',
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 8,
    gap: 6,
  },
  previewImage: {
    width: '100%',
    height: 88,
  },
  pdfPreview: {
    width: '100%',
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    alignSelf: 'center',
  },
  sheetAction: {
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
});
