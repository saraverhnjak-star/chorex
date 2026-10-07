import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { receiptDatabase, Timestamp } from './push-receipt-fixture.mjs';
const require = createRequire(import.meta.url);
const {
  generateContractDeadlineReminders,
  deadlineReminderId,
  deadlineWindowMs,
} = require('../lib/contractDeadlineReminders.js');
const {
  dispatchNegotiationNotification,
} = require('../lib/negotiationNotifications.js');
const now = Timestamp.fromMillis(Date.UTC(2030, 0, 1));
function seed(db, id = 'contract', patch = {}) {
  db.records.set(`contracts/${id}`, {
    status: 'ACTIVE',
    familyId: 'family',
    childUid: 'child',
    parentUid: 'parent',
    deadlineAt: Timestamp.fromMillis(now.toMillis() + deadlineWindowMs),
    ...patch,
  });
  db.records.set('families/family/members/child', {
    status: 'ACTIVE',
    role: 'CHILD',
  });
}
test('future 24-hour boundary, exclusions and active Child membership; no Contract mutations', async () => {
  const db = receiptDatabase();
  seed(db);
  for (const status of [
    'READY_FOR_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'CANCELLED',
    'EXPIRED',
  ])
    seed(db, status, { status });
  seed(db, 'past', { deadlineAt: Timestamp.fromMillis(now.toMillis() - 1) });
  seed(db, 'exact-now', { deadlineAt: now });
  seed(db, 'later', {
    deadlineAt: Timestamp.fromMillis(now.toMillis() + deadlineWindowMs + 1),
  });
  seed(db, 'invalid', { deadlineAt: 'tomorrow' });
  seed(db, 'inactive', { childUid: 'inactive' });
  seed(db, 'parent', { childUid: 'parent' });
  db.records.set('families/family/members/parent', {
    status: 'ACTIVE',
    role: 'PARENT',
  });
  const before = [...db.records.entries()];
  assert.equal(await generateContractDeadlineReminders(db, () => now), 1);
  for (const [path, value] of before)
    assert.deepEqual(db.records.get(path), value);
  const event = db.records.get(
    `activityEvents/${deadlineReminderId('contract')}`,
  );
  assert.equal(event.actorType, 'SYSTEM');
  assert.equal(event.actorUid, undefined);
});
test('concurrent workers and repeated runs create one logical intent even with multiple devices', async () => {
  const db = receiptDatabase();
  seed(db);
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
  assert.equal(
    [...db.records.keys()].filter((p) => p.startsWith('activityEvents/'))
      .length,
    1,
  );
});
test('state/deadline and membership are rechecked after candidate query before intent commit', async () => {
  for (const change of ['submit', 'elapsed', 'member', 'clock']) {
    const db = receiptDatabase();
    seed(db);
    const transaction = db.runTransaction;
    db.runTransaction = (callback) => {
      if (change === 'submit')
        db.records.get('contracts/contract').status = 'READY_FOR_REVIEW';
      if (change === 'elapsed')
        db.records.get('contracts/contract').deadlineAt = now;
      if (change === 'member')
        db.records.get('families/family/members/child').status = 'INACTIVE';
      return transaction(callback);
    };
    let clockReads = 0;
    const clock = () =>
      change === 'clock' && clockReads++ > 0
        ? Timestamp.fromMillis(now.toMillis() + deadlineWindowMs)
        : now;
    assert.equal(await generateContractDeadlineReminders(db, clock), 0);
  }
});
test('bounded pagination progresses beyond already-generated first page', async () => {
  const db = receiptDatabase();
  for (let i = 0; i < 105; i++) seed(db, `c${i}`);
  assert.equal(await generateContractDeadlineReminders(db, () => now), 105);
  assert.equal(await generateContractDeadlineReminders(db, () => now), 0);
});
test('existing dispatcher targets only Child devices, retains tickets and deduplicates reminder effect', async () => {
  const db = receiptDatabase();
  seed(db);
  for (const id of ['a', 'b'])
    db.records.set(`users/child/devices/${id}`, {
      appVariant: 'CHILD',
      pushEnabled: true,
      expoPushToken: 'ExpoPushToken[test]',
      lastSeenAt: now,
    });
  db.records.set('users/parent/devices/a', {
    appVariant: 'PARENT',
    pushEnabled: true,
    expoPushToken: 'ExpoPushToken[parent]',
  });
  await generateContractDeadlineReminders(db, () => now);
  let sent = [];
  const transport = async (messages) => {
    sent.push(...messages);
    return messages.map(() => ({ status: 'ok', id: 'reminder-ticket' }));
  };
  const originalClock = Timestamp.now;
  Timestamp.now = () => now;
  const id = deadlineReminderId('contract');
  try {
    await dispatchNegotiationNotification(db, id, transport);
    await dispatchNegotiationNotification(db, id, transport);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].data, {
      type: 'CONTRACT_DEADLINE_REMINDER',
      entityType: 'CONTRACT',
      entityId: 'contract',
      familyId: 'family',
    });
    assert.equal(sent[0].title, 'Deadline tomorrow');
    assert.equal(
      [...db.records.keys()].filter((p) => p.startsWith('pushReceipts/'))
        .length,
      1,
    );
    assert.equal(db.records.get('contracts/contract').status, 'ACTIVE');
  } finally {
    Timestamp.now = originalClock;
  }
});
test('dispatcher skips a committed intent that becomes submitted before delivery', async () => {
  const db = receiptDatabase();
  seed(db);
  await generateContractDeadlineReminders(db, () => now);
  db.records.get('contracts/contract').status = 'READY_FOR_REVIEW';
  await dispatchNegotiationNotification(
    db,
    deadlineReminderId('contract'),
    async () => {
      assert.fail('must not send');
    },
  );
  assert.equal(
    db.records.get(
      `activityEvents/${deadlineReminderId('contract')}/notificationEffects/expo`,
    ).status,
    'SKIPPED',
  );
});
