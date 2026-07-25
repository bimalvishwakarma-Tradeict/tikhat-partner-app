import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { toast } from '../ui/Toast';

export type AttachmentViewerItem = {
  id?: string;
  uri: string;
  name?: string;
  mimeType?: string;
};

export type AttachmentViewerProps = {
  visible: boolean;
  attachments: AttachmentViewerItem[];
  initialIndex?: number;
  onClose: () => void;
  testID?: string;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function isImageAttachment(item: AttachmentViewerItem): boolean {
  const mime = (item.mimeType || '').toLowerCase();
  const name = (item.name || item.uri || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (mime.includes('pdf')) return false;
  return /\.(jpe?g|png|gif|webp)$/i.test(name);
}

function isPdfAttachment(item: AttachmentViewerItem): boolean {
  const mime = (item.mimeType || '').toLowerCase();
  const name = (item.name || item.uri || '').toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

function ZoomableImage({
  uri,
  onLoadStart,
  onLoadEnd,
  onError,
}: {
  uri: string;
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onError: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  }, [uri, scale, savedScale, translateX, translateY, savedX, savedY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(4, Math.max(1, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.zoomWrap, animatedStyle]}>
        <Image
          source={{ uri }}
          style={styles.fullImage}
          resizeMode="contain"
          onLoadStart={onLoadStart}
          onLoad={onLoadEnd}
          onError={onError}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Full-screen attachment gallery — images (pinch-zoom), PDFs, download.
 */
export function AttachmentViewer({
  visible,
  attachments,
  initialIndex = 0,
  onClose,
  testID,
}: AttachmentViewerProps) {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AttachmentViewerItem>>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const safeAttachments = useMemo(
    () => attachments.filter((a) => Boolean(a?.uri)),
    [attachments]
  );

  const current = safeAttachments[index] || null;

  useEffect(() => {
    if (!current) {
      return;
    }
    if (!isImageAttachment(current)) {
      setLoading(false);
      setError(false);
    }
  }, [current]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const start = Math.min(
      Math.max(0, initialIndex),
      Math.max(0, safeAttachments.length - 1)
    );
    setIndex(start);
    setLoading(true);
    setError(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: start, animated: false });
    });
  }, [visible, initialIndex, safeAttachments.length]);

  const onMomentumEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== index && next >= 0 && next < safeAttachments.length) {
      setIndex(next);
      setLoading(true);
      setError(false);
    }
  };

  const openExternal = useCallback(async (uri: string) => {
    try {
      const can = await Linking.canOpenURL(uri);
      if (!can) {
        toast.error('Could not load attachment');
        return;
      }
      await Linking.openURL(uri);
    } catch {
      toast.error('Could not load attachment');
    }
  }, []);

  const downloadCurrent = useCallback(async () => {
    if (!current?.uri) {
      return;
    }
    setDownloading(true);
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const anchor = document.createElement('a');
        anchor.href = current.uri;
        anchor.download = current.name || 'attachment';
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        toast.success('Download started');
      } else {
        await Share.share({
          url: current.uri,
          message: current.name || current.uri,
          title: current.name || 'Attachment',
        });
      }
    } catch {
      try {
        await openExternal(current.uri);
      } catch {
        toast.error('Could not download attachment');
      }
    } finally {
      setDownloading(false);
    }
  }, [current, openExternal]);

  const renderItem = ({
    item,
  }: ListRenderItemInfo<AttachmentViewerItem>) => {
    const image = isImageAttachment(item);
    const pdf = isPdfAttachment(item);

    if (image) {
      return (
        <View style={styles.page}>
          <ZoomableImage
            uri={item.uri}
            onLoadStart={() => {
              setLoading(true);
              setError(false);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        </View>
      );
    }

    return (
      <View style={[styles.page, styles.pdfPage]}>
        <Ionicons
          name={pdf ? 'document-text-outline' : 'attach-outline'}
          size={64}
          color={colors.secondary}
        />
        <Text
          style={[
            typography.title,
            {
              color: colors.text.inverse,
              marginTop: spacing.md,
              textAlign: 'center',
              paddingHorizontal: spacing.lg,
            },
          ]}
          numberOfLines={3}
        >
          {item.name || (pdf ? 'PDF document' : 'Attachment')}
        </Text>
        <Text
          style={[
            typography.body,
            {
              color: colors.text.secondary,
              marginTop: spacing.sm,
              textAlign: 'center',
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
          {pdf
            ? 'Open in your device PDF viewer to read this file.'
            : 'Open this file with a compatible app.'}
        </Text>
        <Pressable
          onPress={() => {
            void openExternal(item.uri);
          }}
          style={[
            styles.openPdfBtn,
            {
              backgroundColor: colors.secondary,
              marginTop: spacing.lg,
            },
          ]}
        >
          <Text style={[typography.button, { color: colors.primary }]}>
            {pdf ? 'Open PDF' : 'Open file'}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[styles.root, { backgroundColor: colors.primary }]}
        testID={testID}
      >
        <View
          style={[
            styles.toolbar,
            {
              paddingTop: insets.top + 8,
              paddingBottom: 8,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Pressable onPress={onClose} hitSlop={12} style={styles.toolBtn}>
            <Ionicons name="close" size={28} color={colors.text.inverse} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.inverse, fontWeight: '600' },
              ]}
              numberOfLines={1}
            >
              {current?.name || 'Attachment'}
            </Text>
            {safeAttachments.length > 1 ? (
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                {index + 1} / {safeAttachments.length}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              void downloadCurrent();
            }}
            hitSlop={12}
            style={styles.toolBtn}
            disabled={downloading || !current}
          >
            {downloading ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Ionicons
                name="download-outline"
                size={26}
                color={colors.text.inverse}
              />
            )}
          </Pressable>
        </View>

        <View style={styles.body}>
          {safeAttachments.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={[typography.body, { color: colors.text.inverse }]}>
                Could not load attachment
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={safeAttachments}
              keyExtractor={(item, i) => item.id || `${item.uri}-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              getItemLayout={(_, i) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * i,
                index: i,
              })}
              onScrollToIndexFailed={({ index: failedIndex }) => {
                setTimeout(() => {
                  listRef.current?.scrollToIndex({
                    index: failedIndex,
                    animated: false,
                  });
                }, 50);
              }}
              renderItem={renderItem}
            />
          )}

          {loading && current && isImageAttachment(current) && !error ? (
            <View style={styles.overlayCenter} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.secondary} />
            </View>
          ) : null}

          {error ? (
            <View style={styles.overlayCenter}>
              <Text style={[typography.body, { color: colors.text.inverse }]}>
                Could not load attachment
              </Text>
              <Pressable
                onPress={() => {
                  if (current?.uri) {
                    void openExternal(current.uri);
                  }
                }}
                style={{ marginTop: spacing.md }}
              >
                <Text style={[typography.subtitle, { color: colors.secondary }]}>
                  Try opening externally
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  toolBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfPage: {
    paddingHorizontal: 24,
  },
  zoomWrap: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  openPdfBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
