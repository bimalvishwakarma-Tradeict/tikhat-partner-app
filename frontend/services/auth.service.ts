/**
 * Auth API service — investor + admin authentication flows.
 */

import {
  apiGet,
  apiPost,
  apiPatch,
  clearAuthSession,
  setAuthTokens,
} from './api';
import type {
  AuthTokensData,
  LoginOtpPendingData,
  LoginRequest,
  RefreshTokenData,
  RefreshTokenRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyOtpRequest,
} from '../types/api.types';

const AUTH = '/api/v1/auth';
const ADMIN_AUTH = '/api/v1/auth/admin';

export const authService = {
  async register(payload: RegisterRequest): Promise<void> {
    await apiPost<null>(`${AUTH}/register`, payload, { skipAuth: true });
  },

  async login(payload: LoginRequest): Promise<LoginOtpPendingData> {
    return apiPost<LoginOtpPendingData>(`${AUTH}/login`, payload, {
      skipAuth: true,
    });
  },

  async verifyOtp(payload: VerifyOtpRequest): Promise<AuthTokensData> {
    const data = await apiPost<AuthTokensData>(`${AUTH}/verify-otp`, payload, {
      skipAuth: true,
    });
    await setAuthTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return data;
  },

  async resendOtp(email: string): Promise<LoginOtpPendingData> {
    return apiPost<LoginOtpPendingData>(
      `${AUTH}/resend-otp`,
      { email },
      { skipAuth: true }
    );
  },

  async logout(): Promise<void> {
    try {
      await apiPost<null>(`${AUTH}/logout`);
    } finally {
      await clearAuthSession();
    }
  },

  async refresh(payload: RefreshTokenRequest): Promise<RefreshTokenData> {
    const data = await apiPost<RefreshTokenData>(`${AUTH}/refresh`, payload, {
      skipAuth: true,
    });
    await setAuthTokens({ accessToken: data.accessToken });
    return data;
  },

  async forgotPassword(email: string): Promise<LoginOtpPendingData> {
    return apiPost<LoginOtpPendingData>(
      `${AUTH}/forgot-password`,
      { email },
      { skipAuth: true }
    );
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<{
    email: string;
    status: string;
  }> {
    return apiPost(`${AUTH}/reset-password`, payload, { skipAuth: true });
  },

  async adminLogin(payload: LoginRequest): Promise<LoginOtpPendingData> {
    return apiPost<LoginOtpPendingData>(`${ADMIN_AUTH}/login`, payload, {
      skipAuth: true,
    });
  },

  async adminVerifyOtp(payload: VerifyOtpRequest): Promise<AuthTokensData> {
    const data = await apiPost<AuthTokensData>(
      `${ADMIN_AUTH}/verify-otp`,
      payload,
      { skipAuth: true }
    );
    await setAuthTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return data;
  },

  async adminResendOtp(email: string): Promise<LoginOtpPendingData> {
    return apiPost<LoginOtpPendingData>(
      `${ADMIN_AUTH}/resend-otp`,
      { email },
      { skipAuth: true }
    );
  },

  async adminLogout(): Promise<void> {
    try {
      await apiPost<null>(`${ADMIN_AUTH}/logout`);
    } finally {
      await clearAuthSession();
    }
  },

  async adminRefresh(payload: RefreshTokenRequest): Promise<RefreshTokenData> {
    const data = await apiPost<RefreshTokenData>(
      `${ADMIN_AUTH}/refresh`,
      payload,
      { skipAuth: true }
    );
    await setAuthTokens({ accessToken: data.accessToken });
    return data;
  },

  async getTerms(): Promise<unknown> {
    return apiGet('/api/v1/public/terms', { skipAuth: true });
  },

  async getPrivacy(): Promise<unknown> {
    return apiGet('/api/v1/public/privacy', { skipAuth: true });
  },

  async changePassword(payload: {
    current_password: string;
    new_password: string;
  }): Promise<void> {
    await apiPatch(`${AUTH}/change-password`, payload);
  },

  async listSessions(): Promise<{
    sessions: Array<{
      id: string;
      device_type: string;
      created_at: string;
      expires_at: string;
      is_current: boolean;
    }>;
  }> {
    return apiGet(`${AUTH}/sessions`);
  },
};
