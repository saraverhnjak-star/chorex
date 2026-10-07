import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
const require = createRequire(
  new URL('../functions/package.json', import.meta.url),
);
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const {
  generateContractDeadlineReminders,
  deadlineReminderId,
} = require('../functions/lib/contractDeadlineReminders.js');
const {
  dispatchNegotiationNotification,
} = require('../functions/lib/negotiationNotifications.js');
if (
  process.env.GCLOUD_PROJECT !== 'chorex-dev' ||
  !/^127\.0\.0\.1:(8080|18080)$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')
)
  throw Error('Local emulator guard failed');
const app = initializeApp({ projectId: 'chorex-dev' }),
  db = getFirestore(app);
const id = `deadline-verify-${randomUUID()}`,
  family = id,
  child = `${id}-child`;
const contract = db.doc(`contracts/${id}`),
  event = db.doc(`activityEvents/${deadlineReminderId(id)}`);
const now = Timestamp.now();
let env;
try {
  env = await initializeTestEnvironment({
    projectId: 'chorex-dev',
    firestore: {
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]),
      rules: await readFile(
        new URL('firestore.rules', import.meta.url),
        'utf8',
      ),
    },
  });
  await db
    .doc(`families/${family}/members/${child}`)
    .set({ status: 'ACTIVE', role: 'CHILD' });
  await contract.set({
    familyId: family,
    childUid: child,
    parentUid: 'parent',
    participantUids: [child, 'parent'],
    status: 'ACTIVE',
    deadlineAt: Timestamp.fromMillis(now.toMillis() + 86400000),
    updatedAt: now,
  });
  await db.doc(`users/${child}/devices/a`).set({
    appVariant: 'CHILD',
    pushEnabled: true,
    expoPushToken: 'ExpoPushToken[reminder_test]',
    lastSeenAt: now,
  });
  const before = (await contract.get()).data();
  assert.deepEqual(
    (
      await Promise.all([
        generateContractDeadlineReminders(db, () => now),
        generateContractDeadlineReminders(db, () => now),
      ])
    ).sort(),
    [0, 1],
  );
  assert.equal(await generateContractDeadlineReminders(db, () => now), 0);
  let sends = 0;
  const transport = async (messages) => {
    sends += messages.length;
    assert.deepEqual(messages[0].data, {
      type: 'CONTRACT_DEADLINE_REMINDER',
      entityType: 'CONTRACT',
      entityId: id,
      familyId: family,
    });
    return messages.map(() => ({ status: 'ok', id: `${id}-ticket` }));
  };
  await dispatchNegotiationNotification(db, event.id, transport);
  await dispatchNegotiationNotification(db, event.id, transport);
  assert.equal(sends, 1);
  assert.deepEqual((await contract.get()).data(), before);
  const submitted = db.doc(`contracts/${id}-submitted`);
  await submitted.set({ ...before, status: 'READY_FOR_REVIEW' });
  assert.equal(await generateContractDeadlineReminders(db, () => now), 0);
  assert.equal(
    (await db.doc(`activityEvents/${deadlineReminderId(submitted.id)}`).get())
      .exists,
    false,
  );
  // Real Firestore transaction race: force an external state change after the first query.
  const raced = db.doc(`contracts/${id}-race`);
  await raced.set(before);
  const wrapped = {
    collection: (...args) => db.collection(...args),
    doc: (...args) => db.doc(...args),
    runTransaction: async (callback) => {
      await raced.update({ status: 'READY_FOR_REVIEW' });
      return db.runTransaction(callback);
    },
  };
  assert.equal(await generateContractDeadlineReminders(wrapped, () => now), 0);
  assert.equal(
    (await db.doc(`activityEvents/${deadlineReminderId(raced.id)}`).get())
      .exists,
    false,
  );
  const client = env.authenticatedContext(child).firestore();
  for (const path of [
    event.path,
    `${event.path}/notificationEffects/expo`,
    'pushReceipts/internal-reminder-test',
  ]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { status: 'COMPLETE' }));
    await assertFails(updateDoc(doc(client, path), { status: 'COMPLETE' }));
  }
  await assertFails(
    updateDoc(doc(client, contract.path), { status: 'EXPIRED' }),
  );
  console.info(
    'PASS: deadline eligibility → one concurrent intent → existing dispatcher/ticket payload, repeat dedupe, submission race, unchanged Contract and internal Rules denials',
  );
} finally {
  await env?.cleanup();
  await db.terminate();
  await deleteApp(app);
}
