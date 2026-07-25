import { useCallback, useState } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type PathValue,
} from 'react-hook-form';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../hooks/useTheme';
import { MAX_FILE_SIZE_MB } from '../../constants';
import type { PickedFile } from '../../utils/validationSchemas';
import { BottomSheet } from '../ui/BottomSheet';

export type FormFilePickerProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  /** Allow selecting more than one file (stores array) */
  multiple?: boolean;
  /** Max files when multiple is true */
  maxFiles?: number;
  disabled?: boolean;
  /** Prefer images only (camera roll / image library) */
  imagesOnly?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

const ALLOWED_EXT = /\.(jpe?g|png|pdf)$/i;

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

function isAllowed(file: PickedFile): boolean {
  const mime = file.type.toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'application/pdf' ||
    ALLOWED_EXT.test(file.name)
  );
}

function withinSize(file: PickedFile): boolean {
  if (typeof file.size !== 'number') {
    return true;
  }
  return file.size <= MAX_FILE_SIZE_MB * 1024 * 1024;
}

export function FormFilePicker<T extends FieldValues>({
  control,
  name,
  label = 'Upload file',
  multiple = false,
  maxFiles = 5,
  disabled = false,
  imagesOnly = false,
  containerStyle,
  testID,
}: FormFilePickerProps<T>) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const toSingleOrArray = useCallback(
    (files: PickedFile[], current: unknown): PickedFile | PickedFile[] | undefined => {
      if (multiple) {
        const existing = Array.isArray(current) ? (current as PickedFile[]) : [];
        const merged = [...existing, ...files].slice(0, maxFiles);
        return merged;
      }
      return files[0];
    },
    [maxFiles, multiple]
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const files: PickedFile[] = multiple
          ? Array.isArray(value)
            ? (value as PickedFile[])
            : []
          : value
            ? [value as PickedFile]
            : [];

        const hasError = Boolean(error?.message);

        const applyFiles = (picked: PickedFile[]) => {
          const valid = picked.filter((file) => {
            if (!isAllowed(file)) {
              Alert.alert('Invalid file', 'Only JPG, PNG, or PDF files are allowed.');
              return false;
            }
            if (!withinSize(file)) {
              Alert.alert(
                'File too large',
                `Each file must be ${MAX_FILE_SIZE_MB}MB or smaller.`
              );
              return false;
            }
            return true;
          });
          if (!valid.length) {
            return;
          }
          onChange(
            toSingleOrArray(valid, value) as PathValue<T, FieldPath<T>>
          );
        };

        const pickFromLibrary = async () => {
          setSheetOpen(false);
          const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert(
              'Permission needed',
              'Allow photo library access to upload images.'
            );
            return;
          }

          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: multiple,
            quality: 0.85,
            selectionLimit: multiple ? maxFiles : 1,
          });

          if (result.canceled || !result.assets?.length) {
            return;
          }

          applyFiles(
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

        const pickDocument = async () => {
          setSheetOpen(false);
          const result = await DocumentPicker.getDocumentAsync({
            type: imagesOnly
              ? ['image/jpeg', 'image/png']
              : ['image/jpeg', 'image/png', 'application/pdf'],
            multiple,
            copyToCacheDirectory: true,
          });

          if (result.canceled || !result.assets?.length) {
            return;
          }

          applyFiles(
            result.assets.map((asset) => ({
              uri: asset.uri,
              name: asset.name,
              type: normalizeMime(asset.mimeType, asset.name),
              size: asset.size,
            }))
          );
        };

        const removeAt = (index: number) => {
          if (multiple) {
            const next = files.filter((_, i) => i !== index);
            onChange(
              (next.length ? next : undefined) as PathValue<T, FieldPath<T>>
            );
            return;
          }
          onChange(undefined as PathValue<T, FieldPath<T>>);
        };

        return (
          <View style={[styles.container, containerStyle]} testID={testID}>
            {label ? (
              <Text
                style={[
                  typography.label,
                  { color: colors.text.primary, marginBottom: spacing.xs },
                ]}
              >
                {label}
              </Text>
            ) : null}

            <Pressable
              disabled={disabled}
              onPress={() => setSheetOpen(true)}
              style={[
                styles.trigger,
                {
                  backgroundColor: isDark ? colors.surface : colors.background,
                  borderColor: hasError ? colors.error : colors.border,
                  borderWidth: hasError ? 2 : 1,
                  borderRadius: borderRadius.md,
                  borderStyle: 'dashed',
                  opacity: disabled ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, textAlign: 'center' },
                ]}
              >
                Tap to upload {multiple ? 'files' : 'a file'} (JPG, PNG
                {imagesOnly ? '' : ', PDF'})
              </Text>
            </Pressable>

            {files.map((file, index) => (
              <View
                key={`${file.uri}-${index}`}
                style={[
                  styles.fileRow,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.sm,
                    marginTop: spacing.sm,
                    padding: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.subtitle,
                    { color: colors.text.primary, flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {file.name}
                </Text>
                <Pressable onPress={() => removeAt(index)} hitSlop={8}>
                  <Text style={{ color: colors.error, fontWeight: '600' }}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            ))}

            {hasError ? (
              <Text
                style={[
                  typography.caption,
                  { color: colors.error, marginTop: spacing.xs },
                ]}
              >
                {error?.message}
              </Text>
            ) : null}

            <BottomSheet
              visible={sheetOpen}
              onClose={() => setSheetOpen(false)}
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
                onPress={pickFromLibrary}
                style={[
                  styles.sheetAction,
                  { backgroundColor: colors.surface, borderRadius: borderRadius.md },
                ]}
              >
                <Text style={[typography.body, { color: colors.text.primary }]}>
                  Photo library
                </Text>
              </Pressable>
              {!imagesOnly ? (
                <Pressable
                  onPress={pickDocument}
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
              ) : null}
            </BottomSheet>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  trigger: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetAction: {
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
});
