import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  setDoc,
  deleteDoc,
  disableNetwork,
  enableNetwork,
} from 'firebase/firestore';

// Extends the real Offer -> execution -> correction -> approval fixture.
export async function verifyRewardFulfillment(ctx) {
  const {
    environment,
    withAdmin,
    readAdmin,
    callFunction,
    watch,
    expectCode,
    normalized,
    parent,
    child,
    sibling,
    outside,
    familyId,
    contractId,
    tasks,
    audit,
  } = ctx;
  const require = createRequire(
    new URL('../functions/package.json', import.meta.url),
  );
  const { contractRewardId } = require('./lib/parentReviewDecision.js');
  const rewardId = contractRewardId(contractId),
    path = `rewards/${rewardId}`,
    contractPath = `contracts/${contractId}`;
  const before = normalized((await readAdmin(path)).data()),
    contractBefore = normalized((await readAdmin(contractPath)).data());
  assert.equal(before.status, 'PENDING_FULFILLMENT');
  assert.equal(contractBefore.status, 'APPROVED');
  const execution = await Promise.all(
    tasks.map(async (task) => ({
      task: normalized(
        (await readAdmin(`${contractPath}/tasks/${task.id}`)).data(),
      ),
      history: await audit(familyId, contractId, task.id),
    })),
  );
  let reviewsBefore;
  await withAdmin(async (db) => {
    reviewsBefore = normalized(
      (await getDocs(collection(db, `${contractPath}/reviews`))).docs.map(
        (d) => ({ id: d.id, ...d.data() }),
      ),
    );
  });
  const offerBefore = normalized(
      (await readAdmin(`offers/${contractBefore.source.offerId}`)).data(),
    ),
    revisionBefore = normalized(
      (
        await readAdmin(
          `offers/${contractBefore.source.offerId}/revisions/${contractBefore.source.revisionId}`,
        )
      ).data(),
    );
  const parentDb = environment.authenticatedContext(parent.localId).firestore(),
    childDb = environment.authenticatedContext(child.localId).firestore();
  const siblingRewardId = contractRewardId(`${contractId}-sibling`);
  await withAdmin(async (db) => {
    const contractData = (await readAdmin(contractPath)).data(),
      rewardData = (await readAdmin(path)).data();
    await setDoc(doc(db, `contracts/${contractId}-sibling`), {
      ...contractData,
      childUid: sibling.localId,
      participantUids: [parent.localId, sibling.localId],
    });
    await setDoc(doc(db, `rewards/${siblingRewardId}`), {
      ...rewardData,
      contractId: `${contractId}-sibling`,
      childUid: sibling.localId,
    });
  });
  const pendingQuery = query(
    collection(parentDb, 'rewards'),
    where('familyId', '==', familyId),
    where('parentUid', '==', parent.localId),
    where('status', '==', 'PENDING_FULFILLMENT'),
    orderBy('earnedAt', 'desc'),
  );
  const earnedQuery = query(
    collection(childDb, 'rewards'),
    where('familyId', '==', familyId),
    where('childUid', '==', child.localId),
    orderBy('earnedAt', 'desc'),
  );
  const pending = watch(pendingQuery),
    earned = watch(earnedQuery),
    detail = watch(doc(childDb, path));
  await pending.wait((s) => s.size === 2 && !s.metadata.fromCache);
  await earned.wait((s) => s.size === 1 && !s.metadata.fromCache);
  assert.equal(
    (await getDoc(doc(parentDb, path))).data().status,
    'PENDING_FULFILLMENT',
  );
  assert.equal(
    (await getDoc(doc(childDb, path))).data().status,
    'PENDING_FULFILLMENT',
  );
  await assertFails(getDoc(doc(childDb, `rewards/${siblingRewardId}`)));
  for (const actor of [undefined, sibling.localId, outside.localId]) {
    const db = actor
      ? environment.authenticatedContext(actor).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, path)));
    await assertFails(
      getDocs(
        query(
          collection(db, 'rewards'),
          where('familyId', '==', familyId),
          where('parentUid', '==', parent.localId),
          where('status', '==', 'PENDING_FULFILLMENT'),
          orderBy('earnedAt', 'desc'),
        ),
      ),
    );
  }
  await assertFails(getDocs(collection(parentDb, 'rewards')));
  const memberPath = `families/${familyId}/members/${parent.localId}`,
    member = (await readAdmin(memberPath)).data();
  for (const status of ['INACTIVE', 'DISABLED']) {
    await withAdmin((db) => updateDoc(doc(db, memberPath), { status }));
    await assertFails(getDoc(doc(parentDb, path)));
    await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
      callFunction(
        'fulfillReward',
        { rewardId, idempotencyKey: 'fulfillment-inactive' },
        parent.idToken,
      ),
    );
  }
  await withAdmin((db) => deleteDoc(doc(db, memberPath)));
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'fulfillReward',
      { rewardId, idempotencyKey: 'fulfillment-nonmember' },
      parent.idToken,
    ),
  );
  await withAdmin((db) => setDoc(doc(db, memberPath), member));
  // Restart listeners terminated by membership revocation before testing delivery convergence.
  const activePending = watch(pendingQuery),
    activeEarned = watch(earnedQuery),
    activeDetail = watch(doc(childDb, path));
  await activePending.wait((s) => s.size === 2 && !s.metadata.fromCache);
  await activeEarned.wait((s) => s.size === 1 && !s.metadata.fromCache);
  const input = { rewardId, idempotencyKey: 'fulfillment-emulator-001' };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', child.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ])
    await expectCode(code, () => callFunction('fulfillReward', input, token));
  for (const extra of [
    { parentUid: parent.localId },
    { fulfilledAt: before.earnedAt },
    { contractId },
    { role: 'PARENT' },
  ])
    await expectCode('INVALID_INPUT', () =>
      callFunction('fulfillReward', { ...input, ...extra }, parent.idToken),
    );
  for (const db of [parentDb, childDb]) {
    await assertFails(
      updateDoc(doc(db, path), {
        status: 'FULFILLED',
        fulfilledAt: new Date(),
        fulfilledBy: parent.localId,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'activityEvents/forged-reward'), {
        type: 'REWARD_FULFILLED',
      }),
    );
  }
  const result = await callFunction('fulfillReward', input, parent.idToken);
  assert.equal(result.reward.status, 'FULFILLED');
  assert.equal(result.reward.fulfilledBy, parent.localId);
  assert.deepEqual(
    await callFunction('fulfillReward', input, parent.idToken),
    result,
  );
  await expectCode('REWARD_ALREADY_FULFILLED', () =>
    callFunction(
      'fulfillReward',
      { ...input, idempotencyKey: 'fulfillment-second' },
      parent.idToken,
    ),
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'fulfillReward',
      { ...input, rewardId: siblingRewardId },
      parent.idToken,
    ),
  );
  await activePending.wait(
    (s) =>
      s.size === 1 &&
      !s.docs.some((d) => d.id === rewardId) &&
      !s.metadata.fromCache,
  );
  await activeEarned.wait(
    (s) =>
      s.docs.some(
        (d) => d.id === rewardId && d.data().status === 'FULFILLED',
      ) && !s.metadata.fromCache,
  );
  await activeDetail.wait(
    (s) => s.data()?.status === 'FULFILLED' && !s.metadata.fromCache,
  );
  assert.deepEqual(normalized((await readAdmin(path)).data()), {
    ...before,
    status: 'FULFILLED',
    fulfilledBy: parent.localId,
    fulfilledAt: result.reward.fulfilledAt,
  });
  assert.deepEqual(
    normalized((await readAdmin(contractPath)).data()),
    contractBefore,
  );
  for (let i = 0; i < tasks.length; i++) {
    assert.deepEqual(
      normalized(
        (await readAdmin(`${contractPath}/tasks/${tasks[i].id}`)).data(),
      ),
      execution[i].task,
    );
    assert.deepEqual(
      await audit(familyId, contractId, tasks[i].id),
      execution[i].history,
    );
  }
  assert.deepEqual(
    normalized(
      (await readAdmin(`offers/${contractBefore.source.offerId}`)).data(),
    ),
    offerBefore,
  );
  assert.deepEqual(
    normalized(
      (
        await readAdmin(
          `offers/${contractBefore.source.offerId}/revisions/${contractBefore.source.revisionId}`,
        )
      ).data(),
    ),
    revisionBefore,
  );
  let eventId;
  await withAdmin(async (db) => {
    assert.deepEqual(
      normalized(
        (await getDocs(collection(db, `${contractPath}/reviews`))).docs.map(
          (d) => ({ id: d.id, ...d.data() }),
        ),
      ),
      reviewsBefore,
    );
    assert.equal(
      (
        await getDocs(
          query(
            collection(db, 'rewards'),
            where('contractId', '==', contractId),
          ),
        )
      ).size,
      1,
    );
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', rewardId),
        where('type', '==', 'REWARD_FULFILLED'),
      ),
    );
    assert.equal(events.size, 1);
    const event = events.docs[0];
    eventId = event.id;
    assert.equal(event.data().actorType, 'PARENT');
    assert.equal(event.data().actorUid, parent.localId);
    assert.equal(event.data().entityType, 'REWARD');
  });
  for (let i = 0; i < 100; i++) {
    const effect = (
      await readAdmin(`activityEvents/${eventId}/notificationEffects/expo`)
    ).data();
    if (effect?.status === 'COMPLETE') {
      assert.equal(effect.recipientUid, child.localId);
      assert.deepEqual(effect.data, {
        type: 'REWARD_FULFILLED',
        entityType: 'REWARD',
        entityId: rewardId,
        familyId,
      });
      break;
    }
    assert.notEqual(i, 99, 'Fulfillment effect not completed');
    await new Promise((r) => setTimeout(r, 100));
  }
  await disableNetwork(childDb);
  await activeEarned.wait(
    (s) =>
      s.docs.some(
        (d) => d.id === rewardId && d.data().status === 'FULFILLED',
      ) && s.metadata.fromCache,
  );
  await enableNetwork(childDb);
  await activeEarned.wait(
    (s) =>
      s.docs.some(
        (d) => d.id === rewardId && d.data().status === 'FULFILLED',
      ) && !s.metadata.fromCache,
  );
  await verifyFulfillmentRacesAndTransport();
  console.info(
    'PASS: Offer -> completion -> correction/resubmission -> approval -> Reward fulfillment, Parent multiple-child obligations/query removal, Child earned/pending/fulfilled realtime/cache/reconnect, stable retries, immutable terms/Contract/history, denied family/direct-write access, Child notification effect',
  );
}
async function verifyFulfillmentRacesAndTransport() {
  const require = createRequire(
    new URL('../functions/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app'),
    { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const { executeFulfillReward } = require('./lib/fulfillReward.js'),
    { contractRewardId } = require('./lib/parentReviewDecision.js'),
    {
      dispatchNegotiationNotification,
    } = require('./lib/negotiationNotifications.js');
  const app = initializeApp(
      { projectId: `${process.env.GCLOUD_PROJECT}-fulfillment-fakes` },
      `fulfillment-${Date.now()}`,
    ),
    db = getFirestore(app);
  try {
    const now = Timestamp.now();
    await db
      .doc('families/family/members/parent')
      .set({ role: 'PARENT', status: 'ACTIVE' });
    await db
      .doc('families/family/members/child')
      .set({ role: 'CHILD', status: 'ACTIVE' });
    await db.doc('users/child/devices/test').set({
      platform: 'ios',
      appVariant: 'CHILD',
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[test]',
    });
    async function seed(id) {
      const terms = {
        title: 'Private reward',
        description: 'Private description',
        type: 'EXPERIENCE',
      };
      await db.doc(`contracts/${id}`).set({
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        participantUids: ['parent', 'child'],
        status: 'APPROVED',
        rewardTerms: terms,
        approvedAt: now,
      });
      const rewardId = contractRewardId(id);
      await db.doc(`rewards/${rewardId}`).set({
        familyId: 'family',
        contractId: id,
        parentUid: 'parent',
        childUid: 'child',
        terms,
        status: 'PENDING_FULFILLMENT',
        earnedAt: now,
      });
      return { rewardId, idempotencyKey: `fulfill-${id}` };
    }
    for (let i = 0; i < 4; i++) {
      const input = await seed(`race-${i}`),
        same = i % 2 === 0;
      const results = await Promise.allSettled([
        executeFulfillReward(db, 'parent', input),
        executeFulfillReward(db, 'parent', {
          ...input,
          idempotencyKey: same ? input.idempotencyKey : `competing-${i}`,
        }),
      ]);
      assert.equal(
        results.filter((r) => r.status === 'fulfilled').length,
        same ? 2 : 1,
      );
      if (same) assert.deepEqual(results[0].value, results[1].value);
      else
        assert.equal(
          results.find((r) => r.status === 'rejected').reason.code,
          'REWARD_ALREADY_FULFILLED',
        );
      assert.equal(
        (await db.doc(`rewards/${input.rewardId}`).get()).data().status,
        'FULFILLED',
      );
      assert.equal(
        (
          await db
            .collection('activityEvents')
            .where('entityId', '==', input.rewardId)
            .get()
        ).size,
        1,
      );
    }
    const input = await seed('transport'),
      result = await executeFulfillReward(db, 'parent', input);
    const event = (
      await db
        .collection('activityEvents')
        .where('entityId', '==', input.rewardId)
        .get()
    ).docs[0];
    let sends = 0;
    await assert.rejects(() =>
      dispatchNegotiationNotification(db, event.id, async () => {
        sends++;
        throw new Error('INJECTED_TRANSPORT');
      }),
    );
    assert.equal(
      (await db.doc(`rewards/${input.rewardId}`).get()).data().status,
      'FULFILLED',
    );
    await dispatchNegotiationNotification(db, event.id, async (messages) => {
      sends++;
      assert.equal(JSON.stringify(messages).includes('Private'), false);
      assert.equal(messages[0].data.entityType, 'REWARD');
      return [{ status: 'ok', id: 'test-ticket' }];
    });
    await dispatchNegotiationNotification(db, event.id, async () => {
      throw new Error('DUPLICATE_SEND');
    });
    assert.equal(sends, 2);
    assert.deepEqual(await executeFulfillReward(db, 'parent', input), result);
    const abort = await seed('abort'),
      failing = {
        doc: (path) => db.doc(path),
        runTransaction: (op) =>
          db.runTransaction(async (tx) => {
            await op(tx);
            throw new Error('INJECTED_ABORT');
          }),
      };
    await assert.rejects(
      () => executeFulfillReward(failing, 'parent', abort),
      /INJECTED_ABORT/,
    );
    assert.equal(
      (await db.doc(`rewards/${abort.rewardId}`).get()).data().status,
      'PENDING_FULFILLMENT',
    );
    assert.equal(
      (
        await db
          .collection('activityEvents')
          .where('entityId', '==', abort.rewardId)
          .get()
      ).size,
      0,
    );
    console.info(
      'PASS: four real fulfillment races (same/different keys), one stable timestamp/event, aborted transaction has no effects, transport failure retains fulfilled state and completed effect deduplicates redelivery',
    );
  } finally {
    await deleteApp(app);
  }
}
