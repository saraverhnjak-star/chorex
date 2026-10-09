import { familyIsDeleting } from './accountDeletionAuthorization';
import { createHash } from 'node:crypto';
import {
  reminderPreferenceEnabled,
  rewardSchema,
  rewardTermsSchema,
} from '@chorex/domain';
import {
  Timestamp,
  type Firestore,
  type Transaction,
  type DocumentData,
} from 'firebase-admin/firestore';
import { contractRewardId } from './parentReviewDecision';
export const pendingRewardDelayMs = 48 * 60 * 60 * 1000;
export const pendingRewardReminderId = (rewardId: string): string =>
  `pending_reward_${createHash('sha256').update(rewardId).digest('hex')}_48h`;

export async function eligiblePendingReward(
  db: Firestore,
  tx: Transaction,
  rewardId: string,
  reward: DocumentData | undefined,
  now: Timestamp,
): Promise<boolean> {
  if (
    !reward ||
    reward.status !== 'PENDING_FULFILLMENT' ||
    !(reward.earnedAt instanceof Timestamp) ||
    reward.earnedAt.toMillis() > now.toMillis() - pendingRewardDelayMs
  )
    return false;
  const parsed = rewardSchema.safeParse({
    ...reward,
    id: rewardId,
    earnedAt: reward.earnedAt.toDate().toISOString(),
  });
  if (!parsed.success || rewardId !== contractRewardId(parsed.data.contractId))
    return false;
  const value = parsed.data;
  if (await familyIsDeleting(db, tx, value.familyId)) return false;
  // IDs from persisted records must still be safe before constructing Admin paths.
  if (
    [value.contractId, value.familyId, value.parentUid, value.childUid].some(
      (id) => !id || id.includes('/'),
    )
  )
    return false;
  const [contractSnapshot, memberSnapshot, preferenceSnapshot] =
    await Promise.all([
      tx.get(db.doc(`contracts/${value.contractId}`)),
      tx.get(db.doc(`families/${value.familyId}/members/${value.parentUid}`)),
      tx.get(db.doc(`users/${value.parentUid}/preferences/reminders`)),
    ]);
  const contract = contractSnapshot.data(),
    member = memberSnapshot.data();
  const terms = rewardTermsSchema.safeParse(contract?.rewardTerms);
  return Boolean(
    contract?.status === 'APPROVED' &&
    contract.familyId === value.familyId &&
    contract.parentUid === value.parentUid &&
    contract.childUid === value.childUid &&
    value.parentUid !== value.childUid &&
    Array.isArray(contract.participantUids) &&
    contract.participantUids.length === 2 &&
    contract.participantUids.includes(value.parentUid) &&
    contract.participantUids.includes(value.childUid) &&
    contract.approvedAt instanceof Timestamp &&
    contract.approvedAt.isEqual(reward.earnedAt) &&
    terms.success &&
    JSON.stringify(terms.data) === JSON.stringify(value.terms) &&
    member?.status === 'ACTIVE' &&
    member.role === 'PARENT' &&
    reminderPreferenceEnabled('PARENT', preferenceSnapshot.data()),
  );
}

export async function generatePendingRewardReminders(
  db: Firestore,
  clock: () => Timestamp = () => Timestamp.now(),
): Promise<number> {
  const now = clock();
  let query = db
    .collection('rewards')
    .where('status', '==', 'PENDING_FULFILLMENT')
    .where(
      'earnedAt',
      '<=',
      Timestamp.fromMillis(now.toMillis() - pendingRewardDelayMs),
    )
    .orderBy('earnedAt')
    .orderBy('__name__')
    .limit(100);
  const jobRef = db.doc('reminderJobs/pendingRewards');
  const cursor = (await jobRef.get()).data();
  if (
    cursor?.earnedAt instanceof Timestamp &&
    typeof cursor.lastRewardId === 'string'
  ) {
    query = query.startAfter(
      cursor.earnedAt,
      db.doc(`rewards/${cursor.lastRewardId}`),
    );
  }
  let generated = 0;
  const candidates = await query.get();
  for (const candidate of candidates.docs) {
    const created = await db.runTransaction(async (tx) => {
      const eventRef = db.doc(
        `activityEvents/${pendingRewardReminderId(candidate.id)}`,
      );
      const [snapshot, existing] = await Promise.all([
        tx.get(candidate.ref),
        tx.get(eventRef),
      ]);
      const reward = snapshot.data();
      if (
        existing.exists ||
        !(await eligiblePendingReward(db, tx, candidate.id, reward, clock()))
      )
        return false;
      tx.create(eventRef, {
        type: 'PENDING_REWARD_REMINDER',
        actorType: 'SYSTEM',
        entityType: 'REWARD',
        entityId: candidate.id,
        familyId: reward!.familyId,
        createdAt: clock(),
      });
      return true;
    });
    if (created) generated++;
  }
  // One bounded page per invocation; resume on the next hour, wrapping after the end.
  // Concurrent runs may share candidates, but cannot regress a newer cursor.
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(jobRef)).data();
    if (
      current?.lastRewardId !== cursor?.lastRewardId ||
      current?.earnedAt?.toMillis?.() !== cursor?.earnedAt?.toMillis?.()
    )
      return;
    const last = candidates.docs[candidates.docs.length - 1];
    tx.set(
      jobRef,
      candidates.size === 100
        ? { lastRewardId: last.id, earnedAt: last.data().earnedAt }
        : { lastRewardId: null, earnedAt: null },
    );
  });
  return generated;
}
