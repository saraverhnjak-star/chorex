import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const config: ExpoConfig = {
  name: 'ChoreX Child',
  slug: 'chorex-child',
  version: '0.0.0',
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
  plugins: [
    'expo-router',
    'expo-dev-client',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
};

export default config;
