/**
 * Axios API client — base URL from env, auth + maintenance interceptors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { ApiClientError, type ApiSuccessResponse } from '../types/api.types';
import { useAuthStore } from '../store/authStore';

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuth?: boolean;
  }
}

const ACCESS_TOKEN_KEY = 'tikhat_access_token';
const REFRESH_TOKEN_KEY = 'tikhat_refresh_token';
const USER_KEY = 'tikhat_auth_user';
const WEB_COOKIE_TOKEN = 'tikhat_access_token';

const LOGIN_HREF = '/(auth)/login' as Href;
const MAINTENANCE_HREF = '/maintenance' as Href;

const isWeb = Platform.OS === 'web';

type MaintenanceHandler = () => void;
type UnauthorizedHandler = () => void;

let maintenanceHandler: MaintenanceHandler | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let isHandlingUnauthorized = false;
let isHandlingMaintenance = false;

export function setMaintenanceHandler(handler: MaintenanceHandler | null): void {
  maintenanceHandler = handler;
}

export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null
): void {
  unauthorizedHandler = handler;
}

function getBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  throw new ApiClientError(
    'EXPO_PUBLIC_API_URL is not configured',
    0,
    'INTERNAL_ERROR'
  );
}

async function saveSecureItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getSecureItem(key: string): Promise<string | null> {
  if (isWeb) {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteSecureItem(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function readWebCookieToken(): string | null {
  if (!isWeb || typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WEB_COOKIE_TOKEN}=`));
  if (!match) {
    return null;
  }
  return decodeURIComponent(match.split('=').slice(1).join('='));
}

export async function getAccessToken(): Promise<string | null> {
  const fromStore = useAuthStore.getState().token;
  if (fromStore) {
    return fromStore;
  }
  const cookieToken = readWebCookieToken();
  if (cookieToken) {
    return cookieToken;
  }
  return getSecureItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getSecureItem(REFRESH_TOKEN_KEY);
}

export async function setAuthTokens(tokens: {
  accessToken: string;
  refreshToken?: string;
}): Promise<void> {
  await saveSecureItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await saveSecureItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  useAuthStore.setState({
    token: tokens.accessToken,
    isAuthenticated: true,
  });
}

export async function clearAuthSession(): Promise<void> {
  await deleteSecureItem(ACCESS_TOKEN_KEY);
  await deleteSecureItem(REFRESH_TOKEN_KEY);
  await deleteSecureItem(USER_KEY);
  if (isWeb && typeof document !== 'undefined') {
    document.cookie = `${WEB_COOKIE_TOKEN}=; Max-Age=0; path=/`;
  }
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
  });
}

function parseFilename(contentDisposition: string | undefined): string | null {
  if (!contentDisposition) {
    return null;
  }
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1].trim());
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plainMatch?.[1]?.trim() ?? null;
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
      success?: boolean;
    }>;

    if (!axiosError.response) {
      return new ApiClientError(
        'Connection failed. Please check your internet.',
        0,
        'NETWORK_ERROR'
      );
    }

    const status = axiosError.response.status;
    const body = axiosError.response.data;
    const message =
      (typeof body === 'object' && body?.message) ||
      (status >= 500
        ? 'Something went wrong. Please try again.'
        : axiosError.message);
    const code =
      (typeof body === 'object' && body?.error) ||
      (status === 401
        ? 'AUTH_UNAUTHORIZED'
        : status === 503
          ? 'MAINTENANCE_MODE'
          : 'UNKNOWN_ERROR');

    return new ApiClientError(String(message), status, String(code), body);
  }

  if (error instanceof Error) {
    return new ApiClientError(error.message, 0, 'UNKNOWN_ERROR');
  }

  return new ApiClientError('Unexpected error', 0, 'UNKNOWN_ERROR');
}

async function handleUnauthorized(): Promise<void> {
  if (isHandlingUnauthorized) {
    return;
  }
  isHandlingUnauthorized = true;
  try {
    await clearAuthSession();
    if (unauthorizedHandler) {
      unauthorizedHandler();
    } else {
      router.replace(LOGIN_HREF);
    }
  } finally {
    isHandlingUnauthorized = false;
  }
}

function handleMaintenance(): void {
  if (isHandlingMaintenance) {
    return;
  }
  isHandlingMaintenance = true;
  try {
    if (maintenanceHandler) {
      maintenanceHandler();
    } else {
      router.replace(MAINTENANCE_HREF);
    }
  } finally {
    isHandlingMaintenance = false;
  }
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: undefined,
    timeout: 60000,
    headers: {
      Accept: 'application/json',
    },
  });

  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      config.baseURL = getBaseUrl();

      const skipAuth = Boolean(config.skipAuth);
      if (!skipAuth) {
        const token = await getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      return config;
    }
  );

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const status = error.response?.status;

      if (status === 401) {
        await handleUnauthorized();
      } else if (status === 503) {
        handleMaintenance();
      }

      return Promise.reject(toApiClientError(error));
    }
  );

  return client;
}

export const apiClient: AxiosInstance = createApiClient();

type RequestConfig = AxiosRequestConfig & { skipAuth?: boolean };

async function unwrapData<T>(
  promise: Promise<AxiosResponse<ApiSuccessResponse<T> | T>>
): Promise<T> {
  try {
    const response = await promise;
    const body = response.data;

    if (
      body &&
      typeof body === 'object' &&
      'success' in body &&
      (body as ApiSuccessResponse<T>).success === true &&
      'data' in body
    ) {
      return (body as ApiSuccessResponse<T>).data;
    }

    return body as T;
  } catch (error) {
    throw toApiClientError(error);
  }
}

/** GET JSON and return `data` from the standard envelope (or raw body). */
export async function apiGet<T>(
  url: string,
  config?: RequestConfig
): Promise<T> {
  return unwrapData<T>(apiClient.get(url, config));
}

