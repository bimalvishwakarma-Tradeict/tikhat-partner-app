/**
 * React Query client — offline-first cache for last-synced data.
 */

import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  QueryClient,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { markDataSynced } from '../utils/lastSynced';

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    const connected =
      state.isConnected === true && state.isInternetReachable !== false;
    setOnline(connected);
  });
});

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

AppState.addEventListener('change', onAppStateChange);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: 'online',
    },
  },
});

queryClient.getQueryCache().subscribe((event) => {
  if (event?.type === 'updated' && event.query.state.status === 'success') {
    markDataSynced();
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event?.type === 'updated' && event.mutation.state.status === 'success') {
    markDataSynced();
  }
});
