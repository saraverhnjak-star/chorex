module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((?:.pnpm/)?(?:react-native|@react-native|expo|@expo|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets|@chorex))|.*(?:react-native|@react-native|expo|@expo|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets))',
  ],
};
