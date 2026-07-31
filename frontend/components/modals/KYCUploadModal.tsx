import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { MAX_FILE_SIZE_MB } from '../../constants';
import { apiClient, toApiClientError } from '../../services/api';
import { profileService } from '../../services/profile.service';
import { ApiClientError } from '../../types/api.types';
import type { Investor } from '../../types/models.types';
import type { PickedFile } from '../../utils/validationSchemas';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';

export type KycDocKey =
  | 'pan_front'
  | 'pan_back'
  | 'aadhar_front'
  | 'aadhar_back';

export type KYCUploadModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  profile?: Investor | null;
  /** Prefer opening on documents or photo section */
  initialTab?: 'documents' | 'photo';
  testID?: string;
};

type SlotStatus = 'idle' | 'ready' | 'uploading' | 'done' | 'error';

type DocSlot = {
  file: PickedFile | null;
  status: SlotStatus;
  error: string | null;
};

const DOC_SLOTS: Array<{ key: KycDocKey; label: string }> = [
  { key: 'pan_front', label: 'PAN front' },
  { key: 'pan_back', label: 'PAN back' },
  { key: 'aadhar_front', label: 'Aadhar front' },
  { key: 'aadhar_back', label: 'Aadhar back' },
];

const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|pdf)$/i;

function emptySlots(): Record<KycDocKey, DocSlot> {
  return {
    pan_front: { file: null, status: 'idle', error: null },
    pan_back: { file: null, status: 'idle', error: null },
    aadhar_front: { file: null, status: 'idle', error: null },
    aadhar_back: { file: null, status: 'idle', error: null },
  };
}

function normalizeMime(mime?: string | null, name?: string): string {
  const raw = (mime || '').toLowerCase().trim();
  if (raw === 'image/jpg') {
    return 'image/jpeg';
  }
  if (raw && raw !== 'application/octet-stream') {
    return raw;
  }
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return raw || 'image/jpeg';
}

function extensionForMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

function ensureFileName(name: string | undefined, mime: string, key: string): string {
  const base = (name || key).trim() || key;
  if (ALLOWED_EXT.test(base)) {
    return base;
  }
  return `${base.replace(/\.[^/.]+$/, '') || key}.${extensionForMime(mime)}`;
}

function toUploadUri(uri: string): string {
  if (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('blob:') ||
    uri.startsWith('data:')
  ) {
    return uri;
  }
  return `file://${uri}`;
}

/**
 * Append a picked file to FormData in a React Native–compatible shape.
 */
async function appendPickedFile(
  form: FormData,
  field: string,
  file: PickedFile
): Promise<void> {
  const type = normalizeMime(file.type, file.name);
  const name = ensureFileName(file.name, type, field);
  const uri = toUploadUri(file.uri);

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    form.append(field, blob, name);
    return;
  }

  form.append(field, {
    uri,
    name,
    type,
  } as unknown as Blob);
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
    return `File too large (${Math.ceil(file.size / (1024 * 1024))}MB). Max ${MAX_FILE_SIZE_MB}MB.`;
  }
  return null;
}

