import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  negotiationNotificationIntent,
  sendExpoMessages,
} = require('../lib/negotiationNotifications.js');
const { negotiationNotificationDataSchema } = require('@chorex/domain');
const offer = { familyId: 'family', parentUid: 'parent', childUid: 'child' };

for (const [type, actorType, actorUid, recipientUid, entityType, entityId] of [
  ['OFFER_PUBLISHED', 'PARENT', 'parent', 'child', 'OFFER', 'offer'],
  ['OFFER_COUNTERED', 'CHILD', 'child', 'parent', 'OFFER', 'offer'],
  ['OFFER_COUNTERED', 'PARENT', 'parent', 'child', 'OFFER', 'offer'],
  ['OFFER_ACCEPTED', 'CHILD', 'child', 'parent', 'CONTRACT', 'contract'],
  ['OFFER_ACCEPTED', 'PARENT', 'parent', 'child', 'CONTRACT', 'contract'],
]) {
  test(`${type} by ${actorType}: authoritative recipient and minimal routing`, () => {
    const event = {
      type,
      actorType,
      actorUid,
      entityType: 'OFFER',
      entityId: 'offer',
      familyId: 'family',
      contractId: 'contract',
      recipientUid: 'attacker',
      note: 'private note',
      reward: 'private reward',
      tasks: 'private tasks',
    };
    const intent = negotiationNotificationIntent(event, offer);
    assert.equal(intent.recipientUid, recipientUid);
    assert.deepEqual(intent.data, {
      type,
      entityType,
      entityId,
      familyId: 'family',
    });
    assert.equal(JSON.stringify(intent).includes('private'), false);
    assert.equal(JSON.stringify(intent).includes('attacker'), false);
    if (type === 'OFFER_PUBLISHED')
      assert.deepEqual(
        [intent.title, intent.body],
        ['New offer', 'You have a new chore offer.'],
      );
  });
}

test('rejection, invalid ownership, wrong family, and malformed payload have no intent', () => {
  const event = {
    type: 'OFFER_COUNTERED',
    actorType: 'PARENT',
    actorUid: 'parent',
    entityType: 'OFFER',
    entityId: 'offer',
    familyId: 'family',
  };
  for (const patch of [
    { type: 'OFFER_REJECTED' },
    { type: 'TASK_COMPLETED' },
    { type: 'CONTRACT_SUBMITTED' },
    { actorUid: 'attacker' },
    { familyId: 'wrong' },
    { entityType: 'CONTRACT' },
    { entityId: '' },
  ])
    assert.equal(
      negotiationNotificationIntent({ ...event, ...patch }, offer),
      undefined,
    );
  assert.equal(
    negotiationNotificationDataSchema.safeParse({
      type: 'OFFER_ACCEPTED',
      entityType: 'OFFER',
      entityId: 'offer',
      familyId: 'family',
    }).success,
    false,
  );
});

test('Expo transport batches at 100 and validates tickets without live networking', async () => {
  const original = globalThis.fetch;
  const chunks = [];
  globalThis.fetch = async (_url, options) => {
    const chunk = JSON.parse(options.body);
    chunks.push(chunk);
    return {
      ok: true,
      json: async () => ({
        data: chunk.map(() => ({ status: 'ok', id: 'ticket' })),
      }),
    };
  };
  try {
    const message = {
      to: 'ExponentPushToken[test]',
      title: 'New offer',
      body: 'You have a new chore offer.',
      data: {
        type: 'OFFER_PUBLISHED',
        entityType: 'OFFER',
        entityId: 'offer',
        familyId: 'family',
      },
      sound: 'default',
      channelId: 'default',
    };
    assert.equal(
      (await sendExpoMessages(Array.from({ length: 201 }, () => message)))
        .length,
      201,
    );
    assert.deepEqual(
      chunks.map((chunk) => chunk.length),
      [100, 100, 1],
    );
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(sendExpoMessages([message]), /EXPO_TRANSPORT_FAILED/);
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    });
    await assert.rejects(sendExpoMessages([message]), /EXPO_INVALID_RESPONSE/);
  } finally {
    globalThis.fetch = original;
  }
});

