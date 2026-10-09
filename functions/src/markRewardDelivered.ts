import { requireAccountActive } from './accountDeletionAuthorization';
import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  rewardTermsSchema,
  rewardSchema,
  markRewardDeliveredInputSchema,
  markRewardDeliveredOutputSchema,
  confirmRewardReceivedOutputSchema,
  type ConfirmRewardReceivedOutput,
  type MarkRewardDeliveredOutput,
  type RewardCommandErrorCode,
} from '@chorex/domain';
import { contractRewardId } from './parentReviewDecision';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export class RewardFulfillmentCommandError extends Error {
  constructor(readonly code: RewardCommandErrorCode) {
    super(code);
    this.name = 'RewardFulfillmentCommandError';
  }
}
export function executeMarkRewardDelivered(
  db: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
): Promise<MarkRewardDeliveredOutput> {
  return executeRewardTransition(
    db,
    actorUid,
    rawInput,
    'PARENT',
  ) as Promise<MarkRewardDeliveredOutput>;
}
export function executeConfirmRewardReceived(
  db: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
): Promise<ConfirmRewardReceivedOutput> {
  return executeRewardTransition(
    db,
    actorUid,
    rawInput,
    'CHILD',
  ) as Promise<ConfirmRewardReceivedOutput>;
}
async function executeRewardTransition(
  db: Firestore,
  actorUid: string | undefined,
  rawInput: unknown,
  role: 'PARENT' | 'CHILD',
): Promise<MarkRewardDeliveredOutput | ConfirmRewardReceivedOutput> {
  const commandName =
    role === 'PARENT' ? 'markRewardDelivered' : 'confirmRewardReceived';
  const fail = (code: RewardCommandErrorCode): never => {
    throw new RewardFulfillmentCommandError(code);
  };
  if (!actorUid) return fail('AUTH_REQUIRED');
  const parsed = markRewardDeliveredInputSchema.safeParse(rawInput);
  if (!parsed.success) return fail('INVALID_INPUT');
  const input = parsed.data,
    identity = hash(`${commandName}:${actorUid}:${input.idempotencyKey}`),
    payloadHash = hash(JSON.stringify({ rewardId: input.rewardId }));
  const ref = db.doc(`rewards/${input.rewardId}`),
    idempotency = db.doc(`idempotency/${identity}`),
    activity = db.doc(`activityEvents/activity_${identity}`);
  return db.runTransaction(async (tx) => {
    await requireAccountActive(db, tx, actorUid);
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
    if (member.role !== role) return fail('WRONG_ACTOR_ROLE');
    if ((role === 'PARENT' ? data.parentUid : data.childUid) !== actorUid)
      return fail('FORBIDDEN');
    if (record) {
      const result = (
        role === 'PARENT'
          ? markRewardDeliveredOutputSchema
          : confirmRewardReceivedOutputSchema
      ).parse(record.result);
      if (
        record.familyId !== data.familyId ||
        result.reward.id !== input.rewardId ||
        result.reward.familyId !== data.familyId ||
        (role === 'PARENT'
          ? result.reward.parentUid
          : result.reward.childUid) !== actorUid
      )
        throw new Error('INVALID_COMPLETED_FULFILLMENT');
      return result;
    }
    if (data.status === 'FULFILLED')
      return fail(
        role === 'PARENT'
          ? 'REWARD_ALREADY_DELIVERED'
          : 'REWARD_ALREADY_FULFILLED',
      );
    if (role === 'PARENT' && data.status === 'AWAITING_CHILD_CONFIRMATION')
      return fail('REWARD_ALREADY_DELIVERED');
    if (
      data.status !==
        (role === 'PARENT'
          ? 'PENDING_FULFILLMENT'
          : 'AWAITING_CHILD_CONFIRMATION') ||
      !(data.earnedAt instanceof Timestamp) ||
      (role === 'CHILD' && !(data.deliveredAt instanceof Timestamp))
    )
      return fail('INVALID_STATE');
    const reward = rewardSchema.safeParse({
      ...data,
      id: input.rewardId,
      earnedAt: data.earnedAt.toDate().toISOString(),
      ...(role === 'CHILD' && data.deliveredAt instanceof Timestamp
        ? { deliveredAt: data.deliveredAt.toDate().toISOString() }
        : {}),
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
      contract.parentUid !== reward.data.parentUid ||
      contract.childUid !== reward.data.childUid ||
      !Array.isArray(contract.participantUids) ||
      contract.participantUids.length !== 2 ||
      !contract.participantUids.includes(reward.data.parentUid) ||
      !contract.participantUids.includes(reward.data.childUid) ||
      reward.data.parentUid === reward.data.childUid ||
      input.rewardId !== contractRewardId(reward.data.contractId) ||
      !(contract.approvedAt instanceof Timestamp) ||
      !contract.approvedAt.isEqual(data.earnedAt) ||
      !contractTerms.success ||
      JSON.stringify(contractTerms.data) !== JSON.stringify(reward.data.terms)
    )
      return fail('INVALID_STATE');
    const now = Timestamp.now();
    const updates =
      role === 'PARENT'
        ? {
            status: 'AWAITING_CHILD_CONFIRMATION',
            deliveredAt: now,
            deliveredBy: actorUid,
          }
        : {
            status: 'FULFILLED',
            confirmedAt: now,
            confirmedBy: actorUid,
            fulfilledAt: now,
          };
    const result = (
      role === 'PARENT'
        ? markRewardDeliveredOutputSchema
        : confirmRewardReceivedOutputSchema
    ).parse({
      reward: {
        ...reward.data,
        ...updates,
        ...(role === 'PARENT'
          ? { deliveredAt: now.toDate().toISOString() }
          : {
              confirmedAt: now.toDate().toISOString(),
              fulfilledAt: now.toDate().toISOString(),
            }),
      },
    });
    tx.update(ref, updates);
    tx.create(activity, {
      familyId: data.familyId,
      actorUid,
      actorType: role,
      type:
        role === 'PARENT' ? 'REWARD_DELIVERED' : 'REWARD_RECEIVED_CONFIRMED',
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
