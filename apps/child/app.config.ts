import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const easProjectId = process.env.EXPO_PUBLIC_CHILD_EAS_PROJECT_ID?.trim();

const config: ExpoConfig = {
  name: 'ChoreX Child',
  slug: 'chorex-child',
  version: '0.0.0',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'chorex-child',
  ios: {
    bundleIdentifier: 'dev.chorex.bootstrap.child',
    googleServicesFile: './firebase/dev/GoogleService-Info.plist',
  },
  android: {
    package: 'dev.chorex.bootstrap.child',
    googleServicesFile: './firebase/dev/google-services.json',
  },
  ...(easProjectId
    ? { extra: { eas: { projectId: easProjectId } } }
    : undefined),
  plugins: [
    'expo-router',
    'expo-dev-client',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    'expo-notifications',
    'expo-secure-store',
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
};

export default config;
