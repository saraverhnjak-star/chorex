import { createDiagnosticReporter } from '../../../packages/firebase-client/src/observabilityCore';
import { initializeObservability } from '@chorex/firebase-client/observability';
import { ClientErrorFallback } from '@chorex/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { crashlyticsPolicy } from '@chorex/config/crashlytics';
import * as sdk from '@react-native-firebase/crashlytics';

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(() => ({ isCrashlyticsCollectionEnabled: true })),
  setCrashlyticsCollectionEnabled: jest.fn().mockResolvedValue(null),
  deleteUnsentReports: jest.fn().mockResolvedValue(undefined),
  setAttributes: jest.fn().mockResolvedValue(null),
  recordError: jest.fn(),
  log: jest.fn(),
  setUserId: jest.fn(),
}));
const transport = () => ({
  record: jest.fn(),
  attributes: jest.fn().mockResolvedValue(null),
  log: jest.fn(),
});
const registry = globalThis as typeof globalThis & {
  __chorexObservability?: Promise<'enabled' | 'disabled' | 'unavailable'>;
};
const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  delete registry.__chorexObservability;
  jest.clearAllMocks();
});

test('native policy defaults local/preview OFF, production ON and rejects unsafe validation configuration', () => {
  expect(crashlyticsPolicy().enabled).toBe(false);
  expect(
    crashlyticsPolicy({ mode: 'emulator', buildProfile: 'preview' }).native
      .crashlytics_auto_collection_enabled,
  ).toBe(false);
  expect(
    crashlyticsPolicy({ mode: 'production', buildProfile: 'production' })
      .enabled,
  ).toBe(true);
  expect(
    crashlyticsPolicy({ mode: 'emulator', validation: 'true' }).native
      .crashlytics_debug_enabled,
  ).toBe(true);
  expect(() =>
    crashlyticsPolicy({ mode: 'production', validation: 'true' }),
  ).toThrow();
  expect(() =>
    crashlyticsPolicy({ mode: 'emulator', buildProfile: 'production' }),
  ).toThrow();
});
test('test/dev startup disables collection and discards pending SDK reports', async () => {
  await initializeObservability({
    appVariant: 'PARENT',
    platform: 'ios',
    mode: 'emulator',
    developmentBuild: true,
    nativePolicy: { enabled: false, environment: 'development' },
  });
  expect(sdk.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(
    expect.anything(),
    false,
  );
  expect(sdk.deleteUnsentReports).toHaveBeenCalledTimes(1);
  expect(sdk.setAttributes).not.toHaveBeenCalled();
});
test('release bootstrap sets each variant without a user ID and initializes once', async () => {
  process.env.NODE_ENV = 'production';
  for (const appVariant of ['PARENT', 'CHILD'] as const) {
    delete registry.__chorexObservability;
    const input = {
      appVariant,
      platform: 'ios',
      mode: 'production',
      developmentBuild: false,
      nativePolicy: { enabled: true, environment: 'production' },
      appVersion: '0.0.0',
      buildVersion: '1',
    };
    const first = initializeObservability(input);
    expect(initializeObservability(input)).toBe(first);
    expect(await first).toBe('enabled');
    expect(sdk.setCrashlyticsCollectionEnabled).toHaveBeenLastCalledWith(
      expect.anything(),
      true,
    );
    expect(sdk.setAttributes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appVariant, environment: 'production' }),
    );
  }
  expect(sdk.setUserId).not.toHaveBeenCalled();
  const warning = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  delete registry.__chorexObservability;
  expect(
    await initializeObservability({
      appVariant: 'PARENT',
      platform: 'ios',
      mode: 'production',
      developmentBuild: false,
      nativePolicy: { enabled: false, environment: 'development' },
    }),
  ).toBe('unavailable');
  expect(sdk.setCrashlyticsCollectionEnabled).toHaveBeenLastCalledWith(
    expect.anything(),
    false,
  );
  delete registry.__chorexObservability;
  jest.mocked(sdk.getCrashlytics).mockReturnValueOnce({
    isCrashlyticsCollectionEnabled: false,
  } as ReturnType<typeof sdk.getCrashlytics>);
  expect(
    await initializeObservability({
      appVariant: 'CHILD',
      platform: 'ios',
      mode: 'production',
      developmentBuild: false,
      nativePolicy: { enabled: true, environment: 'production' },
    }),
  ).toBe('unavailable');
  expect(warning).toHaveBeenCalledTimes(2);
  warning.mockRestore();
});
test('expected domain/offline outcomes are ignored; unknown failures are sanitized and deduplicated', () => {
  const reporter = createDiagnosticReporter();
  const sink = transport();
  reporter.attach(sink);
  const error = Object.assign(
    new Error('private title token=https://secret/?email=private'),
    { uid: 'private-uid', payload: { title: 'private title' } },
  );
  error.stack =
    'Error: private content\n    at publish (https://secret/?token=private:20:4)';
  reporter.report(error, 'publishOffer', 'STALE_REVISION');
  reporter.report(
    { code: 'functions/unavailable' },
    'publishOffer',
    'UNKNOWN_FAMILY_FAILURE',
  );
  expect(sink.record).not.toHaveBeenCalled();
  reporter.report(error, 'publishOffer', 'UNKNOWN_FAMILY_FAILURE');
  reporter.report(error, 'publishOffer', 'UNKNOWN_FAMILY_FAILURE');
  reporter.report(new Error('again'), 'publishOffer', 'UNKNOWN_FAMILY_FAILURE');
  expect(sink.record).toHaveBeenCalledTimes(1);
  const sanitized = sink.record.mock.calls[0][0];
  expect(sanitized.message).toBe('publishOffer:UNKNOWN_FAMILY_FAILURE');
  expect(sanitized.stack).toContain('app.js:20:4');
  expect(JSON.stringify(sanitized) + sanitized.stack).not.toMatch(
    /private|https|uid|payload/,
  );
});
test('context accepts only bounded categories and transport failure cannot break recovery', () => {
  const reporter = createDiagnosticReporter();
  const sink = transport();
  reporter.attach(sink);
  reporter.context({
    authenticated: true,
    routeCategory: 'CONTRACTS',
    uid: 'secret',
    title: 'private',
  } as Parameters<typeof reporter.context>[0]);
  expect(sink.attributes).toHaveBeenLastCalledWith({
    authenticated: 'true',
    routeCategory: 'CONTRACTS',
  });
  sink.record.mockImplementation(() => {
    throw new Error('SDK down');
  });
  expect(() =>
    reporter.report(new Error(), 'bootstrap', 'FIREBASE_BOOTSTRAP_FAILED'),
  ).not.toThrow();
});
test('shared Router fallback reports the caught error once across rerender and preserves retry', () => {
  const error = new Error('private details');
  const report = jest.fn();
  const retry = jest.fn();
  const view = render(
    <ClientErrorFallback error={error} report={report} retry={retry} />,
  );
  view.rerender(
    <ClientErrorFallback error={error} report={report} retry={retry} />,
  );
  expect(report).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('private details')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
