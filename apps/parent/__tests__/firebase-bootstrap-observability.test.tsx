import { configureFirebase as configureParent } from '../src/firebase';
import { configureFirebase as configureChild } from '../../child/src/firebase';
import { initializeFirebase } from '@chorex/firebase-client';
import { initializeObservability } from '@chorex/firebase-client/observability';

jest.mock('@chorex/firebase-client', () => ({ initializeFirebase: jest.fn() }));
jest.mock('@chorex/firebase-client/observability', () => ({
  initializeObservability: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '0.0.0',
      ios: { buildNumber: '1' },
      extra: { observability: { enabled: false, environment: 'development' } },
    },
  },
}));

it.each([
  ['PARENT', configureParent],
  ['CHILD', configureChild],
] as const)(
  '%s canonical Firebase bootstrap starts observability without awaiting it',
  (appVariant, configure) => {
    const services = Promise.resolve({});
    jest
      .mocked(initializeFirebase)
      .mockReturnValue(services as ReturnType<typeof initializeFirebase>);
    jest
      .mocked(initializeObservability)
      .mockReturnValue(new Promise(() => undefined));
    expect(configure()).toBe(services);
    expect(initializeObservability).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appVariant,
        platform: 'ios',
        nativePolicy: { enabled: false, environment: 'development' },
      }),
    );
  },
);
