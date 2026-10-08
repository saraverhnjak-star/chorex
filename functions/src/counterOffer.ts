import { createHash } from 'node:crypto';
import {
  counterOfferInputSchema,
  counterOfferOutputSchema,
  offerCommandErrorCodes,
  offerRevisionSchema,
  type CounterOfferInput,
  type CounterOfferOutput,
  type OfferCommandErrorCode,
  type OfferRevision,
} from '@chorex/domain';
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'counterOffer';

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  offerId: string;
  sourceRevisionId: string;
  resultRevisionId: string;
  payloadHash: string;
  status: 'COMPLETE';
}

export class CounterOfferCommandError extends Error {
  constructor(readonly code: OfferCommandErrorCode) {
    super(code);
    this.name = 'CounterOfferCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseInput(rawInput: unknown): CounterOfferInput {
  const result = counterOfferInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new CounterOfferCommandError(offerCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function requestPayloadHash(input: CounterOfferInput): string {
  return hash(
    JSON.stringify({
      offerId: input.offerId,
      currentRevisionId: input.currentRevisionId,
      reward: {
        title: input.reward.title,
        type: input.reward.type,
        iconKey: input.reward.iconKey,
        ...(input.reward.description === undefined
          ? {}
          : { description: input.reward.description }),
      },
      ...(input.note === undefined ? {} : { note: input.note }),
      ...('tasks' in input
        ? { tasks: input.tasks, deadlineAt: input.deadlineAt }
        : {}),
    }),
  );
}

function idempotencyDocumentId(actorUid: string, key: string): string {
  return hash(`${commandName}:${actorUid}:${key}`);
}

export function counterOfferRevisionId(
  actorUid: string,
  idempotencyKey: string,
): string {
  return `revision_${hash(`${commandName}:${actorUid}:${idempotencyKey}`)}`;
}

function parseIdempotencyRecord(
  data: DocumentData | undefined,
): IdempotencyRecord {
  if (
    !data ||
    data.command !== commandName ||
    typeof data.actorUid !== 'string' ||
    typeof data.offerId !== 'string' ||
    typeof data.sourceRevisionId !== 'string' ||
    typeof data.resultRevisionId !== 'string' ||
    typeof data.payloadHash !== 'string' ||
    data.status !== 'COMPLETE'
  ) {
    throw new Error('INVALID_IDEMPOTENCY_RECORD');
  }
  return {
    command: commandName,
    actorUid: data.actorUid,
    offerId: data.offerId,
    sourceRevisionId: data.sourceRevisionId,
    resultRevisionId: data.resultRevisionId,
    payloadHash: data.payloadHash,
    status: 'COMPLETE',
  };
}

function requireMatchingRequest(
  record: IdempotencyRecord,
  actorUid: string,
  input: CounterOfferInput,
  payloadHash: string,
  resultRevisionId: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.offerId !== input.offerId ||
    record.sourceRevisionId !== input.currentRevisionId ||
    record.resultRevisionId !== resultRevisionId ||
    record.payloadHash !== payloadHash
  ) {
    throw new CounterOfferCommandError(
      offerCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveMembership(
  data: DocumentData | undefined,
): 'PARENT' | 'CHILD' {
  if (!data || data.status !== 'ACTIVE') {
    throw new CounterOfferCommandError(
      offerCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'CHILD' && data.role !== 'PARENT') {
    throw new CounterOfferCommandError(offerCommandErrorCodes.wrongActorRole);
  }
  return data.role;
}

function parseTimestamp(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}

function parseRevision(
  offerId: string,
  revisionId: string,
  data: DocumentData | undefined,
): OfferRevision {
  if (
    !data ||
    !(data.deadlineAt instanceof Timestamp) ||
    !(data.createdAt instanceof Timestamp)
  ) {
    throw new CounterOfferCommandError(offerCommandErrorCodes.staleRevision);
  }
  const result = offerRevisionSchema.safeParse({
    id: revisionId,
    offerId,
    revisionNumber: data.revisionNumber,
    proposedByUid: data.proposedByUid,
    proposedByRole: data.proposedByRole,
    tasks: data.tasks,
    reward: data.reward,
    deadlineAt: parseTimestamp(data.deadlineAt),
    ...(data.note === undefined ? {} : { note: data.note }),
    createdAt: parseTimestamp(data.createdAt),
  });
  if (!result.success) {
    throw new CounterOfferCommandError(offerCommandErrorCodes.staleRevision);
  }
  return result.data;
}

async function readOutput(
  firestore: Firestore,
  offerId: string,
  revisionId: string,
): Promise<CounterOfferOutput> {
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
    throw new Error('COUNTEROFFER_NOT_FOUND');
  }
  return counterOfferOutputSchema.parse({
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
    revision: {
      id: revisionId,
      offerId,
      revisionNumber: revision.revisionNumber,
      proposedByUid: revision.proposedByUid,
      proposedByRole: revision.proposedByRole,
      tasks: revision.tasks,
      reward: revision.reward,
      deadlineAt: parseTimestamp(revision.deadlineAt),
      ...(revision.note === undefined ? {} : { note: revision.note }),
      createdAt: parseTimestamp(revision.createdAt),
    },
  });
}

export async function executeCounterOffer(
  firestore: Firestore,
  actorUid: string,
  rawInput: unknown,
): Promise<CounterOfferOutput> {
  const input = parseInput(rawInput);
  const payloadHash = requestPayloadHash(input);
  const resultRevisionId = counterOfferRevisionId(
    actorUid,
    input.idempotencyKey,
  );
  const offerReference = firestore.doc(`offers/${input.offerId}`);
  const sourceRevisionReference = firestore.doc(
    `offers/${input.offerId}/revisions/${input.currentRevisionId}`,
  );
  const resultRevisionReference = firestore.doc(
    `offers/${input.offerId}/revisions/${resultRevisionId}`,
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
      throw new CounterOfferCommandError(offerCommandErrorCodes.forbidden);
    }

    const completedRecord = idempotencySnapshot.exists
      ? parseIdempotencyRecord(idempotencySnapshot.data())
      : undefined;
    if (completedRecord) {
      requireMatchingRequest(
        completedRecord,
        actorUid,
        input,
        payloadHash,
        resultRevisionId,
      );
    }

    const membershipReference = firestore.doc(
      `families/${offer.familyId}/members/${actorUid}`,
    );
    const [membershipSnapshot, sourceRevisionSnapshot, resultRevisionSnapshot] =
      await Promise.all([
        transaction.get(membershipReference),
        transaction.get(sourceRevisionReference),
        transaction.get(resultRevisionReference),
      ]);
    const actorRole = requireActiveMembership(membershipSnapshot.data());
    const parentTerms = 'tasks' in input ? input : undefined;
    if (actorRole === 'CHILD' && parentTerms) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.invalidInput);
    }
    if (actorRole === 'PARENT' && !parentTerms) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.wrongActorRole);
    }
    if (
      (actorRole === 'PARENT' ? offer.parentUid : offer.childUid) !== actorUid
    ) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.forbidden);
    }

    if (completedRecord) {
      if (
        offer.status !==
          (actorRole === 'PARENT' ? 'AWAITING_CHILD' : 'AWAITING_PARENT') ||
        offer.currentRevisionId !== resultRevisionId ||
        !resultRevisionSnapshot.exists
      ) {
        throw new Error('INVALID_COMPLETED_COUNTEROFFER_STATE');
      }
      return;
    }

    if (
      offer.status !==
      (actorRole === 'PARENT' ? 'AWAITING_PARENT' : 'AWAITING_CHILD')
    ) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.invalidState);
    }
    if (offer.currentRevisionId !== input.currentRevisionId) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    const sourceData = sourceRevisionSnapshot.data();
    const sourceRevision = parseRevision(
      input.offerId,
      input.currentRevisionId,
      sourceData,
    );
    if (!sourceData) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    if (
      sourceRevision.proposedByRole !==
        (actorRole === 'PARENT' ? 'CHILD' : 'PARENT') ||
      sourceRevision.proposedByUid !==
        (actorRole === 'PARENT' ? offer.childUid : offer.parentUid)
    ) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.invalidState);
    }

    if (actorRole === 'PARENT') {
      const childSnapshot = await transaction.get(
        firestore.doc(`families/${offer.familyId}/members/${offer.childUid}`),
      );
      const child = childSnapshot.data();
      if (!child || child.status !== 'ACTIVE' || child.role !== 'CHILD') {
        throw new CounterOfferCommandError(
          offerCommandErrorCodes.familyMembershipRequired,
        );
      }
    }
    const counteredAt = Timestamp.now();
    if (
      parentTerms &&
      Date.parse(parentTerms.deadlineAt) <= counteredAt.toMillis()
    ) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.deadlinePassed);
    }
    if (Date.parse(sourceRevision.deadlineAt) <= counteredAt.toMillis()) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.deadlinePassed);
    }
    if (resultRevisionSnapshot.exists) {
      throw new CounterOfferCommandError(offerCommandErrorCodes.invalidState);
    }

    const persistedReward = {
      title: input.reward.title,
      type: input.reward.type,
      iconKey: input.reward.iconKey,
      ...(input.reward.description === undefined
        ? {}
        : { description: input.reward.description }),
    };
    const activityReference = firestore.collection('activityEvents').doc();
    transaction.create(resultRevisionReference, {
      revisionNumber: sourceRevision.revisionNumber + 1,
      proposedByUid: actorUid,
      proposedByRole: actorRole,
      tasks: parentTerms
        ? parentTerms.tasks.map((task) => ({
            title: task.title,
            targetCount: task.targetCount,
            ...(task.description === undefined
              ? {}
              : { description: task.description }),
          }))
        : sourceData.tasks,
      reward: persistedReward,
      deadlineAt: parentTerms
        ? Timestamp.fromDate(new Date(parentTerms.deadlineAt))
        : sourceData.deadlineAt,
      ...(input.note === undefined ? {} : { note: input.note }),
      createdAt: counteredAt,
    });
    transaction.update(offerReference, {
      status: actorRole === 'PARENT' ? 'AWAITING_CHILD' : 'AWAITING_PARENT',
      currentRevisionId: resultRevisionId,
      updatedAt: counteredAt,
    });
    transaction.create(activityReference, {
      familyId: offer.familyId,
      actorUid,
      actorType: actorRole,
      type: 'OFFER_COUNTERED',
      entityType: 'OFFER',
      entityId: input.offerId,
      sourceRevisionId: input.currentRevisionId,
      revisionId: resultRevisionId,
      createdAt: counteredAt,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: offer.familyId,
      offerId: input.offerId,
      sourceRevisionId: input.currentRevisionId,
      resultRevisionId,
      payloadHash,
      activityEventId: activityReference.id,
      status: 'COMPLETE',
      completedAt: counteredAt,
    });
  });

  return readOutput(firestore, input.offerId, resultRevisionId);
}
