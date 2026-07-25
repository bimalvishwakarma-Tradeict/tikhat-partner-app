/**
 * Admin API service — users, capital, withdrawals, settings, audit, backdate, dashboard.
 */

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from './api';
import type {
  AdminCapitalDashboardData,
  AdminDashboardData,
  AdminsListData,
  AuditLogsData,
  ChangePasswordRequest,
  CreateAdminRequest,
  CronLogsData,
  InvestorsListData,
  MaintenanceModeData,
  SettingsData,
  SettingsUpdatePayload,
  WithdrawalsListData,
} from '../types/api.types';

const ADMIN_CAPITAL = '/api/v1/admin/capital';
const ADMIN_WITHDRAWALS = '/api/v1/admin/withdrawals';
const ADMIN_INVESTORS = '/api/v1/admin/investors';
const PROFILE_REQUESTS = '/api/v1/admin/profile-requests';
const ADMIN_FILES = '/api/v1/admin/files';
const ADMIN_ROOT = '/api/v1/admin';
const SETTINGS = '/api/v1/admin/settings';
const EMAIL_LOGS = '/api/v1/admin/email-logs';
const AUDIT = '/api/v1/admin/audit-logs';
const CRON = '/api/v1/admin/cron-logs';
const BACKDATE = '/api/v1/admin/backdate';
const DASHBOARD = '/api/v1/admin/dashboard';

