import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../hooks/useTheme';
import { supportService } from '../../../services/support.service';
import { ApiClientError } from '../../../types/api.types';
import type { SupportTicket } from '../../../types/models.types';
import { formatDate } from '../../../utils/formatDate';
import { RaiseTicketModal } from '../../../components/modals/RaiseTicketModal';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

type TicketRow = SupportTicket & {
  ticket_id?: string;
  category_label?: string;
  created_at_formatted?: string | null;
};

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

function ticketCode(ticket: TicketRow): string {
  return ticket.ticket_id || ticket.ticket_code || ticket.id;
}

function categoryLabel(ticket: TicketRow): string {
  if (ticket.category_label) {
    return ticket.category_label;
  }
  return String(ticket.category || 'general')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await supportService.listTickets({
          status: filter === 'all' ? undefined : filter,
          page: 1,
          limit: 50,
        });
        setTickets((data.tickets || []) as TicketRow[]);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load support tickets'
        );
        setTickets([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const emptyCopy = useMemo(
    () =>
      filter === 'all'
        ? {
            title: 'No tickets yet. Raise a ticket to get help.',
            subtitle: undefined as string | undefined,
          }
        : {
            title: 'No tickets found',
            subtitle: 'No tickets match this filter.',
          },
    [filter]
  );

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
      <Button
        title="Raise New Ticket"
        variant="golden"
        onPress={() => setRaiseOpen(true)}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                styles.filterChip,
                {
                  borderColor: active ? colors.secondary : colors.border,
                  backgroundColor: active ? colors.surface : colors.background,
                  borderRadius: borderRadius.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  {
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
      </ScrollView>

      {error ? (
        <Text style={[typography.caption, { color: colors.error }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {loading && tickets.length === 0 ? (
        <View style={{ padding: spacing.md }}>
          {renderHeader()}
          <Skeleton height={88} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={88} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={88} />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id || ticketCode(item)}
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xl,
            flexGrow: 1,
          }}
          ListHeaderComponent={renderHeader}
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
          renderItem={({ item }) => {
            const code = ticketCode(item);
            const created =
              item.created_at_formatted ||
              (item.created_at ? formatDate(item.created_at) : '—');
            const updated = item.updated_at
              ? formatDate(item.updated_at)
              : created;

            return (
              <Pressable
                onPress={() => {
                  router.push(`/(partner)/support/${item.id}` as Href);
                }}
                style={[
                  styles.ticketCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    borderRadius: borderRadius.lg,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                  },
                ]}
              >
                <View style={styles.ticketTop}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.secondary, fontWeight: '700' },
                    ]}
                    selectable
                  >
                    {code}
                  </Text>
                  <StatusChip status={item.status} />
                </View>

                <View style={{ marginTop: spacing.xs }}>
                  <Badge label={categoryLabel(item)} variant="default" />
                </View>

                <Text
                  style={[
                    typography.body,
                    {
                      color: colors.text.primary,
                      fontWeight: '600',
                      marginTop: spacing.sm,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {item.subject}
                </Text>

                <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
                  <Text
                    style={[typography.caption, { color: colors.text.secondary }]}
                  >
                    Created: {created}
                  </Text>
                  <Text
                    style={[typography.caption, { color: colors.text.secondary }]}
                  >
                    Updated: {updated}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState title={emptyCopy.title} subtitle={emptyCopy.subtitle} />
          }
        />
      )}

      <RaiseTicketModal
        visible={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        onSuccess={() => {
          void load(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterChip: {
    borderWidth: 1,
  },
  ticketCard: {
    borderWidth: 1,
  },
  ticketTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
});
