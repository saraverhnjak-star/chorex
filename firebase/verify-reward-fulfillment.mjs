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
  const waitingQuery = query(
    collection(parentDb, 'rewards'),
    where('familyId', '==', familyId),
    where('parentUid', '==', parent.localId),
    where('status', '==', 'AWAITING_CHILD_CONFIRMATION'),
    orderBy('earnedAt', 'desc'),
  );
  const earnedQuery = query(
    collection(childDb, 'rewards'),
    where('familyId', '==', familyId),
    where('childUid', '==', child.localId),
    orderBy('earnedAt', 'desc'),
  );
  const pending = watch(pendingQuery),
    earned = watch(earnedQuery);
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
        'markRewardDelivered',
        { rewardId, idempotencyKey: 'fulfillment-inactive' },
        parent.idToken,
      ),
    );
  }
  await withAdmin((db) => deleteDoc(doc(db, memberPath)));
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'markRewardDelivered',
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
    await expectCode(code, () =>
      callFunction('markRewardDelivered', input, token),
    );
  for (const extra of [
    { parentUid: parent.localId },
    { fulfilledAt: before.earnedAt },
    { contractId },
    { role: 'PARENT' },
  ])
    await expectCode('INVALID_INPUT', () =>
      callFunction(
        'markRewardDelivered',
        { ...input, ...extra },
        parent.idToken,
      ),
    );
  for (const db of [parentDb, childDb]) {
    await assertFails(
      updateDoc(doc(db, path), {
        status: 'AWAITING_CHILD_CONFIRMATION',
        fulfilledAt: new Date(),
        deliveredBy: parent.localId,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'activityEvents/forged-reward'), {
        type: 'REWARD_DELIVERED',
      }),
    );
  }
  const result = await callFunction(
    'markRewardDelivered',
    input,
    parent.idToken,
  );
  assert.equal(result.reward.status, 'AWAITING_CHILD_CONFIRMATION');
  assert.equal(result.reward.deliveredBy, parent.localId);
  const waiting = watch(waitingQuery),
    parentDetail = watch(doc(parentDb, path));
  await waiting.wait(
    (s) => s.size === 1 && s.docs[0].id === rewardId && !s.metadata.fromCache,
  );

  assert.deepEqual(
    await callFunction('markRewardDelivered', input, parent.idToken),
    result,
  );
  await expectCode('REWARD_ALREADY_DELIVERED', () =>
    callFunction(
      'markRewardDelivered',
      { ...input, idempotencyKey: 'fulfillment-second' },
      parent.idToken,
    ),
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'markRewardDelivered',
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
        (d) =>
          d.id === rewardId &&
          d.data().status === 'AWAITING_CHILD_CONFIRMATION',
      ) && !s.metadata.fromCache,
  );
  await activeDetail.wait(
    (s) =>
      s.data()?.status === 'AWAITING_CHILD_CONFIRMATION' &&
      !s.metadata.fromCache,
  );
  assert.deepEqual(normalized((await readAdmin(path)).data()), {
    ...before,
    status: 'AWAITING_CHILD_CONFIRMATION',
    deliveredBy: parent.localId,
    deliveredAt: result.reward.deliveredAt,
  });
  const confirmationInput = {
    rewardId,
    idempotencyKey: 'confirmation-emulator-001',
  };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', parent.idToken],
    ['FORBIDDEN', sibling.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ]) {
    await expectCode(code, () =>
      callFunction('confirmRewardReceived', confirmationInput, token),
    );
  }
  const childMemberPath = `families/${familyId}/members/${child.localId}`;
  const childMember = (await readAdmin(childMemberPath)).data();
  await withAdmin((db) =>
    updateDoc(doc(db, childMemberPath), { status: 'INACTIVE' }),
  );
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('confirmRewardReceived', confirmationInput, child.idToken),
  );
  await withAdmin((db) => setDoc(doc(db, childMemberPath), childMember));
  const confirmedDetail = watch(doc(childDb, path));
  const confirmedEarned = watch(earnedQuery);
  const confirmed = await callFunction(
    'confirmRewardReceived',
    confirmationInput,
    child.idToken,
  );
  assert.equal(confirmed.reward.status, 'FULFILLED');
  await waiting.wait((s) => s.size === 0 && !s.metadata.fromCache);
  await parentDetail.wait(
    (s) => s.data()?.status === 'FULFILLED' && !s.metadata.fromCache,
  );

  assert.equal(confirmed.reward.confirmedBy, child.localId);
  assert.equal(confirmed.reward.fulfilledAt, confirmed.reward.confirmedAt);
  assert.equal(confirmed.reward.deliveredAt, result.reward.deliveredAt);
  assert.equal(confirmed.reward.deliveredBy, parent.localId);
  await confirmedDetail.wait(
    (s) => s.data()?.status === 'FULFILLED' && !s.metadata.fromCache,
  );
  await confirmedEarned.wait(
    (s) =>
      s.docs.some(
        (d) => d.id === rewardId && d.data().status === 'FULFILLED',
      ) && !s.metadata.fromCache,
  );
  assert.deepEqual(
    await callFunction(
      'confirmRewardReceived',
      confirmationInput,
      child.idToken,
    ),
    confirmed,
  );
  assert.deepEqual(
    await callFunction('markRewardDelivered', input, parent.idToken),
    result,
  );
  assert.deepEqual(normalized((await readAdmin(path)).data()), {
    ...before,
    status: 'FULFILLED',
    deliveredAt: result.reward.deliveredAt,
    deliveredBy: parent.localId,
    confirmedAt: confirmed.reward.confirmedAt,
    confirmedBy: child.localId,
    fulfilledAt: confirmed.reward.confirmedAt,
  });
  await withAdmin(async (db) => {
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', rewardId),
        where('type', '==', 'REWARD_RECEIVED_CONFIRMED'),
      ),
    );
    assert.equal(events.size, 1);
    assert.equal(events.docs[0].data().actorUid, child.localId);
    assert.equal(events.docs[0].data().actorType, 'CHILD');
    for (let i = 0; i < 100; i++) {
      const effect = (
        await readAdmin(
          `activityEvents/${events.docs[0].id}/notificationEffects/expo`,
        )
      ).data();
      if (effect?.status === 'COMPLETE') {
        assert.equal(effect.recipientUid, parent.localId);
        assert.equal(effect.data.type, 'REWARD_RECEIVED_CONFIRMED');
        break;
      }
      assert.notEqual(i, 99, 'Confirmation effect not completed');
      await new Promise((r) => setTimeout(r, 100));
    }
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
        where('type', '==', 'REWARD_DELIVERED'),
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
        type: 'REWARD_DELIVERED',
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
  await confirmedEarned.wait(
    (s) =>
      s.docs.some(
        (d) => d.id === rewardId && d.data().status === 'FULFILLED',
      ) && s.metadata.fromCache,
  );
  await enableNetwork(childDb);
  await confirmedEarned.wait(
    (s) =>
      s.docs.some(
        (d) => d.id === rewardId && d.data().status === 'FULFILLED',
      ) && !s.metadata.fromCache,
  );
  await verifyFulfillmentRacesAndTransport();
  console.info(
    'PASS: Offer -> completion -> correction/resubmission -> approval -> bilateral Reward fulfillment, Parent multiple-child obligations/query removal, Child earned/pending/fulfilled realtime/cache/reconnect, stable retries, immutable terms/Contract/history, denied family/direct-write access, Child notification effect',
  );
}
async function verifyFulfillmentRacesAndTransport() {
  const require = createRequire(
    new URL('../functions/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app'),
    { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const {
      executeMarkRewardDelivered,
      executeConfirmRewardReceived,
    } = require('./lib/markRewardDelivered.js'),
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
        iconKey: 'cinema',
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
        executeMarkRewardDelivered(db, 'parent', input),
        executeMarkRewardDelivered(db, 'parent', {
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
          'REWARD_ALREADY_DELIVERED',
        );
      assert.equal(
        (await db.doc(`rewards/${input.rewardId}`).get()).data().status,
        'AWAITING_CHILD_CONFIRMATION',
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
    for (let i = 0; i < 2; i++) {
      const input = await seed(`confirmation-race-${i}`);
      await assert.rejects(
        () => executeConfirmRewardReceived(db, 'child', input),
        (e) => e.code === 'INVALID_STATE',
      );
      const delivered = await executeMarkRewardDelivered(db, 'parent', input);
      const confirmation = { ...input, idempotencyKey: `confirm-${i}` };
      const results = await Promise.allSettled([
        executeConfirmRewardReceived(db, 'child', confirmation),
        executeConfirmRewardReceived(db, 'child', {
          ...confirmation,
          idempotencyKey:
            i === 0 ? confirmation.idempotencyKey : 'competing-confirmation',
        }),
      ]);
      assert.equal(
        results.filter((r) => r.status === 'fulfilled').length,
        i === 0 ? 2 : 1,
      );
      if (i === 0) assert.deepEqual(results[0].value, results[1].value);
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
        2,
      );
      assert.deepEqual(
        await executeMarkRewardDelivered(db, 'parent', input),
        delivered,
      );
    }
    const input = await seed('transport'),
      result = await executeMarkRewardDelivered(db, 'parent', input);
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
      'AWAITING_CHILD_CONFIRMATION',
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
    assert.deepEqual(
      await executeMarkRewardDelivered(db, 'parent', input),
      result,
    );
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
      () => executeMarkRewardDelivered(failing, 'parent', abort),
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
      'PASS: four delivery and two confirmation races (same/different keys), one stable timestamp/event, aborted transaction has no effects, transport failure retains awaiting state and completed effect deduplicates redelivery',
    );
  } finally {
    await deleteApp(app);
  }
}
