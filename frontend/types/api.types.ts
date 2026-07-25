/**
 * API envelope and request/response DTOs for Tikhat Partner backend.
 */

import type {
  AccountType,
  Admin,
  AdminDashboard,
  AuditLog,
  AuthUser,
  CapitalBalance,
  CapitalTransaction,
  CreditSettings,
  CronJobLog,
  DeviceType,
  FileUploadAsset,
  GlobalSettings,
  Investor,
  InvestorDashboard,
  Notification,
  PaginationMeta,
  ProfileUpdateRequest,
  RevenueBalance,
  RevenueEntry,
  RoiSettings,
  SupportMessage,
  SupportTicket,
  TransferMode,
  Withdrawal,
} from './models.types';

export type ApiSuccessResponse<T = unknown> = {
  success: true;
  message: string;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  message: string;
  error: string;
};

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export type ApiErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_OTP_EXPIRED'
  | 'AUTH_OTP_INVALID'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'MAINTENANCE_MODE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR'
  | string;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode = 'UNKNOWN_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type Paginated<T> = {
  meta: PaginationMeta;
} & T;

/* ─── Auth ─── */

export type RegisterRequest = {
  full_name: string;
  email: string;
  password: string;
  mobile: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  device_type: DeviceType;
};

export type VerifyOtpRequest = {
  email: string;
  otp: string;
  device_type: DeviceType;
};

export type LoginOtpPendingData = {
  email: string;
  device_type: DeviceType;
  expires_in_minutes: number;
};

export type AuthTokensData = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string | number;
  sessionId: string;
  user: AuthUser;
};

export type RefreshTokenRequest = {
  refreshToken: string;
};

export type RefreshTokenData = {
  accessToken: string;
  expiresIn: string | number;
  sessionId: string;
};

export type ResetPasswordRequest = {
  email: string;
  otp: string;
  new_password: string;
};

/* ─── Capital / Withdrawals ─── */

export type CapitalDepositRequest = {
  amount: number;
  transfer_date: string;
  utr_number: string;
  payment_screenshot: FileUploadAsset;
  remark?: string;
};

export type CapitalWithdrawRequest = {
  amount: number;
  account_type: AccountType;
  transfer_mode: TransferMode;
};

export type WithdrawalActionData = {
  id: string;
  transactionId: string;
  amount: number;
  amountFormatted?: string;
  accountType?: AccountType;
  transferMode?: TransferMode;
  status: string;
  capitalBalance?: number;
  revenueBalance?: number;
  pendingWithdrawalAmount?: number;
  pendingRevenueWithdrawal?: number;
  pendingWithdrawalNote?: string;
};

export type RevenueWithdrawRequest = {
  amount: number;
  transfer_mode: TransferMode;
};

export type WithdrawalsListData = {
  withdrawals: Withdrawal[];
  meta: PaginationMeta;
};

export type WithdrawalsSummaryData = {
  total_withdrawn_capital: number;
  total_withdrawn_capital_formatted: string;
  total_withdrawn_revenue: number;
  total_withdrawn_revenue_formatted: string;
  total_withdrawn_all: number;
  total_withdrawn_all_formatted: string;
};

/* ─── Revenue ─── */

export type RevenueSummaryData = {
  monthly_total: number;
  overall_total: number;
  total_withdrawn: number;
  revenue_balance: number;
  month: number;
  year: number;
};

export type RevenueTransactionsData = {
  transactions?: RevenueEntry[];
  entries?: RevenueEntry[];
  meta?: PaginationMeta;
  nextCursor?: string | null;
};

/* ─── Profile ─── */

export type ProfileUpdatePayload = Partial<{
  full_name: string;
  date_of_birth: string;
  address: string;
  pan_number: string;
  aadhar_number: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_account_name: string;
  bank_name: string;
  upi_id: string;
}>;

export type MyProfileData = {
  profile: Investor;
  pending_update_count: number;
};

export type ProfileUpdateSubmitData = {
  requests: ProfileUpdateRequest[];
  count: number;
};

export type ProfilePhotoUploadData = {
  file_id: string;
  profile_photo_url: string;
  file_url?: string;
};

export type ProfileDocumentsUploadData = {
  documents: Array<{ field: string; file_id: string; url?: string }>;
};

export type UpdateRequestsData = {
  pending?: ProfileUpdateRequest[];
  requests?: ProfileUpdateRequest[];
  all?: ProfileUpdateRequest[];
};

/* ─── Support ─── */

export type CreateTicketRequest = {
  category: string;
  subject: string;
  message: string;
  attachments?: FileUploadAsset[];
};

export type TicketDetailData = {
  ticket: SupportTicket;
  messages: SupportMessage[];
};

export type TicketsListData = {
  tickets: SupportTicket[];
  meta: PaginationMeta;
};

/* ─── Notifications ─── */

export type NotificationsListData = {
  notifications: Notification[];
};

export type UnreadCountData = {
  count: number;
};

export type AdminPendingCountsData = {
  capital_requests: number;
  withdrawal_requests: number;
  profile_updates: number;
  new_registrations: number;
  open_tickets: number;
};

export type BroadcastNotificationRequest = {
  target_type: 'single' | 'selected' | 'all';
  target_ids?: string[];
  title: string;
  body: string;
  send_email?: boolean;
};

/* ─── Admin ─── */

export type AdminCapitalDashboardData = {
  total_capital_under_management: number;
  total_capital_under_management_formatted: string;
  pending_deposits: number;
  pending_withdrawals: number;
  recent_activity?: unknown[];
};

export type AdminRevenueDashboardData = {
  revenue_credited_today: number;
  revenue_credited_today_formatted: string;
  revenue_credited_this_month: number;
  revenue_credited_this_month_formatted: string;
  paused_investors_count: number;
  next_scheduled_credit?: Record<string, unknown>;
};

export type InvestorsListData = {
  investors: Investor[];
  meta: PaginationMeta;
};

export type AuditLogsData = {
  logs: AuditLog[];
  meta: PaginationMeta;
};

export type CronLogsData = {
  logs: CronJobLog[];
  meta?: PaginationMeta;
};

export type CreateAdminRequest = {
  name?: string;
  full_name?: string;
  email: string;
  password: string;
  mobile?: string;
  role?: 'admin' | 'super_admin';
};

export type AdminsListData = {
  admins: Admin[];
};

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

export type SettingsUpdatePayload = Record<string, unknown> & {
  settings?: Record<string, unknown>;
  revenue_credit_hour?: number;
  revenue_credit_minute?: number;
};

export type MaintenanceModeData = {
  maintenance_mode: boolean | string;
  enabled: boolean;
};

export type ReportDownloadParams = {
  from: string;
  to: string;
  format?: 'pdf' | 'excel' | 'xlsx';
};

export type ReportFileResult = {
  data: ArrayBuffer;
  contentType: string;
  filename: string | null;
};

export type DashboardData = InvestorDashboard;
export type AdminDashboardData = AdminDashboard;
export type BalanceData = CapitalBalance;
export type RevenueBalanceData = RevenueBalance;
export type SettingsData = GlobalSettings;
export type RoiData = RoiSettings;
export type CreditSettingsData = CreditSettings;
export type CapitalTransactionsData = {
  transactions?: CapitalTransaction[];
  meta?: PaginationMeta;
} & Record<string, unknown>;