test('approval intent targets authoritative Child with minimal Contract routing and earned/pending copy', () => {
  const {
    approvalNotificationIntent,
  } = require('../lib/negotiationNotifications.js');
  const event = {
    type: 'CONTRACT_APPROVED',
    entityType: 'CONTRACT',
    entityId: 'contract',
    familyId: 'family',
    actorUid: 'parent',
    actorType: 'PARENT',
    recipientUid: 'attacker',
  };
  const contract = {
    ...offer,
    status: 'APPROVED',
    rewardTerms: { title: 'private reward' },
  };
  const intent = approvalNotificationIntent(event, contract);
  assert.equal(intent.recipientUid, 'child');
  assert.equal(intent.recipientRole, 'CHILD');
  assert.deepEqual(intent.data, {
    type: 'CONTRACT_APPROVED',
    entityType: 'CONTRACT',
    entityId: 'contract',
    familyId: 'family',
  });
  assert.match(intent.body, /earned/);
  assert.match(intent.body, /pending/);
  assert.equal(JSON.stringify(intent).includes('private'), false);
  for (const patch of [
    { actorUid: 'attacker' },
    { actorType: 'CHILD' },
    { familyId: 'wrong' },
  ])
    assert.equal(
      approvalNotificationIntent({ ...event, ...patch }, contract),
      undefined,
    );
  assert.equal(
    approvalNotificationIntent(event, {
      ...contract,
      status: 'READY_FOR_REVIEW',
    }),
    undefined,
  );
});

test('changes-requested intent resolves Child with generic copy and no private feedback', () => {
  const {
    changesRequestedNotificationIntent,
  } = require('../lib/negotiationNotifications.js');
  const event = {
    type: 'CONTRACT_CHANGES_REQUESTED',
    entityType: 'CONTRACT',
    entityId: 'contract',
    familyId: 'family',
    actorType: 'PARENT',
    actorUid: 'parent',
    note: 'Private feedback',
    recipientUid: 'attacker',
  };
  const intent = changesRequestedNotificationIntent(event, {
    ...offer,
    status: 'CHANGES_REQUESTED',
  });
  assert.equal(intent.recipientUid, 'child');
  assert.equal(intent.body, 'A change was requested before approval.');
  assert.deepEqual(intent.data, {
    type: 'CONTRACT_CHANGES_REQUESTED',
    entityType: 'CONTRACT',
    entityId: 'contract',
    familyId: 'family',
  });
  assert.equal(JSON.stringify(intent).includes('Private'), false);
  for (const patch of [
    { actorUid: 'other' },
    { actorType: 'CHILD' },
    { familyId: 'wrong' },
    { entityType: 'OFFER' },
  ])
    assert.equal(
      changesRequestedNotificationIntent({ ...event, ...patch }, offer),
      undefined,
    );
});

test('submission and resubmission intent resolves active Parent routing without feedback', () => {
  const {
    submissionNotificationIntent,
  } = require('../lib/negotiationNotifications.js');
  const event = {
    type: 'CONTRACT_SUBMITTED',
    entityType: 'CONTRACT',
    entityId: 'contract',
    familyId: 'family',
    actorType: 'CHILD',
    actorUid: 'child',
    note: 'Private feedback',
  };
  const intent = submissionNotificationIntent(event, offer);
  assert.equal(intent.recipientUid, 'parent');
  assert.equal(intent.recipientRole, 'PARENT');
  assert.deepEqual(intent.data, {
    type: 'CONTRACT_SUBMITTED',
    entityType: 'CONTRACT',
    entityId: 'contract',
    familyId: 'family',
  });
  assert.equal(JSON.stringify(intent).includes('Private'), false);
  for (const patch of [
    { actorUid: 'other' },
    { actorType: 'PARENT' },
    { familyId: 'other' },
    { entityType: 'OFFER' },
  ])
    assert.equal(
      submissionNotificationIntent({ ...event, ...patch }, offer),
      undefined,
    );
});

test('fulfilled Reward targets Child with delivery copy and minimal Reward route', () => {
  const {
    fulfillmentNotificationIntent,
  } = require('../lib/negotiationNotifications.js');
  const event = {
    type: 'REWARD_FULFILLED',
    entityType: 'REWARD',
    entityId: 'reward',
    familyId: 'family',
    actorType: 'PARENT',
    actorUid: 'parent',
    terms: 'Private reward',
  };
  const reward = { ...offer, status: 'FULFILLED', fulfilledBy: 'parent' };
  const intent = fulfillmentNotificationIntent(event, reward);
  assert.equal(intent.recipientUid, 'child');
  assert.equal(intent.recipientRole, 'CHILD');
  assert.match(intent.body, /marked as delivered/);
  assert.deepEqual(intent.data, {
    type: 'REWARD_FULFILLED',
    entityType: 'REWARD',
    entityId: 'reward',
    familyId: 'family',
  });
  assert.equal(JSON.stringify(intent).includes('Private'), false);
  for (const patch of [
    { actorUid: 'other' },
    { actorType: 'CHILD' },
    { entityType: 'CONTRACT' },
    { familyId: 'other' },
  ])
    assert.equal(
      fulfillmentNotificationIntent({ ...event, ...patch }, reward),
      undefined,
    );
  assert.equal(
    fulfillmentNotificationIntent(event, {
      ...reward,
      status: 'PENDING_FULFILLMENT',
    }),
    undefined,
  );
});

