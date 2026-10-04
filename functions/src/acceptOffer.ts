import { createHash } from 'node:crypto';
import {
  acceptOfferInputSchema,
  acceptOfferOutputSchema,
  offerCommandErrorCodes,
  offerRevisionSchema,
  type AcceptOfferInput,
  type AcceptOfferOutput,
  type OfferCommandErrorCode,
  type OfferRevision,
} from '@chorex/domain';
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'acceptOffer';

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  offerId: string;
  revisionId: string;
  contractId: string;
  taskCount: number;
  payloadHash: string;
  status: 'COMPLETE';
}

export class AcceptOfferCommandError extends Error {
  constructor(readonly code: OfferCommandErrorCode) {
    super(code);
    this.name = 'AcceptOfferCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseInput(rawInput: unknown): AcceptOfferInput {
  const result = acceptOfferInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new AcceptOfferCommandError(offerCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function requestPayloadHash(input: AcceptOfferInput): string {
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

export function acceptedContractId(
  offerId: string,
  revisionId: string,
): string {
  return `contract_${hash(`${commandName}:${offerId}:${revisionId}`)}`;
}

export function acceptedContractTaskId(
  contractId: string,
  taskIndex: number,
): string {
  return `task_${hash(`${contractId}:${taskIndex}`)}`;
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
    typeof data.contractId !== 'string' ||
    !Number.isInteger(data.taskCount) ||
    data.taskCount < 1 ||
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
    contractId: data.contractId,
    taskCount: data.taskCount,
    payloadHash: data.payloadHash,
    status: 'COMPLETE',
  };
}

function requireMatchingRequest(
  record: IdempotencyRecord,
  actorUid: string,
  input: AcceptOfferInput,
  payloadHash: string,
  contractId: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.offerId !== input.offerId ||
    record.revisionId !== input.currentRevisionId ||
    record.contractId !== contractId ||
    record.payloadHash !== payloadHash
  ) {
    throw new AcceptOfferCommandError(
      offerCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveChildMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE') {
    throw new AcceptOfferCommandError(
      offerCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'CHILD') {
    throw new AcceptOfferCommandError(offerCommandErrorCodes.wrongActorRole);
  }
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
    throw new AcceptOfferCommandError(offerCommandErrorCodes.staleRevision);
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
    throw new AcceptOfferCommandError(offerCommandErrorCodes.staleRevision);
  }
  return result.data;
}

async function readOutput(
  firestore: Firestore,
  offerId: string,
  contractId: string,
  taskCount: number,
): Promise<AcceptOfferOutput> {
  const taskReferences = Array.from({ length: taskCount }, (_, index) =>
    firestore.doc(
      `contracts/${contractId}/tasks/${acceptedContractTaskId(contractId, index)}`,
    ),
  );
  const [offerSnapshot, contractSnapshot, ...taskSnapshots] =
    await firestore.getAll(
      firestore.doc(`offers/${offerId}`),
      firestore.doc(`contracts/${contractId}`),
      ...taskReferences,
    );
  const offer = offerSnapshot.data();
  const contract = contractSnapshot.data();
  if (
    !offerSnapshot.exists ||
    !offer ||
    !contractSnapshot.exists ||
    !contract
  ) {
    throw new Error('ACCEPTED_CONTRACT_NOT_FOUND');
  }

  return acceptOfferOutputSchema.parse({
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
    contract: {
      id: contractId,
      familyId: contract.familyId,
      parentUid: contract.parentUid,
      childUid: contract.childUid,
      source: contract.source,
      rewardTerms: contract.rewardTerms,
      deadlineAt: parseTimestamp(contract.deadlineAt),
      status: contract.status,
      reviewCycle: contract.reviewCycle,
      createdAt: parseTimestamp(contract.createdAt),
      updatedAt: parseTimestamp(contract.updatedAt),
    },
    tasks: taskSnapshots.map((snapshot, index) => {
      const task = snapshot.data();
      if (!snapshot.exists || !task) {
        throw new Error('CONTRACT_TASK_NOT_FOUND');
      }
      return {
        id: acceptedContractTaskId(contractId, index),
        familyId: task.familyId,
        contractId: task.contractId,
        assigneeUid: task.assigneeUid,
        title: task.title,
        ...(task.description === undefined
          ? {}
          : { description: task.description }),
        targetCount: task.targetCount,
        completedCount: task.completedCount,
        ...(task.lastCompletedAt === undefined
          ? {}
          : { lastCompletedAt: parseTimestamp(task.lastCompletedAt) }),
        createdAt: parseTimestamp(task.createdAt),
        updatedAt: parseTimestamp(task.updatedAt),
      };
    }),
  });
}

export async function executeAcceptOffer(
  firestore: Firestore,
  actorUid: string,
  rawInput: unknown,
): Promise<AcceptOfferOutput> {
  const input = parseInput(rawInput);
  const payloadHash = requestPayloadHash(input);
  const contractId = acceptedContractId(input.offerId, input.currentRevisionId);
  const offerReference = firestore.doc(`offers/${input.offerId}`);
  const revisionReference = firestore.doc(
    `offers/${input.offerId}/revisions/${input.currentRevisionId}`,
  );
  const contractReference = firestore.doc(`contracts/${contractId}`);
  const idempotencyReference = firestore.doc(
    `idempotency/${idempotencyDocumentId(actorUid, input.idempotencyKey)}`,
  );

  const taskCount = await firestore.runTransaction(async (transaction) => {
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
      throw new AcceptOfferCommandError(offerCommandErrorCodes.forbidden);
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
        contractId,
      );
    }

    const membershipReference = firestore.doc(
      `families/${offer.familyId}/members/${actorUid}`,
    );
    const [membershipSnapshot, revisionSnapshot, contractSnapshot] =
      await Promise.all([
        transaction.get(membershipReference),
        transaction.get(revisionReference),
        transaction.get(contractReference),
      ]);
    requireActiveChildMembership(membershipSnapshot.data());
    if (offer.childUid !== actorUid) {
      throw new AcceptOfferCommandError(offerCommandErrorCodes.forbidden);
    }
    const revision = parseRevision(
      input.offerId,
      input.currentRevisionId,
      revisionSnapshot.data(),
    );

    if (completedRecord) {
      if (
        offer.status !== 'ACCEPTED' ||
        offer.currentRevisionId !== input.currentRevisionId ||
        !contractSnapshot.exists
      ) {
        throw new Error('INVALID_COMPLETED_ACCEPT_STATE');
      }
      return completedRecord.taskCount;
    }

    if (offer.status !== 'AWAITING_CHILD') {
      throw new AcceptOfferCommandError(offerCommandErrorCodes.invalidState);
    }
    if (offer.currentRevisionId !== input.currentRevisionId) {
      throw new AcceptOfferCommandError(offerCommandErrorCodes.staleRevision);
    }
    if (
      revision.proposedByRole !== 'PARENT' ||
      revision.proposedByUid !== offer.parentUid
    ) {
      throw new AcceptOfferCommandError(offerCommandErrorCodes.invalidState);
    }
    const acceptedAt = Timestamp.now();
    if (Date.parse(revision.deadlineAt) <= acceptedAt.toMillis()) {
      throw new AcceptOfferCommandError(offerCommandErrorCodes.deadlinePassed);
    }
    if (contractSnapshot.exists) {
      throw new AcceptOfferCommandError(offerCommandErrorCodes.invalidState);
    }

    const activityReference = firestore.collection('activityEvents').doc();
    transaction.update(offerReference, {
      status: 'ACCEPTED',
      updatedAt: acceptedAt,
    });
    transaction.create(contractReference, {
      familyId: offer.familyId,
      parentUid: offer.parentUid,
      childUid: offer.childUid,
      participantUids: [offer.parentUid, offer.childUid],
      source: {
        type: 'OFFER',
        offerId: input.offerId,
        revisionId: input.currentRevisionId,
      },
      rewardTerms: revision.reward,
      deadlineAt: Timestamp.fromDate(new Date(revision.deadlineAt)),
      status: 'ACTIVE',
      reviewCycle: 0,
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
    });
    revision.tasks.forEach((task, index) => {
      const taskReference = contractReference
        .collection('tasks')
        .doc(acceptedContractTaskId(contractId, index));
      transaction.create(taskReference, {
        familyId: offer.familyId,
        contractId,
        assigneeUid: offer.childUid,
        title: task.title,
        ...(task.description === undefined
          ? {}
          : { description: task.description }),
        targetCount: task.targetCount,
        completedCount: 0,
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      });
    });
    transaction.create(activityReference, {
      familyId: offer.familyId,
      actorUid,
      actorType: 'CHILD',
      type: 'OFFER_ACCEPTED',
      entityType: 'OFFER',
      entityId: input.offerId,
      contractId,
      revisionId: input.currentRevisionId,
      createdAt: acceptedAt,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: offer.familyId,
      offerId: input.offerId,
      revisionId: input.currentRevisionId,
      contractId,
      taskCount: revision.tasks.length,
      payloadHash,
      activityEventId: activityReference.id,
      status: 'COMPLETE',
      completedAt: acceptedAt,
    });
    return revision.tasks.length;
  });

  return readOutput(firestore, input.offerId, contractId, taskCount);
}
