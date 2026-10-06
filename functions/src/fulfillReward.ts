import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  rewardTermsSchema,
  rewardSchema,
  fulfillRewardInputSchema,
  fulfillRewardOutputSchema,
  type FulfillRewardOutput,
  type RewardCommandErrorCode,
} from '@chorex/domain';
import { contractRewardId } from './parentReviewDecision';
const commandName = 'fulfillReward';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export class FulfillRewardCommandError extends Error {
  constructor(readonly code: RewardCommandErrorCode) {
    super(code);
    this.name = 'FulfillRewardCommandError';
  }
}
export async function executeFulfillReward(
  db: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
): Promise<FulfillRewardOutput> {
  const fail = (code: RewardCommandErrorCode): never => {
    throw new FulfillRewardCommandError(code);
  };
  if (!actorUid) return fail('AUTH_REQUIRED');
  const parsed = fulfillRewardInputSchema.safeParse(rawInput);
  if (!parsed.success) return fail('INVALID_INPUT');
  const input = parsed.data,
    identity = hash(`${commandName}:${actorUid}:${input.idempotencyKey}`),
    payloadHash = hash(JSON.stringify({ rewardId: input.rewardId }));
  const ref = db.doc(`rewards/${input.rewardId}`),
    idempotency = db.doc(`idempotency/${identity}`),
    activity = db.doc(`activityEvents/activity_${identity}`);
  return db.runTransaction(async (tx) => {
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
        record.rewardId !== input.rewardId ||
        record.payloadHash !== payloadHash
      )
        return fail('IDEMPOTENCY_CONFLICT');
    }
    const data = snapshot.data();
    if (!data) return fail('REWARD_NOT_FOUND');
    if (
      typeof data.familyId !== 'string' ||
      !data.familyId ||
      data.familyId.includes('/')
    )
      return fail('INVALID_STATE');
    const member = (
      await tx.get(db.doc(`families/${data.familyId}/members/${actorUid}`))
    ).data();
    if (!member || member.status !== 'ACTIVE')
      return fail('FAMILY_MEMBERSHIP_REQUIRED');
    if (member.role !== 'PARENT') return fail('WRONG_ACTOR_ROLE');
    if (data.parentUid !== actorUid) return fail('FORBIDDEN');
    if (record) {
      const result = fulfillRewardOutputSchema.parse(record.result);
      if (
        record.familyId !== data.familyId ||
        result.reward.id !== input.rewardId ||
        result.reward.familyId !== data.familyId ||
        result.reward.parentUid !== actorUid
      )
        throw new Error('INVALID_COMPLETED_FULFILLMENT');
      return result;
    }
    if (data.status === 'FULFILLED') return fail('REWARD_ALREADY_FULFILLED');
    if (
      data.status !== 'PENDING_FULFILLMENT' ||
      !(data.earnedAt instanceof Timestamp)
    )
      return fail('INVALID_STATE');
    const reward = rewardSchema.safeParse({
      ...data,
      id: input.rewardId,
      earnedAt: data.earnedAt.toDate().toISOString(),
    });
    if (!reward.success) return fail('INVALID_STATE');
    const contract = (
      await tx.get(db.doc(`contracts/${reward.data.contractId}`))
    ).data();
    const contractTerms = rewardTermsSchema.safeParse(contract?.rewardTerms);
    if (
      !contract ||
      contract.status !== 'APPROVED' ||
      contract.familyId !== reward.data.familyId ||
      contract.parentUid !== actorUid ||
      contract.childUid !== reward.data.childUid ||
      !Array.isArray(contract.participantUids) ||
      contract.participantUids.length !== 2 ||
      !contract.participantUids.includes(actorUid) ||
      !contract.participantUids.includes(reward.data.childUid) ||
      actorUid === reward.data.childUid ||
      input.rewardId !== contractRewardId(reward.data.contractId) ||
      !(contract.approvedAt instanceof Timestamp) ||
      !contract.approvedAt.isEqual(data.earnedAt) ||
      !contractTerms.success ||
      JSON.stringify(contractTerms.data) !== JSON.stringify(reward.data.terms)
    )
      return fail('INVALID_STATE');
    const now = Timestamp.now();
    const result = fulfillRewardOutputSchema.parse({
      reward: {
        ...reward.data,
        status: 'FULFILLED',
        fulfilledAt: now.toDate().toISOString(),
        fulfilledBy: actorUid,
      },
    });
    tx.update(ref, {
      status: 'FULFILLED',
      fulfilledAt: now,
      fulfilledBy: actorUid,
    });
    tx.create(activity, {
      familyId: data.familyId,
      actorUid,
      actorType: 'PARENT',
      type: 'REWARD_FULFILLED',
      entityType: 'REWARD',
      entityId: input.rewardId,
      createdAt: now,
    });
    tx.create(idempotency, {
      command: commandName,
      actorUid,
      familyId: data.familyId,
      rewardId: input.rewardId,
      payloadHash,
      activityEventId: activity.id,
      status: 'COMPLETE',
      completedAt: now,
      result,
    });
    return result;
  });
}
