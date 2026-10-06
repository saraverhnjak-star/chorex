import {
  bindRegistrations,
  retainExpoTickets,
  invalidatePushRegistrations,
} from './pushReceipts';
import { contractReviewId, contractRewardId } from './parentReviewDecision';
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
  onTickets?: (tickets: readonly ExpoTicket[], offset: number) => Promise<void>,
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

export function fulfillmentNotificationIntent(
  event: DocumentData,
  reward: DocumentData,
): NotificationIntent | undefined {
  if (
    event.type !== 'REWARD_FULFILLED' ||
    event.entityType !== 'REWARD' ||
    event.familyId !== reward.familyId ||
    event.actorType !== 'PARENT' ||
    event.actorUid !== reward.parentUid ||
    reward.status !== 'FULFILLED' ||
    reward.fulfilledBy !== reward.parentUid ||
    typeof reward.childUid !== 'string'
  )
    return;
  const data = negotiationNotificationDataSchema.safeParse({
    type: event.type,
    entityType: 'REWARD',
    entityId: event.entityId,
    familyId: reward.familyId,
  });
  if (!data.success) return;
  return {
    recipientUid: reward.childUid,
    recipientRole: 'CHILD',
    title: 'Reward delivered',
    body: 'Your reward was marked as delivered.',
    data: data.data,
  };
}

export function approvalNotificationIntent(
  event: DocumentData,
  contract: DocumentData,
): NotificationIntent | undefined {
  if (
    event.type !== 'CONTRACT_APPROVED' ||
    event.entityType !== 'CONTRACT' ||
    event.familyId !== contract.familyId ||
    event.actorType !== 'PARENT' ||
    event.actorUid !== contract.parentUid ||
    contract.status !== 'APPROVED' ||
    typeof contract.childUid !== 'string'
  )
    return;
  const data = negotiationNotificationDataSchema.safeParse({
    type: event.type,
    entityType: 'CONTRACT',
    entityId: event.entityId,
    familyId: contract.familyId,
  });
  if (!data.success) return;
  return {
    recipientUid: contract.childUid,
    recipientRole: 'CHILD',
    title: 'Reward earned',
    body: 'You earned your promised reward. Delivery is still pending.',
    data: data.data,
  };
}

export function submissionNotificationIntent(
  event: DocumentData,
  contract: DocumentData,
): NotificationIntent | undefined {
  if (
    event.type !== 'CONTRACT_SUBMITTED' ||
    event.entityType !== 'CONTRACT' ||
    event.familyId !== contract.familyId ||
    event.actorType !== 'CHILD' ||
    event.actorUid !== contract.childUid ||
    typeof contract.parentUid !== 'string'
  )
    return;
  const data = negotiationNotificationDataSchema.safeParse({
    type: event.type,
    entityType: 'CONTRACT',
    entityId: event.entityId,
    familyId: contract.familyId,
  });
  if (!data.success) return;
  return {
    recipientUid: contract.parentUid,
    recipientRole: 'PARENT',
    title: 'Ready for review',
    body: 'An agreement is waiting for your review.',
    data: data.data,
  };
}

export function changesRequestedNotificationIntent(
  event: DocumentData,
  contract: DocumentData,
): NotificationIntent | undefined {
  if (
    event.type !== 'CONTRACT_CHANGES_REQUESTED' ||
    event.entityType !== 'CONTRACT' ||
    event.familyId !== contract.familyId ||
    event.actorType !== 'PARENT' ||
    event.actorUid !== contract.parentUid ||
    typeof contract.childUid !== 'string'
  )
    return;
  const data = negotiationNotificationDataSchema.safeParse({
    type: event.type,
    entityType: 'CONTRACT',
    entityId: event.entityId,
    familyId: contract.familyId,
  });
  if (!data.success) return;
  return {
    recipientUid: contract.childUid,
    recipientRole: 'CHILD',
    title: 'Changes requested',
    body: 'A change was requested before approval.',
    data: data.data,
  };
}