function isPdf(file: PickedFile | null): boolean {
  if (!file) return false;
  return (
    file.type.toLowerCase().includes('pdf') ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

/**
 * KYC document + profile photo upload bottom sheet.
 */
export function KYCUploadModal({
  visible,
  onClose,
  onSuccess,
  profile,
  initialTab = 'documents',
  testID,
}: KYCUploadModalProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [tab, setTab] = useState<'documents' | 'photo'>(initialTab);
  const [slots, setSlots] = useState(emptySlots);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [photoPreview, setPhotoPreview] = useState<PickedFile | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<KycDocKey | 'photo' | null>(
    null
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setTab(initialTab);
    setSlots(emptySlots());
    setDocsError(null);
    setPhotoPreview(null);
    setPhotoError(null);
    setUploadingDocs(false);
    setUploadingPhoto(false);
    setPickerOpen(null);
  }, [visible, initialTab]);

  const setSlotFile = (key: KycDocKey, file: PickedFile | null, error: string | null) => {
    setSlots((prev) => ({
      ...prev,
      [key]: {
        file: error ? null : file,
        status: error ? 'error' : file ? 'ready' : 'idle',
        error,
      },
    }));
  };

  const applyPicked = (key: KycDocKey | 'photo', files: PickedFile[]) => {
    const file = files[0];
    if (!file) {
      return;
    }
    const err = validatePicked(file);
    if (key === 'photo') {
      if (err) {
        setPhotoError(err);
        setPhotoPreview(null);
        return;
      }
      if (isPdf(file)) {
        setPhotoError('Profile photo must be JPG or PNG.');
        setPhotoPreview(null);
        return;
      }
      setPhotoError(null);
      setPhotoPreview(file);
      return;
    }
    setSlotFile(key, err ? null : file, err);
  };

  const pickFromLibrary = async (key: KycDocKey | 'photo') => {
    setPickerOpen(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to upload files.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: key === 'photo',
      aspect: key === 'photo' ? [1, 1] : undefined,
    });
    if (result.canceled || !result.assets?.[0]) {
      return;
    }
    const asset = result.assets[0];
    applyPicked(key, [
      {
        uri: asset.uri,
        name:
          asset.fileName ||
          `image-${Date.now()}.${asset.uri.split('.').pop() || 'jpg'}`,
        type: normalizeMime(asset.mimeType, asset.fileName || asset.uri),
        size: asset.fileSize,
      },
    ]);
  };

  const pickFromCamera = async () => {
    setPickerOpen(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) {
      return;
    }
    const asset = result.assets[0];
    applyPicked('photo', [
      {
        uri: asset.uri,
        name: asset.fileName || `camera-${Date.now()}.jpg`,
        type: normalizeMime(asset.mimeType, asset.fileName || asset.uri),
        size: asset.fileSize,
      },
    ]);
  };

  const pickDocument = async (key: KycDocKey) => {
    setPickerOpen(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) {
      return;
    }
    const asset = result.assets[0];
    applyPicked(key, [
      {
        uri: asset.uri,
        name: asset.name,
        type: normalizeMime(asset.mimeType, asset.name),
        size: asset.size,
      },
    ]);
  };

  const uploadDocuments = async () => {
    // Validate from slot state (previewed files), not FormData — at least 1 required
    const payloadKeys = (Object.keys(slots) as KycDocKey[]).filter((key) => {
      const slot = slots[key];
      return Boolean(slot.file?.uri) && slot.status !== 'uploading';
    });

    if (payloadKeys.length === 0) {
      setDocsError('Select at least one document to upload.');
      return;
    }

    setDocsError(null);
    setUploadingDocs(true);
    setSlots((prev) => {
      const next = { ...prev };
      payloadKeys.forEach((key) => {
        next[key] = { ...next[key], status: 'uploading', error: null };
      });
      return next;
    });

    try {
      const form = new FormData();
      let appended = 0;
      for (const key of payloadKeys) {
        const file = slots[key].file;
        if (!file?.uri) {
          continue;
        }
        const type = normalizeMime(file.type, file.name);
        await appendPickedFile(form, key, {
          uri: file.uri,
          name: ensureFileName(file.name, type, key),
          type,
          size: file.size,
        });
        appended += 1;
      }

      if (appended === 0) {
        setDocsError('Select at least one document to upload.');
        setSlots((prev) => {
          const next = { ...prev };
          payloadKeys.forEach((key) => {
            next[key] = {
              ...next[key],
              status: next[key].file ? 'ready' : 'idle',
              error: null,
            };
          });
          return next;
        });
        return;
      }

      await apiClient.post('/api/v1/investor/profile/documents', form, {
        headers: {
          Accept: 'application/json',
        },
        transformRequest: [
          (data, headers) => {
            // Do not force Content-Type — runtime must set multipart boundary
            if (headers && typeof headers === 'object') {
              delete (headers as Record<string, unknown>)['Content-Type'];
            }
            return data;
          },
        ],
      });

      setSlots((prev) => {
        const next = { ...prev };
        payloadKeys.forEach((key) => {
          next[key] = { ...next[key], status: 'done', error: null };
        });
        return next;
      });
      toast.success('KYC documents uploaded successfully');
      onSuccess?.();
    } catch (err) {
      const normalized = toApiClientError(err);
      const message =
        normalized instanceof ApiClientError
          ? normalized.message
          : 'Failed to upload KYC documents';
      setDocsError(message);
      setSlots((prev) => {
        const next = { ...prev };
        payloadKeys.forEach((key) => {
          next[key] = { ...next[key], status: 'error', error: message };
        });
        return next;
      });
    } finally {
      setUploadingDocs(false);
    }
  };

  const savePhoto = async () => {
    if (!photoPreview) {
      setPhotoError('Choose a photo first.');
      return;
    }
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      await profileService.uploadPhoto({
        uri: photoPreview.uri,
        name: photoPreview.name,
        type: photoPreview.type,
      });
      toast.success('Profile photo updated');
      setPhotoPreview(null);
      onSuccess?.();
    } catch (err) {
      setPhotoError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to upload profile photo'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const existingLabel = (key: KycDocKey): string | null => {
    if (!profile) return null;
    const map: Record<KycDocKey, string | null | undefined> = {
      pan_front: profile.pan_front_url,
      pan_back: profile.pan_back_url,
      aadhar_front: profile.aadhar_front_url,
      aadhar_back: profile.aadhar_back_url,
    };
    return map[key] ? 'On file' : null;
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (uploadingDocs || uploadingPhoto) return;
        onClose();
      }}
      heightRatio={0.9}
      testID={testID}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.md }}
      >
        <Text style={[typography.h3, { color: colors.text.primary }]}>
          Uploads
        </Text>

        <View style={[styles.tabRow, { gap: spacing.sm }]}>
          {(
            [
              { key: 'documents' as const, label: 'KYC documents' },
              { key: 'photo' as const, label: 'Profile photo' },
            ] as const
          ).map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[
                  styles.tab,
                  {
                    flex: 1,
                    borderColor: active ? colors.secondary : colors.border,
                    backgroundColor: active ? colors.surface : colors.background,
                    borderRadius: borderRadius.md,
                    paddingVertical: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      textAlign: 'center',
                      color: active ? colors.secondary : colors.text.secondary,
                      fontWeight: active ? '700' : '500',
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'documents' ? (
          <>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              JPG, PNG, or PDF · max {MAX_FILE_SIZE_MB}MB each
            </Text>
            {DOC_SLOTS.map((slot) => {
              const state = slots[slot.key];
              const existing = existingLabel(slot.key);
              return (
                <View
                  key={slot.key}
                  style={[
                    styles.slotCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      borderRadius: borderRadius.md,
                      padding: spacing.sm,
                    },
                  ]}
                >
                  <View style={styles.slotHeader}>
                    <Text
                      style={[
                        typography.subtitle,
                        { color: colors.text.primary, fontWeight: '600' },
                      ]}
                    >
                      {slot.label}
                    </Text>
                    {state.status === 'uploading' ? (
                      <ActivityIndicator color={colors.secondary} />
                    ) : state.status === 'done' ? (
                      <Text
                        style={[typography.caption, { color: colors.success }]}
                      >
                        Uploaded
                      </Text>
                    ) : existing ? (
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.text.secondary },
                        ]}
                      >
                        {existing}
                      </Text>
                    ) : null}
                  </View>

                  {state.file ? (
                    <View style={[styles.previewRow, { marginTop: spacing.sm }]}>
                      {isPdf(state.file) ? (
                        <View
                          style={[
                            styles.pdfBox,
                            {
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name="document-text"
                            size={28}
                            color={colors.secondary}
                          />
                        </View>
                      ) : (
                        <Image
                          source={{ uri: state.file.uri }}
                          style={styles.thumb}
                          resizeMode="cover"
                        />
                      )}
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text
                          style={[
                            typography.caption,
                            { color: colors.text.primary },
                          ]}
                          numberOfLines={2}
                        >
                          {state.file.name}
                        </Text>
                        <Pressable
                          onPress={() => setSlotFile(slot.key, null, null)}
                          hitSlop={6}
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
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setPickerOpen(slot.key)}
                      style={[
                        styles.pickBtn,
                        {
                          borderColor: colors.border,
                          borderRadius: borderRadius.md,
                          marginTop: spacing.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.body,
                          { color: colors.text.secondary, textAlign: 'center' },
                        ]}
                      >
                        Tap to select file
                      </Text>
                    </Pressable>
                  )}

                  {state.error ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.error, marginTop: spacing.xs },
                      ]}
                    >
                      {state.error}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            {docsError ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {docsError}
              </Text>
            ) : null}

            <Button
              title="Upload documents"
              variant="golden"
              loading={uploadingDocs}
              onPress={() => {
                void uploadDocuments();
              }}
            />
          </>
        ) : (
          <>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              Take a photo or choose from gallery. Preview before saving.
            </Text>

            {photoPreview ? (
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <Image
                  source={{ uri: photoPreview.uri }}
                  style={[
                    styles.photoPreview,
                    { borderRadius: borderRadius.lg, borderColor: colors.border },
                  ]}
                  resizeMode="cover"
                />
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  {photoPreview.name}
                </Text>
                <Pressable onPress={() => setPhotoPreview(null)} hitSlop={8}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.error, fontWeight: '600' },
                    ]}
                  >
                    Remove preview
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.photoEmpty,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.lg,
                  },
                ]}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={56}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: spacing.sm },
                  ]}
                >
                  No photo selected
                </Text>
              </View>
            )}

            <View style={[styles.tabRow, { gap: spacing.sm }]}>
              <Button
                title="Camera"
                variant="secondary"
                fullWidth={false}
                onPress={() => {
                  void pickFromCamera();
                }}
                style={styles.halfBtn}
              />
              <Button
                title="Gallery"
                variant="secondary"
                fullWidth={false}
                onPress={() => {
                  void pickFromLibrary('photo');
                }}
                style={styles.halfBtn}
              />
            </View>

            {photoError ? (
              <Text style={[typography.caption, { color: colors.error }]}>
                {photoError}
              </Text>
            ) : null}

            <Button
              title="Save photo"
              variant="golden"
              loading={uploadingPhoto}
              disabled={!photoPreview}
              onPress={() => {
                void savePhoto();
              }}
            />
          </>
        )}

        <Button title="Close" variant="secondary" onPress={onClose} />
      </ScrollView>

      <BottomSheet
        visible={pickerOpen !== null && pickerOpen !== 'photo'}
        onClose={() => setPickerOpen(null)}
        heightRatio={0.34}
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
            if (pickerOpen && pickerOpen !== 'photo') {
              void pickFromLibrary(pickerOpen);
            }
          }}
          style={[
            styles.sourceRow,
            { backgroundColor: colors.surface, borderRadius: borderRadius.md },
          ]}
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>
            Photo library
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (pickerOpen && pickerOpen !== 'photo') {
              void pickDocument(pickerOpen);
            }
          }}
          style={[
            styles.sourceRow,
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
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    borderWidth: 1,
  },
  slotCard: {
    borderWidth: 1,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  pdfBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: {
    width: 180,
    height: 180,
    borderWidth: 1,
  },
  photoEmpty: {
    height: 160,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfBtn: {
    flex: 1,
    minWidth: 0,
  },
  sourceRow: {
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
});
