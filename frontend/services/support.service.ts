/**
 * Support ticket API service — investor + admin.
 */

import { apiGet, apiPatch, apiUpload } from './api';
import type {
  CreateTicketRequest,
  TicketDetailData,
  TicketsListData,
} from '../types/api.types';
import type { FileUploadAsset } from '../types/models.types';

const INVESTOR = '/api/v1/investor/support';
const ADMIN = '/api/v1/admin/support';

function appendFile(form: FormData, field: string, file: FileUploadAsset): void {
  form.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

function buildTicketForm(
  payload: CreateTicketRequest | { message: string; attachments?: FileUploadAsset[] },
  includeTicketFields: boolean
): FormData {
  const form = new FormData();
  if (includeTicketFields && 'category' in payload) {
    form.append('category', payload.category);
    form.append('subject', payload.subject);
    form.append('message', payload.message);
  } else if ('message' in payload) {
    form.append('message', payload.message);
  }

  const attachments = payload.attachments || [];
  for (const file of attachments) {
    appendFile(form, 'attachments', file);
  }
  return form;
}

export const supportService = {
  /* ── Investor ── */

  async createTicket(payload: CreateTicketRequest): Promise<TicketDetailData> {
    const form = buildTicketForm(payload, true);
    return apiUpload<TicketDetailData>(`${INVESTOR}/tickets`, form);
  },

  async listTickets(params?: {
    status?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<TicketsListData> {
    return apiGet<TicketsListData>(`${INVESTOR}/tickets`, { params });
  },

  async getTicket(id: string): Promise<TicketDetailData> {
    return apiGet<TicketDetailData>(`${INVESTOR}/tickets/${id}`);
  },

  async replyToTicket(
    id: string,
    payload: { message: string; attachments?: FileUploadAsset[] }
  ): Promise<TicketDetailData> {
    const form = buildTicketForm(payload, false);
    return apiUpload<TicketDetailData>(`${INVESTOR}/tickets/${id}/reply`, form);
  },

  async reopenTicket(id: string): Promise<{ ticket: unknown }> {
    return apiPatch(`${INVESTOR}/tickets/${id}/reopen`);
  },

  /* ── Admin ── */

  async getAdminSummary(): Promise<Record<string, number>> {
    return apiGet(`${ADMIN}/summary`);
  },

  async listAdminTickets(params?: Record<string, string | number | boolean | undefined>): Promise<TicketsListData> {
    return apiGet<TicketsListData>(`${ADMIN}/tickets`, { params });
  },

  async listEscalatedTickets(
    params?: Record<string, string | number | undefined>
  ): Promise<TicketsListData> {
    return apiGet<TicketsListData>(`${ADMIN}/tickets/escalated`, { params });
  },

  async getInvestorTickets(
    investorId: string,
    params?: Record<string, string | number | undefined>
  ): Promise<TicketsListData & { investor?: unknown }> {
    return apiGet(`${ADMIN}/investor/${investorId}/tickets`, { params });
  },

  async getAdminTicket(id: string): Promise<TicketDetailData> {
    return apiGet<TicketDetailData>(`${ADMIN}/tickets/${id}`);
  },

  async adminReply(
    id: string,
    payload: { message: string; attachments?: FileUploadAsset[] }
  ): Promise<TicketDetailData> {
    const form = buildTicketForm(payload, false);
    return apiUpload<TicketDetailData>(`${ADMIN}/tickets/${id}/reply`, form);
  },

  async updateTicketStatus(
    id: string,
    status: 'in_progress' | 'resolved' | 'closed'
  ): Promise<{ ticket: unknown }> {
    return apiPatch(`${ADMIN}/tickets/${id}/status`, { status });
  },

  async assignTicket(
    id: string,
    adminId: string
  ): Promise<{ ticket: unknown; assigned_admin: unknown }> {
    return apiPatch(`${ADMIN}/tickets/${id}/assign`, { admin_id: adminId });
  },
};
