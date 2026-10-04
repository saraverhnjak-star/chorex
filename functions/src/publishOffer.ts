import { createHash } from 'node:crypto';
import {
  offerCommandErrorCodes,
  publishOfferInputSchema,
  publishOfferOutputSchema,
  type OfferCommandErrorCode,
  type PublishOfferInput,
  type PublishOfferOutput,
} from '@chorex/domain';
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'publishOffer';

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  offerId: string;
  revisionId: string;
  payloadHash: string;
  status: 'COMPLETE';
}

export class PublishOfferCommandError extends Error {
  constructor(readonly code: OfferCommandErrorCode) {
    super(code);
    this.name = 'PublishOfferCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseInput(rawInput: unknown): PublishOfferInput {
  const result = publishOfferInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new PublishOfferCommandError(offerCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function requestPayloadHash(input: PublishOfferInput): string {
  return hash(
    JSON.stringify({
      offerId: input.offerId,
      currentRevisionId: input.currentRevisionId,
    }),
  );
}

function idempotencyDocumentId(actorUid: string, key: string): string {
  return hash(`${commandName}:${actorUid}:${key}`);
}

function parseIdempotencyRecord(
  data: DocumentData | undefined,
): IdempotencyRecord {
  if (
    !data ||
    data.command !== commandName ||
    typeof data.actorUid !== 'string' ||
    typeof data.offerId !== 'string' ||
    typeof data.revisionId !== 'string' ||
    typeof data.payloadHash !== 'string' ||
    data.status !== 'COMPLETE'
  ) {
    throw new Error('INVALID_IDEMPOTENCY_RECORD');
  }
  return {
    command: commandName,
    actorUid: data.actorUid,
    offerId: data.offerId,
    revisionId: data.revisionId,
    payloadHash: data.payloadHash,
    status: 'COMPLETE',
  };
}

function requireMatchingRequest(
  record: IdempotencyRecord,
  actorUid: string,
  input: PublishOfferInput,
  payloadHash: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.offerId !== input.offerId ||
    record.revisionId !== input.currentRevisionId ||
    record.payloadHash !== payloadHash
  ) {
    throw new PublishOfferCommandError(
      offerCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveParentMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE') {
    throw new PublishOfferCommandError(
      offerCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'PARENT') {
    throw new PublishOfferCommandError(offerCommandErrorCodes.wrongActorRole);
  }
}

function requireActiveChildMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE' || data.role !== 'CHILD') {
    throw new PublishOfferCommandError(
      offerCommandErrorCodes.childMembershipRequired,
    );
  }
}

function parseTimestamp(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}

async function readOutput(
  firestore: Firestore,
  offerId: string,
): Promise<PublishOfferOutput> {
  const snapshot = await firestore.doc(`offers/${offerId}`).get();
  const offer = snapshot.data();
  if (!snapshot.exists || !offer) throw new Error('OFFER_NOT_FOUND');
  return publishOfferOutputSchema.parse({
    offer: {
      id: offerId,
      familyId: offer.familyId,
      parentUid: offer.parentUid,
      childUid: offer.childUid,
      status: offer.status,
      currentRevisionId: offer.currentRevisionId,
      createdAt: parseTimestamp(offer.createdAt),
      updatedAt: parseTimestamp(offer.updatedAt),
    },
  });
}

export async function executePublishOffer(
  firestore: Firestore,
  actorUid: string,
  rawInput: unknown,
): Promise<PublishOfferOutput> {
  const input = parseInput(rawInput);
  const payloadHash = requestPayloadHash(input);
  const offerReference = firestore.doc(`offers/${input.offerId}`);
  const revisionReference = firestore.doc(
    `offers/${input.offerId}/revisions/${input.currentRevisionId}`,
  );
  const idempotencyReference = firestore.doc(
    `idempotency/${idempotencyDocumentId(actorUid, input.idempotencyKey)}`,
  );

  await firestore.runTransaction(async (transaction) => {
    const [offerSnapshot, idempotencySnapshot] = await Promise.all([
      transaction.get(offerReference),
      transaction.get(idempotencyReference),
    ]);
    const completedRequest = idempotencySnapshot.exists;
    if (completedRequest) {
      requireMatchingRequest(
        parseIdempotencyRecord(idempotencySnapshot.data()),
        actorUid,
        input,
        payloadHash,
      );
    }
    const offer = offerSnapshot.data();
    if (
      !offerSnapshot.exists ||
      !offer ||
      typeof offer.familyId !== 'string' ||
      typeof offer.parentUid !== 'string' ||
      typeof offer.childUid !== 'string' ||
      typeof offer.currentRevisionId !== 'string'
    ) {
      throw new PublishOfferCommandError(offerCommandErrorCodes.forbidden);
    }

    const parentMembershipReference = firestore.doc(
      `families/${offer.familyId}/members/${actorUid}`,
    );
    const childMembershipReference = firestore.doc(
      `families/${offer.familyId}/members/${offer.childUid}`,
    );
    const [parentSnapshot, childSnapshot, revisionSnapshot] = await Promise.all(
      [
        transaction.get(parentMembershipReference),
        transaction.get(childMembershipReference),
        transaction.get(revisionReference),
      ],
    );

    requireActiveParentMembership(parentSnapshot.data());
    if (offer.parentUid !== actorUid) {
      throw new PublishOfferCommandError(offerCommandErrorCodes.forbidden);
    }
    requireActiveChildMembership(childSnapshot.data());

    if (completedRequest) {
      if (
        offer.status !== 'AWAITING_CHILD' ||
        offer.currentRevisionId !== input.currentRevisionId
      ) {
        throw new Error('INVALID_COMPLETED_PUBLISH_STATE');
      }
      return;
    }

    if (offer.status !== 'DRAFT') {
      throw new PublishOfferCommandError(offerCommandErrorCodes.invalidState);
    }
    if (offer.currentRevisionId !== input.currentRevisionId) {
      throw new PublishOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    const revision = revisionSnapshot.data();
    if (
      !revisionSnapshot.exists ||
      !revision ||
      !(revision.deadlineAt instanceof Timestamp)
    ) {
      throw new PublishOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    const publishedAt = Timestamp.now();
    if (revision.deadlineAt.toMillis() <= publishedAt.toMillis()) {
      throw new PublishOfferCommandError(offerCommandErrorCodes.deadlinePassed);
    }

    const activityReference = firestore.collection('activityEvents').doc();
    transaction.update(offerReference, {
      status: 'AWAITING_CHILD',
      updatedAt: publishedAt,
    });
    transaction.create(activityReference, {
      familyId: offer.familyId,
      actorUid,
      actorType: 'PARENT',
      type: 'OFFER_PUBLISHED',
      entityType: 'OFFER',
      entityId: input.offerId,
      childUid: offer.childUid,
      revisionId: input.currentRevisionId,
      createdAt: publishedAt,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: offer.familyId,
      childUid: offer.childUid,
      offerId: input.offerId,
      revisionId: input.currentRevisionId,
      payloadHash,
      activityEventId: activityReference.id,
      status: 'COMPLETE',
      completedAt: publishedAt,
    });
  });

  return readOutput(firestore, input.offerId);
}
