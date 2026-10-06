import {
  negotiationNotificationDataSchema,
  type NegotiationNotificationData,
} from '@chorex/domain';

export type NotificationRoutingIntent = NegotiationNotificationData;
export function parseNotificationRoutingIntent(
  data: unknown,
): NotificationRoutingIntent | undefined {
  const parsed = negotiationNotificationDataSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
export interface NotificationRoutingReadiness {
  authStatus: 'loading' | 'ready' | 'error';
  uid: string | null;
  routerReady: boolean;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function responseParts(response: unknown, defaultActionIdentifier: string) {
  const value = record(response);
  const request = record(record(value?.notification)?.request);
  if (
    value?.actionIdentifier !== defaultActionIdentifier ||
    typeof request?.identifier !== 'string' ||
    !request.identifier.trim() ||
    request.identifier.length > 512
  )
    return;
  return {
    key: JSON.stringify([request.identifier, value.actionIdentifier]),
    data: record(request.content)?.data,
  };
}

// One instance per app JS process: no domain cache or persisted navigation history.
export function createNotificationResponseCoordinator(
  defaultActionIdentifier: string,
) {
  const consumed = new Set<string>();
  let readiness: NotificationRoutingReadiness = {
    authStatus: 'loading',
    uid: null,
    routerReady: false,
  };
  let pending:
    { intent: NotificationRoutingIntent; ownerUid?: string } | undefined;
  let sink: ((intent: NotificationRoutingIntent) => void) | undefined;
  function flush() {
    if (!pending || readiness.authStatus === 'loading') return;
    if (
      readiness.authStatus === 'error' ||
      !readiness.uid ||
      (pending.ownerUid && pending.ownerUid !== readiness.uid)
    ) {
      pending = undefined;
      return;
    }
    pending.ownerUid = readiness.uid;
    if (!readiness.routerReady || !sink) return;
    const intent = pending.intent;
    pending = undefined;
    // Consume before navigation so reentrant renders cannot deliver it twice.
    try {
      sink(intent);
    } catch {
      /* No navigation retry loop or payload logging. */
    }
  }
  return {
    update(next: NotificationRoutingReadiness) {
      readiness = next;
      flush();
    },
    attach(navigate: (intent: NotificationRoutingIntent) => void) {
      sink = navigate;
      flush();
      return () => {
        if (sink === navigate) sink = undefined;
      };
    },
    receive(response: unknown): string | undefined {
      const parts = responseParts(response, defaultActionIdentifier);
      if (!parts) return;
      if (consumed.has(parts.key)) return parts.key;
      consumed.add(parts.key);
      // IDs only, retained for this JS process; no persisted navigation history.
      pending = undefined;
      const intent = parseNotificationRoutingIntent(parts.data);
      if (!intent) return parts.key;
      pending = {
        intent,
        ...(readiness.authStatus === 'ready' && readiness.uid
          ? { ownerUid: readiness.uid }
          : {}),
      };
      flush();
      return parts.key;
    },
    responseKey(response: unknown) {
      return responseParts(response, defaultActionIdentifier)?.key;
    },
  };
}
export type NotificationResponseCoordinator = ReturnType<
  typeof createNotificationResponseCoordinator
>;
export interface NotificationResponseTransport {
  addResponseListener(listener: (response: unknown) => void): {
    remove(): void;
  };
  getLastResponse(): unknown;
  clearLastResponse(): void;
}
export function listenForNotificationResponsesWithDependencies(
  coordinator: NotificationResponseCoordinator,
  transport: NotificationResponseTransport,
  navigate: (intent: NotificationRoutingIntent) => void,
): () => void {
  let active = true;
  const detach = coordinator.attach(navigate);
  const open = (response: unknown) => {
    if (!active) return;
    const key = coordinator.receive(response);
    if (!key) return;
    try {
      // Synchronous Expo APIs avoid clearing a newer response after an async race.
      if (coordinator.responseKey(transport.getLastResponse()) === key)
        transport.clearLastResponse();
    } catch {
      /* Native retrieval/clear failure must not break navigation. */
    }
  };
  let subscription: { remove(): void } | undefined;
  try {
    subscription = transport.addResponseListener(open);
  } catch {
    /* Try cold response independently. */
  }
  try {
    open(transport.getLastResponse());
  } catch {
    /* No response available. */
  }
  return () => {
    active = false;
    subscription?.remove();
    detach();
  };
}
