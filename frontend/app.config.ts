import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo config with environment variables (Task 27.2).
 * Static defaults live in app.json; this file injects runtime env.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    'https://tikhatpartner.online/api/v1';

  const previousExtra =
    config.extra && typeof config.extra === 'object' ? config.extra : {};

  return {
    ...config,
    name: config.name ?? 'Tikhat Partner',
    slug: config.slug ?? 'tikhat-partner',
    version: config.version ?? '1.0.0',
    scheme: config.scheme ?? 'tikhatpartner',
    orientation: config.orientation ?? 'portrait',
    userInterfaceStyle: config.userInterfaceStyle ?? 'automatic',
    extra: {
      ...previousExtra,
      apiUrl,
      eas: {
        ...(typeof (previousExtra as { eas?: unknown }).eas === 'object' &&
        (previousExtra as { eas?: object }).eas
          ? (previousExtra as { eas: object }).eas
          : {}),
      },
    },
  };
};
