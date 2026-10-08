import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

// Explicit local-only guard: this suite never accepts production endpoints/projects.
const projectId = 'chorex-dev';
const address = process.env.FIRESTORE_EMULATOR_HOST;
if (
  process.env.GCLOUD_PROJECT !== projectId ||
  !/^127\.0\.0\.1:(8080|8180|18080)$/.test(address ?? '')
)
  throw new Error('Security baseline emulator guard failed');
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: Number(address.split(':')[1]),
    rules: await readFile(
      new URL('./firestore.rules', import.meta.url),
      'utf8',
    ),
  },
});
const id = randomUUID();
const family = `baseline-${id}`;
const parent = `parent-${id}`,
  child = `child-${id}`,
  sibling = `sibling-${id}`;
const contractId = `contract-${id}`,
  offerId = `offer-${id}`,
  rewardId = `reward-${id}`;
const paths = [];
const fixtures = {
  [`users/other-parent-${id}`]: { accountType: 'PARENT' },
  [`users/other-child-${id}`]: { accountType: 'CHILD' },
  [`families/other-${family}`]: { name: 'Other security fixture' },
  [`families/other-${family}/members/other-parent-${id}`]: {
    role: 'PARENT',
    status: 'ACTIVE',
  },
  [`families/other-${family}/members/other-child-${id}`]: {
    role: 'CHILD',
    status: 'ACTIVE',
  },
  [`users/${parent}`]: { accountType: 'PARENT' },
  [`users/${child}`]: { accountType: 'CHILD' },
  [`families/${family}`]: { name: 'Security fixture' },
  [`families/${family}/members/${parent}`]: {
    role: 'PARENT',
    status: 'ACTIVE',
  },
  [`families/${family}/members/${child}`]: { role: 'CHILD', status: 'ACTIVE' },
  [`families/${family}/members/${sibling}`]: {
    role: 'CHILD',
    status: 'ACTIVE',
  },
  [`offers/${offerId}`]: {
    familyId: family,
    parentUid: parent,
    childUid: child,
    participantUids: [parent, child],
    status: 'AWAITING_CHILD',
    updatedAt: new Date(),
  },
  [`offers/${offerId}/revisions/revision`]: {
    reward: { type: 'ITEM', title: 'Book', iconKey: 'book' },
  },
  [`contracts/${contractId}`]: {
    familyId: family,
    parentUid: parent,
    childUid: child,
    participantUids: [parent, child],
    status: 'ACTIVE',
    createdAt: new Date(),
  },
  [`contracts/${contractId}/tasks/task`]: {
    familyId: family,
    contractId,
    assigneeUid: child,
    completedCount: 0,
  },
  [`contracts/${contractId}/reviews/review`]: {
    familyId: family,
    contractId,
    cycle: 0,
  },
  [`rewards/${rewardId}`]: {
    familyId: family,
    contractId,
    parentUid: parent,
    childUid: child,
    status: 'PENDING_FULFILLMENT',
    earnedAt: new Date(),
    terms: { type: 'ITEM', title: 'Book', iconKey: 'book' },
  },
};
const parentDb = environment.authenticatedContext(parent).firestore();
const childDb = environment.authenticatedContext(child).firestore();
const siblingDb = environment.authenticatedContext(sibling).firestore();
const outsiders = [
  environment.authenticatedContext(`other-parent-${id}`).firestore(),
  environment.authenticatedContext(`other-child-${id}`).firestore(),
  environment.unauthenticatedContext().firestore(),
];
try {
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const [path, value] of Object.entries(fixtures)) {
      paths.push(path);
      await setDoc(doc(context.firestore(), path), value);
    }
  });
  // Only the owner reads the profile; membership grants family access, not participant access.
  await assertSucceeds(getDoc(doc(parentDb, `users/${parent}`)));
  await assertSucceeds(getDoc(doc(childDb, `families/${family}`)));
  for (const db of outsiders)
    for (const path of [
      `users/${parent}`,
      `families/${family}`,
      `offers/${offerId}`,
      `contracts/${contractId}`,
      `rewards/${rewardId}`,
    ])
      await assertFails(getDoc(doc(db, path)));
  for (const path of [
    `offers/${offerId}`,
    `contracts/${contractId}`,
    `contracts/${contractId}/tasks/task`,
    `contracts/${contractId}/reviews/review`,
    `rewards/${rewardId}`,
  ])
    await assertFails(getDoc(doc(siblingDb, path)));
  // Dedicated collection queries use the exact ownership/participant constraints.
  for (const db of [parentDb, childDb]) {
    const uid = db === parentDb ? parent : child;
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'offers'),
          where('familyId', '==', family),
          where('participantUids', 'array-contains', uid),
          where('status', '==', 'AWAITING_CHILD'),
          orderBy('updatedAt', 'desc'),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'contracts'),
          where('familyId', '==', family),
          where('participantUids', 'array-contains', uid),
          where('status', '==', 'ACTIVE'),
          orderBy('createdAt', 'desc'),
        ),
      ),
    );
    const constraints = [
      where('familyId', '==', family),
      where(db === parentDb ? 'parentUid' : 'childUid', '==', uid),
    ];
    if (db === parentDb)
      constraints.push(where('status', '==', 'PENDING_FULFILLMENT'));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'rewards'),
          ...constraints,
          orderBy('earnedAt', 'desc'),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(collection(db, 'rewards'), where('familyId', '==', family)),
      ),
    );
  }
  await assertSucceeds(
    getDocs(
      query(
        collection(parentDb, 'offers'),
        where('familyId', '==', family),
        where('parentUid', '==', parent),
        where('participantUids', 'array-contains', parent),
        where('status', '==', 'AWAITING_PARENT'),
        orderBy('updatedAt', 'desc'),
      ),
    ),
  );
  // Approved narrow preference/device exceptions, including account-derived shape.
  for (const [db, uid, field] of [
    [parentDb, parent, 'pendingRewardRemindersEnabled'],
    [childDb, child, 'deadlineRemindersEnabled'],
  ]) {
    const path = `users/${uid}/preferences/reminders`;
    paths.push(path);
    await assertSucceeds(setDoc(doc(db, path), { [field]: false }));
    await assertSucceeds(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { [field]: true, role: 'PARENT' }));
    await assertFails(
      setDoc(doc(db, path), {
        [field === 'deadlineRemindersEnabled'
          ? 'pendingRewardRemindersEnabled'
          : 'deadlineRemindersEnabled']: true,
      }),
    );
    await assertFails(setDoc(doc(outsiders[0], path), { [field]: true }));
  }
  const devicePath = `users/${parent}/devices/device`;
  paths.push(devicePath);
  const device = {
    platform: 'ios',
    appVariant: 'PARENT',
    appVersion: 'test',
    expoPushToken: 'ExponentPushToken[local-fixture]',
    pushEnabled: true,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(parentDb, devicePath), device));
  await assertFails(setDoc(doc(childDb, devicePath), device));
  await assertFails(
    updateDoc(doc(parentDb, devicePath), {
      role: 'PARENT',
      lastSeenAt: serverTimestamp(),
    }),
  );
  // No direct lifecycle, frozen terms, review, role or completion mutations.
  for (const [path, patch] of [
    [`users/${parent}`, { accountType: 'CHILD' }],
    [
      `families/${family}/members/${child}`,
      { role: 'PARENT', status: 'ACTIVE' },
    ],
    [`offers/${offerId}`, { status: 'ACCEPTED' }],
    [`offers/${offerId}/revisions/revision`, { 'reward.iconKey': 'gift' }],
    [
      `contracts/${contractId}`,
      { status: 'APPROVED', 'rewardTerms.iconKey': 'gift' },
    ],
    [`contracts/${contractId}/tasks/task`, { completedCount: 12 }],
    [`contracts/${contractId}/reviews/review`, { decision: 'APPROVE' }],
    [
      `rewards/${rewardId}`,
      {
        status: 'FULFILLED',
        deliveredAt: serverTimestamp(),
        deliveredBy: parent,
        confirmedAt: serverTimestamp(),
        confirmedBy: child,
        'terms.iconKey': 'gift',
      },
    ],
  ])
    await assertFails(updateDoc(doc(parentDb, path), patch));
  await assertFails(
    setDoc(
      doc(childDb, `contracts/${contractId}/tasks/task/completions/completion`),
      { childUid: child },
    ),
  );
  // These internal collections have no client surface, even for a family owner.
  for (const path of [
    `activityEvents/${id}`,
    `activityEvents/${id}/notificationEffects/expo`,
    `pairingSessions/${id}`,
    `pairingRateLimits/${id}`,
    `idempotency/${id}`,
    `pushReceipts/${id}`,
    'reminderJobs/pendingRewards',
  ]) {
    await assertFails(getDoc(doc(parentDb, path)));
    await assertFails(setDoc(doc(parentDb, path), { familyId: family }));
  }
  // Membership removal takes effect without relying on client-provided roles/claims.
  await environment.withSecurityRulesDisabled((context) =>
    updateDoc(doc(context.firestore(), `families/${family}/members/${child}`), {
      status: 'DISABLED',
    }),
  );
  await assertFails(getDoc(doc(childDb, `families/${family}`)));
  await assertFails(getDoc(doc(childDb, `contracts/${contractId}`)));
  assert.equal(
    (await getDoc(doc(parentDb, `rewards/${rewardId}`))).data().terms.iconKey,
    'book',
  );
  console.log(
    'Production Rules baseline: isolation, query constraints, narrow owner writes and authoritative/internal denial passed.',
  );
} finally {
  await environment.withSecurityRulesDisabled(async (context) => {
    const { deleteDoc } = await import('firebase/firestore');
    for (const path of paths.reverse())
      await deleteDoc(doc(context.firestore(), path));
  });
  await environment.cleanup();
}
