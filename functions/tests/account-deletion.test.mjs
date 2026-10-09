import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { receiptDatabase, Timestamp } from './push-receipt-fixture.mjs';
const require = createRequire(import.meta.url);
const { executeDeleteParentAccount } = require('../lib/deleteParentAccount.js');
const { processAccountDeletions } = require('../lib/accountDeletionWorker.js');
const {
  requireAccountActive,
  withDeletionSafeEffect,
} = require('../lib/accountDeletionAuthorization.js');
const {
  dispatchNegotiationNotification,
} = require('../lib/negotiationNotifications.js');
const input = {
  idempotencyKey: 'deletion-key-1',
  confirmation: 'DELETE_ACCOUNT_AND_FAMILY',
};
function fixture(family = true) {
  const db = receiptDatabase();
  let time = Date.now();
  const users = new Map([
    [
      'parent',
      {
        email: 'parent@example.invalid',
        providerData: [{ providerId: 'password' }],
      },
    ],
    ['child', { providerData: [] }],
  ]);
  const deleted = [];
  const auth = {
    getUser: async (uid) => {
      if (!users.has(uid))
        throw Object.assign(Error(), { code: 'auth/user-not-found' });
      return users.get(uid);
    },
    updateUser: async (uid, patch) =>
      Object.assign(await auth.getUser(uid), patch),
    revokeRefreshTokens: async () => {},
    deleteUser: async (uid) => {
      if (uid === 'parent')
        assert.equal(
          [...db.records.keys()].some(
            (p) =>
              p.startsWith('users/') ||
              p.startsWith('families/') ||
              p.startsWith('contracts/'),
          ),
          false,
        );
      users.delete(uid);
      deleted.push(uid);
    },
  };
  if (family) {
    for (const [path, data] of Object.entries({
      'users/parent': { accountType: 'PARENT', familyIds: ['family'] },
      'users/child': { accountType: 'CHILD', familyIds: ['family'] },
      'families/family': { createdBy: 'parent' },
      'families/family/members/parent': { role: 'PARENT', status: 'ACTIVE' },
      'families/family/members/child': { role: 'CHILD', status: 'ACTIVE' },
      'contracts/active': {
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        status: 'ACTIVE',
      },
      'contracts/active/tasks/task': { familyId: 'family' },
      'contracts/active/tasks/task/completions/one': { familyId: 'family' },
      'contracts/active/reviews/one': {
        familyId: 'family',
        note: 'Private feedback',
      },
      'rewards/awaiting': {
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        status: 'AWAITING_CHILD_CONFIRMATION',
      },
      'offers/waiting': {
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        status: 'AWAITING_CHILD',
      },
      'offers/waiting/revisions/one': { reward: { title: 'Private terms' } },
      'pairingSessions/replay': {
        familyId: 'family',
        childUid: 'child',
        status: 'REDEEMED',
      },
      'idempotency/receipt': {
        actorUid: 'parent',
        familyId: 'family',
        result: { note: 'Private feedback' },
      },
      'activityEvents/event': { familyId: 'family' },
      'activityEvents/event/notificationEffects/expo': {
        recipientUid: 'child',
      },
      'pushReceipts/receipt': {
        eventId: 'event',
        registrations: [{ devicePath: 'users/child/devices/phone' }],
      },
      'users/child/devices/phone': { expoPushToken: 'ExpoPushToken[token]' },
      'users/parent/preferences/reminders': {
        pendingRewardRemindersEnabled: true,
      },
    }))
      db.records.set(path, data);
  }
  if (family) {
    for (const status of ['READY_FOR_REVIEW', 'CHANGES_REQUESTED'])
      db.records.set(`contracts/${status}`, {
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        status,
      });
    db.records.set('rewards/pending', {
      familyId: 'family',
      parentUid: 'parent',
      childUid: 'child',
      status: 'PENDING_FULFILLMENT',
    });
  }
  return {
    db,
    auth,
    users,
    deleted,
    actor: { uid: 'parent', authTime: Math.floor(time / 1000) },
    now: () => time,
    tick: () => {
      time += 60001;
    },
  };
}
async function finish(f, options = {}) {
  for (let n = 0; n < 20; n++) {
    f.tick();
    await processAccountDeletions(f.db, f.auth, { now: f.now, ...options });
  }
}
test('authentication, fresh auth and strict input deny before fences; Child role denied', async () => {
  const f = fixture();
  for (const [actor, raw, code] of [
    [undefined, input, 'AUTH_REQUIRED'],
    [{ ...f.actor, authTime: 0 }, input, 'RECENT_AUTH_REQUIRED'],
    [
      { ...f.actor, authTime: f.now() / 1000 + 1 },
      input,
      'RECENT_AUTH_REQUIRED',
    ],
    [f.actor, { ...input, uid: 'victim' }, 'INVALID_INPUT'],
    [{ uid: 'child', authTime: f.actor.authTime }, input, 'WRONG_ACTOR_ROLE'],
  ])
    await assert.rejects(
      executeDeleteParentAccount(f.db, f.auth, actor, raw, f.now()),
      { code },
    );
  assert.equal(f.db.records.has('deletionFences/parent'), false);
});
test('shared/multiple or foreign relationships fail before any destructive writes', async () => {
  for (const path of [
    'families/other/members/child',
    'families/family/members/guardian',
  ]) {
    const f = fixture();
    f.db.records.set(path, { role: 'PARENT', status: 'ACTIVE' });
    await assert.rejects(
      executeDeleteParentAccount(f.db, f.auth, f.actor, input, f.now()),
      { code: 'ACCOUNT_DELETION_SCOPE_UNSUPPORTED' },
    );
    assert.equal(f.db.records.has('deletionFences/parent'), false);
  }
});
test('recursive cascade, Auth-last, retry after final Auth delete and bounded metadata retention', async () => {
  const f = fixture();
  f.db.records.set('pairingRateLimits/global', { totalCount: 1 });
  f.db.records.set('reminderJobs/pendingRewards', {
    lastRewardId: 'unrelated-missing',
    earnedAt: null,
  });
  assert.deepEqual(
    await executeDeleteParentAccount(f.db, f.auth, f.actor, input, f.now()),
    { status: 'PENDING' },
  );
  assert.deepEqual(
    await executeDeleteParentAccount(f.db, f.auth, f.actor, input, f.now()),
    { status: 'PENDING' },
  );
  await assert.rejects(
    executeDeleteParentAccount(
      f.db,
      f.auth,
      f.actor,
      { ...input, idempotencyKey: 'another-key' },
      f.now(),
    ),
    { code: 'IDEMPOTENCY_CONFLICT' },
  );
  await assert.rejects(
    f.db.runTransaction((tx) => requireAccountActive(f.db, tx, 'child')),
    { code: 'ACCOUNT_DELETION_IN_PROGRESS' },
  );
  let fail = true;
  await finish(f, {
    afterPhase: async (phase) => {
      if (phase === 'COMPLETE' && fail) {
        fail = false;
        throw Error('crash after Auth');
      }
    },
  });
  assert.equal(
    f.db.records.get('accountDeletionOperations/parent').status,
    'COMPLETE',
  );
  assert.equal(f.deleted[0], 'child');
  assert.equal(f.users.size, 0);
  assert.equal(f.db.records.get('pairingRateLimits/global').totalCount, 1);
  assert.equal(
    f.db.records.get('reminderJobs/pendingRewards').lastRewardId,
    'unrelated-missing',
  );
  assert.equal(
    [...f.db.records.keys()].some((p) =>
      /^(users|families|contracts|offers|rewards|idempotency|activityEvents|pairingSessions|pushReceipts)\//.test(
        p,
      ),
    ),
    false,
  );
  for (let n = 0; n < 10081; n++) f.tick();
  await processAccountDeletions(f.db, f.auth, { now: f.now });
  assert.equal(f.db.records.has('accountDeletionOperations/parent'), false);
  assert.equal(f.db.records.has('deletionFences/child'), false);
});
test('identity-only deletion and crashed-effect draining independent of client', async () => {
  const f = fixture(false);
  f.db.records.set('deletionEffects/crashed', {
    scopes: ['deletionFences/parent'],
    expiresAt: Timestamp.fromMillis(f.now() + 600000),
  });
  await executeDeleteParentAccount(f.db, f.auth, f.actor, input, f.now());
  f.tick();
  await processAccountDeletions(f.db, f.auth, { now: f.now });
  assert.equal(f.users.has('parent'), true);
  await assert.rejects(
    withDeletionSafeEffect(f.db, ['deletionFences/parent'], async () =>
      assert.fail('must not mint'),
    ),
    { code: 'ACCOUNT_DELETION_IN_PROGRESS' },
  );
  await finish(f);
  assert.equal(f.users.has('parent'), false);
});
test('fenced family dispatcher does not send or create a new effect', async () => {
  const f = fixture();
  await executeDeleteParentAccount(f.db, f.auth, f.actor, input, f.now());
  await dispatchNegotiationNotification(f.db, 'event', async () =>
    assert.fail('must not send'),
  );
  assert.equal(
    [...f.db.records.keys()].some((p) => p.startsWith('deletionEffects/')),
    false,
  );
});

test('accepted fences reject bootstrap and external Auth effects before side effects', async () => {
  const { executeCreateFamily } = require('../lib/createFamily.js');
  const { db, auth, actor } = fixture();
  await executeDeleteParentAccount(db, auth, actor, input);
  const before = new Map(db.records);
  await assert.rejects(
    executeCreateFamily(db, 'parent', {
      displayName: 'Parent',
      familyName: 'Recreated',
    }),
    { code: 'ACCOUNT_DELETION_IN_PROGRESS' },
  );
  let minted = false;
  await assert.rejects(
    withDeletionSafeEffect(db, ['deletionFences/child'], async () => {
      minted = true;
    }),
    { code: 'ACCOUNT_DELETION_IN_PROGRESS' },
  );
  assert.equal(minted, false);
  assert.deepEqual(db.records, before);
});