const { receiptDatabase, seedNotification, Timestamp } =
  await import('./push-receipt-fixture.mjs');
const {
  dispatchNegotiationNotification,
} = require('../lib/negotiationNotifications.js');
const {
  retainExpoTickets,
  processPushReceipts,
  receiptPolicy,
  classifyExpoReceipt,
  getExpoReceipts,
  ReceiptTransportError,
} = require('../lib/pushReceipts.js');
const works = (db) =>
  [...db.records.entries()].filter(([key]) => key.startsWith('pushReceipts/'));
const dueTime = (db) =>
  Timestamp.fromMillis(
    Math.max(...works(db).map(([, work]) => work.nextAttemptAt.toMillis())),
  );
async function sent(db, event = 'event') {
  seedNotification(db, event);
  const messages = [];
  await dispatchNegotiationNotification(db, event, async (batch) => {
    messages.push(...batch);
    return batch.map((_, i) => ({ status: 'ok', id: `${event}-${i}` }));
  });
  return messages;
}
test('accepted tickets bind exact registrations without tokens or message contents; sender dedup survives', async () => {
  const db = receiptDatabase();
  await sent(db);
  assert.equal(works(db).length, 2);
  const [path, work] = works(db)[0];
  assert.equal(work.registrations[0].devicePath, 'users/child/devices/a');
  assert.match(work.registrations[0].tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(work).includes('ExponentPushToken'), false);
  assert.equal(JSON.stringify(work).includes('chore offer'), false);
  await retainExpoTickets(db, 'event', [
    {
      index: 0,
      ticket: { status: 'ok', id: 'event-0' },
      registrations: work.registrations,
    },
  ]);
  assert.equal(works(db).length, 2);
  assert.deepEqual(db.records.get(path), work);
  await dispatchNegotiationNotification(db, 'event', () => {
    throw Error('unexpected resend');
  });
  assert.equal(works(db).length, 2);
});
test('failed pre-ticket send creates no receipt work', async () => {
  const db = receiptDatabase();
  seedNotification(db);
  await assert.rejects(
    dispatchNegotiationNotification(db, 'event', async () => {
      throw Error('transport');
    }),
  );
  assert.equal(works(db).length, 0);
});
test('concurrent receipt workers disable only invalid registration; success remains active and repeats are harmless', async () => {
  const db = receiptDatabase();
  await sent(db);
  const member = structuredClone(
    db.records.get('families/family/members/child'),
  );
  let lookups = 0;
  const transport = async () => {
    lookups++;
    return {
      'event-0': { status: 'ok' },
      'event-1': { status: 'error', details: { error: 'DeviceNotRegistered' } },
    };
  };
  const now = dueTime(db);
  await Promise.all([
    processPushReceipts(db, transport, now),
    processPushReceipts(db, transport, now),
  ]);
  // Workers may split a batch, but each ticket is claimed exactly once.
  assert.ok(lookups <= 2);
  assert.deepEqual(
    works(db).map(([, w]) => w.attempts),
    [1, 1],
  );
  assert.equal(db.records.get('users/child/devices/a').pushEnabled, true);
  assert.equal(db.records.get('users/child/devices/b').pushEnabled, false);
  assert.deepEqual(db.records.get('families/family/members/child'), member);
  assert.deepEqual(
    works(db).map(([, w]) => w.status),
    ['SUCCEEDED', 'DEVICE_INVALID'],
  );
  await processPushReceipts(
    db,
    () => {
      throw Error('unexpected lookup');
    },
    now,
  );
  db.records.set('activityEvents/next', db.records.get('activityEvents/event'));
  let targets;
  await dispatchNegotiationNotification(db, 'next', async (messages) => {
    targets = messages.map((m) => m.to);
    return messages.map(() => ({ status: 'ok', id: 'next' }));
  });
  assert.deepEqual(targets, ['ExponentPushToken[a]']);
});
for (const rotate of [true, false])
  test(`late invalid receipt preserves legitimate ${rotate ? 'token rotation' : 'same-token re-registration'}`, async () => {
    const db = receiptDatabase();
    await sent(db);
    const device = db.records.get('users/child/devices/b');
    db.records.set('users/child/devices/b', {
      ...device,
      expoPushToken: rotate ? 'ExponentPushToken[new]' : device.expoPushToken,
      lastSeenAt: Timestamp.fromMillis(2),
    });
    await processPushReceipts(
      db,
      async () => ({
        'event-0': { status: 'ok' },
        'event-1': {
          status: 'error',
          details: { error: 'DeviceNotRegistered' },
        },
      }),
      dueTime(db),
    );
    assert.equal(db.records.get('users/child/devices/b').pushEnabled, true);
  });
