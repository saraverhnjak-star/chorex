import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
const projectId = 'chorex-dev';
if (
  process.env.GCLOUD_PROJECT !== projectId ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:18080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099'
)
  throw Error('Isolated deletion emulator guard failed');
const require = createRequire(
  new URL('../functions/package.json', import.meta.url),
);
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const {
  executeDeleteParentAccount,
} = require('../functions/lib/deleteParentAccount.js');
const {
  processAccountDeletions,
} = require('../functions/lib/accountDeletionWorker.js');
const { executeCreateFamily } = require('../functions/lib/createFamily.js');
initializeApp({ projectId });
const db = getFirestore(),
  auth = getAuth();
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 18080,
    rules: await readFile(
      new URL('./firestore.rules', import.meta.url),
      'utf8',
    ),
  },
});
async function identity() {
  const response = await fetch(
    'http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${randomUUID()}@example.invalid`,
        password: randomUUID(),
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) throw Error('Auth fixture failed');
  return response.json();
}
const parent = await identity(),
  other = await identity();
const childUid = `child_${randomUUID()}`;
await auth.createUser({ uid: childUid });
const familyId = `family-${randomUUID()}`,
  foreign = `foreign-${randomUUID()}`;
const fixtures = {
  [`users/${parent.localId}`]: { accountType: 'PARENT', familyIds: [familyId] },
  [`users/${childUid}`]: { accountType: 'CHILD', familyIds: [familyId] },
  [`families/${familyId}`]: { createdBy: parent.localId },
  [`families/${familyId}/members/${parent.localId}`]: {
    role: 'PARENT',
    status: 'ACTIVE',
  },
  [`families/${familyId}/members/${childUid}`]: {
    role: 'CHILD',
    status: 'ACTIVE',
  },
  [`users/${other.localId}`]: { accountType: 'PARENT', familyIds: [foreign] },
  [`families/${foreign}`]: { createdBy: other.localId },
  [`families/${foreign}/members/${other.localId}`]: {
    role: 'PARENT',
    status: 'ACTIVE',
  },
  [`contracts/${familyId}`]: {
    familyId,
    parentUid: parent.localId,
    childUid,
    participantUids: [parent.localId, childUid],
    status: 'CHANGES_REQUESTED',
  },
  [`contracts/${familyId}/tasks/t/completions/c`]: { familyId },
  [`contracts/${familyId}/reviews/r`]: { familyId, note: 'Fixture feedback' },
  [`offers/${familyId}`]: {
    familyId,
    parentUid: parent.localId,
    childUid,
    status: 'AWAITING_CHILD',
  },
  [`offers/${familyId}/revisions/r`]: { note: 'Fixture terms' },
  [`rewards/${familyId}`]: {
    familyId,
    parentUid: parent.localId,
    childUid,
    status: 'PENDING_FULFILLMENT',
  },
  [`users/${childUid}/devices/phone`]: {
    expoPushToken: 'ExpoPushToken[fixture]',
  },
  [`users/${parent.localId}/preferences/reminders`]: {
    pendingRewardRemindersEnabled: true,
  },
  [`activityEvents/${familyId}`]: { familyId },
  [`activityEvents/${familyId}/notificationEffects/expo`]: {
    recipientUid: childUid,
  },
  [`pushReceipts/${familyId}`]: {
    eventId: familyId,
    registrations: [{ devicePath: `users/${childUid}/devices/phone` }],
  },
  [`pairingSessions/${familyId}`]: {
    familyId,
    childUid,
    status: 'REDEEMED',
    tokenHash: 'fixture',
  },
  [`idempotency/${familyId}`]: {
    actorUid: parent.localId,
    familyId,
    result: { note: 'Fixture feedback' },
  },
  [`pairingRateLimits/global`]: { totalCount: 1 },
  [`reminderJobs/pendingRewards`]: { lastRewardId: null, earnedAt: null },
};
for (const [path, value] of Object.entries(fixtures))
  await db.doc(path).set(value);
