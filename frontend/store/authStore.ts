import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

export type UserRole = 'investor' | 'admin' | 'super_admin';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

export type ThemePreference = 'light' | 'dark';

type AuthState = {
  user: AuthUser | null;
  /** Access token (alias kept for existing callers) */
  token: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  /** Light/dark UI preference (persisted separately from session) */
  themePreference: ThemePreference;
  isThemeHydrated: boolean;
  /**
   * Persist session. Prefer `login(tokens, user)`.
   * Also accepts legacy `(user, accessToken)` used by screens via useAuth.
   */
  login: {
    (tokens: AuthTokens, user: AuthUser): Promise<void>;
    (user: AuthUser, accessToken: string, refreshToken?: string): Promise<void>;
  };
  logout: () => Promise<void>;
  refreshTokens: () => Promise<string>;
  hydrate: () => Promise<void>;
  hydrateTheme: () => Promise<void>;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setLoading: (isLoading: boolean) => void;
};

export const ACCESS_TOKEN_KEY = 'tikhat_access_token';
export const REFRESH_TOKEN_KEY = 'tikhat_refresh_token';
export const USER_KEY = 'tikhat_auth_user';
export const THEME_PREFERENCE_KEY = 'tikhat_theme_preference';
const WEB_COOKIE_TOKEN = 'tikhat_access_token';

const isWeb = Platform.OS === 'web';

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

