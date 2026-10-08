import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
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
const {
  generatePendingRewardReminders,
  pendingRewardReminderId,
  pendingRewardDelayMs,
} = require('../functions/lib/pendingRewardReminders.js');
const {
  contractRewardId,
} = require('../functions/lib/parentReviewDecision.js');
const {
  executeMarkRewardDelivered,
} = require('../functions/lib/markRewardDelivered.js');
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
  const parent = `${id}-parent`,
    otherParent = `${id}-other-parent`;
  for (const [uid, role] of [
    [child, 'CHILD'],
    [parent, 'PARENT'],
    [otherParent, 'PARENT'],
  ])
    await db.doc(`users/${uid}`).set({ accountType: role });
  await db
    .doc(`families/${family}/members/${parent}`)
    .set({ status: 'ACTIVE', role: 'PARENT' });
  const childClient = env.authenticatedContext(child).firestore(),
    parentClient = env.authenticatedContext(parent).firestore();
  const childPreference = `users/${child}/preferences/reminders`,
    parentPreference = `users/${parent}/preferences/reminders`;
  await assertSucceeds(
    setDoc(doc(childClient, childPreference), {
      deadlineRemindersEnabled: false,
    }),
  );
  assert.equal(await generateContractDeadlineReminders(db, () => now), 0);
  await assertSucceeds(
    setDoc(doc(childClient, childPreference), {
      deadlineRemindersEnabled: true,
    }),
  );
  await assertSucceeds(getDoc(doc(childClient, childPreference)));
  await assertSucceeds(
    setDoc(doc(parentClient, parentPreference), {
      pendingRewardRemindersEnabled: true,
    }),
  );
  for (const [client, path, data] of [
    [
      parentClient,
      `users/${otherParent}/preferences/reminders`,
      { pendingRewardRemindersEnabled: false },
    ],
    [childClient, parentPreference, { pendingRewardRemindersEnabled: false }],
    [parentClient, childPreference, { deadlineRemindersEnabled: false }],
    [childClient, childPreference, { pendingRewardRemindersEnabled: false }],
    [parentClient, parentPreference, { deadlineRemindersEnabled: false }],
    [
      childClient,
      childPreference,
      { deadlineRemindersEnabled: false, expoPushToken: 'invalid' },
    ],
  ]) {
    await assertFails(setDoc(doc(client, path), data));
  }
  await assertFails(getDoc(doc(parentClient, childPreference)));
  await assertFails(
    setDoc(doc(env.unauthenticatedContext().firestore(), childPreference), {
      deadlineRemindersEnabled: true,
    }),
  );
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
    'reminderJobs/pendingRewards',
  ]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { status: 'COMPLETE' }));
    await assertFails(updateDoc(doc(client, path), { status: 'COMPLETE' }));
  }
  await assertFails(
    updateDoc(doc(client, contract.path), { status: 'EXPIRED' }),
  );
  const terms = { title: 'Time together', type: 'CUSTOM', iconKey: 'gift' };
  const earnedAt = Timestamp.fromMillis(now.toMillis() - pendingRewardDelayMs);
  async function seedReward(suffix, patch = {}) {
    const contractId = `${id}-${suffix}`,
      rewardId = contractRewardId(contractId);
    await db.doc(`contracts/${contractId}`).set({
      familyId: family,
      parentUid: parent,
      childUid: child,
      participantUids: [parent, child],
      status: 'APPROVED',
      approvedAt: patch.earnedAt ?? earnedAt,
      rewardTerms: terms,
    });
    await db.doc(`rewards/${rewardId}`).set({
      familyId: family,
      parentUid: parent,
      childUid: child,
      contractId,
      status: 'PENDING_FULFILLMENT',
      earnedAt,
      terms,
      ...patch,
    });
    return rewardId;
  }
  const rewardId = await seedReward('reward');
  await seedReward('young', {
    earnedAt: Timestamp.fromMillis(now.toMillis() - pendingRewardDelayMs + 1),
  });
  await seedReward('fulfilled', {
    status: 'FULFILLED',
    deliveredAt: now,
    deliveredBy: parent,
    confirmedAt: now,
    confirmedBy: child,
    fulfilledAt: now,
  });
  await seedReward('delivered', {
    status: 'AWAITING_CHILD_CONFIRMATION',
    deliveredAt: now,
    deliveredBy: parent,
  });
  await seedReward('cancelled', { status: 'CANCELLED' });
  await assertSucceeds(
    setDoc(doc(parentClient, parentPreference), {
      pendingRewardRemindersEnabled: false,
    }),
  );
  assert.equal(await generatePendingRewardReminders(db, () => now), 0);
  await assertSucceeds(
    setDoc(doc(parentClient, parentPreference), {
      pendingRewardRemindersEnabled: true,
    }),
  );
  const rewardBefore = (await db.doc(`rewards/${rewardId}`).get()).data();
  assert.deepEqual(
    (
      await Promise.all([
        generatePendingRewardReminders(db, () => now),
        generatePendingRewardReminders(db, () => now),
      ])
    ).sort(),
    [0, 1],
  );
  assert.equal(await generatePendingRewardReminders(db, () => now), 0);
  assert.deepEqual(
    (await db.doc(`rewards/${rewardId}`).get()).data(),
    rewardBefore,
  );
  await db.doc(`users/${parent}/devices/a`).set({
    appVariant: 'PARENT',
    pushEnabled: true,
    expoPushToken: 'ExpoPushToken[parent_reminder]',
    lastSeenAt: now,
  });
  let rewardSends = 0;
  await dispatchNegotiationNotification(
    db,
    pendingRewardReminderId(rewardId),
    async (messages) => {
      rewardSends += messages.length;
      assert.deepEqual(messages[0].data, {
        type: 'PENDING_REWARD_REMINDER',
        entityType: 'REWARD',
        entityId: rewardId,
        familyId: family,
      });
      return messages.map(() => ({ status: 'ok', id: `${id}-reward-ticket` }));
    },
  );
  assert.equal(rewardSends, 1);
  const reminderBefore = (
    await db.doc(`activityEvents/${pendingRewardReminderId(rewardId)}`).get()
  ).data();
  await executeMarkRewardDelivered(db, parent, {
    rewardId,
    idempotencyKey: 'reminder-existing-delivery',
  });
  assert.equal(await generatePendingRewardReminders(db, () => now), 0);
  assert.deepEqual(
    (
      await db.doc(`activityEvents/${pendingRewardReminderId(rewardId)}`).get()
    ).data(),
    reminderBefore,
  );

  const racingReward = await seedReward('fulfillment-race');
  const fulfillmentRace = {
    collection: (...args) => db.collection(...args),
    doc: (...args) => db.doc(...args),
    runTransaction: async (callback) => {
      await executeMarkRewardDelivered(db, parent, {
        rewardId: racingReward,
        idempotencyKey: 'reminder-race-verification',
      });
      return db.runTransaction(callback);
    },
  };
  assert.equal(
    await generatePendingRewardReminders(fulfillmentRace, () => now),
    0,
  );
  assert.equal(
    (await db.doc(`rewards/${racingReward}`).get()).data().status,
    'AWAITING_CHILD_CONFIRMATION',
  );
  assert.equal(
    (
      await db
        .doc(`activityEvents/${pendingRewardReminderId(racingReward)}`)
        .get()
    ).exists,
    false,
  );
  console.info(
    'PASS: owner/role preference Rules, default/OFF/ON deadline and 48h Reward eligibility, one logical intent, Parent routing, no reminder domain mutation, real fulfillment command race',
  );
  console.info(
    'PASS: deadline eligibility → one concurrent intent → existing dispatcher/ticket payload, repeat dedupe, submission race, unchanged Contract and internal Rules denials',
  );
} finally {
  await env?.cleanup();
  await db.terminate();
  await deleteApp(app);
}
