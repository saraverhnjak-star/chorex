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
