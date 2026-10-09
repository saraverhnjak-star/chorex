import { crashlyticsPolicy } from '@chorex/config/crashlytics';
import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const easProjectId = process.env.EXPO_PUBLIC_CHILD_EAS_PROJECT_ID?.trim();

const observability = crashlyticsPolicy({
  mode: process.env.EXPO_PUBLIC_FIREBASE_MODE,
  validation: process.env.EXPO_PUBLIC_CRASHLYTICS_VALIDATION,
  buildProfile: process.env.EAS_BUILD_PROFILE,
});
const production = process.env.EXPO_PUBLIC_FIREBASE_MODE === 'production';
const iosFirebaseFile = production
  ? process.env.CHOREX_CHILD_GOOGLE_SERVICES_IOS
  : './firebase/dev/GoogleService-Info.plist';
const androidFirebaseFile = production
  ? process.env.CHOREX_CHILD_GOOGLE_SERVICES_ANDROID
  : './firebase/dev/google-services.json';
if (
  production &&
  (!iosFirebaseFile ||
    !androidFirebaseFile ||
    iosFirebaseFile.includes('/dev/') ||
    androidFirebaseFile.includes('/dev/'))
)
  throw new Error(
    'Production requires separate native Firebase files for both platforms.',
  );

const config: ExpoConfig = {
  name: 'ChoreX Child',
  slug: 'chorex-child',
  version: '0.0.0',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'chorex-child',
  ios: {
    ...(production
      ? {
          entitlements: {
            'com.apple.developer.devicecheck.appattest-environment':
              'production',
          },
        }
      : undefined),
    bundleIdentifier: 'dev.chorex.bootstrap.child',
    googleServicesFile: iosFirebaseFile,
  },
  android: {
    package: 'dev.chorex.bootstrap.child',
    googleServicesFile: androidFirebaseFile,
  },
  extra: {
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    observability: {
      enabled: observability.enabled,
      environment: observability.environment,
    },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    '@react-native-firebase/crashlytics',
    [
      '../../packages/config/withCrashlytics.cjs',
      {
        mode: process.env.EXPO_PUBLIC_FIREBASE_MODE,
        validation: process.env.EXPO_PUBLIC_CRASHLYTICS_VALIDATION,
        buildProfile: process.env.EAS_BUILD_PROFILE,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      },
    ],
    'expo-notifications',
    'expo-secure-store',
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
};

export default config;
