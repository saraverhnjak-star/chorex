import { randomUUID } from 'node:crypto';
import {
  negotiationNotificationDataSchema,
  type NegotiationNotificationData,
} from '@chorex/domain';
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

export interface NotificationIntent {
  recipientUid: string;
  recipientRole: 'PARENT' | 'CHILD';
  title: string;
  body: string;
  data: NegotiationNotificationData;
}
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: NegotiationNotificationData;
  sound: 'default';
  channelId: 'default';
}
export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
}
export type ExpoTransport = (
  messages: readonly ExpoMessage[],
) => Promise<readonly ExpoTicket[]>;

// Terms, notes, names, and caller-supplied recipients never enter push payloads.
export function negotiationNotificationIntent(
  event: DocumentData,
  offer: DocumentData,
): NotificationIntent | undefined {
  if (
    event.entityType !== 'OFFER' ||
    event.familyId !== offer.familyId ||
    typeof offer.parentUid !== 'string' ||
    typeof offer.childUid !== 'string'
  )
    return;
  const parentActor =
    event.actorType === 'PARENT' && event.actorUid === offer.parentUid;
  const childActor =
    event.actorType === 'CHILD' && event.actorUid === offer.childUid;
  if (!parentActor && !childActor) return;
  let title: string;
  let body: string;
  switch (event.type) {
    case 'OFFER_PUBLISHED':
      if (!parentActor) return;
      title = 'New offer';
      body = 'You have a new chore offer.';
      break;
    case 'OFFER_COUNTERED':
      title = 'New proposal';
      body = parentActor
        ? 'Your offer has new terms.'
        : 'A counteroffer is waiting for you.';
      break;
    case 'OFFER_ACCEPTED':
      title = 'Agreement reached';
      body = 'Your contract is active.';
      break;
    default:
      return;
  }
  const data = negotiationNotificationDataSchema.safeParse({
    type: event.type,
    entityType: event.type === 'OFFER_ACCEPTED' ? 'CONTRACT' : 'OFFER',
    entityId:
      event.type === 'OFFER_ACCEPTED' ? event.contractId : event.entityId,
    familyId: offer.familyId,
  });
  if (!data.success) return;
  return {
    recipientUid: parentActor ? offer.childUid : offer.parentUid,
    recipientRole: parentActor ? 'CHILD' : 'PARENT',
    title,
    body,
    data: data.data,
  };
}

export async function sendExpoMessages(
  messages: readonly ExpoMessage[],
): Promise<readonly ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let offset = 0; offset < messages.length; offset += 100) {
    const chunk = messages.slice(offset, offset + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('EXPO_TRANSPORT_FAILED');
    const result = (await response.json()) as { data?: ExpoTicket[] };
    if (
      !Array.isArray(result.data) ||
      result.data.length !== chunk.length ||
      result.data.some(
        (ticket) => ticket.status !== 'ok' && ticket.status !== 'error',
      )
    )
      throw new Error('EXPO_INVALID_RESPONSE');
    tickets.push(...result.data);
  }
  return tickets;
}

const maxAttempts = 3;
const leaseMs = 120000;