export async function sendExpoMessages(
  messages: readonly ExpoMessage[],
  onTickets?: (tickets: readonly ExpoTicket[], offset: number) => Promise<void>,
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
        (ticket) =>
          !ticket ||
          (ticket.status !== 'ok' && ticket.status !== 'error') ||
          (ticket.status === 'ok' &&
            (typeof ticket.id !== 'string' || !ticket.id)),
      )
    )
      throw new Error('EXPO_INVALID_RESPONSE');
    await onTickets?.(result.data, offset);
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
      ![
        'OFFER_PUBLISHED',
        'OFFER_COUNTERED',
        'OFFER_ACCEPTED',
        'CONTRACT_APPROVED',
        'CONTRACT_CHANGES_REQUESTED',
        'CONTRACT_SUBMITTED',
        'REWARD_FULFILLED',
      ].includes(event.type)
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
    let resolved: NotificationIntent | undefined;
    let familyId: string;
    if (event.type === 'REWARD_FULFILLED') {
      if (
        typeof event.entityId !== 'string' ||
        !event.entityId ||
        event.entityId.includes('/')
      )
        return;
      const reward = (
        await tx.get(firestore.doc(`rewards/${event.entityId}`))
      ).data();
      if (
        !reward ||
        typeof reward.contractId !== 'string' ||
        reward.contractId.includes('/') ||
        !(reward.fulfilledAt instanceof Timestamp) ||
        event.entityId !== contractRewardId(reward.contractId)
      )
        return;
      const contract = (
        await tx.get(firestore.doc(`contracts/${reward.contractId}`))
      ).data();
      if (
        !contract ||
        contract.status !== 'APPROVED' ||
        contract.familyId !== reward.familyId ||
        contract.parentUid !== reward.parentUid ||
        contract.childUid !== reward.childUid
      )
        return;
      resolved = fulfillmentNotificationIntent(event, reward);
      if (!resolved) return;
      familyId = reward.familyId;
    } else if (event.type === 'CONTRACT_SUBMITTED') {
      if (
        typeof event.entityId !== 'string' ||
        !event.entityId ||
        event.entityId.includes('/')
      )
        return;
      const contract = (
        await tx.get(firestore.doc(`contracts/${event.entityId}`))
      ).data();
      if (!contract) return;
      // The immutable completed receipt validates committed submissions even after later decisions.
      const receipt = (
        await tx.get(
          firestore.doc(`idempotency/${eventId.replace(/^activity_/, '')}`),
        )
      ).data();
      if (
        !receipt ||
        receipt.command !== 'submitContractForReview' ||
        receipt.status !== 'COMPLETE' ||
        receipt.activityEventId !== eventId ||
        receipt.actorUid !== event.actorUid ||
        receipt.contractId !== event.entityId ||
        receipt.familyId !== contract.familyId ||
        receipt.result?.contract?.status !== 'READY_FOR_REVIEW' ||
        receipt.result.contract.id !== event.entityId ||
        receipt.result.contract.familyId !== contract.familyId ||
        receipt.result.contract.childUid !== contract.childUid ||
        receipt.result.contract.parentUid !== contract.parentUid
      )
        return;
      resolved = submissionNotificationIntent(event, contract);
      if (!resolved) return;
      familyId = contract.familyId;
    } else if (event.type === 'CONTRACT_CHANGES_REQUESTED') {
      if (
        typeof event.entityId !== 'string' ||
        !event.entityId ||
        event.entityId.includes('/') ||
        typeof event.reviewId !== 'string' ||
        event.reviewId.includes('/')
      )
        return;
      const [contractSnapshot, reviewSnapshot] = await Promise.all([
        tx.get(firestore.doc(`contracts/${event.entityId}`)),
        tx.get(
          firestore.doc(
            `contracts/${event.entityId}/reviews/${event.reviewId}`,
          ),
        ),
      ]);
      const contract = contractSnapshot.data(),
        review = reviewSnapshot.data();
      if (
        !contract ||
        !review ||
        review.decision !== 'REQUEST_CHANGES' ||
        !Number.isInteger(review.cycle) ||
        review.cycle < 0 ||
        event.reviewId !== contractReviewId(event.entityId, review.cycle) ||
        review.familyId !== contract.familyId ||
        review.contractId !== event.entityId ||
        review.reviewerUid !== contract.parentUid
      )
        return;
      // Immutable review validates a historical committed event after a later round opens.
      resolved = changesRequestedNotificationIntent(event, contract);
      if (!resolved) return;
      familyId = contract.familyId;
    } else if (event.type === 'CONTRACT_APPROVED') {
      if (
        typeof event.entityId !== 'string' ||
        !event.entityId ||
        event.entityId.includes('/')
      )
        return;
      const contract = (
        await tx.get(firestore.doc(`contracts/${event.entityId}`))
      ).data();
      if (
        !contract ||
        !Number.isInteger(contract.reviewCycle) ||
        contract.reviewCycle < 0
      )
        return;
      const reviewId = contractReviewId(event.entityId, contract.reviewCycle);
      const rewardId = contractRewardId(event.entityId);
      if (event.reviewId !== reviewId || event.rewardId !== rewardId) return;
      const [reviewSnapshot, rewardSnapshot] = await Promise.all([
        tx.get(
          firestore.doc(`contracts/${event.entityId}/reviews/${reviewId}`),
        ),
        tx.get(firestore.doc(`rewards/${rewardId}`)),
      ]);
      const review = reviewSnapshot.data(),
        reward = rewardSnapshot.data();
      if (
        !review ||
        !reward ||
        review.decision !== 'APPROVE' ||
        review.cycle !== contract.reviewCycle ||
        review.reviewerUid !== contract.parentUid ||
        review.familyId !== contract.familyId ||
        review.contractId !== event.entityId ||
        reward.familyId !== contract.familyId ||
        reward.contractId !== event.entityId ||
        reward.parentUid !== contract.parentUid ||
        reward.childUid !== contract.childUid
      )
        return;
      resolved = approvalNotificationIntent(event, contract);
      if (!resolved) return;
      familyId = contract.familyId;
    } else {
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
      resolved = negotiationNotificationIntent(event, offer);
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
      familyId = offer.familyId;
    }
    const member = (
      await tx.get(
        firestore.doc(`families/${familyId}/members/${resolved.recipientUid}`),
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
    const bindings = tokens.map((token) =>
      bindRegistrations(
        devices.docs.filter(
          (device) =>
            device.data().appVariant === intent.recipientRole &&
            device.data().expoPushToken === token,
        ),
      ),
    );
    const retain = (batch: readonly ExpoTicket[], offset: number) =>
      retainExpoTickets(
        firestore,
        eventId,
        batch.map((ticket, index) => ({
          index: offset + index,
          ticket,
          registrations: bindings[offset + index],
        })),
      );
    const tickets = messages.length ? await transport(messages, retain) : [];
    if (
      tickets.length !== messages.length ||
      tickets.some(
        (ticket) => !ticket || !['ok', 'error'].includes(ticket.status),
      )
    )
      throw new Error('EXPO_INVALID_RESPONSE');
    await retain(tickets, 0);
    for (let i = 0; i < tickets.length; i++) {
      if (
        tickets[i].status === 'error' &&
        tickets[i].details?.error === 'DeviceNotRegistered'
      )
        await invalidatePushRegistrations(firestore, bindings[i]);
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
