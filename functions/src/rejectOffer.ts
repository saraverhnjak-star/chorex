import { createHash } from 'node:crypto';
import {
  offerCommandErrorCodes,
  rejectOfferInputSchema,
  rejectOfferOutputSchema,
  type OfferCommandErrorCode,
  type RejectOfferInput,
  type RejectOfferOutput,
} from '@chorex/domain';
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'rejectOffer';

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  offerId: string;
  revisionId: string;
  payloadHash: string;
  status: 'COMPLETE';
}

export class RejectOfferCommandError extends Error {
  constructor(readonly code: OfferCommandErrorCode) {
    super(code);
    this.name = 'RejectOfferCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseInput(rawInput: unknown): RejectOfferInput {
  const result = rejectOfferInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new RejectOfferCommandError(offerCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function requestPayloadHash(input: RejectOfferInput): string {
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
  input: RejectOfferInput,
  payloadHash: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.offerId !== input.offerId ||
    record.revisionId !== input.currentRevisionId ||
    record.payloadHash !== payloadHash
  ) {
    throw new RejectOfferCommandError(
      offerCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveChildMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE') {
    throw new RejectOfferCommandError(
      offerCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'CHILD') {
    throw new RejectOfferCommandError(offerCommandErrorCodes.wrongActorRole);
  }
}

function parseTimestamp(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}

async function readOutput(
  firestore: Firestore,
  offerId: string,
): Promise<RejectOfferOutput> {
  const snapshot = await firestore.doc(`offers/${offerId}`).get();
  const offer = snapshot.data();
  if (!snapshot.exists || !offer) throw new Error('OFFER_NOT_FOUND');
  return rejectOfferOutputSchema.parse({
    offer: {
      id: offerId,
      familyId: offer.familyId,
      parentUid: offer.parentUid,
      childUid: offer.childUid,
      status: offer.status,
      currentRevisionId: offer.currentRevisionId,
      ...(offer.expiresAt === undefined
        ? {}
        : { expiresAt: parseTimestamp(offer.expiresAt) }),
      createdAt: parseTimestamp(offer.createdAt),
      updatedAt: parseTimestamp(offer.updatedAt),
    },
  });
}

export async function executeRejectOffer(
  firestore: Firestore,
  actorUid: string,
  rawInput: unknown,
): Promise<RejectOfferOutput> {
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
    const offer = offerSnapshot.data();
    if (
      !offerSnapshot.exists ||
      !offer ||
      typeof offer.familyId !== 'string' ||
      typeof offer.parentUid !== 'string' ||
      typeof offer.childUid !== 'string' ||
      typeof offer.currentRevisionId !== 'string'
    ) {
      throw new RejectOfferCommandError(offerCommandErrorCodes.forbidden);
    }

    const completedRecord = idempotencySnapshot.exists
      ? parseIdempotencyRecord(idempotencySnapshot.data())
      : undefined;
    if (completedRecord) {
      requireMatchingRequest(completedRecord, actorUid, input, payloadHash);
    }

    const membershipReference = firestore.doc(
      `families/${offer.familyId}/members/${actorUid}`,
    );
    const [membershipSnapshot, revisionSnapshot] = await Promise.all([
      transaction.get(membershipReference),
      transaction.get(revisionReference),
    ]);
    requireActiveChildMembership(membershipSnapshot.data());
    if (offer.childUid !== actorUid) {
      throw new RejectOfferCommandError(offerCommandErrorCodes.forbidden);
    }

    if (completedRecord) {
      if (
        offer.status !== 'REJECTED' ||
        offer.currentRevisionId !== input.currentRevisionId
      ) {
        throw new Error('INVALID_COMPLETED_REJECT_STATE');
      }
      return;
    }

    if (offer.status !== 'AWAITING_CHILD') {
      throw new RejectOfferCommandError(offerCommandErrorCodes.invalidState);
    }
    if (offer.currentRevisionId !== input.currentRevisionId) {
      throw new RejectOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    const revision = revisionSnapshot.data();
    if (!revisionSnapshot.exists || !revision) {
      throw new RejectOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    if (
      revision.proposedByRole !== 'PARENT' ||
      revision.proposedByUid !== offer.parentUid
    ) {
      throw new RejectOfferCommandError(offerCommandErrorCodes.invalidState);
    }

    const rejectedAt = Timestamp.now();
    const activityReference = firestore.collection('activityEvents').doc();
    transaction.update(offerReference, {
      status: 'REJECTED',
      updatedAt: rejectedAt,
    });
    transaction.create(activityReference, {
      familyId: offer.familyId,
      actorUid,
      actorType: 'CHILD',
      type: 'OFFER_REJECTED',
      entityType: 'OFFER',
      entityId: input.offerId,
      revisionId: input.currentRevisionId,
      createdAt: rejectedAt,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: offer.familyId,
      offerId: input.offerId,
      revisionId: input.currentRevisionId,
      payloadHash,
      activityEventId: activityReference.id,
      status: 'COMPLETE',
      completedAt: rejectedAt,
    });
  });

  return readOutput(firestore, input.offerId);
}
