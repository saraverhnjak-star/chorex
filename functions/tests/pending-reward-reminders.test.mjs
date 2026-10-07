import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { receiptDatabase, Timestamp } from './push-receipt-fixture.mjs';
const require = createRequire(import.meta.url);
const {
  generatePendingRewardReminders,
  pendingRewardReminderId,
  pendingRewardDelayMs,
} = require('../lib/pendingRewardReminders.js');
const { contractRewardId } = require('../lib/parentReviewDecision.js');
const {
  dispatchNegotiationNotification,
} = require('../lib/negotiationNotifications.js');
const now = Timestamp.fromMillis(Date.UTC(2030, 0, 1)),
  terms = { title: 'Time together', type: 'CUSTOM' };
function seed(db, contractId = 'contract', patch = {}) {
  const earnedAt =
    patch.earnedAt ??
    Timestamp.fromMillis(now.toMillis() - pendingRewardDelayMs);
  const id = contractRewardId(contractId);
  db.records.set(`rewards/${id}`, {
    familyId: 'family',
    parentUid: 'parent',
    childUid: 'child',
    contractId,
    terms,
    status: 'PENDING_FULFILLMENT',
    earnedAt,
    ...patch,
  });
  db.records.set(`contracts/${contractId}`, {
    familyId: 'family',
    parentUid: 'parent',
    childUid: 'child',
    participantUids: ['parent', 'child'],
    status: 'APPROVED',
    rewardTerms: terms,
    approvedAt: earnedAt,
  });
  db.records.set('families/family/members/parent', {
    status: 'ACTIVE',
    role: 'PARENT',
  });
  return id;
}
test('48-hour threshold/default preference, fulfilled exclusion and unchanged snapshots', async () => {
  const db = receiptDatabase();
  const id = seed(db);
  seed(db, 'young', {
    earnedAt: Timestamp.fromMillis(now.toMillis() - pendingRewardDelayMs + 1),
  });
  seed(db, 'fulfilled', {
    status: 'FULFILLED',
    deliveredAt: now,
    deliveredBy: 'parent',
    confirmedAt: now,
    confirmedBy: 'child',
    fulfilledAt: now,
  });
  seed(db, 'delivered', {
    status: 'AWAITING_CHILD_CONFIRMATION',
    deliveredAt: now,
    deliveredBy: 'parent',
  });
  seed(db, 'cancelled', { status: 'CANCELLED' });
  const before = [...db.records.entries()];
  assert.equal(await generatePendingRewardReminders(db, () => now), 1);
  for (const [path, value] of before)
    assert.deepEqual(db.records.get(path), value);
  assert.equal(
    db.records.get(`activityEvents/${pendingRewardReminderId(id)}`).actorType,
    'SYSTEM',
  );
});
test('Parent OFF suppresses, re-enable works, concurrent and repeated workers do not duplicate', async () => {
  const db = receiptDatabase();
  seed(db);
  const path = 'users/parent/preferences/reminders';
  db.records.set(path, { pendingRewardRemindersEnabled: false });
  assert.equal(await generatePendingRewardReminders(db, () => now), 0);
  db.records.set(path, { pendingRewardRemindersEnabled: true });
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
});
test('fulfillment, membership and preference changes after candidate lookup suppress commit', async () => {
  for (const change of [
    'fulfill',
    'inactive',
    'disabled',
    'invalid-contract',
  ]) {
    const db = receiptDatabase();
    const id = seed(db),
      original = db.runTransaction;
    db.runTransaction = (callback) => {
      if (change === 'fulfill')
        Object.assign(db.records.get(`rewards/${id}`), {
          status: 'AWAITING_CHILD_CONFIRMATION',
          deliveredAt: now,
          deliveredBy: 'parent',
        });
      if (change === 'inactive')
        db.records.get('families/family/members/parent').status = 'INACTIVE';
      if (change === 'disabled')
        db.records.set('users/parent/preferences/reminders', {
          pendingRewardRemindersEnabled: false,
        });
      if (change === 'invalid-contract')
        db.records.get('contracts/contract').familyId = 'other';
      return original(callback);
    };
    assert.equal(await generatePendingRewardReminders(db, () => now), 0);
  }
});
test('existing Parent Reward payload/device/receipt integration; OFF after intent suppresses delivery', async () => {
  const db = receiptDatabase(),
    id = seed(db);
  await generatePendingRewardReminders(db, () => now);
  db.records.set('users/parent/devices/a', {
    appVariant: 'PARENT',
    pushEnabled: true,
    expoPushToken: 'ExpoPushToken[parent]',
    lastSeenAt: now,
  });
  const originalClock = Timestamp.now;
  Timestamp.now = () => now;
  try {
    let messages = [];
    const transport = async (value) => {
      messages.push(...value);
      return value.map(() => ({ status: 'ok', id: 'reward-reminder-ticket' }));
    };
    await dispatchNegotiationNotification(
      db,
      pendingRewardReminderId(id),
      transport,
    );
    await dispatchNegotiationNotification(
      db,
      pendingRewardReminderId(id),
      transport,
    );
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].data, {
      type: 'PENDING_REWARD_REMINDER',
      entityType: 'REWARD',
      entityId: id,
      familyId: 'family',
    });
    const second = seed(db, 'second');
    await generatePendingRewardReminders(db, () => now);
    db.records.set('users/parent/preferences/reminders', {
      pendingRewardRemindersEnabled: false,
    });
    await dispatchNegotiationNotification(
      db,
      pendingRewardReminderId(second),
      transport,
    );
    assert.equal(messages.length, 1);
  } finally {
    Timestamp.now = originalClock;
  }
});

test('bounded Reward page cursor progresses past older generated work and wraps', async () => {
  const db = receiptDatabase();
  for (let i = 0; i < 105; i++) seed(db, `contract-${i}`);
  assert.equal(await generatePendingRewardReminders(db, () => now), 100);
  assert.equal(await generatePendingRewardReminders(db, () => now), 5);
  assert.equal(await generatePendingRewardReminders(db, () => now), 0);
});
