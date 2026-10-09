import { createHash } from 'node:crypto';
import {
  deleteParentAccountInputSchema,
  type AccountDeletionOutput,
} from '@chorex/domain';
import type { Auth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  AccountDeletionError,
  familyFence,
  userFence,
} from './accountDeletionAuthorization';
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const unsupported = (): never => {
  throw new AccountDeletionError('ACCOUNT_DELETION_SCOPE_UNSUPPORTED');
};
export async function executeDeleteParentAccount(
  db: Firestore,
  auth: Auth,
  actor: { uid: string; authTime: unknown } | undefined,
  raw: unknown,
  now = Date.now(),
): Promise<AccountDeletionOutput> {
  if (!actor) throw new AccountDeletionError('AUTH_REQUIRED');
  const parsed = deleteParentAccountInputSchema.safeParse(raw);
  if (!parsed.success) throw new AccountDeletionError('INVALID_INPUT');
  if (
    typeof actor.authTime !== 'number' ||
    !Number.isFinite(actor.authTime) ||
    actor.authTime * 1000 > now ||
    now - actor.authTime * 1000 > 300000
  )
    throw new AccountDeletionError('RECENT_AUTH_REQUIRED');
  const uid = actor.uid;
  if (!safeId(uid)) unsupported();
  const requestHash = createHash('sha256')
    .update(parsed.data.idempotencyKey)
    .digest('hex');
  const ref = db.doc(`accountDeletionOperations/${uid}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.requestHash !== requestHash)
        throw new AccountDeletionError('IDEMPOTENCY_CONFLICT');
      return {
        status: existing.data()?.status === 'COMPLETE' ? 'COMPLETE' : 'PENDING',
      };
    }
    // Admin Auth validation also rejects old signed tokens for already-deleted identities.
    const parentAuth = await auth.getUser(uid);
    if (
      parentAuth.disabled ||
      !parentAuth.email ||
      !parentAuth.providerData.some(
        (provider) => provider.providerId === 'password',
      )
    )
      throw new AccountDeletionError('WRONG_ACTOR_ROLE');
    const profile = await tx.get(db.doc(`users/${uid}`));
    if (profile.exists && profile.data()?.accountType !== 'PARENT')
      throw new AccountDeletionError('WRONG_ACTOR_ROLE');
    const ids = profile.data()?.familyIds ?? [];
    if (!Array.isArray(ids) || ids.length > 1 || ids.some((id) => !safeId(id)))
      unsupported();
    // Membership documents currently omit uid/familyId fields. Inspect the real paths,
    // including memberships omitted from discovery projections. Fail closed if audit exceeds bound.
    const allMembers = await tx.get(db.collectionGroup('members').limit(1001));
    if (allMembers.size > 1000) unsupported();
    const ownMemberships = allMembers.docs.filter(
      (member) => member.id === uid,
    );
    const createdFamilies = await tx.get(
      db.collection('families').where('createdBy', '==', uid),
    );
    const actorCommands = await tx.get(
      db.collection('idempotency').where('actorUid', '==', uid),
    );
    const bootstrapCommands = await tx.get(
      db.collection('idempotency').where('uid', '==', uid),
    );
    const familyId: string | null = ids[0] ?? null;
    if (
      !familyId &&
      (ownMemberships.length ||
        createdFamilies.size ||
        actorCommands.size ||
        bootstrapCommands.size)
    )
      unsupported();
    const childUids = new Set<string>();
    if (familyId) {
      if (
        ownMemberships.length !== 1 ||
        ownMemberships[0].ref.parent.parent?.id !== familyId ||
        ownMemberships[0].data().role !== 'PARENT' ||
        ownMemberships[0].data().status !== 'ACTIVE'
      )
        unsupported();
      const family = await tx.get(db.doc(`families/${familyId}`));
      if (
        !family.exists ||
        family.data()?.createdBy !== uid ||
        createdFamilies.size !== 1 ||
        createdFamilies.docs[0].id !== familyId
      )
        unsupported();
      const members = allMembers.docs.filter(
        (member) => member.ref.parent.parent?.id === familyId,
      );
      for (const member of members) {
        if (member.id === uid) continue;
        if (!safeId(member.id) || member.data().role !== 'CHILD') unsupported();
        childUids.add(member.id);
      }
      for (const record of actorCommands.docs) {
        if (record.data().familyId !== familyId) unsupported();
        if (record.data().command === 'createChild') {
          if (!safeId(record.data().childUid)) unsupported();
          childUids.add(record.data().childUid);
        }
      }
      for (const record of bootstrapCommands.docs)
        if (record.data().familyId !== familyId) unsupported();
      const projected = await tx.get(
        db.collection('users').where('familyIds', 'array-contains', familyId),
      );
      for (const item of projected.docs) {
        if (item.id !== uid && !childUids.has(item.id)) unsupported();
      }
      for (const collection of [
        'offers',
        'contracts',
        'rewards',
        'pairingSessions',
      ]) {
        const scoped = await tx.get(
          db.collection(collection).where('familyId', '==', familyId),
        );
        for (const item of scoped.docs) {
          const value = item.data();
          if (value.parentUid !== undefined && value.parentUid !== uid)
            unsupported();
          if (!safeId(value.childUid) || !childUids.has(value.childUid))
            unsupported();
        }
      }
    } else {
      for (const collection of ['offers', 'contracts', 'rewards']) {
        if (
          !(
            await tx.get(
              db.collection(collection).where('parentUid', '==', uid).limit(1),
            )
          ).empty
        )
          unsupported();
      }
      if (
        !(
          await tx.get(
            db
              .collection('pairingSessions')
              .where('createdBy', '==', uid)
              .limit(1),
          )
        ).empty
      )
        unsupported();
    }
    for (const collection of ['offers', 'contracts', 'rewards']) {
      const refs = await tx.get(
        db.collection(collection).where('parentUid', '==', uid),
      );
      if (refs.docs.some((item) => item.data().familyId !== familyId))
        unsupported();
    }
    if (childUids.size > 100) unsupported();
    for (const childUid of childUids) {
      if (
        allMembers.docs.some(
          (member) =>
            member.id === childUid && member.ref.parent.parent?.id !== familyId,
        )
      )
        unsupported();
      const childProfile = await tx.get(db.doc(`users/${childUid}`));
      if (
        childProfile.exists &&
        (childProfile.data()?.accountType !== 'CHILD' ||
          JSON.stringify(childProfile.data()?.familyIds) !==
            JSON.stringify([familyId]))
      )
        unsupported();
      for (const collection of [
        'offers',
        'contracts',
        'rewards',
        'pairingSessions',
        'idempotency',
      ]) {
        const references = await tx.get(
          db.collection(collection).where('childUid', '==', childUid),
        );
        if (references.docs.some((item) => item.data().familyId !== familyId))
          unsupported();
      }
      const childCommands = await tx.get(
        db.collection('idempotency').where('actorUid', '==', childUid),
      );
      if (childCommands.docs.some((item) => item.data().familyId !== familyId))
        unsupported();
      try {
        const child = await auth.getUser(childUid);
        if (child.email || child.providerData.length) unsupported();
      } catch (error) {
        if ((error as { code?: string }).code !== 'auth/user-not-found')
          throw error;
      }
    }
    const uids = [uid, ...childUids];
    const fences = await Promise.all(
      uids.map((id) => tx.get(db.doc(userFence(id)))),
    );
    const familyFences = familyId
      ? await tx.get(db.doc(familyFence(familyId)))
      : undefined;
    if (fences.some((item) => item.exists) || familyFences?.exists)
      unsupported();
    tx.create(ref, {
      parentUid: uid,
      childUids: [...childUids],
      familyId,
      requestHash,
      status: 'PENDING',
      phase: 'DRAIN',
      createdAt: Timestamp.fromMillis(now),
      nextAttemptAt: Timestamp.fromMillis(now),
      attempts: 0,
    });
    for (const id of uids) tx.create(db.doc(userFence(id)), { deleting: true });
    if (familyId) tx.create(db.doc(familyFence(familyId)), { deleting: true });
    // The durable operation is the minimal administrative audit. Product history is erased.
    return { status: 'PENDING' };
  });
}
