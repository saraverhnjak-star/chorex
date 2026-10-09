// No native imports: safe for read-model tests and for startup before the SDK is ready.
export const diagnosticOperations = [
  'bootstrap',
  'auth',
  'familyRead',
  'offerRead',
  'contractRead',
  'rewardRead',
  'createFamily',
  'createChild',
  'createOfferDraft',
  'publishOffer',
  'acceptOffer',
  'rejectOffer',
  'counterOffer',
  'createPairingSession',
  'redeemPairingSession',
  'recordTaskCompletion',
  'submitContractForReview',
  'approveContract',
  'requestContractChanges',
  'markRewardDelivered',
  'confirmRewardReceived',
  'pushRegistration',
  'notificationRouting',
  'renderBoundary',
] as const;
export type DiagnosticOperation = (typeof diagnosticOperations)[number];
const reportableCodes = [
  'FIREBASE_BOOTSTRAP_FAILED',
  'UNKNOWN_AUTH_FAILURE',
  'UNKNOWN_FAMILY_FAILURE',
  'UNKNOWN_PAIRING_FAILURE',
  'UNKNOWN_CONTRACT_FAILURE',
  'UNKNOWN_REWARD_FAILURE',
  'PROFILE_READ_FAILED',
  'OFFER_INBOX_READ_FAILED',
  'MALFORMED_OFFER_DATA',
  'MALFORMED_DATA',
  'READ_FAILED',
  'PUSH_REGISTRATION_FAILED',
  'NOTIFICATION_ROUTING_FAILED',
  'RENDER_BOUNDARY_FAILED',
] as const;
export type DiagnosticCode = (typeof reportableCodes)[number];
export type RouteCategory =
  | 'HOME'
  | 'OFFERS'
  | 'CONTRACTS'
  | 'REWARDS'
  | 'SETTINGS'
  | 'AUTH'
  | 'PAIRING'
  | 'OTHER';
export interface DiagnosticContext {
  authenticated?: boolean;
  routeCategory?: RouteCategory;
}
export interface DiagnosticTransport {
  record(error: Error, name: string): void;
  attributes(values: Record<string, string>): Promise<unknown>;
  log(message: string): void;
}
export function createDiagnosticReporter() {
  let transport: DiagnosticTransport | undefined;
  const seenErrors = new WeakSet<object>();
  const categories = new Set<string>();
  const pending: { error: Error; name: string }[] = [];
  let context: Record<string, string> = {};
  let lastBreadcrumb: string | undefined;
  function safely(action: () => unknown) {
    try {
      void Promise.resolve(action()).catch(() => undefined);
    } catch {
      /* fail-soft */
    }
  }
  return {
    attach(next: DiagnosticTransport) {
      transport = next;
      safely(() => next.attributes(context));
      for (const item of pending.splice(0))
        safely(() => next.record(item.error, item.name));
    },
    context(input: DiagnosticContext) {
      // Reconstruct explicitly: unknown keys (UIDs, titles, payloads) cannot reach the SDK.
      const next: Record<string, string> = {};
      if (typeof input.authenticated === 'boolean')
        next.authenticated = String(input.authenticated);
      if (
        [
          'HOME',
          'OFFERS',
          'CONTRACTS',
          'REWARDS',
          'SETTINGS',
          'AUTH',
          'PAIRING',
          'OTHER',
        ].includes(input.routeCategory ?? '')
      )
        next.routeCategory = input.routeCategory!;
      context = { ...context, ...next };
      if (transport) safely(() => transport!.attributes(next));
    },
    breadcrumb(
      kind:
        | 'bootstrap_started'
        | 'bootstrap_completed'
        | 'authenticated'
        | 'unauthenticated',
    ) {
      if (kind === lastBreadcrumb) return;
      lastBreadcrumb = kind;
      if (
        transport &&
        [
          'bootstrap_started',
          'bootstrap_completed',
          'authenticated',
          'unauthenticated',
        ].includes(kind)
      )
        safely(() => transport!.log(kind));
    },
    report(original: unknown, operation: DiagnosticOperation, code: string) {
      if (
        !diagnosticOperations.includes(operation) ||
        !(reportableCodes as readonly string[]).includes(code)
      )
        return;
      const providerCode =
        original && typeof original === 'object' && 'code' in original
          ? original.code
          : undefined;
      if (
        typeof providerCode === 'string' &&
        /(?:unavailable|deadline-exceeded|network-request-failed|permission-denied|unauthenticated|cancelled|NETWORK_UNAVAILABLE|TOKEN_TIMEOUT|ERR_NETWORK|user-disabled)$/.test(
          providerCode,
        )
      )
        return;
      if (original && typeof original === 'object') {
        if (seenErrors.has(original)) return;
        seenErrors.add(original);
      }
      const name = `${operation}:${code}`;
      // Bound listener storms and memory: at most one category per operation per JS process.
      if (categories.has(name) || categories.size >= 32) return;
      categories.add(name);
      const error = new Error(name);
      error.name = 'ChoreXOperationalError';
      // Preserve frame coordinates, never external messages, file URLs, paths or arbitrary properties.
      const rawStack = original instanceof Error ? original.stack : undefined;
      const frames = (rawStack ?? '')
        .split('\n')
        .slice(1, 25)
        .flatMap((line) => {
          const match =
            line.match(/^\s*at ([A-Za-z0-9_.$]+) .*:(\d+):(\d+)\)?$/) ??
            line.match(/^([A-Za-z0-9_.$]+)@.*:(\d+):(\d+)$/);
          return match
            ? [`    at ${match[1]} (app.js:${match[2]}:${match[3]})`]
            : [];
        });
      const safeFrames = frames.length
        ? frames
        : ['    at diagnosticBoundary (app.js:0:0)'];
      error.stack = `${error.name}: ${name}\n${safeFrames.join('\n')}`;
      if (transport) safely(() => transport!.record(error, name));
      else if (pending.length < 32) pending.push({ error, name });
    },
  };
}
const registry = globalThis as typeof globalThis & {
  __chorexDiagnosticReporter?: ReturnType<typeof createDiagnosticReporter>;
};
export const diagnosticReporter = (registry.__chorexDiagnosticReporter ??=
  createDiagnosticReporter());
export const recordOperationalError = diagnosticReporter.report;
export const setObservabilityContext = diagnosticReporter.context;
export const logDiagnosticBreadcrumb = diagnosticReporter.breadcrumb;
export function reportBoundaryError(error: unknown) {
  recordOperationalError(error, 'renderBoundary', 'RENDER_BOUNDARY_FAILED');
}

export function routeCategory(pathname: string): RouteCategory {
  const route = pathname.split('/').filter(Boolean)[0];
  if (!route) return 'HOME';
  return (
    (
      {
        offers: 'OFFERS',
        contracts: 'CONTRACTS',
        rewards: 'REWARDS',
        more: 'SETTINGS',
        settings: 'SETTINGS',
        'sign-in': 'AUTH',
        register: 'AUTH',
        pair: 'PAIRING',
        pairing: 'PAIRING',
      } as Record<string, RouteCategory>
    )[route] ?? 'OTHER'
  );
}