const input = {
  idempotencyKey: randomUUID(),
  confirmation: 'DELETE_ACCOUNT_AND_FAMILY',
};
let now = Date.now();
const actor = { uid: parent.localId, authTime: Math.floor(now / 1000) };
try {
  await assert.rejects(executeDeleteParentAccount(db, auth, undefined, input), {
    code: 'AUTH_REQUIRED',
  });
  await assert.rejects(
    executeDeleteParentAccount(
      db,
      auth,
      { uid: childUid, authTime: actor.authTime },
      input,
    ),
    { code: 'WRONG_ACTOR_ROLE' },
  );
  await assert.rejects(
    executeDeleteParentAccount(
      db,
      auth,
      { ...actor, authTime: actor.authTime - 301 },
      input,
    ),
    { code: 'RECENT_AUTH_REQUIRED' },
  );
  await assert.rejects(
    executeDeleteParentAccount(db, auth, actor, {
      ...input,
      familyId: foreign,
    }),
    { code: 'INVALID_INPUT' },
  );
  // A hidden second membership must deny even when familyIds looks single-family.
  await db
    .doc(`families/${foreign}/members/${childUid}`)
    .set({ role: 'CHILD', status: 'ACTIVE' });
  await assert.rejects(executeDeleteParentAccount(db, auth, actor, input), {
    code: 'ACCOUNT_DELETION_SCOPE_UNSUPPORTED',
  });
  assert.equal(
    (await db.doc(`deletionFences/${parent.localId}`).get()).exists,
    false,
  );
  await db.doc(`families/${foreign}/members/${childUid}`).delete();
  const callable = async (token, data) => {
    const response = await fetch(
      'http://127.0.0.1:15001/chorex-dev/us-central1/deleteParentAccount',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data }),
      },
    );
    return response.json();
  };
  assert.equal(
    (await callable(undefined, input)).error.details.code,
    'AUTH_REQUIRED',
  );
  assert.equal(
    (await callable(parent.idToken, input)).result.status,
    'PENDING',
  );
  assert.deepEqual(await executeDeleteParentAccount(db, auth, actor, input), {
    status: 'PENDING',
  });
  assert.deepEqual(await executeDeleteParentAccount(db, auth, actor, input), {
    status: 'PENDING',
  });
  await assert.rejects(
    executeCreateFamily(db, parent.localId, {
      displayName: 'Fixture',
      familyName: 'Fixture',
    }),
    { code: 'ACCOUNT_DELETION_IN_PROGRESS' },
  );
  // Still valid Auth identities/ID tokens cannot use Rules once a deletion fence exists.
  for (const uid of [parent.localId, childUid]) {
    const client = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, `contracts/${familyId}`)));
    await assertFails(getDoc(doc(client, `users/${uid}`)));
    await assertFails(
      setDoc(doc(client, `users/${uid}/devices/recreated`), {
        platform: 'ios',
        appVariant: uid === childUid ? 'CHILD' : 'PARENT',
        appVersion: '1',
        expoPushToken: 'ExpoPushToken[fixture]',
        pushEnabled: true,
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(
        doc(client, `users/${uid}/preferences/reminders`),
        uid === childUid
          ? { deadlineRemindersEnabled: true }
          : { pendingRewardRemindersEnabled: true },
      ),
    );
    await assertSucceeds(getDoc(doc(client, `deletionFences/${uid}`)));
  }
  let failures = new Set(['DATA', 'CHILDREN', 'COMPLETE']);
  const intercepted = Object.create(auth);
  intercepted.deleteUser = async (uid) => {
    if (uid === parent.localId) {
      assert.equal((await db.doc(`families/${familyId}`).get()).exists, false);
      assert.equal(
        (await db.doc(`users/${parent.localId}`).get()).exists,
        false,
      );
      await assert.rejects(auth.getUser(childUid), {
        code: 'auth/user-not-found',
      });
      for (const collection of [
        'offers',
        'contracts',
        'rewards',
        'idempotency',
        'activityEvents',
        'pairingSessions',
      ])
        assert.equal(
          (
            await db
              .collection(collection)
              .where('familyId', '==', familyId)
              .get()
          ).empty,
          true,
        );
    }
    return auth.deleteUser(uid);
  };
  for (let n = 0; n < 20; n++) {
    now += 60001;
    await processAccountDeletions(db, intercepted, {
      now: () => now,
      afterPhase: async (phase) => {
        if (failures.delete(phase)) throw Error('Injected crash');
      },
    });
  }
  assert.equal(
    (await db.doc(`accountDeletionOperations/${parent.localId}`).get()).data()
      .status,
    'COMPLETE',
  );
  await assert.rejects(auth.getUser(parent.localId), {
    code: 'auth/user-not-found',
  });
  for (const path of Object.keys(fixtures).filter(
    (path) =>
      !path.includes(foreign) &&
      !path.includes(other.localId) &&
      !path.startsWith('pairingRateLimits/') &&
      !path.startsWith('reminderJobs/'),
  ))
    assert.equal((await db.doc(path).get()).exists, false, path);
  assert.equal((await db.doc(`families/${foreign}`).get()).exists, true);
  assert.equal((await auth.getUser(other.localId)).disabled, false);
  assert.equal(
    (await db.doc('pairingRateLimits/global').get()).data().totalCount,
    1,
  );
  now += 7 * 24 * 60 * 60 * 1000;
  await processAccountDeletions(db, auth, { now: () => now });
  assert.equal(
    (await db.doc(`accountDeletionOperations/${parent.localId}`).get()).exists,
    false,
  );
  console.log(
    'PASS account deletion: scope/auth, stale-token Rules, recursive isolation, failure recovery, Auth-last, seven-day purge',
  );
} finally {
  await environment.cleanup();
  await db.terminate();
}
