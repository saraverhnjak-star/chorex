import { createHash } from 'node:crypto';
import {
  createOfferDraftInputSchema,
  createOfferDraftOutputSchema,
  offerCommandErrorCodes,
  type CreateOfferDraftInput,
  type CreateOfferDraftOutput,
  type OfferCommandErrorCode,
} from '@chorex/domain';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'createOfferDraft';

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  familyId: string;
  childUid: string;
  payloadHash: string;
  offerId: string;
  revisionId: string;
  status: 'COMPLETE';
}

export class CreateOfferDraftCommandError extends Error {
  constructor(readonly code: OfferCommandErrorCode) {
    super(code);
    this.name = 'CreateOfferDraftCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseInput(rawInput: unknown): CreateOfferDraftInput {
  const result = createOfferDraftInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new CreateOfferDraftCommandError(offerCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function requestPayloadHash(input: CreateOfferDraftInput): string {
  return hash(
    JSON.stringify({
      familyId: input.familyId,
      childUid: input.childUid,
      tasks: input.tasks,
      reward: input.reward,
      deadlineAt: input.deadlineAt,
    }),
  );
}

function idempotencyDocumentId(actorUid: string, key: string): string {
  return hash(`${commandName}:${actorUid}:${key}`);
}

function deterministicOfferId(actorUid: string, key: string): string {
  return `offer_${hash(`${commandName}:${actorUid}:${key}`)}`;
}

function deterministicRevisionId(offerId: string): string {
  return `revision_${hash(`${commandName}:${offerId}:1`)}`;
}

function parseIdempotencyRecord(
  data: DocumentData | undefined,
): IdempotencyRecord {
  if (
    !data ||
    data.command !== commandName ||
    typeof data.actorUid !== 'string' ||
    typeof data.familyId !== 'string' ||
    typeof data.childUid !== 'string' ||
    typeof data.payloadHash !== 'string' ||
    typeof data.offerId !== 'string' ||
    typeof data.revisionId !== 'string' ||
    data.status !== 'COMPLETE'
  ) {
    throw new Error('INVALID_IDEMPOTENCY_RECORD');
  }
  return {
    command: commandName,
    actorUid: data.actorUid,
    familyId: data.familyId,
    childUid: data.childUid,
    payloadHash: data.payloadHash,
    offerId: data.offerId,
    revisionId: data.revisionId,
    status: 'COMPLETE',
  };
}

function requireMatchingRequest(
  record: IdempotencyRecord,
  actorUid: string,
  input: CreateOfferDraftInput,
  payloadHash: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.familyId !== input.familyId ||
    record.childUid !== input.childUid ||
    record.payloadHash !== payloadHash
  ) {
    throw new CreateOfferDraftCommandError(
      offerCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveParentMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE') {
    throw new CreateOfferDraftCommandError(
      offerCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'PARENT') {
    throw new CreateOfferDraftCommandError(
      offerCommandErrorCodes.wrongActorRole,
    );
  }
}

function requireActiveChildMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE' || data.role !== 'CHILD') {
    throw new CreateOfferDraftCommandError(
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
  revisionId: string,
): Promise<CreateOfferDraftOutput> {
  const [offerSnapshot, revisionSnapshot] = await firestore.getAll(
    firestore.doc(`offers/${offerId}`),
    firestore.doc(`offers/${offerId}/revisions/${revisionId}`),
  );
  const offer = offerSnapshot.data();
  const revision = revisionSnapshot.data();
  if (
    !offerSnapshot.exists ||
    !offer ||
    !revisionSnapshot.exists ||
    !revision
  ) {
    throw new Error('OFFER_DRAFT_NOT_FOUND');
  }
  return createOfferDraftOutputSchema.parse({
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
    revision: {
      id: revisionId,
      offerId,
      revisionNumber: revision.revisionNumber,
      proposedByUid: revision.proposedByUid,
      proposedByRole: revision.proposedByRole,
      tasks: revision.tasks,
      reward: revision.reward,
      deadlineAt: parseTimestamp(revision.deadlineAt),
      createdAt: parseTimestamp(revision.createdAt),
    },
  });
}

export async function executeCreateOfferDraft(
  firestore: Firestore,
  actorUid: string,
  rawInput: unknown,
): Promise<CreateOfferDraftOutput> {
  const input = parseInput(rawInput);
  const payloadHash = requestPayloadHash(input);
  const persistedTasks = input.tasks.map((task) => ({
    title: task.title,
    targetCount: task.targetCount,
    ...(task.description ? { description: task.description } : {}),
  }));
  const persistedReward = {
    title: input.reward.title,
    type: input.reward.type,
    iconKey: input.reward.iconKey,
    ...(input.reward.description
      ? { description: input.reward.description }
      : {}),
  };
  const offerId = deterministicOfferId(actorUid, input.idempotencyKey);
  const revisionId = deterministicRevisionId(offerId);
  const idempotencyReference = firestore.doc(
    `idempotency/${idempotencyDocumentId(actorUid, input.idempotencyKey)}`,
  );
  const parentMembershipReference = firestore.doc(
    `families/${input.familyId}/members/${actorUid}`,
  );
  const childMembershipReference = firestore.doc(
    `families/${input.familyId}/members/${input.childUid}`,
  );
  const offerReference = firestore.doc(`offers/${offerId}`);
  const revisionReference = firestore.doc(
    `offers/${offerId}/revisions/${revisionId}`,
  );

  await firestore.runTransaction(async (transaction) => {
    const [idempotencySnapshot, parentSnapshot, childSnapshot] =
      await Promise.all([
        transaction.get(idempotencyReference),
        transaction.get(parentMembershipReference),
        transaction.get(childMembershipReference),
      ]);

    requireActiveParentMembership(parentSnapshot.data());
    requireActiveChildMembership(childSnapshot.data());

    if (idempotencySnapshot.exists) {
      const record = parseIdempotencyRecord(idempotencySnapshot.data());
      requireMatchingRequest(record, actorUid, input, payloadHash);
      if (record.offerId !== offerId || record.revisionId !== revisionId) {
        throw new Error('INVALID_IDEMPOTENCY_RECORD');
      }
      return;
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.create(offerReference, {
      familyId: input.familyId,
      parentUid: actorUid,
      childUid: input.childUid,
      participantUids: [actorUid, input.childUid],
      status: 'DRAFT',
      currentRevisionId: revisionId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.create(revisionReference, {
      revisionNumber: 1,
      proposedByUid: actorUid,
      proposedByRole: 'PARENT',
      tasks: persistedTasks,
      reward: persistedReward,
      deadlineAt: Timestamp.fromDate(new Date(input.deadlineAt)),
      createdAt: timestamp,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: input.familyId,
      childUid: input.childUid,
      payloadHash,
      offerId,
      revisionId,
      status: 'COMPLETE',
      completedAt: timestamp,
    });
  });

  return readOutput(firestore, offerId, revisionId);
}
