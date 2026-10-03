import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const easProjectId = process.env.EXPO_PUBLIC_PARENT_EAS_PROJECT_ID?.trim();

const config: ExpoConfig = {
  name: 'ChoreX Parent',
  slug: 'chorex-parent',
  version: '0.0.0',
  userInterfaceStyle: 'light',
  scheme: 'chorex-parent',
  ios: {
    bundleIdentifier: 'dev.chorex.bootstrap.parent',
    googleServicesFile: './firebase/dev/GoogleService-Info.plist',
  },
  android: {
    package: 'dev.chorex.bootstrap.parent',
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
