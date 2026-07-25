import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';
import { supportService } from '../../../services/support.service';
import { adminService } from '../../../services/admin.service';
import { ApiClientError } from '../../../types/api.types';
import type { SupportTicket } from '../../../types/models.types';
import { formatDate } from '../../../utils/formatDate';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';

type TicketRow = SupportTicket & {
  ticket_id?: string;
  category_label?: string;
  assigned_admin_name?: string | null;
  is_escalated?: boolean;
  created_at_formatted?: string | null;
};

type AdminOption = { id: string; full_name: string };

const STATUS_FILTERS = [
  { key: '', label: 'All status' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

const CATEGORY_FILTERS = [
  { key: '', label: 'All categories' },
  { key: 'capital', label: 'Capital' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'withdrawal', label: 'Withdrawal' },
  { key: 'kyc_profile', label: 'KYC/Profile' },
  { key: 'technical', label: 'Technical' },
  { key: 'other', label: 'Other' },
];

const SORT_OPTIONS = [
  { key: 'date:desc', label: 'Newest' },
  { key: 'status:asc', label: 'Status' },
  { key: 'investor_name:asc', label: 'Investor' },
];

function ticketCode(t: TicketRow): string {
  return t.ticket_id || t.ticket_code || t.id;
}

function categoryLabel(t: TicketRow): string {
  if (t.category_label) return t.category_label;
  return String(t.category || '')
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Admin support ticket queue.
 */
export default function AdminSupportIndexScreen() {
  const router = useRouter();
  const { colors, spacing, typography, borderRadius } = useTheme();

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [investorQuery, setInvestorQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('date:desc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [sortBy, sortOrder] = sort.split(':');
        const data = await supportService.listAdminTickets({
          status: status || undefined,
          category: category || undefined,
          assigned_to: assignedTo || undefined,
          investor_name: investorQuery.trim() || undefined,
          date_from: dateFrom.trim() || undefined,
          date_to: dateTo.trim() || undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
          page: 1,
          limit: 50,
        });
        setTickets((data.tickets || []) as TicketRow[]);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load tickets'
        );
        setTickets([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [status, category, assignedTo, investorQuery, dateFrom, dateTo, sort]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const chip = (
    label: string,
    active: boolean,
    onPress: () => void
  ) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.secondary : colors.border,
          backgroundColor: active ? colors.surface : colors.background,
          borderRadius: borderRadius.full,
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
        {label}
      </Text>
    </Pressable>
  );

  const header = useMemo(
    () => (
      <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text.primary }]}>
          Support
        </Text>

        <TextInput
          value={investorQuery}
          onChangeText={setInvestorQuery}
          placeholder="Filter by investor name"
          placeholderTextColor={colors.text.secondary}
          style={[
            typography.body,
            styles.input,
            { borderColor: colors.border, color: colors.text.primary },
          ]}
        />

        <View style={styles.dateRow}>
          <TextInput
            value={dateFrom}
            onChangeText={setDateFrom}
            placeholder="From YYYY-MM-DD"
            placeholderTextColor={colors.text.secondary}
            style={[
              typography.body,
              styles.input,
              { flex: 1, borderColor: colors.border, color: colors.text.primary },
            ]}
          />
          <TextInput
            value={dateTo}
            onChangeText={setDateTo}
            placeholder="To YYYY-MM-DD"
            placeholderTextColor={colors.text.secondary}
            style={[
              typography.body,
              styles.input,
              { flex: 1, borderColor: colors.border, color: colors.text.primary },
            ]}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {STATUS_FILTERS.map((f) =>
              chip(f.label, status === f.key, () => setStatus(f.key))
            )}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CATEGORY_FILTERS.map((f) =>
              chip(f.label, category === f.key, () => setCategory(f.key))
            )}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {chip('Any assignee', assignedTo === '', () => setAssignedTo(''))}
            {admins.map((a) =>
              chip(a.full_name, assignedTo === a.id, () => setAssignedTo(a.id))
            )}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SORT_OPTIONS.map((s) =>
              chip(s.label, sort === s.key, () => setSort(s.key))
            )}
          </View>
        </ScrollView>

        {error ? (
          <Text style={[typography.caption, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>
    ),
    [
      admins,
      assignedTo,
      category,
      colors,
      error,
      investorQuery,
      sort,
      spacing.md,
      status,
      typography,
      borderRadius.full,
      dateFrom,
      dateTo,
    ]
  );

  if (loading && tickets.length === 0) {
    return (
      <View style={{ padding: spacing.md }}>
        {header}
        <Skeleton height={96} style={{ marginBottom: 8 }} />
        <Skeleton height={96} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: spacing.xl,
          flexGrow: 1,
        }}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        renderItem={({ item }) => {
          const escalated = Boolean(item.is_escalated);
          return (
            <Pressable
              onPress={() =>
                router.push(`/(admin)/support/${item.id}` as Href)
              }
              style={[
                styles.card,
                {
                  borderColor: escalated ? colors.error : colors.border,
                  backgroundColor: escalated ? colors.surface : colors.card,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                  borderWidth: escalated ? 2 : 1,
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
                  {ticketCode(item)}
                </Text>
                <StatusChip status={item.status} />
              </View>
              {escalated ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Badge label="ESCALATED" variant="error" />
                </View>
              ) : null}
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.primary,
                    fontWeight: '700',
                    marginTop: spacing.sm,
                  },
                ]}
              >
                {item.investor_name || 'Investor'}
              </Text>
              <View style={{ marginTop: spacing.xs }}>
                <Badge label={categoryLabel(item)} variant="default" />
              </View>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.primary, marginTop: spacing.sm },
                ]}
                numberOfLines={2}
              >
                {item.subject}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: spacing.xs },
                ]}
              >
                Assigned: {item.assigned_admin_name || 'Unassigned'}
              </Text>
              <View style={[styles.rowBetween, { marginTop: spacing.xs }]}>
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Created:{' '}
                  {item.created_at_formatted ||
                    (item.created_at ? formatDate(item.created_at) : '—')}
                </Text>
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Updated:{' '}
                  {item.updated_at ? formatDate(item.updated_at) : '—'}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No tickets"
            subtitle="No support tickets match these filters."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateRow: { flexDirection: 'row', gap: 8 },
  card: {},
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
