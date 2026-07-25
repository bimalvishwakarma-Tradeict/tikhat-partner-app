/**
 * Revenue API service — investor ledger + admin revenue operations.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from './api';
import type {
  AdminRevenueDashboardData,
  CreditSettingsData,
  RevenueSummaryData,
  RevenueTransactionsData,
  RoiData,
} from '../types/api.types';

const INVESTOR = '/api/v1/investor/revenue';
const ADMIN = '/api/v1/admin/revenue';

export const revenueService = {
  /* ── Investor ── */

  async getTransactions(params?: {
    month?: number;
    year?: number;
    page?: number;
    limit?: number;
    cursor?: string;
  }): Promise<RevenueTransactionsData> {
    return apiGet<RevenueTransactionsData>(`${INVESTOR}/transactions`, {
      params,
    });
  },

  async getSummary(): Promise<RevenueSummaryData> {
    return apiGet<RevenueSummaryData>(`${INVESTOR}/summary`);
  },

  async getMonthly(params: {
    month: number;
    year: number;
    page?: number;
    limit?: number;
    cursor?: string;
  }): Promise<RevenueTransactionsData & { month: number; year: number; total?: number }> {
    return apiGet(`${INVESTOR}/monthly`, { params });
  },

  /* ── Admin ── */

  async getAdminDashboard(): Promise<AdminRevenueDashboardData> {
    return apiGet<AdminRevenueDashboardData>(`${ADMIN}/dashboard`);
  },

  async getAdminInvestors(params?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<unknown> {
    return apiGet(`${ADMIN}/investors`, { params });
  },

  async getTodaySchedule(): Promise<unknown> {
    return apiGet(`${ADMIN}/schedule/today`);
  },

  async getInvestorRoi(investorId: string): Promise<RoiData> {
    const data = (await apiGet(
      `${ADMIN}/investor/${investorId}/roi`
    )) as Record<string, unknown>;

    const toFloat = (value: unknown): number | null => {
      if (value == null || value === '') return null;
      const n = Number.parseFloat(String(value));
      return Number.isFinite(n) ? n : null;
    };

    const defaultRoiRaw = data.defaultRoi;
    if (defaultRoiRaw && typeof defaultRoiRaw === 'object') {
      const row = defaultRoiRaw as Record<string, unknown>;
      data.defaultRoi = {
        ...row,
        roi_percentage: toFloat(row.roi_percentage),
      };
    } else if (defaultRoiRaw != null) {
      data.defaultRoi = toFloat(defaultRoiRaw);
    }

    if (Array.isArray(data.terms)) {
      data.terms = data.terms.map((term) => {
        const row = term as Record<string, unknown>;
        const pct =
          toFloat(row.percentage) ?? toFloat(row.roi_percentage) ?? 0;
        return { ...row, percentage: pct, roi_percentage: pct };
      });
    }

    if (data.activePercentage != null) {
      data.activePercentage = toFloat(data.activePercentage);
    }

    return data as unknown as RoiData;
  },

  async setDefaultRoi(
    investorId: string,
    percentage: number
  ): Promise<unknown> {
    const pct = Number.parseFloat(String(percentage));
    return apiPost(`${ADMIN}/investor/${investorId}/roi/default`, {
      percentage: pct,
      roi_percentage: pct,
    });
  },

  async addRoiTerm(
    investorId: string,
    payload: {
      percentage: number;
      start_date: string;
      end_date: string;
    }
  ): Promise<unknown> {
    const pct = Number.parseFloat(String(payload.percentage));
    return apiPost(`${ADMIN}/investor/${investorId}/roi/term`, {
      percentage: pct,
      roi_percentage: pct,
      start_date: payload.start_date,
      end_date: payload.end_date,
    });
  },

  async deleteRoiTerm(investorId: string, termId: string): Promise<unknown> {
    return apiDelete(`${ADMIN}/investor/${investorId}/roi/term/${termId}`);
  },

  async getActiveRoi(
    investorId: string,
    date?: string
  ): Promise<unknown> {
    return apiGet(`${ADMIN}/investor/${investorId}/roi/active`, {
      params: date ? { date } : undefined,
    });
  },

  async updateCreditSettings(
    investorId: string,
    payload: Partial<{
      credit_frequency: string;
      withdrawal_frequency: string;
      is_paused: boolean;
      credit_time_hour: number;
      credit_time_minute: number;
    }>
  ): Promise<CreditSettingsData> {
    return apiPatch<CreditSettingsData>(
      `${ADMIN}/investor/${investorId}/settings`,
      payload
    );
  },

  async getInvestorTransactions(
    investorId: string,
    params?: {
      month?: number;
      year?: number;
      backdated?: boolean;
      page?: number;
      limit?: number;
      cursor?: string;
    }
  ): Promise<RevenueTransactionsData> {
    return apiGet(`${ADMIN}/investor/${investorId}/transactions`, { params });
  },

  async getInvestorSummary(investorId: string): Promise<unknown> {
    return apiGet(`${ADMIN}/investor/${investorId}/summary`);
  },

  async creditInvestor(
    investorId: string,
    payload: { amount: number; date?: string; credit_date?: string; remark?: string }
  ): Promise<unknown> {
    return apiPost(`${ADMIN}/investor/${investorId}/credit`, {
      amount: Math.round(payload.amount),
      date: payload.date || payload.credit_date,
      credit_date: payload.credit_date || payload.date,
      remark: payload.remark,
    });
  },

  async debitInvestor(
    investorId: string,
    payload: { amount: number; date?: string; credit_date?: string; remark?: string }
  ): Promise<unknown> {
    return apiPost(`${ADMIN}/investor/${investorId}/debit`, {
      amount: Math.round(payload.amount),
      date: payload.date || payload.credit_date,
      credit_date: payload.credit_date || payload.date,
      remark: payload.remark,
    });
  },

  async reverseEntry(entryId: string, reason?: string): Promise<unknown> {
    return apiPatch(`${ADMIN}/entry/${entryId}/reverse`, { reason });
  },

  async pauseInvestor(investorId: string): Promise<unknown> {
    return apiPatch(`${ADMIN}/investor/${investorId}/pause`);
  },

  async resumeInvestor(investorId: string): Promise<unknown> {
    return apiPatch(`${ADMIN}/investor/${investorId}/resume`);
  },
};
