import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
const require = createRequire(
  new URL('../functions/package.json', import.meta.url),
);
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const {
  dispatchNegotiationNotification,
} = require('./lib/negotiationNotifications.js');
const { processPushReceipts, receiptPolicy } = require('./lib/pushReceipts.js');
const projectId = 'chorex-dev';
if (
  process.env.GCLOUD_PROJECT !== projectId ||
  !/^127\.0\.0\.1:(8080|18080)$/.test(
    process.env.FIRESTORE_EMULATOR_HOST ?? '',
  ) ||
  !/^127\.0\.0\.1:(9099|19099)$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '',
  )
)
  throw Error('Local emulator guard failed');
const app = initializeApp({ projectId });
const db = getFirestore(app),
  auth = getAuth(app);
const prefix = `receipt-${randomUUID()}`,
  child = `${prefix}-child`,
  parent = `${prefix}-parent`,
  family = prefix,
  offer = prefix;
let environment;
const device = (id) => db.doc(`users/${child}/devices/${id}`);
const event = (id) => db.doc(`activityEvents/${prefix}-${id}`);
const eventData = {
  type: 'OFFER_PUBLISHED',
  entityType: 'OFFER',
  entityId: offer,
  revisionId: 'revision',
  familyId: family,
  actorUid: parent,
  actorType: 'PARENT',
};
const nowAfterDelay = () =>
  Timestamp.fromMillis(Date.now() + receiptPolicy.initialDelayMs + 1000);
const registration = (token) => ({
  platform: 'ios',
  appVariant: 'CHILD',
  appVersion: '0.0.0',
  expoPushToken: `ExponentPushToken[${token}]`,
  pushEnabled: true,
  createdAt: serverTimestamp(),
  lastSeenAt: serverTimestamp(),
});
let sends = 0;
async function dispatch(id) {
  await event(id).set(eventData);
  let targets;
  await dispatchNegotiationNotification(db, event(id).id, async (messages) => {
    sends++;
    targets = messages.map((m) => m.to);
    return messages.map((_, i) => ({
      status: 'ok',
      id: `${prefix}-${id}-${i}`,
    }));
  });
  return targets;
}
try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]),
    },
  });
  await auth.createUser({ uid: child });
  const authBefore = JSON.stringify((await auth.getUser(child)).toJSON());
  const memberRef = db.doc(`families/${family}/members/${child}`);
  await memberRef.set({ status: 'ACTIVE', role: 'CHILD' });
  const memberBefore = (await memberRef.get()).data();
  await db
    .doc(`offers/${offer}`)
    .set({ familyId: family, parentUid: parent, childUid: child });
  await db
    .doc(`offers/${offer}/revisions/revision`)
    .set({ proposedByUid: parent, proposedByRole: 'PARENT' });
  const client = environment.authenticatedContext(child).firestore(),
    other = environment.authenticatedContext(parent).firestore();
  await assertSucceeds(
    setDoc(doc(client, device('a').path), registration('valid-a')),
  );
  await assertSucceeds(
    setDoc(doc(client, device('b').path), registration('invalid-b')),
  );
  assert.deepEqual((await dispatch('first')).sort(), [
    'ExponentPushToken[invalid-b]',
    'ExponentPushToken[valid-a]',
  ]);
  const work = await db
    .collection('pushReceipts')
    .where('eventId', '==', event('first').id)
    .get();
  assert.equal(work.size, 2);
  assert.equal(
    JSON.stringify(work.docs.map((d) => d.data())).includes(
      'ExponentPushToken',
    ),
    false,
  );
  const invalidId = work.docs
    .find((d) => d.data().registrations[0].devicePath === device('b').path)
    .data().ticketId;
  let requests = 0;
  const receipts = async (ids) => {
    requests++;
    return Object.fromEntries(
      ids.map((id) => [
        id,
        id === invalidId
          ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok' },
      ]),
    );
  };
  const now = nowAfterDelay();
  await Promise.all([
    processPushReceipts(db, receipts, now),
    processPushReceipts(db, receipts, now),
  ]);
  assert.ok(requests <= 2);
  assert.equal((await device('a').get()).data().pushEnabled, true);
  assert.equal((await device('b').get()).data().pushEnabled, false);
  const completed = (
    await db
      .collection('pushReceipts')
      .where('eventId', '==', event('first').id)
      .get()
  ).docs;
  assert.ok(
    completed.every((d) => d.data().complete && d.data().attempts === 1),
  );
  await processPushReceipts(
    db,
    () => {
      throw Error('duplicate lookup');
    },
    now,
  );
  assert.deepEqual(await dispatch('second'), ['ExponentPushToken[valid-a]']);
  await dispatchNegotiationNotification(db, event('second').id, () => {
    throw Error('duplicate send');
  });
  assert.equal(sends, 2);
  assert.equal(
    JSON.stringify((await auth.getUser(child)).toJSON()),
    authBefore,
  );
  assert.deepEqual((await memberRef.get()).data(), memberBefore);
  const receiptPath = work.docs[0].ref.path;
  for (const context of [
    client,
    other,
    environment.unauthenticatedContext().firestore(),
  ]) {
    await assertFails(getDoc(doc(context, receiptPath)));
    await assertFails(getDocs(collection(context, 'pushReceipts')));
    await assertFails(
      setDoc(doc(context, 'pushReceipts/forged'), { complete: true }),
    );
    await assertFails(updateDoc(doc(context, receiptPath), { complete: true }));
  }
  await assertFails(
    updateDoc(doc(other, device('a').path), { pushEnabled: false }),
  );
  await assertFails(
    updateDoc(doc(client, device('a').path), {
      pushEnabled: false,
      lastSeenAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(client, device('b').path), {
      expoPushToken: 'ExponentPushToken[refreshed-b]',
      pushEnabled: true,
      lastSeenAt: serverTimestamp(),
    }),
  );
  assert.deepEqual((await dispatch('third')).sort(), [
    'ExponentPushToken[refreshed-b]',
    'ExponentPushToken[valid-a]',
  ]);
  // A late receipt for the previous generation cannot disable a legitimate fresh registration.
  await assertSucceeds(
    updateDoc(doc(client, device('b').path), {
      expoPushToken: 'ExponentPushToken[newest-b]',
      pushEnabled: true,
      lastSeenAt: serverTimestamp(),
    }),
  );
  await processPushReceipts(
    db,
    async (ids) =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ]),
      ),
    nowAfterDelay(),
  );
  assert.equal((await device('b').get()).data().pushEnabled, true);
  assert.deepEqual(await dispatch('fourth'), ['ExponentPushToken[newest-b]']);
  await processPushReceipts(
    db,
    async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])),
    nowAfterDelay(),
  );
  assert.equal((await device('b').get()).data().pushEnabled, true);
  assert.equal(
    JSON.stringify((await auth.getUser(child)).toJSON()),
    authBefore,
  );
  assert.deepEqual((await memberRef.get()).data(), memberBefore);
  console.info(
    'PASS: committed event → ticket → receipts → exact invalid-device exclusion, success, concurrent claims, deduplication, token refresh, Auth/membership unchanged, receipt and device Rules',
  );
} finally {
  if (environment) await environment.cleanup();
  await auth.deleteUser(child).catch(() => {});
  await db.terminate();
  await deleteApp(app);
}
