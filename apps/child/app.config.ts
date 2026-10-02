import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const config: ExpoConfig = {
  name: 'ChoreX Child',
  slug: 'chorex-child',
  version: '0.0.0',
  userInterfaceStyle: 'light',
  scheme: 'chorex-child',
  ios: { bundleIdentifier: 'dev.chorex.bootstrap.child' },
  android: { package: 'dev.chorex.bootstrap.child' },
  plugins: ['expo-router', 'expo-dev-client'],
};

export default config;
