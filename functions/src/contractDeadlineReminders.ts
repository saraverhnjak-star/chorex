import { reminderPreferenceEnabled } from '@chorex/domain';
import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

export const deadlineWindowMs = 24 * 60 * 60 * 1000;
export function deadlineReminderId(contractId: string): string {
  return `deadline_${createHash('sha256').update(contractId).digest('hex')}_24h`;
}

// Frozen deadlines need one permanent logical identity; no Contract marker is written.
export async function generateContractDeadlineReminders(
  firestore: Firestore,
  clock: () => Timestamp = () => Timestamp.now(),
): Promise<number> {
  const now = clock();
  let query = firestore
    .collection('contracts')
    .where('status', '==', 'ACTIVE')
    .where('deadlineAt', '>', now)
    .where(
      'deadlineAt',
      '<=',
      Timestamp.fromMillis(now.toMillis() + deadlineWindowMs),
    )
    .orderBy('deadlineAt')
    .orderBy('__name__')
    .limit(100);
  let generated = 0;
  // Bounded pagination prevents already-generated earliest deadlines starving later ones.
  for (;;) {
    const candidates = await query.get();
    for (const candidate of candidates.docs) {
      const created = await firestore.runTransaction(async (tx) => {
        const eventRef = firestore.doc(
          `activityEvents/${deadlineReminderId(candidate.id)}`,
        );
        const [snapshot, existing] = await Promise.all([
          tx.get(candidate.ref),
          tx.get(eventRef),
        ]);
        const contract = snapshot.data();
        const commitTime = clock();
        if (
          existing.exists ||
          !contract ||
          contract.status !== 'ACTIVE' ||
          !(contract.deadlineAt instanceof Timestamp) ||
          contract.deadlineAt.toMillis() <= commitTime.toMillis() ||
          contract.deadlineAt.toMillis() >
            commitTime.toMillis() + deadlineWindowMs ||
          typeof contract.familyId !== 'string' ||
          !contract.familyId ||
          contract.familyId.includes('/') ||
          typeof contract.childUid !== 'string' ||
          !contract.childUid ||
          contract.childUid.includes('/')
        )
          return false;
        const member = (
          await tx.get(
            firestore.doc(
              `families/${contract.familyId}/members/${contract.childUid}`,
            ),
          )
        ).data();
        if (member?.status !== 'ACTIVE' || member.role !== 'CHILD')
          return false;
        const preference = (
          await tx.get(
            firestore.doc(`users/${contract.childUid}/preferences/reminders`),
          )
        ).data();
        if (!reminderPreferenceEnabled('CHILD', preference)) return false;
        tx.create(eventRef, {
          type: 'CONTRACT_DEADLINE_REMINDER',
          actorType: 'SYSTEM',
          entityType: 'CONTRACT',
          entityId: candidate.id,
          familyId: contract.familyId,
          deadlineAt: contract.deadlineAt,
          createdAt: commitTime,
        });
        return true;
      });
      if (created) generated++;
    }
    if (candidates.size < 100) break;
    query = query.startAfter(candidates.docs[candidates.docs.length - 1]);
  }
  return generated;
}
