import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services/auth.service';
import { formatDate } from '../../utils/formatDate';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ApiClientError } from '../../types/api.types';

type LegalDoc = {
  content: string;
  version?: number | null;
  updated_at?: string | null;
};

function parseLegalPayload(data: unknown): LegalDoc {
  if (typeof data === 'string') {
    return { content: data, updated_at: null };
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    return {
      content: String(obj.content ?? ''),
      version: typeof obj.version === 'number' ? obj.version : null,
      updated_at:
        typeof obj.updated_at === 'string'
          ? obj.updated_at
          : obj.updated_at
            ? String(obj.updated_at)
            : null,
    };
  }
  return { content: '', updated_at: null };
}

function renderContentBlocks(
  content: string,
  colors: { text: { primary: string; secondary: string }; secondary: string },
  typography: {
    h3: object;
    body: object;
  },
  spacing: { sm: number; md: number }
) {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return (
      <Text style={[typography.body, { color: colors.text.secondary }]}>
        No content available.
      </Text>
    );
  }

  return blocks.map((block, index) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const first = lines[0] || '';
    const isHeading =
      first.startsWith('#') ||
      (first.length < 80 &&
        lines.length === 1 &&
        /^[A-Z0-9][A-Z0-9\s\-&,.:]+$/.test(first));

    if (isHeading) {
      const heading = first.replace(/^#+\s*/, '');
      return (
        <Text
          key={`h-${index}`}
          style={[
            typography.h3,
            {
              color: colors.text.primary,
              marginTop: index === 0 ? 0 : spacing.md,
              marginBottom: spacing.sm,
            },
          ]}
        >
          {heading}
        </Text>
      );
    }

    return (
      <Text
        key={`p-${index}`}
        style={[
          typography.body,
          {
            color: colors.text.secondary,
            marginBottom: spacing.md,
            lineHeight: 24,
          },
        ]}
      >
        {lines.join('\n')}
      </Text>
    );
  });
}

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<LegalDoc | null>(null);

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.getPrivacy();
      setDoc(parseLegalPayload(data));
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load document. Please try again.';
      setError(message);
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDoc();
  }, [fetchDoc]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.md,
        },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[typography.subtitle, { color: colors.secondary }]}>
            ← Back
          </Text>
        </Pressable>
        <Text
          style={[
            typography.h2,
            { color: colors.text.primary, marginTop: spacing.sm },
          ]}
        >
          Privacy Policy
        </Text>
        {doc?.updated_at && !loading ? (
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginTop: spacing.xs },
            ]}
          >
            Last updated: {formatDate(doc.updated_at)}
            {doc.version ? ` · Version ${doc.version}` : ''}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton width="40%" height={18} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="92%" height={14} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="88%" height={14} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="70%" height={14} />
        </View>
      ) : error ? (
        <View
          style={{
            flex: 1,
            padding: spacing.lg,
            justifyContent: 'center',
            gap: spacing.md,
          }}
        >
          <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
          <Button title="Retry" onPress={fetchDoc} variant="golden" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
          }}
        >
          {renderContentBlocks(
            doc?.content || '',
            colors,
            typography,
            spacing
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
