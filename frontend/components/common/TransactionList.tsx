import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import {
  TransactionItem,
  type TransactionListItem,
} from '../cards/TransactionItem';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

export type TransactionListProps = {
  items?: TransactionListItem[];
  loading?: boolean;
  /** True while fetching the next page (mobile infinite scroll) */
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** 1-based page index for web pagination */
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onItemPress?: (item: TransactionListItem) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function TransactionSkeletonList() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing?.md, paddingVertical: spacing?.sm }}>
      {(Array.from({ length: 5 }) ?? []).map((_, index) => (
        <View key={`txn-skel-${index}`} style={{ gap: spacing?.sm }}>
          <Skeleton width="30%" height={12} />
          <Skeleton width="70%" height={16} />
          <Skeleton width="45%" height={12} />
        </View>
      ))}
    </View>
  );
}

export function TransactionList({
  items = [],
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  page = 1,
  totalPages = 1,
  onPageChange,
  onItemPress,
  emptyTitle = 'No transactions yet',
  emptySubtitle = 'Your capital and revenue activity will appear here.',
  style,
  testID,
}: TransactionListProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const isWeb = Platform.OS === 'web';
  const safeItems = Array.isArray(items) ? items : [];

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const total = Math.max(1, totalPages ?? 1);
    const current = Math.min(Math.max(1, page ?? 1), total);
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    for (let p = start; p <= end; p += 1) {
      pages.push(p);
    }
    return pages;
  }, [page, totalPages]);

  if (loading && (safeItems ?? []).length === 0) {
    return (
      <View testID={testID} style={style}>
        <TransactionSkeletonList />
      </View>
    );
  }

  if (!loading && (safeItems ?? []).length === 0) {
    return (
      <View testID={testID} style={style}>
        <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, style]}>
      <FlatList
        data={safeItems ?? []}
        keyExtractor={(item, index) => item?.id ?? `txn-${index}`}
        renderItem={({ item }) =>
          item ? (
            <TransactionItem
              item={item}
              onPress={onItemPress ? () => onItemPress(item) : undefined}
            />
          ) : null
        }
        scrollEnabled={!isWeb}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (!isWeb && hasMore && !loadingMore) {
            onLoadMore?.();
          }
        }}
        ListFooterComponent={
          !isWeb && loadingMore ? (
            <View style={{ paddingVertical: spacing?.md }}>
              <ActivityIndicator color={colors?.secondary} />
            </View>
          ) : null
        }
      />

      {isWeb && (totalPages ?? 1) > 1 ? (
        <View
          style={[
            styles.pagination,
            {
              borderTopColor: colors?.border,
              paddingTop: spacing?.md,
              marginTop: spacing?.sm,
              gap: spacing?.xs,
            },
          ]}
        >
          <Pressable
            disabled={(page ?? 1) <= 1}
            onPress={() => onPageChange?.((page ?? 1) - 1)}
            style={[
              styles.pageBtn,
              {
                borderColor: colors?.border,
                borderRadius: borderRadius?.sm,
                opacity: (page ?? 1) <= 1 ? 0.4 : 1,
              },
            ]}
          >
            <Text
              style={[typography?.subtitle, { color: colors?.text?.primary }]}
            >
              Prev
            </Text>
          </Pressable>

          {(pageNumbers ?? []).map((p) => {
            const active = p === page;
            return (
              <Pressable
                key={`page-${p}`}
                onPress={() => onPageChange?.(p)}
                style={[
                  styles.pageBtn,
                  {
                    borderColor: active ? colors?.secondary : colors?.border,
                    backgroundColor: active ? colors?.surface : 'transparent',
                    borderRadius: borderRadius?.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    typography?.subtitle,
                    {
                      color: active
                        ? colors?.secondary
                        : colors?.text?.primary,
                      fontWeight: active ? '700' : '400',
                    },
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            disabled={(page ?? 1) >= (totalPages ?? 1)}
            onPress={() => onPageChange?.((page ?? 1) + 1)}
            style={[
              styles.pageBtn,
              {
                borderColor: colors?.border,
                borderRadius: borderRadius?.sm,
                opacity: (page ?? 1) >= (totalPages ?? 1) ? 0.4 : 1,
              },
            ]}
          >
            <Text
              style={[typography?.subtitle, { color: colors?.text?.primary }]}
            >
              Next
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pageBtn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
