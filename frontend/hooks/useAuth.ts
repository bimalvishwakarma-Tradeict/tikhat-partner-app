import { useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  getJwtExpiry,
  useAuthStore,
  type AuthTokens,
  type AuthUser,
  type UserRole,
} from '../store/authStore';

const LOGIN_HREF = '/(auth)/login' as Href;
const PARTNER_DASHBOARD_HREF = '/(partner)/dashboard' as Href;
const ADMIN_DASHBOARD_HREF = '/(admin)/dashboard' as Href;

/** Refresh 60s before access-token expiry (min delay 5s). */
const REFRESH_SKEW_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;

export function useAuth() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const loginStore = useAuthStore((state) => state.login);
  const logoutStore = useAuthStore((state) => state.logout);
  const refreshTokensStore = useAuthStore((state) => state.refreshTokens);
  const hydrate = useAuthStore((state) => state.hydrate);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInvestor = user?.role === 'investor';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  const clearRefreshTimer = () => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  };

  const refreshTokens = async () => {
    return refreshTokensStore();
  };

  /**
   * Legacy screen signature: login(user, accessToken)
   * Also supports login(tokens, user) per Task 16.4.
   */
  const login = async (
    arg1: AuthUser | AuthTokens,
    arg2?: string | AuthUser,
    arg3?: string
  ) => {
    if (
      arg1 &&
      typeof arg1 === 'object' &&
      'accessToken' in arg1 &&
      arg2 &&
      typeof arg2 === 'object' &&
      'id' in arg2
    ) {
      await loginStore(arg1 as AuthTokens, arg2 as AuthUser);
      const nextUser = arg2 as AuthUser;
      if (nextUser.role === 'investor') {
        router.replace(PARTNER_DASHBOARD_HREF);
        return;
      }
      router.replace(ADMIN_DASHBOARD_HREF);
      return;
    }

    const nextUser = arg1 as AuthUser;
    const access = String(arg2 || '');
    await loginStore(nextUser, access, arg3);

    if (nextUser.role === 'investor') {
      router.replace(PARTNER_DASHBOARD_HREF);
      return;
    }

    router.replace(ADMIN_DASHBOARD_HREF);
  };

  const logout = async () => {
    clearRefreshTimer();
    await logoutStore();
    router.replace(LOGIN_HREF);
  };

  const hasRole = (roles: UserRole | UserRole[]) => {
    if (!user) return false;
    const list = Array.isArray(roles) ? roles : [roles];
    return list.includes(user.role);
  };

  // Proactive auto-refresh before access token expires
  useEffect(() => {
    clearRefreshTimer();

    const activeAccess = accessToken || token;
    if (!isAuthenticated || !activeAccess || !refreshToken) {
      return;
    }

    const exp = getJwtExpiry(activeAccess);
    if (exp === null) {
      return;
    }

    const delay = Math.max(
      exp * 1000 - Date.now() - REFRESH_SKEW_MS,
      MIN_REFRESH_DELAY_MS
    );

    refreshTimer.current = setTimeout(() => {
      void refreshTokensStore().catch(() => {
        void logoutStore().then(() => {
          router.replace(LOGIN_HREF);
        });
      });
    }, delay);

    return clearRefreshTimer;
  }, [
    accessToken,
    token,
    refreshToken,
    isAuthenticated,
    refreshTokensStore,
    logoutStore,
    router,
  ]);

  return {
    user,
    token,
    accessToken: accessToken || token,
    refreshToken,
    isAuthenticated,
    isHydrated,
    isLoading,
    isInvestor,
    isAdmin,
    isSuperAdmin,
    login,
    logout,
    refreshTokens,
    hydrate,
    hasRole,
  };
}
