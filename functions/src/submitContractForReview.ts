import { createHash } from 'node:crypto';
import {
  contractCommandErrorCodes,
  contractSchema,
  contractReviewSchema,
  submitContractForReviewInputSchema,
  submitContractForReviewOutputSchema,
  type ContractCommandErrorCode,
  type SubmitContractForReviewOutput,
} from '@chorex/domain';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  readContractTask,
  RecordTaskCompletionCommandError,
} from './recordTaskCompletion';
import { contractReviewId, contractRewardId } from './parentReviewDecision';

const commandName = 'submitContractForReview';
export class SubmitContractForReviewCommandError extends Error {
  constructor(readonly code: ContractCommandErrorCode) {
    super(code);
    this.name = 'SubmitContractForReviewCommandError';
  }
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function iso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}
export async function executeSubmitContractForReview(
  firestore: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
): Promise<SubmitContractForReviewOutput> {
  const fail = (code: ContractCommandErrorCode): never => {
    throw new SubmitContractForReviewCommandError(code);
  };
  if (!actorUid) return fail(contractCommandErrorCodes.authRequired);
  const parsed = submitContractForReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) return fail(contractCommandErrorCodes.invalidInput);
  const input = parsed.data;
  const identity = hash(`${commandName}:${actorUid}:${input.idempotencyKey}`);
  const payloadHash = hash(JSON.stringify({ contractId: input.contractId }));
  const reference = firestore.doc(`contracts/${input.contractId}`);
  const idempotency = firestore.doc(`idempotency/${identity}`);
  const activity = firestore.doc(`activityEvents/activity_${identity}`);
  return firestore.runTransaction(async (transaction) => {
    const [snapshot, receipt] = await Promise.all([
      transaction.get(reference),
      transaction.get(idempotency),
    ]);
    const record = receipt.data();
    if (receipt.exists) {
      if (
        !record ||
        record.command !== commandName ||
        record.status !== 'COMPLETE'
      )
        throw new Error('INVALID_IDEMPOTENCY_RECORD');
      if (
        record.actorUid !== actorUid ||
        record.contractId !== input.contractId ||
        record.payloadHash !== payloadHash
      )
        return fail(contractCommandErrorCodes.idempotencyConflict);
    }
    const data = snapshot.data();
    if (!snapshot.exists || !data)
      return fail(contractCommandErrorCodes.contractNotFound);
    if (
      typeof data.familyId !== 'string' ||
      !data.familyId ||
      data.familyId.includes('/')
    )
      throw new Error('INVALID_CONTRACT_FAMILY');
    const member = (
      await transaction.get(
        firestore.doc(`families/${data.familyId}/members/${actorUid}`),
      )
    ).data();
    if (!member || member.status !== 'ACTIVE')
      return fail(contractCommandErrorCodes.familyMembershipRequired);
    if (member.role !== 'CHILD')
      return fail(contractCommandErrorCodes.wrongActorRole);
    if (
      data.childUid !== actorUid ||
      !Array.isArray(data.participantUids) ||
      !data.participantUids.includes(actorUid)
    )
      return fail(contractCommandErrorCodes.forbidden);
    // Revalidate current access, but return the original committed receipt after later states.
    if (record) {
      const result = submitContractForReviewOutputSchema.parse(record.result);
      if (
        record.familyId !== data.familyId ||
        result.contract.id !== input.contractId ||
        result.contract.familyId !== data.familyId ||
        result.contract.childUid !== actorUid
      )
        throw new Error('INVALID_COMPLETED_SUBMISSION_STATE');
      return result;
    }
    const resubmitting = data.status === 'CHANGES_REQUESTED';
    if (data.status !== 'ACTIVE' && !resubmitting)
      return fail(contractCommandErrorCodes.invalidState);
    if (resubmitting) {
      if (
        !Number.isSafeInteger(data.reviewCycle) ||
        data.reviewCycle < 0 ||
        !Number.isSafeInteger(data.reviewCycle + 1)
      )
        return fail(contractCommandErrorCodes.invalidState);
      const reviewId = contractReviewId(input.contractId, data.reviewCycle);
      const [reviewSnapshot, nextReview, reward] = await Promise.all([
        transaction.get(
          firestore.doc(`contracts/${input.contractId}/reviews/${reviewId}`),
        ),
        transaction.get(
          firestore.doc(
            `contracts/${input.contractId}/reviews/${contractReviewId(input.contractId, data.reviewCycle + 1)}`,
          ),
        ),
        transaction.get(
          firestore.doc(`rewards/${contractRewardId(input.contractId)}`),
        ),
      ]);
      const reviewData = reviewSnapshot.data();
      if (!reviewData || !(reviewData.createdAt instanceof Timestamp))
        return fail(contractCommandErrorCodes.invalidState);
      const review = contractReviewSchema.safeParse({
        ...reviewData,
        id: reviewId,
        createdAt: iso(reviewData.createdAt),
      });
      if (
        !review.success ||
        review.data.familyId !== data.familyId ||
        review.data.contractId !== input.contractId ||
        review.data.cycle !== data.reviewCycle ||
        review.data.reviewerUid !== data.parentUid ||
        review.data.decision !== 'REQUEST_CHANGES' ||
        !review.data.note ||
        nextReview.exists ||
        reward.exists
      )
        return fail(contractCommandErrorCodes.invalidState);
    }
    const tasks = await transaction.get(
      firestore.collection(`contracts/${input.contractId}/tasks`),
    );
    if (tasks.empty) return fail(contractCommandErrorCodes.invalidState);
    // Read the entire scoped task collection in this transaction. Concurrent final
    // completions must commit before this read can authorize the transition.
    const parsedTasks = tasks.docs.map((task) => {
      const value = task.data();
      if (
        value.familyId !== data.familyId ||
        value.contractId !== input.contractId ||
        value.assigneeUid !== actorUid
      )
        return fail(contractCommandErrorCodes.forbidden);
      try {
        return readContractTask(task.id, value);
      } catch (error) {
        if (error instanceof RecordTaskCompletionCommandError)
          return fail(error.code);
        throw error;
      }
    });
    if (!parsedTasks.length)
      return fail(contractCommandErrorCodes.invalidState);
    if (
      !resubmitting &&
      parsedTasks.some((task) => task.completedCount !== task.targetCount)
    )
      return fail(contractCommandErrorCodes.tasksIncomplete);
    const contract = contractSchema.parse({
      id: input.contractId,
      familyId: data.familyId,
      parentUid: data.parentUid,
      childUid: data.childUid,
      source: data.source,
      rewardTerms: data.rewardTerms,
      deadlineAt: iso(data.deadlineAt),
      status: data.status,
      reviewCycle: data.reviewCycle,
      ...(data.approvedAt === undefined
        ? {}
        : { approvedAt: iso(data.approvedAt) }),
      createdAt: iso(data.createdAt),
      updatedAt: iso(data.updatedAt),
    });
    const now = Timestamp.now();
    const result = submitContractForReviewOutputSchema.parse({
      contract: {
        ...contract,
        status: 'READY_FOR_REVIEW',
        reviewCycle: contract.reviewCycle + (resubmitting ? 1 : 0),
        updatedAt: now.toDate().toISOString(),
      },
    });
    transaction.update(reference, {
      status: 'READY_FOR_REVIEW',
      ...(resubmitting ? { reviewCycle: result.contract.reviewCycle } : {}),
      updatedAt: now,
    });
    transaction.create(activity, {
      familyId: contract.familyId,
      actorUid,
      actorType: 'CHILD',
      type: 'CONTRACT_SUBMITTED',
      entityType: 'CONTRACT',
      entityId: input.contractId,
      reviewCycle: result.contract.reviewCycle,
      createdAt: now,
    });
    transaction.create(idempotency, {
      command: commandName,
      actorUid,
      familyId: contract.familyId,
      contractId: input.contractId,
      payloadHash,
      activityEventId: activity.id,
      status: 'COMPLETE',
      completedAt: now,
      result,
    });
    return result;
  });
}
