import { randomUUID } from 'node:crypto';
import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import type { AccountDeletionErrorCode } from '@chorex/domain';
export class AccountDeletionError extends Error {
  constructor(readonly code: AccountDeletionErrorCode) {
    super(code);
  }
}
export const userFence = (uid: string) => `deletionFences/${uid}`;
export const familyFence = (id: string) => `familyDeletionFences/${id}`;
export async function requireAccountActive(
  db: Firestore,
  tx: Transaction,
  uid: string,
) {
  if ((await tx.get(db.doc(userFence(uid)))).exists)
    throw new AccountDeletionError('ACCOUNT_DELETION_IN_PROGRESS');
}
export async function familyIsDeleting(
  db: Firestore,
  tx: Transaction,
  familyId: string,
): Promise<boolean> {
  return (await tx.get(db.doc(familyFence(familyId)))).exists;
}
// Every external effect has a lease longer than its function's configured timeout.
// Cleanup waits for release or expiry, including crashed processes. Never extend work beyond it.
export async function withDeletionSafeEffect<T>(
  db: Firestore,
  scopes: readonly string[],
  work: () => Promise<T>,
): Promise<T> {
  const ref = db.doc(`deletionEffects/${randomUUID()}`);
  await db.runTransaction(async (tx) => {
    const fences = await Promise.all(
      scopes.map((path) => tx.get(db.doc(path))),
    );
    if (fences.some((item) => item.exists))
      throw new AccountDeletionError('ACCOUNT_DELETION_IN_PROGRESS');
    tx.create(ref, {
      scopes,
      expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
    });
  });
  try {
    return await work();
  } finally {
    await ref.delete();
  }
}