/** POST JSON and return `data` from the standard envelope (or raw body). */
export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: RequestConfig
): Promise<T> {
  return unwrapData<T>(apiClient.post(url, body, config));
}

/** PATCH JSON and return `data` from the standard envelope (or raw body). */
export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: RequestConfig
): Promise<T> {
  return unwrapData<T>(apiClient.patch(url, body, config));
}

/** DELETE and return `data` from the standard envelope (or raw body). */
export async function apiDelete<T>(
  url: string,
  config?: RequestConfig
): Promise<T> {
  return unwrapData<T>(apiClient.delete(url, config));
}

/**
 * Full success envelope (message + data). Use when callers need `message`.
 */
export async function apiRequest<T>(
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  body?: unknown,
  config?: RequestConfig
): Promise<ApiSuccessResponse<T>> {
  try {
    const response = await apiClient.request<ApiSuccessResponse<T>>({
      ...config,
      method,
      url,
      data: body,
    });

    const payload = response.data;
    if (payload && typeof payload === 'object' && 'success' in payload) {
      if (payload.success !== true) {
        throw new ApiClientError(
          (payload as { message?: string }).message || 'Request failed',
          response.status,
          (payload as { error?: string }).error || 'UNKNOWN_ERROR',
          payload
        );
      }
      return payload;
    }

    return {
      success: true,
      message: 'OK',
      data: payload as T,
    };
  } catch (error) {
    throw toApiClientError(error);
  }
}

/** Multipart POST (React Native FormData). */
export async function apiUpload<T>(
  url: string,
  formData: FormData,
  config?: RequestConfig
): Promise<T> {
  return unwrapData<T>(
    apiClient.post(url, formData, {
      ...config,
      headers: {
        ...(config?.headers || {}),
        'Content-Type': 'multipart/form-data',
      },
    })
  );
}

/** Binary download (PDF/Excel). */
export async function apiDownload(
  url: string,
  config?: RequestConfig
): Promise<{
  data: ArrayBuffer;
  contentType: string;
  filename: string | null;
}> {
  try {
    const response = await apiClient.get<ArrayBuffer>(url, {
      ...config,
      responseType: 'arraybuffer',
    });

    return {
      data: response.data,
      contentType: String(response.headers['content-type'] || 'application/octet-stream'),
      filename: parseFilename(
        response.headers['content-disposition'] as string | undefined
      ),
    };
  } catch (error) {
    throw toApiClientError(error);
  }
}

export { toApiClientError };
