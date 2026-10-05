import { createHash } from 'node:crypto';
import {
  approveContractInputSchema,
  approveContractOutputSchema,
  contractSchema,
  requestContractChangesInputSchema,
  requestContractChangesOutputSchema,
  type RequestContractChangesOutput,
  type ApproveContractOutput,
  type ContractCommandErrorCode,
} from '@chorex/domain';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
// Shared round identity for either future Parent review decision, independent of command/key.
export const contractReviewId = (contractId: string, cycle: number): string =>
  `review_${hash(`${contractId}:${cycle}`)}`;
export const contractRewardId = (contractId: string): string =>
  `reward_${hash(contractId)}`;
export class ParentReviewCommandError extends Error {
  constructor(readonly code: ContractCommandErrorCode) {
    super(code);
    this.name = 'ParentReviewCommandError';
  }
}
function iso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}
export function executeParentReviewDecision(
  firestore: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
  decision: 'APPROVE',
): Promise<ApproveContractOutput>;
export function executeParentReviewDecision(
  firestore: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
  decision: 'REQUEST_CHANGES',
): Promise<RequestContractChangesOutput>;
export async function executeParentReviewDecision(
  firestore: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
  decision: 'APPROVE' | 'REQUEST_CHANGES',
): Promise<ApproveContractOutput | RequestContractChangesOutput> {
  const approving = decision === 'APPROVE';
  const commandName = approving ? 'approveContract' : 'requestContractChanges';
  const parseResult = (value: unknown) =>
    approving
      ? approveContractOutputSchema.parse(value)
      : requestContractChangesOutputSchema.parse(value);
  const fail = (code: ContractCommandErrorCode): never => {
    throw new ParentReviewCommandError(code);
  };
  if (!actorUid) return fail('AUTH_REQUIRED');
  const parsed = (
    approving ? approveContractInputSchema : requestContractChangesInputSchema
  ).safeParse(rawInput);
  if (!parsed.success) return fail('INVALID_INPUT');
  const input = parsed.data;
  const identity = hash(`${commandName}:${actorUid}:${input.idempotencyKey}`);
  const payloadHash = hash(
    JSON.stringify({
      contractId: input.contractId,
      ...('note' in input ? { note: input.note } : {}),
    }),
  );
  const ref = firestore.doc(`contracts/${input.contractId}`);
  const idempotency = firestore.doc(`idempotency/${identity}`);
  return firestore.runTransaction(async (tx) => {
    const [snapshot, receipt] = await Promise.all([
      tx.get(ref),
      tx.get(idempotency),
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
        return fail('IDEMPOTENCY_CONFLICT');
    }
    const data = snapshot.data();
    if (!snapshot.exists || !data) return fail('CONTRACT_NOT_FOUND');
    if (
      typeof data.familyId !== 'string' ||
      !data.familyId ||
      data.familyId.includes('/')
    )
      throw new Error('INVALID_CONTRACT_FAMILY');
    const member = (
      await tx.get(
        firestore.doc(`families/${data.familyId}/members/${actorUid}`),
      )
    ).data();
    if (!member || member.status !== 'ACTIVE')
      return fail('FAMILY_MEMBERSHIP_REQUIRED');
    if (member.role !== 'PARENT') return fail('WRONG_ACTOR_ROLE');
    if (
      data.parentUid !== actorUid ||
      !Array.isArray(data.participantUids) ||
      !data.participantUids.includes(actorUid)
    )
      return fail('FORBIDDEN');
    if (record) {
      const result = parseResult(record.result);
      if (
        record.familyId !== data.familyId ||
        result.contract.id !== input.contractId ||
        result.contract.familyId !== data.familyId ||
        result.contract.parentUid !== actorUid
      )
        throw new Error('INVALID_APPROVAL_RECEIPT');
      return result;
    }
    if (data.status !== 'READY_FOR_REVIEW') return fail('INVALID_STATE');
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
      createdAt: iso(data.createdAt),
      updatedAt: iso(data.updatedAt),
    });
    const review = firestore.doc(
      `contracts/${input.contractId}/reviews/${contractReviewId(input.contractId, contract.reviewCycle)}`,
    );
    const reward = firestore.doc(
      `rewards/${contractRewardId(input.contractId)}`,
    );
    const [previousReview, previousReward] = await Promise.all([
      tx.get(review),
      tx.get(reward),
    ]);
    if (previousReview.exists || previousReward.exists)
      return fail('INVALID_STATE');
    const now = Timestamp.now();
    const time = now.toDate().toISOString();
    const result = parseResult({
      contract: {
        ...contract,
        status: approving ? 'APPROVED' : 'CHANGES_REQUESTED',
        ...(approving ? { approvedAt: time } : {}),
        updatedAt: time,
      },
      review: {
        id: review.id,
        familyId: contract.familyId,
        contractId: contract.id,
        cycle: contract.reviewCycle,
        reviewerUid: actorUid,
        decision,
        ...('note' in input ? { note: input.note } : {}),
        createdAt: time,
      },
      ...(approving
        ? {
            reward: {
              id: reward.id,
              familyId: contract.familyId,
              contractId: contract.id,
              parentUid: contract.parentUid,
              childUid: contract.childUid,
              terms: contract.rewardTerms,
              status: 'PENDING_FULFILLMENT',
              earnedAt: time,
            },
          }
        : {}),
    });
    const { id: _reviewId, ...reviewData } = result.review;
    tx.create(review, { ...reviewData, createdAt: now });
    tx.update(ref, {
      status: result.contract.status,
      ...(approving ? { approvedAt: now } : {}),
      updatedAt: now,
    });
    if ('reward' in result) {
      const { id: _rewardId, ...rewardData } = result.reward;
      tx.create(reward, { ...rewardData, earnedAt: now });
    }
    const activity = firestore.doc(`activityEvents/activity_${identity}`);
    tx.create(activity, {
      familyId: contract.familyId,
      actorUid,
      actorType: 'PARENT',
      type: approving ? 'CONTRACT_APPROVED' : 'CONTRACT_CHANGES_REQUESTED',
      entityType: 'CONTRACT',
      entityId: contract.id,
      reviewId: review.id,
      ...(approving ? { rewardId: reward.id } : {}),
      createdAt: now,
    });
    tx.create(idempotency, {
      command: commandName,
      actorUid,
      familyId: contract.familyId,
      contractId: contract.id,
      payloadHash,
      activityEventId: activity.id,
      status: 'COMPLETE',
      completedAt: now,
      result,
    });
    return result;
  });
}
