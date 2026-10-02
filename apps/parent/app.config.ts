import type { ExpoConfig } from 'expo/config';

// Temporary local-development identifiers; not production identity decisions.
const config: ExpoConfig = {
  name: 'ChoreX Parent',
  slug: 'chorex-parent',
  version: '0.0.0',
  userInterfaceStyle: 'light',
  scheme: 'chorex-parent',
  ios: { bundleIdentifier: 'dev.chorex.bootstrap.parent' },
  android: { package: 'dev.chorex.bootstrap.parent' },
  plugins: ['expo-router', 'expo-dev-client'],
};

export default config;
