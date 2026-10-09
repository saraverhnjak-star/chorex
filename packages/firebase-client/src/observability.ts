import { crashlyticsPolicy } from '@chorex/config/crashlytics';
import { diagnosticReporter } from './observabilityCore';
declare const require: (
  name: string,
) => typeof import('@react-native-firebase/crashlytics');

export {
  recordOperationalError,
  setObservabilityContext,
  reportBoundaryError,
  logDiagnosticBreadcrumb,
  routeCategory,
} from './observabilityCore';

export type ObservabilityStatus = 'enabled' | 'disabled' | 'unavailable';
interface ObservabilityInput {
  appVariant: 'PARENT' | 'CHILD';
  platform: string;
  mode?: string;
  validation?: string;
  developmentBuild: boolean;
  appVersion?: string;
  buildVersion?: string;
  nativePolicy?: { enabled: boolean; environment: string };
}
const registry = globalThis as typeof globalThis & {
  __chorexObservability?: Promise<ObservabilityStatus>;
};
export function initializeObservability(
  input: ObservabilityInput,
): Promise<ObservabilityStatus> {
  if (registry.__chorexObservability) return registry.__chorexObservability;
  registry.__chorexObservability = (async () => {
    const policy = crashlyticsPolicy(input);
    // Test runner never initializes native collection. Dedicated builds alone opt in.
    const enabled =
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV !== 'test' &&
      policy.enabled &&
      (!input.developmentBuild || policy.environment === 'validation');
    // Lazy load keeps missing native modules fail-soft during upgrades.
    const sdk: typeof import('@react-native-firebase/crashlytics') = require('@react-native-firebase/crashlytics');
    const crashlytics = sdk.getCrashlytics();
    const initiallyEnabled = crashlytics.isCrashlyticsCollectionEnabled;
    const nativeMatches =
      input.nativePolicy?.enabled === policy.enabled &&
      input.nativePolicy.environment === policy.environment;
    await sdk.setCrashlyticsCollectionEnabled(
      crashlytics,
      enabled && nativeMatches,
    );
    if (!enabled || !nativeMatches) {
      await sdk.deleteUnsentReports(crashlytics);
      if (enabled && !nativeMatches)
        throw new Error('CRASHLYTICS_NATIVE_POLICY_MISMATCH');
      return 'disabled' as const;
    }
    // The SDK global JS handler caches native collection state at construction.
    // A persisted OFF override needs a cold restart after enabling; a Debug native
    // binary with production policy needs a proper Release rebuild.
    if (initiallyEnabled === false)
      throw new Error('CRASHLYTICS_NATIVE_COLD_START_REQUIRED');
    const version = (value?: string) =>
      value && /^[A-Za-z0-9_.+-]{1,40}$/.test(value) ? value : 'unknown';
    await sdk.setAttributes(crashlytics, {
      appVariant: input.appVariant,
      platform:
        input.platform === 'ios'
          ? 'ios'
          : input.platform === 'android'
            ? 'android'
            : 'unknown',
      environment: policy.environment,
      appVersion: version(input.appVersion),
      buildVersion: version(input.buildVersion),
    });
    diagnosticReporter.attach({
      record: (error, name) => sdk.recordError(crashlytics, error, name),
      attributes: (values) => sdk.setAttributes(crashlytics, values),
      log: (message) => sdk.log(crashlytics, message),
    });
    diagnosticReporter.breadcrumb('bootstrap_started');
    return 'enabled' as const;
  })().catch(() => {
    // No SDK exception content. Observability failure must not break normal startup.
    console.warn(
      'CHOREX_OBSERVABILITY_UNAVAILABLE: verify native build/configuration.',
    );
    return 'unavailable' as const;
  });
  return registry.__chorexObservability;
}
