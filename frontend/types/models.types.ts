/**
 * Domain model types aligned with Tikhat Partner backend entities.
 * Amounts are whole rupees (integers). Display formatting is client-side.
 */

export type UserRole = 'investor' | 'admin' | 'super_admin';

export type InvestorStatus =
  | 'pending'
  | 'active'
  | 'rejected'
  | 'paused'
  | 'locked'
  | 'self_deactivated'
  | 'deleted';

export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected';

export type TransactionStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'processed'
  | 'failed';

export type AccountType = 'capital' | 'revenue';
export type TransferMode = 'bank' | 'upi';
export type DeviceType = 'mobile' | 'web';

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'escalated'
  | 'reopened';

export type SupportTicketCategory =
  | 'general'
  | 'capital'
  | 'revenue'
  | 'withdrawal'
  | 'kyc'
  | 'technical'
  | 'other';

export type ProfileUpdateStatus = 'pending' | 'approved' | 'rejected';

export type CronJobStatus = 'success' | 'failed' | 'partial' | 'running';

export type CreditFrequency = 'daily' | 'weekly' | 'monthly';

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  mobile?: string | null;
  status?: string;
  role: UserRole;
};

export type Investor = {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  profile_photo_url: string | null;
  date_of_birth: string | null;
  address: string | null;
  pan_number: string | null;
  pan_front_url: string | null;
  pan_back_url: string | null;
  aadhar_number: string | null;
  aadhar_front_url: string | null;
  aadhar_back_url: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_name: string | null;
  bank_name: string | null;
  upi_id: string | null;
  status: InvestorStatus | string;
  kyc_status: KycStatus | string;
  joining_date: string | null;
  joining_date_formatted?: string | null;
  banner_dismissed: boolean;
  is_deleted?: boolean;
  pan_locked?: boolean;
  aadhar_locked?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Admin = {
  id: string;
  full_name: string;
  email: string;
  mobile?: string | null;
  role: 'admin' | 'super_admin';
  status?: string;
  is_suspended?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CapitalTransaction = {
  id: string;
  transaction_id: string;
  investor_id: string;
  type: string;
  amount: number;
  amount_formatted?: string;
  status: TransactionStatus | string;
  utr_number?: string | null;
  payment_screenshot_url?: string | null;
  transfer_date?: string | null;
  remark?: string | null;
  admin_remark?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
};

export type Withdrawal = {
  id: string;
  transaction_id: string;
  investor_id: string;
  amount: number;
  amount_formatted?: string;
  account_type: AccountType;
  transfer_mode: TransferMode;
  status: TransactionStatus | string;
  payment_utr?: string | null;
  payment_date?: string | null;
  admin_remark?: string | null;
  rejection_reason?: string | null;
  investor_name?: string;
  investor_email?: string;
  created_at: string;
  updated_at?: string;
};

export type RevenueEntry = {
  id: string;
  transaction_id?: string;
  investor_id: string;
  amount: number;
  amount_formatted?: string;
  credit_date: string;
  credit_date_formatted?: string;
  type?: string;
  remark?: string | null;
  is_backdated?: boolean;
  created_at?: string;
};

export type CapitalBalance = {
  capitalBalance: number;
  capitalBalanceFormatted: string;
  revenueBalance: number;
  revenueBalanceFormatted: string;
  pendingWithdrawalAmount: number;
  pendingWithdrawalFormatted: string;
  isLocked: boolean;
  statusLabel: string;
};

export type RevenueBalance = {
  revenueBalance: number;
  revenueBalanceFormatted: string;
  pendingRevenueWithdrawal: number;
  pendingWithdrawalNote?: string | null;
};

export type RoiTerm = {
  id: string;
  investor_id: string;
  percentage: number;
  start_date: string;
  end_date: string;
  created_at?: string;
};

export type RoiSettings = {
  defaultRoi: number | null;
  activePercentage?: number | null;
  terms: RoiTerm[];
};

export type CreditSettings = {
  investor_id: string;
  credit_frequency?: CreditFrequency | string;
  withdrawal_frequency?: string;
  is_paused?: boolean;
  credit_time_hour?: number;
  credit_time_minute?: number;
};

export type ProfileUpdateRequest = {
  id: string;
  transaction_id?: string;
  investor_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  status: ProfileUpdateStatus | string;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
};

export type SupportTicket = {
  id: string;
  ticket_code: string;
  investor_id: string;
  category: SupportTicketCategory | string;
  subject: string;
  status: SupportTicketStatus | string;
  assigned_to?: string | null;
  assigned_admin_name?: string | null;
  investor_name?: string;
  investor_email?: string;
  is_escalated?: boolean;
  created_at: string;
  updated_at?: string;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_type: 'investor' | 'admin' | string;
  sender_id: string;
  message: string;
  attachments?: string[] | null;
  created_at: string;
};

export type Notification = {
  id: string;
  investor_id?: string;
  admin_id?: string | null;
  title: string;
  body: string;
  type: string;
  reference_id?: string | null;
  reference_type?: string | null;
  is_read: boolean;
  created_at: string;
  updated_at?: string;
};

export type AuditLog = {
  id: string;
  admin_id: string;
  admin_name?: string;
  admin_email?: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string | null;
  created_at: string;
};

export type CronJobLog = {
  id: string;
  job_name: string;
  started_at: string | null;
  completed_at: string | null;
  status: CronJobStatus | string;
  processed_count: number;
  failed_count: number;
  total_amount: number;
  total_amount_formatted?: string;
  error_details?: unknown;
  started_at_formatted?: string | null;
  completed_at_formatted?: string | null;
  created_at?: string;
};

export type BackdateRequest = {
  id: string;
  type: string;
  investor_id: string;
  status: string;
  amount?: number;
  start_date?: string;
  end_date?: string;
  remark?: string | null;
  created_at: string;
};

export type InvestorDashboard = {
  capital_balance: number;
  capital_balance_formatted: string;
  revenue_balance: number;
  revenue_balance_formatted: string;
  total_balance: number;
  total_balance_formatted: string;
  pending_withdrawal: number;
  pending_withdrawal_formatted: string;
  joining_date: string | null;
  partner_since: string | null;
  last_5_capital_transactions: CapitalTransaction[];
  last_5_revenue_transactions: RevenueEntry[];
  monthly_revenue_chart: Array<{ month: string; amount: number }>;
  capital_growth_chart: Array<{ date: string; amount: number }>;
  kyc_status: string;
  profile_completion_percentage: number;
  banner_dismissed: boolean;
};

export type AdminDashboard = {
  date_range?: { from: string; to: string } | null;
  total_investors: number;
  total_capital: number;
  total_capital_formatted: string;
  revenue_today: number;
  revenue_today_formatted: string;
  pending_approvals_count: number;
  pending_approvals_breakdown?: Record<string, number>;
  active_tickets_count: number;
  today_revenue_schedule?: unknown;
  top_investors_by_capital?: unknown[];
  top_investors_by_roi?: unknown[];
  financial_summary?: {
    total_capital: number;
    monthly_revenue: number;
    monthly_withdrawals: number;
    net_liability: number;
    period?: string;
  };
  recent_activity?: unknown[];
};

export type GlobalSettings = {
  settings: Record<string, unknown>;
  revenue_credit_hour?: number;
  revenue_credit_minute?: number;
  revenue_credit_time?: string;
  maintenance_mode?: boolean | string;
  cache?: unknown;
};

export type FileUploadAsset = {
  uri: string;
  name: string;
  type: string;
};