for (const failure of ['missing', 'network', 'MessageRateExceeded'])
  test(`${failure}: bounded lookup retries never resend or invalidate`, async () => {
    const db = receiptDatabase();
    await sent(db);
    let calls = 0;
    for (let attempt = 1; attempt <= receiptPolicy.maxAttempts; attempt++) {
      const now = dueTime(db);
      await processPushReceipts(
        db,
        async () => {
          calls++;
          if (failure === 'network')
            throw new ReceiptTransportError('TRANSIENT_TRANSPORT');
          return failure === 'missing'
            ? {}
            : Object.fromEntries(
                works(db).map(([, w]) => [
                  w.ticketId,
                  { status: 'error', details: { error: failure } },
                ]),
              );
        },
        now,
      );
      assert.equal(db.records.get('users/child/devices/b').pushEnabled, true);
      if (attempt < receiptPolicy.maxAttempts)
        assert.equal(
          works(db)[0][1].nextAttemptAt.toMillis() - now.toMillis(),
          receiptPolicy.initialDelayMs * 2 ** (attempt - 1),
        );
    }
    assert.equal(calls, 5);
    assert.ok(
      works(db).every(
        ([, w]) => w.complete && w.status === 'EXHAUSTED' && w.attempts === 5,
      ),
    );
    assert.equal(
      db.records.get('activityEvents/event/notificationEffects/expo').attempts,
      1,
    );
    await processPushReceipts(
      db,
      () => {
        throw Error('unbounded');
      },
      dueTime(db),
    );
  });
for (const error of [
  'MessageTooBig',
  'MismatchSenderId',
  'InvalidCredentials',
  'UnknownProviderError',
])
  test(`${error}: terminal non-device failure keeps registration active`, async () => {
    const db = receiptDatabase();
    await sent(db);
    await processPushReceipts(
      db,
      async (ids) =>
        Object.fromEntries(
          ids.map((id) => [id, { status: 'error', details: { error } }]),
        ),
      dueTime(db),
    );
    assert.ok(works(db).every(([, w]) => w.complete && w.attempts === 1));
    assert.equal(db.records.get('users/child/devices/b').pushEnabled, true);
  });
