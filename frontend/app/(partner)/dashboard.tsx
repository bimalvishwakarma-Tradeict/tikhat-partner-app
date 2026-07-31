import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { capitalService } from '../../services/capital.service';
import { profileService } from '../../services/profile.service';
import type { InvestorDashboard } from '../../types/models.types';
import { BalanceCard } from '../../components/cards/BalanceCard';
import { PortfolioCard } from '../../components/cards/PortfolioCard';
import { ProfileBanner } from '../../components/common/ProfileBanner';
import { AmountDisplay } from '../../components/common/AmountDisplay';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { MonthlyRevenueChart } from '../../components/charts/MonthlyRevenueChart';
import { CapitalGrowthChart } from '../../components/charts/CapitalGrowthChart';
import { ApiClientError } from '../../types/api.types';

const FUND_HREF = '/(partner)/fund' as Href;
const REVENUE_HREF = '/(partner)/revenue' as Href;
const PROFILE_HREF = '/(partner)/profile' as Href;

function DashboardSkeleton() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton width="100%" height={56} borderRadius={12} />
      <Skeleton width="100%" height={120} borderRadius={16} />
      <Skeleton width="100%" height={120} borderRadius={16} />
      <Skeleton width="100%" height={120} borderRadius={16} />
      <Skeleton width="100%" height={160} borderRadius={16} />
      <Skeleton width="100%" height={220} borderRadius={16} />
      <Skeleton width="100%" height={220} borderRadius={16} />
    </View>
  );
}

