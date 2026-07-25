/**
 * Capital & withdrawal API service (investor + shared withdrawal helpers).
 */

import { apiClient, apiGet, apiPatch, apiPost, toApiClientError } from './api';
import type {
  ApiSuccessResponse,
  BalanceData,
  CapitalDepositRequest,
  CapitalTransactionsData,
  CapitalWithdrawRequest,
  RevenueBalanceData,
  RevenueWithdrawRequest,
  WithdrawalActionData,
  WithdrawalsListData,
  WithdrawalsSummaryData,
} from '../types/api.types';
import { ApiClientError } from '../types/api.types';

const CAPITAL = '/api/v1/investor/capital';
const WITHDRAWALS = '/api/v1/investor/withdrawals';
const REVENUE = '/api/v1/investor/revenue';

function appendFile(
  form: FormData,
  field: string,
  file: { uri: string; name: string; type: string }
): void {
  form.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

export const capitalService = {
  async getBalance(): Promise<BalanceData> {
    return apiGet<BalanceData>(`${CAPITAL}/balance`);
  },

  async getTransactions(params?: {
    page?: number;
    limit?: number;
  }): Promise<CapitalTransactionsData> {
    return apiGet<CapitalTransactionsData>(`${CAPITAL}/transactions`, {
      params,
    });
  },

  async deposit(
    payload: CapitalDepositRequest
  ): Promise<{ transactionId: string; message: string }> {
    const form = new FormData();
    form.append('amount', String(Math.round(payload.amount)));
    form.append('transfer_date', payload.transfer_date);
    form.append('utr_number', payload.utr_number);
    if (payload.remark) {
      form.append('remark', payload.remark);
    }
    appendFile(form, 'payment_screenshot', payload.payment_screenshot);

    try {
      const response = await apiClient.post<
        ApiSuccessResponse<unknown> & { transactionId?: string }
      >(`${CAPITAL}/deposit`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const body = response.data;
      const transactionId =
        body.transactionId ||
        (body.data as { transactionId?: string } | null)?.transactionId;

      if (!transactionId) {
        throw new ApiClientError(
          'Deposit succeeded but transaction ID was missing',
          response.status,
          'INTERNAL_ERROR',
          body
        );
      }

      return {
        transactionId,
        message: body.message || 'Deposit submitted successfully',
      };
    } catch (error) {
      throw toApiClientError(error);
    }
  },

  async withdraw(
    payload: CapitalWithdrawRequest
  ): Promise<WithdrawalActionData> {
    return apiPost<WithdrawalActionData>(`${CAPITAL}/withdraw`, {
      amount: Math.round(payload.amount),
      account_type: payload.account_type,
      transfer_mode: payload.transfer_mode,
    });
  },

  async cancelWithdrawal(id: string): Promise<WithdrawalActionData> {
    return apiPatch<WithdrawalActionData>(
      `${CAPITAL}/withdraw/${id}/cancel`
    );
  },

  async getWithdrawals(params?: {
    account_type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<WithdrawalsListData> {
    return apiGet<WithdrawalsListData>(`${WITHDRAWALS}/`, { params });
  },

  async getWithdrawalsSummary(): Promise<WithdrawalsSummaryData> {
    return apiGet<WithdrawalsSummaryData>(`${WITHDRAWALS}/summary`);
  },

  async getRevenueBalance(): Promise<RevenueBalanceData> {
    return apiGet<RevenueBalanceData>(`${REVENUE}/balance`);
  },

  async withdrawRevenue(
    payload: RevenueWithdrawRequest
  ): Promise<WithdrawalActionData> {
    return apiPost<WithdrawalActionData>(`${REVENUE}/withdraw`, {
      amount: Math.round(payload.amount),
      transfer_mode: payload.transfer_mode,
    });
  },

  async getDashboard(): Promise<unknown> {
    return apiGet('/api/v1/investor/dashboard/');
  },
};