export const adminService = {
  /* ── Dashboard ── */

  async getDashboard(params?: {
    from?: string;
    to?: string;
  }): Promise<AdminDashboardData> {
    return apiGet<AdminDashboardData>(`${DASHBOARD}/`, { params });
  },

  /* ── Capital ── */

  async getCapitalDashboard(): Promise<AdminCapitalDashboardData> {
    return apiGet<AdminCapitalDashboardData>(`${ADMIN_CAPITAL}/dashboard`);
  },

  async listCapitalInvestors(params?: {
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }): Promise<unknown> {
    return apiGet(`${ADMIN_CAPITAL}/investors`, { params });
  },

  async listCapitalRequests(params?: {
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<unknown> {
    return apiGet(`${ADMIN_CAPITAL}/requests`, { params });
  },

  async getInvestorCapital(investorId: string): Promise<unknown> {
    return apiGet(`${ADMIN_CAPITAL}/investor/${investorId}`);
  },

  async getInvestorCapitalFull(investorId: string): Promise<unknown> {
    return apiGet(`${ADMIN_CAPITAL}/investor/${investorId}/full`);
  },

  async approveDeposit(
    id: string,
    payload?: { amount?: number; admin_remark?: string }
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/deposit/${id}/approve`, payload);
  },

  async rejectDeposit(id: string, reason: string): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/deposit/${id}/reject`, { reason });
  },

  async approveWithdrawal(
    id: string,
    payload?: Record<string, unknown>
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/withdraw/${id}/approve`, payload);
  },

  async processWithdrawal(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/withdraw/${id}/process`);
  },

  async completeWithdrawal(
    id: string,
    payload: { payment_utr: string; payment_date?: string }
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/withdraw/${id}/complete`, payload);
  },

  async rejectWithdrawal(id: string, reason: string): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/withdraw/${id}/reject`, { reason });
  },

  async bulkApproveWithdrawals(ids: string[]): Promise<unknown> {
    return apiPost(`${ADMIN_CAPITAL}/withdraw/bulk-approve`, { ids });
  },

  async creditCapital(
    investorId: string,
    payload: { amount: number; remark?: string }
  ): Promise<unknown> {
    return apiPost(`${ADMIN_CAPITAL}/investor/${investorId}/credit`, {
      amount: Math.round(payload.amount),
      remark: payload.remark,
    });
  },

  async debitCapital(
    investorId: string,
    payload: { amount: number; remark?: string }
  ): Promise<unknown> {
    return apiPost(`${ADMIN_CAPITAL}/investor/${investorId}/debit`, {
      amount: Math.round(payload.amount),
      remark: payload.remark,
    });
  },

  async lockCapital(investorId: string): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/investor/${investorId}/lock`);
  },

  async unlockCapital(
    investorId: string,
    unlockReason?: string
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_CAPITAL}/investor/${investorId}/unlock`, {
      unlock_reason: unlockReason,
    });
  },

  async undoCapitalAction(investorId: string): Promise<unknown> {
    return apiPost(`${ADMIN_CAPITAL}/investor/${investorId}/undo`);
  },

  /* ── Withdrawals queue ── */

  async listWithdrawals(params?: {
    status?: string;
    account_type?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }): Promise<WithdrawalsListData> {
    return apiGet<WithdrawalsListData>(`${ADMIN_WITHDRAWALS}/`, { params });
  },

  async listPendingWithdrawals(params?: {
    account_type?: string;
    page?: number;
    limit?: number;
  }): Promise<WithdrawalsListData> {
    return apiGet<WithdrawalsListData>(`${ADMIN_WITHDRAWALS}/pending`, {
      params,
    });
  },

  async bulkApproveWithdrawalQueue(ids: string[]): Promise<unknown> {
    return apiPost(`${ADMIN_WITHDRAWALS}/bulk-approve`, { ids });
  },

  async reviewWithdrawal(
    id: string,
    adminRemark?: string
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_WITHDRAWALS}/${id}/review`, {
      admin_remark: adminRemark,
    });
  },

  async approveWithdrawalQueue(
    id: string,
    adminRemark?: string
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_WITHDRAWALS}/${id}/approve`, {
      admin_remark: adminRemark,
    });
  },

  async processWithdrawalQueue(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_WITHDRAWALS}/${id}/process`);
  },

  async completeWithdrawalQueue(
    id: string,
    payload?: { payment_date?: string; payment_utr?: string }
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_WITHDRAWALS}/${id}/complete`, payload);
  },

  async rejectWithdrawalQueue(
    id: string,
    remark: string
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_WITHDRAWALS}/${id}/reject`, {
      remark,
      admin_remark: remark,
    });
  },

  /* ── Investors ── */

  async listInvestors(params?: Record<string, string | number | undefined>): Promise<InvestorsListData> {
    return apiGet<InvestorsListData>(`${ADMIN_INVESTORS}/`, { params });
  },

  async createInvestor(payload: Record<string, unknown>): Promise<unknown> {
    return apiPost(`${ADMIN_INVESTORS}/`, payload);
  },

  async getInvestor(id: string): Promise<unknown> {
    return apiGet(`${ADMIN_INVESTORS}/${id}`);
  },

  async updateInvestor(
    id: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}`, payload);
  },

  async softDeleteInvestor(id: string): Promise<unknown> {
    return apiDelete(`${ADMIN_INVESTORS}/${id}`);
  },

  async approveInvestor(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/approve`);
  },

  async rejectInvestor(id: string, reason: string): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/reject`, { reason });
  },

  async pauseInvestor(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/pause`);
  },

  async resumeInvestor(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/resume`);
  },

  async unlockInvestor(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/unlock`);
  },

  async updateJoiningDate(
    id: string,
    joiningDate: string
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/joining-date`, {
      joining_date: joiningDate,
    });
  },

  async releaseInvestorEditLock(id: string): Promise<unknown> {
    return apiDelete(`${ADMIN_INVESTORS}/${id}/edit`);
  },

  async getInvestorKyc(id: string): Promise<unknown> {
    return apiGet(`${ADMIN_INVESTORS}/${id}/kyc`);
  },

  async updateKycStatus(
    id: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    return apiPatch(`${ADMIN_INVESTORS}/${id}/kyc/status`, payload);
  },

  async overrideKycField(
    id: string,
    payload: { field_name: string; new_value: string }
  ): Promise<unknown> {
    return apiPost(`${ADMIN_INVESTORS}/${id}/kyc/override`, payload);
  },

  /* ── Profile update requests ── */

  async listProfileRequests(): Promise<unknown> {
    return apiGet(`${PROFILE_REQUESTS}/`);
  },

  async listInvestorProfileRequests(investorId: string): Promise<unknown> {
    return apiGet(`${PROFILE_REQUESTS}/investor/${investorId}`);
  },

  async approveProfileRequest(id: string): Promise<unknown> {
    return apiPatch(`${PROFILE_REQUESTS}/${id}/approve`);
  },

  async rejectProfileRequest(id: string, reason?: string): Promise<unknown> {
    return apiPatch(`${PROFILE_REQUESTS}/${id}/reject`, { reason });
  },

  async downloadFile(fileId: string): Promise<{
    data: ArrayBuffer;
    contentType: string;
    filename: string | null;
  }> {
    return apiDownload(`${ADMIN_FILES}/${fileId}/download`);
  },

  /* ── Admin users (Super Admin) ── */

  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await apiPatch(`${ADMIN_ROOT}/profile/password`, payload);
  },

  async createAdmin(payload: CreateAdminRequest): Promise<unknown> {
    return apiPost(`${ADMIN_ROOT}/admins`, payload);
  },

  async listAdmins(): Promise<AdminsListData> {
    return apiGet<AdminsListData>(`${ADMIN_ROOT}/admins`);
  },

  async suspendAdmin(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_ROOT}/admins/${id}/suspend`);
  },

  async unsuspendAdmin(id: string): Promise<unknown> {
    return apiPatch(`${ADMIN_ROOT}/admins/${id}/unsuspend`);
  },

  async deleteAdmin(id: string): Promise<unknown> {
    return apiDelete(`${ADMIN_ROOT}/admins/${id}`);
  },

  /* ── Settings ── */

  async getSettings(): Promise<SettingsData> {
    return apiGet<SettingsData>(`${SETTINGS}/`);
  },

  async updateSettings(payload: SettingsUpdatePayload): Promise<unknown> {
    return apiPatch(`${SETTINGS}/global`, payload);
  },

  async getMaintenanceMode(): Promise<MaintenanceModeData> {
    return apiGet<MaintenanceModeData>(`${SETTINGS}/maintenance`);
  },

  async setMaintenanceMode(enabled: boolean): Promise<MaintenanceModeData> {
    return apiPatch<MaintenanceModeData>(`${SETTINGS}/maintenance`, {
      enabled,
      maintenance_mode: enabled ? 'on' : 'off',
    });
  },

  async getTerms(): Promise<unknown> {
    return apiGet(`${SETTINGS}/terms`);
  },

  async getTermsHistory(): Promise<unknown> {
    return apiGet(`${SETTINGS}/terms/history`);
  },

  async updateTerms(content: string): Promise<unknown> {
    return apiPatch(`${SETTINGS}/terms`, { content });
  },

  async getPrivacy(): Promise<unknown> {
    return apiGet(`${SETTINGS}/privacy`);
  },

  async updatePrivacy(content: string): Promise<unknown> {
    return apiPatch(`${SETTINGS}/privacy`, { content });
  },

  async getBackupHistory(): Promise<unknown> {
    return apiGet(`${SETTINGS}/backup/history`);
  },

  async triggerBackup(): Promise<unknown> {
    return apiPost(`${SETTINGS}/backup`);
  },

  /* ── Email logs ── */

  async listEmailLogs(params?: Record<string, string | number | undefined>): Promise<unknown> {
    return apiGet(`${EMAIL_LOGS}/`, { params });
  },

  async listFailedEmailLogs(
    params?: Record<string, string | number | undefined>
  ): Promise<unknown> {
    return apiGet(`${EMAIL_LOGS}/failed`, { params });
  },

  async retryEmail(id: string): Promise<unknown> {
    return apiPost(`${EMAIL_LOGS}/${id}/retry`);
  },

  /* ── Audit & cron ── */

  async listAuditLogs(params?: {
    admin_id?: string;
    entity_type?: string;
    action?: string;
    start_date?: string;
    end_date?: string;
    entity_id?: string;
    page?: number;
    limit?: number;
  }): Promise<AuditLogsData> {
    return apiGet<AuditLogsData>(`${AUDIT}/`, { params });
  },

  async listInvestorAuditLogs(
    investorId: string,
    params?: { page?: number; limit?: number }
  ): Promise<AuditLogsData> {
    return apiGet<AuditLogsData>(`${AUDIT}/investor/${investorId}`, {
      params,
    });
  },

  async listCronLogs(params?: {
    job_name?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }): Promise<CronLogsData> {
    return apiGet<CronLogsData>(`${CRON}/`, { params });
  },

  async listLatestCronLogs(): Promise<CronLogsData> {
    return apiGet<CronLogsData>(`${CRON}/latest`);
  },

  /* ── Backdate ── */

  async backdateRevenueSingle(payload: {
    investor_id: string;
    date: string;
    amount?: number;
    roi_percentage?: number;
    remark?: string;
    send_email?: boolean;
  }): Promise<unknown> {
    return apiPost(`${BACKDATE}/revenue/single`, payload);
  },

  async backdateRevenueBulk(payload: {
    investor_id: string;
    start_date: string;
    end_date: string;
    roi_percentage?: number;
    remark?: string;
    send_email?: boolean;
  }): Promise<unknown> {
    return apiPost(`${BACKDATE}/revenue/bulk`, payload);
  },

  async previewCapitalBackdate(payload: {
    investor_id: string;
    date: string;
    amount: number;
    roi_percentage?: number;
  }): Promise<unknown> {
    return apiPost(`${BACKDATE}/capital/preview`, {
      ...payload,
      amount: Math.round(payload.amount),
    });
  },

  async submitCapitalBackdate(payload: {
    investor_id: string;
    date: string;
    amount: number;
    roi_percentage?: number;
    send_email?: boolean;
  }): Promise<unknown> {
    return apiPost(`${BACKDATE}/capital`, {
      ...payload,
      amount: Math.round(payload.amount),
    });
  },

  async backdateNewInvestor(payload: Record<string, unknown>): Promise<unknown> {
    return apiPost(`${BACKDATE}/new-investor`, payload);
  },

  async getBackdateHistory(
    params?: Record<string, string | number | undefined>
  ): Promise<unknown> {
    return apiGet(`${BACKDATE}/history`, { params });
  },

  async listBackdateRequests(
    params?: Record<string, string | number | undefined>
  ): Promise<unknown> {
    return apiGet(`${BACKDATE}/requests`, { params });
  },

  async getBackdateRequestLog(id: string): Promise<unknown> {
    return apiGet(`${BACKDATE}/requests/${id}/log`);
  },

  async approveBackdateRequest(id: string): Promise<unknown> {
    return apiPatch(`${BACKDATE}/requests/${id}/approve`);
  },

  async rejectBackdateRequest(id: string, reason: string): Promise<unknown> {
    return apiPatch(`${BACKDATE}/requests/${id}/reject`, { reason });
  },
};
