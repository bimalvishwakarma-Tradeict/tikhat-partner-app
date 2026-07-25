/**
 * Notification API service — investor inbox + admin broadcast/pending.
 */

import { apiClient, apiGet, apiPatch, apiPost, toApiClientError } from './api';
import type {
  AdminPendingCountsData,
  BroadcastNotificationRequest,
  NotificationsListData,
  UnreadCountData,
} from '../types/api.types';
import type { PaginationMeta } from '../types/models.types';
import { ApiClientError } from '../types/api.types';

const INVESTOR = '/api/v1/notifications';
const ADMIN = '/api/v1/admin/notifications';

export const notificationService = {
  async list(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ notifications: NotificationsListData['notifications']; meta?: PaginationMeta }> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        message: string;
        data: NotificationsListData | { notifications: NotificationsListData['notifications'] };
        meta?: PaginationMeta;
      }>(INVESTOR, { params });

      const body = response.data;
      const notifications =
        (body.data as NotificationsListData)?.notifications ||
        (Array.isArray(body.data) ? body.data : []) ||
        [];

      return {
        notifications: notifications as NotificationsListData['notifications'],
        meta: body.meta,
      };
    } catch (error) {
      throw toApiClientError(error);
    }
  },

  async getUnreadCount(): Promise<number> {
    const data = await apiGet<UnreadCountData>(`${INVESTOR}/unread-count`);
    return data.count;
  },

  async markRead(id: string): Promise<unknown> {
    return apiPatch(`${INVESTOR}/${id}/read`);
  },

  async markAllRead(): Promise<unknown> {
    return apiPatch(`${INVESTOR}/read-all`);
  },

  async getAdminPendingCounts(): Promise<AdminPendingCountsData> {
    return apiGet<AdminPendingCountsData>(`${ADMIN}/pending-counts`);
  },

  async getAdminSummary(): Promise<unknown> {
    return apiGet(`${ADMIN}/summary`);
  },

  async listAdmin(params?: {
    page?: number;
    limit?: number;
  }): Promise<NotificationsListData & { meta?: PaginationMeta }> {
    return apiGet(`${ADMIN}/`, { params });
  },

  async broadcast(payload: BroadcastNotificationRequest): Promise<unknown> {
    if (!payload.title?.trim() || !payload.body?.trim()) {
      throw new ApiClientError(
        'Title and body are required',
        400,
        'VALIDATION_ERROR'
      );
    }
    return apiPost(`${ADMIN}/broadcast`, payload);
  },
};