function writeWebAccessCookie(token: string | null): void {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (!token) {
    document.cookie = `${WEB_COOKIE_TOKEN}=; Max-Age=0; path=/`;
    return;
  }
  // Non-httpOnly cookie bridge for web (true httpOnly requires Set-Cookie from API).
  document.cookie = `${WEB_COOKIE_TOKEN}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

/**
 * Decode JWT `exp` (seconds). Returns null if missing/invalid.
 */
export function getJwtExpiry(token: string | null | undefined): number | null {
  if (!token) {
    return null;
  }
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const atobFn = globalThis.atob;
    if (typeof atobFn !== 'function') {
      return null;
    }
    const json = JSON.parse(atobFn(pad)) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export function isAccessTokenValid(
  token: string | null | undefined,
  skewMs = 5000
): boolean {
  if (!token) {
    return false;
  }
  const exp = getJwtExpiry(token);
  if (exp === null) {
    return true;
  }
  return exp * 1000 > Date.now() + skewMs;
}

function isAuthTokens(
  value: AuthTokens | AuthUser
): value is AuthTokens {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof (value as AuthTokens).accessToken === 'string'
  );
}

async function persistSession(
  user: AuthUser,
  accessToken: string,
  refreshToken?: string | null
): Promise<{ accessToken: string; refreshToken: string | null }> {
  await saveSecureItem(ACCESS_TOKEN_KEY, accessToken);
  await saveSecureItem(USER_KEY, JSON.stringify(user));

  let nextRefresh = refreshToken ?? null;
  if (nextRefresh) {
    await saveSecureItem(REFRESH_TOKEN_KEY, nextRefresh);
  } else {
    nextRefresh = await getSecureItem(REFRESH_TOKEN_KEY);
  }

  writeWebAccessCookie(accessToken);

  return { accessToken, refreshToken: nextRefresh };
}

async function clearPersistedSession(): Promise<void> {
  await deleteSecureItem(ACCESS_TOKEN_KEY);
  await deleteSecureItem(REFRESH_TOKEN_KEY);
  await deleteSecureItem(USER_KEY);
  writeWebAccessCookie(null);
}

function parseThemePreference(value: string | null): ThemePreference {
  return value === 'dark' ? 'dark' : 'light';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  themePreference: 'light',
  isThemeHydrated: false,

  setLoading: (isLoading) => set({ isLoading }),

  hydrateTheme: async () => {
    try {
      const raw = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
      set({
        themePreference: parseThemePreference(raw),
        isThemeHydrated: true,
      });
    } catch {
      set({ themePreference: 'light', isThemeHydrated: true });
    }
  },

  setThemePreference: async (preference) => {
    const next: ThemePreference = preference === 'dark' ? 'dark' : 'light';
    set({ themePreference: next });
    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
    } catch {
      // Preference still applied in-memory for this session
    }
  },

  toggleTheme: async () => {
    const next: ThemePreference =
      get().themePreference === 'dark' ? 'light' : 'dark';
    await get().setThemePreference(next);
  },

  login: (async (
    arg1: AuthTokens | AuthUser,
    arg2?: AuthUser | string,
    arg3?: string
  ) => {
    set({ isLoading: true });
    try {
      let user: AuthUser;
      let accessToken: string;
      let refreshToken: string | undefined;

      if (isAuthTokens(arg1)) {
        user = arg2 as AuthUser;
        accessToken = arg1.accessToken;
        refreshToken = arg1.refreshToken;
      } else {
        user = arg1;
        accessToken = String(arg2 || '');
        refreshToken = arg3;
      }

      if (!user?.id || !accessToken) {
        throw new Error('login requires user and access token');
      }

      const persisted = await persistSession(user, accessToken, refreshToken);

      set({
        user,
        token: persisted.accessToken,
        accessToken: persisted.accessToken,
        refreshToken: persisted.refreshToken,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  }) as AuthState['login'],

  logout: async () => {
    set({ isLoading: true });
    try {
      await clearPersistedSession();
    } finally {
      set({
        user: null,
        token: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  refreshTokens: async () => {
    const currentRefresh =
      get().refreshToken || (await getSecureItem(REFRESH_TOKEN_KEY));

    if (!currentRefresh) {
      await get().logout();
      throw new Error('Refresh token missing');
    }

    set({ isLoading: true });

    try {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
      if (!baseUrl) {
        throw new Error('EXPO_PUBLIC_API_URL is not configured');
      }

      const role = get().user?.role;
      const path =
        role === 'admin' || role === 'super_admin'
          ? '/api/v1/auth/admin/refresh'
          : '/api/v1/auth/refresh';

      const response = await axios.post<{
        success: boolean;
        message: string;
        data: { accessToken: string; expiresIn?: string | number; sessionId?: string };
      }>(
        `${baseUrl}${path}`,
        { refreshToken: currentRefresh },
        { headers: { Accept: 'application/json' } }
      );

      const accessToken = response.data?.data?.accessToken;
      if (!accessToken) {
        throw new Error('Refresh response missing access token');
      }

      await saveSecureItem(ACCESS_TOKEN_KEY, accessToken);
      writeWebAccessCookie(accessToken);

      set({
        token: accessToken,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
      });

      return accessToken;
    } catch (error) {
      await get().logout();
      throw error;
    }
  },

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const [accessToken, refreshToken, userRaw, themeRaw] = await Promise.all([
        getSecureItem(ACCESS_TOKEN_KEY),
        getSecureItem(REFRESH_TOKEN_KEY),
        getSecureItem(USER_KEY),
        AsyncStorage.getItem(THEME_PREFERENCE_KEY),
      ]);

      set({
        themePreference: parseThemePreference(themeRaw),
        isThemeHydrated: true,
      });

      const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : null;

      if (!user || (!accessToken && !refreshToken)) {
        await clearPersistedSession();
        set({
          user: null,
          token: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isHydrated: true,
          isLoading: false,
        });
        return;
      }

      if (accessToken && isAccessTokenValid(accessToken)) {
        writeWebAccessCookie(accessToken);
        set({
          user,
          token: accessToken,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isHydrated: true,
          isLoading: false,
        });
        return;
      }

      // Access expired — try refresh
      if (refreshToken) {
        set({
          user,
          token: accessToken,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isHydrated: true,
        });
        try {
          await get().refreshTokens();
          set({ isHydrated: true, isLoading: false });
          return;
        } catch {
          set({
            user: null,
            token: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isHydrated: true,
            isLoading: false,
          });
          return;
        }
      }

      await clearPersistedSession();
      set({
        user: null,
        token: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isHydrated: true,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        token: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isHydrated: true,
        isLoading: false,
      });
    }
  },
}));

// Keep store in sync when API layer clears/sets tokens without going through login/logout.
useAuthStore.subscribe((state, prev) => {
  if (!state.token && prev.token) {
    if (state.refreshToken || state.accessToken || state.user) {
      useAuthStore.setState({
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        user: null,
      });
    }
    return;
  }

  if (state.token && state.token !== prev.token) {
    if (state.accessToken !== state.token) {
      useAuthStore.setState({ accessToken: state.token });
    }
    void getSecureItem(REFRESH_TOKEN_KEY).then((refresh) => {
      if (refresh && useAuthStore.getState().refreshToken !== refresh) {
        useAuthStore.setState({ refreshToken: refresh });
      }
    });
  }
});
