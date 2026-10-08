import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const easProjectId = process.env.EXPO_PUBLIC_PARENT_EAS_PROJECT_ID?.trim();

const production = process.env.EXPO_PUBLIC_FIREBASE_MODE === 'production';
const iosFirebaseFile = production
  ? process.env.CHOREX_PARENT_GOOGLE_SERVICES_IOS
  : './firebase/dev/GoogleService-Info.plist';
const androidFirebaseFile = production
  ? process.env.CHOREX_PARENT_GOOGLE_SERVICES_ANDROID
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
  name: 'ChoreX Parent',
  slug: 'chorex-parent',
  version: '0.0.0',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'chorex-parent',
  ios: {
    ...(production
      ? {
          entitlements: {
            'com.apple.developer.devicecheck.appattest-environment':
              'production',
          },
        }
      : undefined),
    bundleIdentifier: 'dev.chorex.bootstrap.parent',
    googleServicesFile: iosFirebaseFile,
  },
  android: {
    package: 'dev.chorex.bootstrap.parent',
    googleServicesFile: androidFirebaseFile,
  },
  ...(easProjectId
    ? { extra: { eas: { projectId: easProjectId } } }
    : undefined),
  plugins: [
    'expo-router',
    'expo-dev-client',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    'expo-notifications',
    'expo-secure-store',
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
};

export default config;
