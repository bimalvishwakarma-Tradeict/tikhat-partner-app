import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import {
  getLastSyncedAt,
  subscribeLastSynced,
} from '../../utils/lastSynced';

export type OfflineBannerProps = {
  testID?: string;
};

function formatLastUpdated(syncedAt: number | null): string | null {
  if (!syncedAt) {
    return null;
  }
  const minutes = Math.max(0, Math.round((Date.now() - syncedAt) / 60000));
  if (minutes <= 0) {
    return 'Last updated just now';
  }
  if (minutes === 1) {
    return 'Last updated 1 minute ago';
  }
  return `Last updated ${minutes} minutes ago`;
}

/**
 * Red top banner when the device has no internet connection.
 * Hides automatically when connectivity is restored.
 */
export function OfflineBanner({ testID }: OfflineBannerProps) {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(getLastSyncedAt());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected === true && state.isInternetReachable !== false;
      setOffline(!connected);
      if (connected) {
        // Keep last sync stamp; online recovery clears the banner.
        setSyncedAt(getLastSyncedAt());
      }
    });

    void NetInfo.fetch().then((state) => {
      const connected =
        state.isConnected === true && state.isInternetReachable !== false;
      setOffline(!connected);
    });

    const unsubSync = subscribeLastSynced((at) => {
      setSyncedAt(at);
    });

    return () => {
      unsubNet();
      unsubSync();
    };
  }, []);

  useEffect(() => {
    if (!offline) {
      return;
    }
    const id = setInterval(() => {
      setTick((n) => n + 1);
    }, 30000);
    return () => clearInterval(id);
  }, [offline]);

  const lastUpdated = useMemo(() => {
    void tick;
    return formatLastUpdated(syncedAt);
  }, [syncedAt, tick]);

  if (!offline) {
    return null;
  }

  return (
    <View
      testID={testID || 'offline-banner'}
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          backgroundColor: colors.error,
          paddingTop: Math.max(insets.top, spacing.sm),
          paddingBottom: spacing.sm,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Text
        style={[
          typography.subtitle,
          { color: colors.text.inverse, fontWeight: '700', textAlign: 'center' },
        ]}
      >
        No internet connection
      </Text>
      {lastUpdated ? (
        <Text
          style={[
            typography.caption,
            {
              color: colors.text.inverse,
              textAlign: 'center',
              marginTop: 2,
              opacity: 0.92,
            },
          ]}
        >
          {lastUpdated}
        </Text>
      ) : (
        <Text
          style={[
            typography.caption,
            {
              color: colors.text.inverse,
              textAlign: 'center',
              marginTop: 2,
              opacity: 0.92,
            },
          ]}
        >
          Showing last synced data
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    zIndex: 1000,
  },
});
