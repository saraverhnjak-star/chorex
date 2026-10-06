import { createHash, randomUUID } from 'node:crypto';
import {
  Timestamp,
  type Firestore,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { warn } from 'firebase-functions/logger';

const minute = 60000;
export const receiptPolicy = {
  batchSize: 100,
  initialDelayMs: 15 * minute,
  leaseMs: 2 * minute,
  maxAttempts: 5,
  lifetimeMs: 24 * 60 * minute,
  retentionMs: 7 * 24 * 60 * minute,
} as const;
export const pushTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export interface RegistrationBinding {
  devicePath: string;
  tokenHash: string;
  lastSeenAt?: Timestamp;
}
export function bindRegistrations(
  devices: readonly DocumentSnapshot[],
): RegistrationBinding[] {
  return devices.map((device) => ({
    devicePath: device.ref.path,
    tokenHash: pushTokenHash(device.data()!.expoPushToken),
    ...(device.data()?.lastSeenAt instanceof Timestamp
      ? { lastSeenAt: device.data()!.lastSeenAt }
      : {}),
  }));
}
function matches(
  binding: RegistrationBinding,
  device: DocumentSnapshot,
): boolean {
  const data = device.data();
  return (
    data?.pushEnabled === true &&
    typeof data.expoPushToken === 'string' &&
    pushTokenHash(data.expoPushToken) === binding.tokenHash &&
    (binding.lastSeenAt
      ? data.lastSeenAt instanceof Timestamp &&
        binding.lastSeenAt.isEqual(data.lastSeenAt)
      : !(data.lastSeenAt instanceof Timestamp))
  );
}
async function readBindings(
  db: Firestore,
  tx: Transaction,
  bindings: readonly RegistrationBinding[],
) {
  return Promise.all(
    bindings.map((binding) => tx.get(db.doc(binding.devicePath))),
  );
}
function disableBindings(
  tx: Transaction,
  bindings: readonly RegistrationBinding[],
  devices: readonly DocumentSnapshot[],
) {
  bindings.forEach((binding, index) => {
    if (matches(binding, devices[index]))
      tx.update(devices[index].ref, { pushEnabled: false });
  });
}
export async function invalidatePushRegistrations(
  db: Firestore,
  bindings: readonly RegistrationBinding[],
) {
  await db.runTransaction(async (tx) => {
    const devices = await readBindings(db, tx, bindings);
    disableBindings(tx, bindings, devices);
  });
}
export async function retainExpoTickets(
  db: Firestore,
  eventId: string,
  entries: readonly {
    index: number;
    ticket: { status: 'ok' | 'error'; id?: string };
    registrations: readonly RegistrationBinding[];
  }[],
) {
  const accepted = entries.filter((entry) => entry.ticket.status === 'ok');
  if (
    accepted.some(
      (entry) =>
        typeof entry.ticket.id !== 'string' ||
        !entry.ticket.id ||
        entry.ticket.id.length > 512,
    )
  )
    throw new Error('EXPO_INVALID_TICKET');
  // Stable per event/ticket/message; safe for repeated persistence and transport test doubles.
  const refs = accepted.map((entry) =>
    db.doc(
      `pushReceipts/${pushTokenHash(`${eventId}:${entry.ticket.id}:${entry.index}`)}`,
    ),
  );
  for (let offset = 0; offset < accepted.length; offset += 100)
    await db.runTransaction(async (tx) => {
      const chunk = accepted.slice(offset, offset + 100),
        chunkRefs = refs.slice(offset, offset + 100);
      const existing = await Promise.all(chunkRefs.map((ref) => tx.get(ref)));
      const now = Timestamp.now();
      chunk.forEach((entry, i) => {
        if (!existing[i].exists)
          tx.create(chunkRefs[i], {
            eventId,
            ticketId: entry.ticket.id,
            registrations: entry.registrations,
            complete: false,
            status: 'PENDING',
            attempts: 0,
            createdAt: now,
            expiresAt: Timestamp.fromMillis(
              now.toMillis() + receiptPolicy.lifetimeMs,
            ),
            nextAttemptAt: Timestamp.fromMillis(
              now.toMillis() + receiptPolicy.initialDelayMs,
            ),
          });
      });
    });
}
export class ReceiptTransportError extends Error {
  constructor(
    readonly category:
      'TRANSIENT_TRANSPORT' | 'PERMANENT_REQUEST' | 'MALFORMED_RESPONSE',
  ) {
    super(category);
  }
}
export type ReceiptTransport = (
  ids: readonly string[],
) => Promise<Record<string, unknown>>;
export const getExpoReceipts: ReceiptTransport = async (ids) => {
  if (ids.length > 1000) throw new ReceiptTransportError('PERMANENT_REQUEST');
  let response: Response;
  try {
    response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ReceiptTransportError('TRANSIENT_TRANSPORT');
  }
  if (!response.ok)
    throw new ReceiptTransportError(
      response.status === 429 || response.status >= 500
        ? 'TRANSIENT_TRANSPORT'
        : 'PERMANENT_REQUEST',
    );
  let result: { data?: unknown; errors?: { code?: string }[] };
  try {
    result = await response.json();
  } catch {
    throw new ReceiptTransportError('MALFORMED_RESPONSE');
  }
  if (
    result?.errors !== undefined &&
    (!Array.isArray(result.errors) ||
      result.errors.some((error) => !error || typeof error !== 'object'))
  )
    throw new ReceiptTransportError('MALFORMED_RESPONSE');
  if (result?.errors?.length)
    throw new ReceiptTransportError(
      result.errors.some((error) => error.code === 'TOO_MANY_REQUESTS')
        ? 'TRANSIENT_TRANSPORT'
        : 'PERMANENT_REQUEST',
    );
  if (
    !result?.data ||
    typeof result.data !== 'object' ||
    Array.isArray(result.data)
  )
    throw new ReceiptTransportError('MALFORMED_RESPONSE');
  return result.data as Record<string, unknown>;
};
export function classifyExpoReceipt(raw: unknown): {
  status: string;
  category: string;
  retry: boolean;
  invalidate: boolean;
} {
  if (raw === undefined)
    return {
      status: 'PENDING',
      category: 'NOT_AVAILABLE',
      retry: true,
      invalidate: false,
    };
  if (!raw || typeof raw !== 'object' || !('status' in raw))
    return {
      status: 'MESSAGE_ERROR',
      category: 'MALFORMED_RESPONSE',
      retry: false,
      invalidate: false,
    };
  if (raw.status === 'ok')
    return {
      status: 'SUCCEEDED',
      category: 'PROVIDER_ACCEPTED',
      retry: false,
      invalidate: false,
    };
  const error =
    'details' in raw &&
    raw.details &&
    typeof raw.details === 'object' &&
    'error' in raw.details
      ? raw.details.error
      : undefined;
  if (raw.status !== 'error')
    return {
      status: 'MESSAGE_ERROR',
      category: 'MALFORMED_RESPONSE',
      retry: false,
      invalidate: false,
    };
  if (error === 'DeviceNotRegistered')
    return {
      status: 'DEVICE_INVALID',
      category: error,
      retry: false,
      invalidate: true,
    };
  if (error === 'MessageRateExceeded')
    return {
      status: 'PENDING',
      category: error,
      retry: true,
      invalidate: false,
    };
  if (error === 'MessageTooBig')
    return {
      status: 'MESSAGE_ERROR',
      category: error,
      retry: false,
      invalidate: false,
    };
  if (error === 'MismatchSenderId' || error === 'InvalidCredentials')
    return {
      status: 'PROVIDER_ERROR',
      category: error,
      retry: false,
      invalidate: false,
    };
  return {
    status: 'PROVIDER_ERROR',
    category: 'UNRECOGNIZED_ERROR',
    retry: false,
    invalidate: false,
  };
}
function validBindings(value: unknown): value is RegistrationBinding[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (binding) =>
        binding &&
        typeof binding.devicePath === 'string' &&
        /^users\/[^/]+\/devices\/[^/]+$/.test(binding.devicePath) &&
        typeof binding.tokenHash === 'string' &&
        /^[a-f0-9]{64}$/.test(binding.tokenHash) &&
        (binding.lastSeenAt === undefined ||
          binding.lastSeenAt instanceof Timestamp),
    )
  );
}
export async function processPushReceipts(
  db: Firestore,
  transport: ReceiptTransport,
  now = Timestamp.now(),
): Promise<number> {
  const due = await db
    .collection('pushReceipts')
    .where('complete', '==', false)
    .where('nextAttemptAt', '<=', now)
    .orderBy('nextAttemptAt', 'asc')
    .limit(receiptPolicy.batchSize)
    .get();
  const claimed: {
    ref: DocumentSnapshot['ref'];
    ticketId: string;
    leaseId: string;
  }[] = [];
  for (const candidate of due.docs) {
    const leaseId = randomUUID();
    const ticketId = await db.runTransaction(async (tx) => {
      const data = (await tx.get(candidate.ref)).data();
      if (
        !data ||
        data.complete ||
        !(data.nextAttemptAt instanceof Timestamp) ||
        data.nextAttemptAt.toMillis() > now.toMillis()
      )
        return;
      if (
        typeof data.ticketId !== 'string' ||
        !data.ticketId ||
        !validBindings(data.registrations) ||
        !Number.isInteger(data.attempts) ||
        data.attempts < 0 ||
        data.attempts >= receiptPolicy.maxAttempts ||
        !(data.expiresAt instanceof Timestamp) ||
        data.expiresAt.toMillis() <= now.toMillis()
      ) {
        tx.update(candidate.ref, {
          complete: true,
          status: 'EXHAUSTED',
          category: 'EXPIRED_OR_INVALID_WORK',
          completedAt: now,
          deleteAfter: Timestamp.fromMillis(
            now.toMillis() + receiptPolicy.retentionMs,
          ),
        });
        return;
      }
      tx.update(candidate.ref, {
        status: 'PROCESSING',
        leaseId,
        attempts: data.attempts + 1,
        nextAttemptAt: Timestamp.fromMillis(
          now.toMillis() + receiptPolicy.leaseMs,
        ),
      });
      return data.ticketId as string;
    });
    if (ticketId) claimed.push({ ref: candidate.ref, ticketId, leaseId });
  }
  let receipts: Record<string, unknown> = {},
    failure: ReceiptTransportError | undefined;
  if (claimed.length)
    try {
      receipts = await transport([
        ...new Set(claimed.map((item) => item.ticketId)),
      ]);
    } catch (error) {
      failure =
        error instanceof ReceiptTransportError
          ? error
          : new ReceiptTransportError('TRANSIENT_TRANSPORT');
    }
  for (const item of claimed) {
    const outcome = failure
      ? {
          status:
            failure.category === 'TRANSIENT_TRANSPORT'
              ? 'PENDING'
              : 'PROVIDER_ERROR',
          category: failure.category,
          retry: failure.category === 'TRANSIENT_TRANSPORT',
          invalidate: false,
        }
      : classifyExpoReceipt(
          Object.hasOwn(receipts, item.ticketId)
            ? receipts[item.ticketId]
            : undefined,
        );
    const terminal = await db.runTransaction(async (tx) => {
      const data = (await tx.get(item.ref)).data();
      if (!data || data.complete || data.leaseId !== item.leaseId) return false;
      const devices = outcome.invalidate
        ? await readBindings(db, tx, data.registrations)
        : [];
      const retry =
        outcome.retry &&
        data.attempts < receiptPolicy.maxAttempts &&
        data.expiresAt.toMillis() > now.toMillis();
      if (outcome.invalidate) disableBindings(tx, data.registrations, devices);
      tx.update(item.ref, {
        complete: !retry,
        status: retry
          ? 'PENDING'
          : outcome.retry
            ? 'EXHAUSTED'
            : outcome.status,
        category: outcome.category,
        updatedAt: now,
        ...(retry
          ? {
              nextAttemptAt: Timestamp.fromMillis(
                now.toMillis() +
                  Math.min(
                    4 * 60 * minute,
                    receiptPolicy.initialDelayMs * 2 ** (data.attempts - 1),
                  ),
              ),
            }
          : {
              completedAt: now,
              deleteAfter: Timestamp.fromMillis(
                now.toMillis() + receiptPolicy.retentionMs,
              ),
            }),
      });
      return !retry;
    });
    if (terminal && outcome.status !== 'SUCCEEDED')
      warn('PUSH_RECEIPT_TERMINAL', {
        receiptWorkId: item.ref.id,
        category: outcome.category,
      });
  }
  const old = await db
    .collection('pushReceipts')
    .where('complete', '==', true)
    .where('deleteAfter', '<=', now)
    .orderBy('deleteAfter', 'asc')
    .limit(receiptPolicy.batchSize)
    .get();
  if (!old.empty) {
    const batch = db.batch();
    old.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  return claimed.length;
}