// One deterministic effect record is owned by its committed activity event.
// Expo has no exactly-once send primitive: ambiguous transport failures can repeat a physical push.
export async function dispatchNegotiationNotification(
  firestore: Firestore,
  eventId: string,
  transport: ExpoTransport,
): Promise<void> {
  const eventRef = firestore.doc(`activityEvents/${eventId}`);
  const effectRef = eventRef.collection('notificationEffects').doc('expo');
  const leaseId = randomUUID();
  const intent = await firestore.runTransaction(async (tx) => {
    const [eventSnapshot, effectSnapshot] = await Promise.all([
      tx.get(eventRef),
      tx.get(effectRef),
    ]);
    const event = eventSnapshot.data();
    if (
      !event ||
      !['OFFER_PUBLISHED', 'OFFER_COUNTERED', 'OFFER_ACCEPTED'].includes(
        event.type,
      )
    )
      return;
    const effect = effectSnapshot.data();
    if (effect && ['COMPLETE', 'SKIPPED', 'FAILED'].includes(effect.status))
      return;
    const now = Timestamp.now();
    if (
      effect?.leaseUntil instanceof Timestamp &&
      effect.leaseUntil.toMillis() > now.toMillis()
    )
      throw new Error('NOTIFICATION_LEASE_BUSY');
    if (effect && effect.attempts >= maxAttempts) {
      tx.set(effectRef, { status: 'FAILED', updatedAt: now }, { merge: true });
      return;
    }
    if (
      typeof event.entityId !== 'string' ||
      typeof event.revisionId !== 'string'
    )
      return;
    const offerRef = firestore.doc(`offers/${event.entityId}`);
    const [offerSnapshot, revisionSnapshot] = await Promise.all([
      tx.get(offerRef),
      tx.get(offerRef.collection('revisions').doc(event.revisionId)),
    ]);
    const offer = offerSnapshot.data();
    const revision = revisionSnapshot.data();
    if (!offer || !revision) return;
    const resolved = negotiationNotificationIntent(event, offer);
    if (!resolved) return;
    // Historical committed revisions remain valid even if later negotiation has advanced.
    const expectedProposer =
      event.type === 'OFFER_ACCEPTED'
        ? event.actorType === 'PARENT'
          ? offer.childUid
          : offer.parentUid
        : event.actorUid;
    if (
      revision.proposedByUid !== expectedProposer ||
      revision.proposedByRole !==
        (expectedProposer === offer.parentUid ? 'PARENT' : 'CHILD')
    )
      return;
    if (event.type === 'OFFER_ACCEPTED') {
      const contract = (
        await tx.get(firestore.doc(`contracts/${event.contractId}`))
      ).data();
      if (
        !contract ||
        contract.familyId !== offer.familyId ||
        contract.parentUid !== offer.parentUid ||
        contract.childUid !== offer.childUid ||
        contract.source?.offerId !== event.entityId ||
        contract.source?.revisionId !== event.revisionId
      )
        return;
    }
    const member = (
      await tx.get(
        firestore.doc(
          `families/${offer.familyId}/members/${resolved.recipientUid}`,
        ),
      )
    ).data();
    if (
      !member ||
      member.status !== 'ACTIVE' ||
      member.role !== resolved.recipientRole
    ) {
      tx.set(effectRef, {
        status: 'SKIPPED',
        reason: 'RECIPIENT_INACTIVE',
        updatedAt: now,
      });
      return;
    }
    tx.set(effectRef, {
      status: 'PROCESSING',
      attempts: (effect?.attempts ?? 0) + 1,
      leaseId,
      leaseUntil: Timestamp.fromMillis(now.toMillis() + leaseMs),
      recipientUid: resolved.recipientUid,
      data: resolved.data,
      updatedAt: now,
    });
    return resolved;
  });
  if (!intent) return;
  try {
    const devices = await firestore
      .collection(`users/${intent.recipientUid}/devices`)
      .where('pushEnabled', '==', true)
      .get();
    const unique = new Map<string, (typeof devices.docs)[number]>();
    for (const device of devices.docs) {
      const value = device.data();
      if (
        value.appVariant === intent.recipientRole &&
        typeof value.expoPushToken === 'string' &&
        /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(
          value.expoPushToken,
        )
      )
        unique.set(value.expoPushToken, device);
    }
    const tokens = [...unique.keys()];
    const messages: ExpoMessage[] = tokens.map((to) => ({
      to,
      title: intent.title,
      body: intent.body,
      data: intent.data,
      sound: 'default',
      channelId: 'default',
    }));
    const tickets = messages.length ? await transport(messages) : [];
    if (tickets.length !== messages.length)
      throw new Error('EXPO_INVALID_RESPONSE');
    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i].details?.error === 'DeviceNotRegistered') {
        const token = tokens[i];
        // Disable all duplicate registrations, without disabling a newly rotated token.
        await firestore.runTransaction(async (tx) => {
          const matching = devices.docs.filter(
            (device) => device.data().expoPushToken === token,
          );
          const current = await Promise.all(
            matching.map((device) => tx.get(device.ref)),
          );
          current.forEach((device) => {
            if (device.data()?.expoPushToken === token)
              tx.update(device.ref, { pushEnabled: false });
          });
        });
      }
    }
    if (
      tickets.some(
        (ticket) =>
          ticket.status === 'error' &&
          ticket.details?.error !== 'DeviceNotRegistered',
      )
    )
      throw new Error('EXPO_TICKET_FAILED');
    await firestore.runTransaction(async (tx) => {
      const effect = (await tx.get(effectRef)).data();
      if (effect?.leaseId === leaseId)
        tx.update(effectRef, {
          status: 'COMPLETE',
          deviceCount: messages.length,
          ticketIds: tickets.flatMap((ticket) =>
            ticket.id ? [ticket.id] : [],
          ),
          updatedAt: Timestamp.now(),
        });
    });
  } catch {
    const retry = await firestore.runTransaction(async (tx) => {
      const effect = (await tx.get(effectRef)).data();
      if (effect?.leaseId !== leaseId) return false;
      const retryable = effect.attempts < maxAttempts;
      tx.update(effectRef, {
        status: retryable ? 'RETRY' : 'FAILED',
        leaseUntil: Timestamp.fromMillis(0),
        updatedAt: Timestamp.now(),
      });
      return retryable;
    });
    if (retry) throw new Error('NOTIFICATION_DELIVERY_RETRY');
  }
}
