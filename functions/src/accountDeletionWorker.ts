import { warn } from 'firebase-functions/logger';
import { randomUUID } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { familyFence, userFence } from './accountDeletionAuthorization';
const retentionMs = 7 * 24 * 60 * 60 * 1000;
async function deleteAuth(auth: Auth, uid: string) {
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found')
      throw error;
  }
}
async function deleteQuery(
  db: Firestore,
  collection: string,
  field: string,
  value: string,
) {
  const page = await db
    .collection(collection)
    .where(field, '==', value)
    .limit(50)
    .get();
  for (const doc of page.docs) await db.recursiveDelete(doc.ref);
  return page.empty;
}
export async function processAccountDeletions(
  db: Firestore,
  auth: Auth,
  options: {
    now?: () => number;
    afterPhase?: (phase: string) => Promise<void>;
  } = {},
) {
  const clock = options.now ?? Date.now;
  const due = await db
    .collection('accountDeletionOperations')
    .where('nextAttemptAt', '<=', Timestamp.fromMillis(clock()))
    .limit(10)
    .get();
  for (const candidate of due.docs) {
    const lease = randomUUID();
    const operation = await db.runTransaction(async (tx) => {
      const data = (await tx.get(candidate.ref)).data();
      if (!data || data.nextAttemptAt.toMillis() > clock()) return;
      tx.update(candidate.ref, {
        lease,
        nextAttemptAt: Timestamp.fromMillis(clock() + 10 * 60 * 1000),
        attempts: data.attempts + 1,
      });
      return data;
    });
    if (!operation) continue;
    const parentUid = operation.parentUid as string,
      childUids = operation.childUids as string[],
      familyId = operation.familyId as string | null;
    const uids = [parentUid, ...childUids];
    const paths = [
      ...uids.map(userFence),
      ...(familyId ? [familyFence(familyId)] : []),
    ];
    const advance = async (phase: string, complete = false) => {
      await options.afterPhase?.(phase);
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(candidate.ref)).data();
        if (current?.lease !== lease) return;
        tx.update(candidate.ref, {
          phase,
          status: complete ? 'COMPLETE' : 'PENDING',
          nextAttemptAt: Timestamp.fromMillis(
            clock() + (complete ? retentionMs : 60000),
          ),
          ...(complete ? { completedAt: Timestamp.fromMillis(clock()) } : {}),
        });
      });
    };
    try {
      if (operation.status === 'COMPLETE') {
        // Existing ID tokens have expired well before this seven-day boundary.
        for (const path of paths) await db.doc(path).delete();
        await candidate.ref.delete();
        continue;
      }
      // Leases acquired before the fence may finish; no new effects can start.
      let busy = false;
      for (const path of paths) {
        const effects = await db
          .collection('deletionEffects')
          .where('scopes', 'array-contains', path)
          .get();
        for (const effect of effects.docs) {
          if (effect.data().expiresAt.toMillis() > clock()) busy = true;
          else await effect.ref.delete();
        }
      }
      if (busy) {
        await advance('DRAIN');
        continue;
      }
      if (operation.phase === 'DRAIN') {
        for (const uid of childUids) {
          try {
            await auth.updateUser(uid, { disabled: true });
            await auth.revokeRefreshTokens(uid);
          } catch (error) {
            if ((error as { code?: string }).code !== 'auth/user-not-found')
              throw error;
          }
        }
        await advance('RECEIPTS');
        continue;
      }
      if (operation.phase === 'RECEIPTS') {
        // Page indirect receipts before deleting their event parents; durable cursor
        // bounds memory and resumes after crashes without sweeping unrelated records.
        let query = db
          .collection('pushReceipts')
          .orderBy('__name__')
          .limit(100);
        if (typeof operation.receiptCursor === 'string')
          query = query.where(
            '__name__',
            '>',
            db.doc(`pushReceipts/${operation.receiptCursor}`),
          );
        const receipts = await query.get();
        for (const receipt of receipts.docs) {
          const data = receipt.data();
          const ownDevice =
            Array.isArray(data.registrations) &&
            data.registrations.some((binding: { devicePath?: string }) =>
              uids.some((uid) =>
                binding.devicePath?.startsWith(`users/${uid}/devices/`),
              ),
            );
          const event =
            typeof data.eventId === 'string'
              ? await db.doc(`activityEvents/${data.eventId}`).get()
              : undefined;
          if (ownDevice || (familyId && event?.data()?.familyId === familyId))
            await receipt.ref.delete();
        }
        await db.runTransaction(async (tx) => {
          if (
            (await tx.get(candidate.ref)).data()?.lease === lease &&
            receipts.size === 100
          )
            tx.update(candidate.ref, {
              receiptCursor: receipts.docs[receipts.docs.length - 1].id,
            });
        });
        await advance(receipts.size === 100 ? 'RECEIPTS' : 'DATA');
        continue;
      }
      if (operation.phase === 'DATA') {
        const cursorRef = db.doc('reminderJobs/pendingRewards');
        const oldCursor = (await cursorRef.get()).data();
        const oldReward =
          typeof oldCursor?.lastRewardId === 'string'
            ? await db.doc(`rewards/${oldCursor.lastRewardId}`).get()
            : undefined;
        const ownCursor = Boolean(
          familyId && oldReward?.data()?.familyId === familyId,
        );
        let empty = true;
        if (familyId)
          for (const collection of [
            'offers',
            'contracts',
            'rewards',
            'pairingSessions',
            'idempotency',
            'activityEvents',
          ])
            empty =
              (await deleteQuery(db, collection, 'familyId', familyId)) &&
              empty;
        // Include bootstrap/partial reservations and actor receipts outside normal projections.
        for (const uid of uids)
          for (const field of ['actorUid', 'uid'])
            empty = (await deleteQuery(db, 'idempotency', field, uid)) && empty;
        await db.runTransaction(async (tx) => {
          const cursor = await tx.get(cursorRef);
          const rewardId = cursor.data()?.lastRewardId;
          if (
            ownCursor &&
            rewardId === oldCursor?.lastRewardId &&
            typeof rewardId === 'string' &&
            !(await tx.get(db.doc(`rewards/${rewardId}`))).exists
          )
            tx.update(cursorRef, { lastRewardId: null, earnedAt: null });
        });
        await advance(empty ? 'CHILDREN' : 'DATA');
        continue;
      }
      if (operation.phase === 'CHILDREN') {
        for (const uid of childUids) {
          await db.recursiveDelete(db.doc(`users/${uid}`));
          await deleteAuth(auth, uid);
        }
        await advance('PARENT_DATA');
        continue;
      }
      if (operation.phase === 'PARENT_DATA') {
        await db.recursiveDelete(db.doc(`users/${parentUid}`));
        if (familyId) await db.recursiveDelete(db.doc(`families/${familyId}`));
        await advance('PARENT_AUTH');
        continue;
      }
      if (operation.phase === 'PARENT_AUTH') {
        await deleteAuth(auth, parentUid);
        await advance('COMPLETE', true);
      }
    } catch {
      if (operation.attempts === 2)
        warn('Account deletion cleanup requires retry', {
          category: 'CLEANUP_RETRY_REQUIRED',
        });
      // No payload/identity/error message logging. Durable scope and phase survive failure.
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(candidate.ref)).data();
        if (current?.lease === lease)
          tx.update(candidate.ref, {
            nextAttemptAt: Timestamp.fromMillis(clock() + 60000),
            lastFailure: 'CLEANUP_RETRY_REQUIRED',
          });
      });
    }
  }
}
