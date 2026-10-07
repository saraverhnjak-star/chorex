jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native adapter
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