test('malformed receipt is terminal; missing receipt is retryable; retention removes only expired work', async () => {
  assert.equal(classifyExpoReceipt(null).retry, false);
  assert.equal(classifyExpoReceipt(undefined).retry, true);
  const db = receiptDatabase();
  await sent(db);
  const now = dueTime(db);
  await processPushReceipts(
    db,
    async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])),
    now,
  );
  await processPushReceipts(
    db,
    () => {
      throw Error('resend');
    },
    Timestamp.fromMillis(now.toMillis() + receiptPolicy.retentionMs - 1),
  );
  assert.equal(works(db).length, 2);
  await processPushReceipts(
    db,
    () => {
      throw Error('resend');
    },
    Timestamp.fromMillis(now.toMillis() + receiptPolicy.retentionMs),
  );
  assert.equal(works(db).length, 0);
});
test('expired work never hits Expo; stale lease result cannot overwrite newer terminal result', async () => {
  const db = receiptDatabase();
  await sent(db);
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const now = dueTime(db);
  const old = processPushReceipts(
    db,
    async () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    now,
  );
  await ready;
  await processPushReceipts(
    db,
    async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])),
    Timestamp.fromMillis(now.toMillis() + receiptPolicy.leaseMs),
  );
  release({
    'event-0': { status: 'error', details: { error: 'DeviceNotRegistered' } },
  });
  await old;
  assert.ok(
    works(db).every(([, w]) => w.status === 'SUCCEEDED' && w.attempts === 2),
  );
  assert.equal(db.records.get('users/child/devices/a').pushEnabled, true);
  const expired = receiptDatabase();
  await sent(expired);
  await processPushReceipts(
    expired,
    () => {
      throw Error('expired lookup');
    },
    Timestamp.fromMillis(Date.now() + receiptPolicy.lifetimeMs + 1000),
  );
  assert.ok(works(expired).every(([, w]) => w.complete && w.attempts === 0));
});
test('receipt HTTP transport validates envelope and uses supported endpoint without resending', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://exp.host/--/api/v2/push/getReceipts');
      assert.deepEqual(JSON.parse(options.body), { ids: ['ticket'] });
      return {
        ok: true,
        json: async () => ({ data: { ticket: { status: 'ok' } } }),
      };
    };
    assert.deepEqual(await getExpoReceipts(['ticket']), {
      ticket: { status: 'ok' },
    });
    for (const [status, category] of [
      [429, 'TRANSIENT_TRANSPORT'],
      [503, 'TRANSIENT_TRANSPORT'],
      [400, 'PERMANENT_REQUEST'],
    ]) {
      globalThis.fetch = async () => ({ ok: false, status });
      await assert.rejects(
        getExpoReceipts(['ticket']),
        (error) => error.category === category,
      );
    }
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    });
    await assert.rejects(
      getExpoReceipts(['ticket']),
      (error) => error.category === 'MALFORMED_RESPONSE',
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('sender persists accepted first batch before a later batch transport failure', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  const retained = [];
  globalThis.fetch = async (_url, options) => {
    if (++requests === 2) return { ok: false };
    return {
      ok: true,
      json: async () => ({
        data: JSON.parse(options.body).map((_, i) => ({
          status: 'ok',
          id: `ticket-${i}`,
        })),
      }),
    };
  };
  try {
    await assert.rejects(
      sendExpoMessages(
        Array.from({ length: 101 }, () => ({ to: 'ExponentPushToken[test]' })),
        async (tickets, offset) => retained.push([tickets.length, offset]),
      ),
      /EXPO_TRANSPORT_FAILED/,
    );
    assert.deepEqual(retained, [[100, 0]]);
  } finally {
    globalThis.fetch = original;
  }
});

test('worker processes at most 100 receipts and cleanup deletes at most 100 per run', async () => {
  const db = receiptDatabase();
  const now = Timestamp.now();
  for (let i = 0; i < 101; i++) {
    db.records.set(`pushReceipts/pending-${i}`, {
      ticketId: `ticket-${i}`,
      complete: false,
      status: 'PENDING',
      attempts: 0,
      registrations: [
        { devicePath: 'users/child/devices/a', tokenHash: 'a'.repeat(64) },
      ],
      nextAttemptAt: now,
      expiresAt: Timestamp.fromMillis(
        now.toMillis() + receiptPolicy.lifetimeMs,
      ),
    });
    db.records.set(`pushReceipts/old-${i}`, {
      complete: true,
      deleteAfter: now,
    });
  }
  assert.equal(
    await processPushReceipts(
      db,
      async (ids) => {
        assert.equal(ids.length, 100);
        return Object.fromEntries(ids.map((id) => [id, { status: 'ok' }]));
      },
      now,
    ),
    100,
  );
  assert.equal(works(db).filter(([, w]) => !w.complete).length, 1);
  assert.equal(works(db).filter(([key]) => key.includes('old-')).length, 1);
});

test('immediate unregistered ticket disables exact registration and creates no receipt; duplicate token binds all matching registrations', async () => {
  const db = receiptDatabase();
  seedNotification(db);
  db.records.set('users/child/devices/c', {
    ...db.records.get('users/child/devices/b'),
  });
  let count;
  await dispatchNegotiationNotification(db, 'event', async (messages) => {
    count = messages.length;
    return messages.map((message) =>
      message.to === 'ExponentPushToken[b]'
        ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'valid' },
    );
  });
  assert.equal(count, 2);
  assert.equal(works(db).length, 1);
  assert.equal(db.records.get('users/child/devices/a').pushEnabled, true);
  assert.equal(db.records.get('users/child/devices/b').pushEnabled, false);
  assert.equal(db.records.get('users/child/devices/c').pushEnabled, false);
});

test('mixed ticket results retain accepted work before preserving existing bounded delivery retry', async () => {
  const db = receiptDatabase();
  seedNotification(db);
  await assert.rejects(
    dispatchNegotiationNotification(db, 'event', async () => [
      { status: 'ok', id: 'valid' },
      { status: 'error', details: { error: 'MessageRateExceeded' } },
    ]),
    /NOTIFICATION_DELIVERY_RETRY/,
  );
  assert.equal(works(db).length, 1);
  assert.equal(
    db.records.get('activityEvents/event/notificationEffects/expo').status,
    'RETRY',
  );
  assert.equal(db.records.get('users/child/devices/b').pushEnabled, true);
});