export default function PartnerDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography } = useTheme();

  const [data, setData] = useState<InvestorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerDismissedLocal, setBannerDismissedLocal] = useState(false);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = (await capitalService.getDashboard()) as InvestorDashboard;
      setData({
        capital_balance: Math.round(Number(result?.capital_balance) || 0),
        capital_balance_formatted: result?.capital_balance_formatted || '₹0',
        revenue_balance: Math.round(Number(result?.revenue_balance) || 0),
        revenue_balance_formatted: result?.revenue_balance_formatted || '₹0',
        total_balance: Math.round(Number(result?.total_balance) || 0),
        total_balance_formatted: result?.total_balance_formatted || '₹0',
        pending_withdrawal: Math.round(Number(result?.pending_withdrawal) || 0),
        pending_withdrawal_formatted:
          result?.pending_withdrawal_formatted || '₹0',
        joining_date: result?.joining_date ?? null,
        partner_since: result?.partner_since ?? null,
        last_5_capital_transactions: Array.isArray(
          result?.last_5_capital_transactions
        )
          ? result.last_5_capital_transactions
          : [],
        last_5_revenue_transactions: Array.isArray(
          result?.last_5_revenue_transactions
        )
          ? result.last_5_revenue_transactions
          : [],
        monthly_revenue_chart: Array.isArray(result?.monthly_revenue_chart)
          ? result.monthly_revenue_chart
          : [],
        capital_growth_chart: Array.isArray(result?.capital_growth_chart)
          ? result.capital_growth_chart
          : [],
        kyc_status: result?.kyc_status || 'pending',
        profile_completion_percentage: Math.round(
          Number(result?.profile_completion_percentage) || 0
        ),
        banner_dismissed: Boolean(result?.banner_dismissed),
      });
      setBannerDismissedLocal(Boolean(result?.banner_dismissed));
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load dashboard';
      setError(message);
      if (!isRefresh) {
        setData(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  const showBanner =
    Boolean(data) &&
    !bannerDismissedLocal &&
    !data!.banner_dismissed &&
    (data!.profile_completion_percentage ?? 0) < 100;

  const totalEarned = useMemo(() => {
    const chart = Array.isArray(data?.monthly_revenue_chart)
      ? data!.monthly_revenue_chart
      : [];
    return (chart ?? []).reduce((sum, row) => {
      if (row == null) {
        return sum;
      }
      return (
        sum + Math.round(Number((row as { amount?: number }).amount) || 0)
      );
    }, 0);
  }, [data]);

  const revenueChartData = useMemo(() => {
    const rows = (
      Array.isArray(data?.monthly_revenue_chart)
        ? data!.monthly_revenue_chart
        : []
    ) as Array<{
      label?: string;
      month?: string | number;
      amount?: number;
      year?: number;
    } | null | undefined>;
    return (rows ?? [])
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map((row, index, filtered) => ({
        month:
          row.label ||
          (typeof row.month === 'string'
            ? row.month
            : `M${row.month || index + 1}`),
        amount: Math.round(Number(row.amount) || 0),
        isCurrent: index === filtered.length - 1,
      }));
  }, [data]);

  const capitalChartData = useMemo(() => {
    const rows = (
      Array.isArray(data?.capital_growth_chart)
        ? data!.capital_growth_chart
        : []
    ) as Array<{
      label?: string;
      date?: string;
      capital_balance?: number;
      amount?: number;
      year?: number;
      month?: number;
    } | null | undefined>;
    return (rows ?? [])
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map((row) => {
        const amount = Math.round(
          Number(row.capital_balance ?? row.amount) || 0
        );
        const date =
          row.date ||
          row.label ||
          (row.year && row.month
            ? `${row.year}-${String(row.month).padStart(2, '0')}-01`
            : new Date().toISOString());
        return { date, amount };
      });
  }, [data]);

  const onDismissBanner = async () => {
    setBannerDismissedLocal(true);
    try {
      await profileService.dismissBanner();
      setData((prev) =>
        prev ? { ...prev, banner_dismissed: true } : prev
      );
    } catch {
      // Keep dismissed locally; next refresh will reconcile
    }
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.md,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadDashboard(true)}
          tintColor={colors?.secondary}
          colors={[colors?.secondary].filter(Boolean) as string[]}
        />
      }
    >
      {loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {showBanner ? (
            <ProfileBanner
              message="Complete your profile"
              visible
              onPress={() => router.push(PROFILE_HREF)}
              onDismiss={onDismissBanner}
            />
          ) : null}

          {error ? (
            <Text style={[typography?.body, { color: colors?.error }]}>
              {error}
            </Text>
          ) : null}

          <BalanceCard
            label="Capital Invested"
            amount={data?.capital_balance ?? 0}
            pendingWithdrawal={data?.pending_withdrawal ?? 0}
            onViewTransactions={() => router.push(FUND_HREF)}
          />

          <BalanceCard
            label="Revenue Account"
            amount={data?.revenue_balance ?? 0}
            pendingNote={
              (data?.pending_withdrawal ?? 0) > 0
                ? `Includes pending withdrawal activity: ${data?.pending_withdrawal_formatted ?? ''}`
                : undefined
            }
            onViewTransactions={() => router.push(REVENUE_HREF)}
          />

          <Card accent>
            <Text
              style={[
                typography?.label,
                { color: colors?.text?.secondary },
              ]}
            >
              Total Balance
            </Text>
            <View style={{ marginTop: spacing?.xs }}>
              <AmountDisplay amount={data?.total_balance ?? 0} size="xl" />
            </View>
            <Text
              style={[
                typography?.caption,
                { color: colors?.text?.secondary, marginTop: spacing?.sm },
              ]}
            >
              Capital + Revenue
            </Text>
          </Card>

          <PortfolioCard
            totalInvested={data?.capital_balance ?? 0}
            totalEarned={totalEarned ?? 0}
          />

          <Text
            style={[
              typography?.body,
              { color: colors?.text?.secondary, textAlign: 'center' },
            ]}
          >
            {data?.partner_since ||
              (data?.joining_date
                ? `Partner Since: ${data.joining_date}`
                : 'Partner Since: —')}
          </Text>

          <View>
            <Text
              style={[
                typography?.title,
                {
                  color: colors?.text?.primary,
                  marginBottom: spacing?.sm,
                },
              ]}
            >
              Monthly Revenue Trend
            </Text>
            <MonthlyRevenueChart data={revenueChartData ?? []} loading={false} />
          </View>

          <View>
            <Text
              style={[
                typography?.title,
                {
                  color: colors?.text?.primary,
                  marginBottom: spacing?.sm,
                },
              ]}
            >
              Capital Growth
            </Text>
            <CapitalGrowthChart data={capitalChartData ?? []} loading={false} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
