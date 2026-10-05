import { createHash } from 'node:crypto';
import {
  contractCommandErrorCodes,
  contractTaskSchema,
  recordTaskCompletionInputSchema,
  recordTaskCompletionOutputSchema,
  type ContractCommandErrorCode,
  type RecordTaskCompletionOutput,
} from '@chorex/domain';
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'recordTaskCompletion';
export class RecordTaskCompletionCommandError extends Error {
  constructor(readonly code: ContractCommandErrorCode) {
    super(code);
    this.name = 'RecordTaskCompletionCommandError';
  }
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function iso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}
export function readContractTask(taskId: string, data: DocumentData) {
  const result = contractTaskSchema.safeParse({
    id: taskId,
    familyId: data.familyId,
    contractId: data.contractId,
    assigneeUid: data.assigneeUid,
    title: data.title,
    ...(data.description === undefined
      ? {}
      : { description: data.description }),
    targetCount: data.targetCount,
    completedCount: data.completedCount,
    ...(data.lastCompletedAt === undefined
      ? {}
      : { lastCompletedAt: iso(data.lastCompletedAt) }),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  });
  if (!result.success)
    throw new RecordTaskCompletionCommandError(
      contractCommandErrorCodes.invalidState,
    );
  return result.data;
}

export async function executeRecordTaskCompletion(
  firestore: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
): Promise<RecordTaskCompletionOutput> {
  if (!actorUid)
    throw new RecordTaskCompletionCommandError(
      contractCommandErrorCodes.authRequired,
    );
  const parsed = recordTaskCompletionInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new RecordTaskCompletionCommandError(
      contractCommandErrorCodes.invalidInput,
    );
  const input = parsed.data;
  const identity = hash(`${commandName}:${actorUid}:${input.idempotencyKey}`);
  const payloadHash = hash(
    JSON.stringify({ contractId: input.contractId, taskId: input.taskId }),
  );
  const contractReference = firestore.doc(`contracts/${input.contractId}`);
  const taskReference = firestore.doc(
    `contracts/${input.contractId}/tasks/${input.taskId}`,
  );
  const completionId = `completion_${identity}`;
  const completionReference = firestore.doc(
    `contracts/${input.contractId}/tasks/${input.taskId}/completions/${completionId}`,
  );
  const activityReference = firestore.doc(
    `activityEvents/activity_${identity}`,
  );
  const idempotencyReference = firestore.doc(`idempotency/${identity}`);

  return firestore.runTransaction(async (transaction) => {
    const [contractSnapshot, idempotencySnapshot] = await Promise.all([
      transaction.get(contractReference),
      transaction.get(idempotencyReference),
    ]);
    const record = idempotencySnapshot.data();
    if (idempotencySnapshot.exists) {
      if (
        !record ||
        record.command !== commandName ||
        record.status !== 'COMPLETE'
      )
        throw new Error('INVALID_IDEMPOTENCY_RECORD');
      if (
        record.actorUid !== actorUid ||
        record.contractId !== input.contractId ||
        record.taskId !== input.taskId ||
        record.payloadHash !== payloadHash
      )
        throw new RecordTaskCompletionCommandError(
          contractCommandErrorCodes.idempotencyConflict,
        );
    }
    const contract = contractSnapshot.data();
    if (!contractSnapshot.exists || !contract)
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.contractNotFound,
      );
    if (
      typeof contract.familyId !== 'string' ||
      !contract.familyId ||
      contract.familyId.includes('/')
    )
      throw new Error('INVALID_CONTRACT_FAMILY');
    const membershipSnapshot = await transaction.get(
      firestore.doc(`families/${contract.familyId}/members/${actorUid}`),
    );
    const membership = membershipSnapshot.data();
    if (!membership || membership.status !== 'ACTIVE')
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.familyMembershipRequired,
      );
    if (membership.role !== 'CHILD')
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.wrongActorRole,
      );
    if (
      contract.childUid !== actorUid ||
      !Array.isArray(contract.participantUids) ||
      !contract.participantUids.includes(actorUid)
    )
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.forbidden,
      );
    // Committed retries return their original result, even after later progress/state changes.
    // Current membership and ownership still apply to retries.
    if (!record && contract.status !== 'ACTIVE')
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.invalidState,
      );
    const taskSnapshot = await transaction.get(taskReference);
    const taskData = taskSnapshot.data();
    if (!taskSnapshot.exists || !taskData)
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.taskNotFound,
      );
    if (
      taskData.familyId !== contract.familyId ||
      taskData.contractId !== input.contractId ||
      taskData.assigneeUid !== actorUid
    )
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.forbidden,
      );
    const task = readContractTask(input.taskId, taskData);
    if (record) {
      const result = recordTaskCompletionOutputSchema.parse(record.result);
      if (
        record.familyId !== contract.familyId ||
        result.completion.id !== completionId ||
        result.task.id !== input.taskId ||
        result.task.contractId !== input.contractId ||
        result.task.familyId !== contract.familyId ||
        result.task.assigneeUid !== actorUid ||
        result.completion.ordinal > task.completedCount
      )
        throw new Error('INVALID_COMPLETED_TASK_STATE');
      return result;
    }
    if (task.completedCount >= task.targetCount)
      throw new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.taskAlreadyComplete,
      );
    const createdAt = Timestamp.now();
    const ordinal = task.completedCount + 1;
    const completion = {
      id: completionId,
      familyId: contract.familyId,
      contractId: input.contractId,
      taskId: input.taskId,
      childUid: actorUid,
      ordinal,
      createdAt: createdAt.toDate().toISOString(),
    };
    const result = recordTaskCompletionOutputSchema.parse({
      completion,
      task: {
        ...task,
        completedCount: ordinal,
        lastCompletedAt: completion.createdAt,
        updatedAt: completion.createdAt,
      },
    });
    transaction.create(completionReference, {
      familyId: contract.familyId,
      contractId: input.contractId,
      taskId: input.taskId,
      childUid: actorUid,
      ordinal,
      createdAt,
    });
    transaction.update(taskReference, {
      completedCount: ordinal,
      lastCompletedAt: createdAt,
      updatedAt: createdAt,
    });
    transaction.create(activityReference, {
      familyId: contract.familyId,
      actorUid,
      actorType: 'CHILD',
      type: 'TASK_COMPLETED',
      entityType: 'TASK',
      entityId: input.taskId,
      metadata: {
        contractId: input.contractId,
        taskId: input.taskId,
        completionId,
        ordinal,
      },
      createdAt,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: contract.familyId,
      contractId: input.contractId,
      taskId: input.taskId,
      payloadHash,
      completionId,
      activityEventId: activityReference.id,
      status: 'COMPLETE',
      completedAt: createdAt,
      result,
    });
    return result;
  });
}
