import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  setDoc,
} from 'firebase/firestore';

// Extends the existing accepted/completed/submitted/requested-changes fixture.
export async function verifyContractResubmission(ctx) {
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
  const path = `contracts/${contractId}`;
  const before = normalized((await readAdmin(path)).data());
  assert.equal(before.status, 'CHANGES_REQUESTED');
  assert.equal(before.reviewCycle, 0);
  let previousReviews;
  await withAdmin(async (db) => {
    previousReviews = normalized(
      (await getDocs(collection(db, `${path}/reviews`))).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
    );
  });
  const execution = await Promise.all(
    tasks.map(async (task) => ({
      task: normalized((await readAdmin(`${path}/tasks/${task.id}`)).data()),
      history: await audit(familyId, contractId, task.id),
    })),
  );
  const parentDb = environment.authenticatedContext(parent.localId).firestore();
  const queue = watch(
    query(
      collection(parentDb, 'contracts'),
      where('familyId', '==', familyId),
      where('participantUids', 'array-contains', parent.localId),
      where('status', '==', 'READY_FOR_REVIEW'),
      orderBy('createdAt', 'desc'),
    ),
  );
  await queue.wait(
    (s) => !s.docs.some((d) => d.id === contractId) && !s.metadata.fromCache,
  );
  const views = [parent, child].map((actor) =>
    watch(
      doc(environment.authenticatedContext(actor.localId).firestore(), path),
    ),
  );
  const input = { contractId, idempotencyKey: 'resubmission-emulator-001' };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', parent.idToken],
    ['FORBIDDEN', sibling.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ])
    await expectCode(code, () =>
      callFunction('submitContractForReview', input, token),
    );
  const result = await callFunction(
    'submitContractForReview',
    input,
    child.idToken,
  );
  assert.equal(result.contract.reviewCycle, 1);
  assert.equal(result.contract.status, 'READY_FOR_REVIEW');
  assert.deepEqual(
    await callFunction('submitContractForReview', input, child.idToken),
    result,
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'submitContractForReview',
      { ...input, idempotencyKey: 'resubmission-losing' },
      child.idToken,
    ),
  );
  await queue.wait(
    (s) =>
      s.docs.some((d) => d.id === contractId && d.data().reviewCycle === 1) &&
      !s.metadata.fromCache,
  );
  for (const view of views)
    await view.wait(
      (s) =>
        s.data()?.status === 'READY_FOR_REVIEW' &&
        s.data().reviewCycle === 1 &&
        !s.metadata.fromCache,
    );
  const after = normalized((await readAdmin(path)).data());
  assert.deepEqual(after, {
    ...before,
    status: 'READY_FOR_REVIEW',
    reviewCycle: 1,
    updatedAt: after.updatedAt,
  });
  for (let i = 0; i < tasks.length; i++) {
    assert.deepEqual(
      normalized((await readAdmin(`${path}/tasks/${tasks[i].id}`)).data()),
      execution[i].task,
    );
    assert.deepEqual(
      await audit(familyId, contractId, tasks[i].id),
      execution[i].history,
    );
  }
  let eventId;
  await withAdmin(async (db) => {
    const reviews = normalized(
      (await getDocs(collection(db, `${path}/reviews`))).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
    );
    assert.deepEqual(reviews, previousReviews);
    assert.equal(
      (
        await getDocs(
          query(
            collection(db, 'rewards'),
            where('contractId', '==', contractId),
          ),
        )
      ).size,
      0,
    );
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', contractId),
        where('type', '==', 'CONTRACT_SUBMITTED'),
      ),
    );
    assert.equal(events.size, 2);
    const event = events.docs.find((d) => d.data().reviewCycle === 1);
    assert.equal(event.data().actorUid, child.localId);
    assert.equal(event.data().actorType, 'CHILD');
    eventId = event.id;
  });
  for (let i = 0; i < 100; i++) {
    const effect = (
      await readAdmin(`activityEvents/${eventId}/notificationEffects/expo`)
    ).data();
    if (effect?.status === 'COMPLETE') {
      assert.equal(effect.recipientUid, parent.localId);
      assert.equal(effect.data.type, 'CONTRACT_SUBMITTED');
      assert.equal(Object.keys(effect.data).length, 4);
      break;
    }
    assert.notEqual(i, 99, 'Submission notification did not complete');
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const actor of [parent, child]) {
    const db = environment.authenticatedContext(actor.localId).firestore();
    await assertFails(
      updateDoc(doc(db, path), { reviewCycle: 2, status: 'READY_FOR_REVIEW' }),
    );
    await assertFails(setDoc(doc(db, `${path}/reviews/forged`), { cycle: 1 }));
    await assertFails(
      updateDoc(doc(db, `${path}/tasks/${tasks[0].id}`), { completedCount: 0 }),
    );
  }
  const approved = await callFunction(
    'approveContract',
    { contractId, idempotencyKey: 'approval-after-resubmit' },
    parent.idToken,
  );
  assert.equal(approved.review.cycle, 1);
  assert.equal(approved.contract.reviewCycle, 1);
  await withAdmin(async (db) => {
    assert.equal((await getDocs(collection(db, `${path}/reviews`))).size, 2);
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
  });
  await verifyResubmissionTransactions();
  console.info(
    'PASS: full correction loop, cycle 0 -> 1, bilateral realtime/Parent queue re-entry, unchanged tasks/completions/review, same-key retry, one Parent notification effect, denied writes, later approval round 1 earns exactly one Reward',
  );
}

async function verifyResubmissionTransactions() {
  const require = createRequire(
    new URL('../functions/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const {
    executeSubmitContractForReview,
  } = require('./lib/submitContractForReview.js');
  const { contractReviewId } = require('./lib/parentReviewDecision.js');
  const {
    dispatchNegotiationNotification,
  } = require('./lib/negotiationNotifications.js');
  const app = initializeApp(
      { projectId: `${process.env.GCLOUD_PROJECT}-resubmit-fakes` },
      `resubmit-${Date.now()}`,
    ),
    db = getFirestore(app);
  try {
    const now = Timestamp.now();
    await db
      .doc('families/family/members/child')
      .set({ role: 'CHILD', status: 'ACTIVE' });
    await db
      .doc('families/family/members/parent')
      .set({ role: 'PARENT', status: 'ACTIVE' });
    await db.doc('users/parent/devices/test').set({
      platform: 'ios',
      appVariant: 'PARENT',
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[test]',
    });
    const base = {
      familyId: 'family',
      parentUid: 'parent',
      childUid: 'child',
      participantUids: ['parent', 'child'],
      status: 'CHANGES_REQUESTED',
      reviewCycle: 2,
      source: { type: 'OFFER', offerId: 'offer', revisionId: 'revision' },
      rewardTerms: { title: 'Cinema', type: 'EXPERIENCE' },
      deadlineAt: now,
      createdAt: now,
      updatedAt: now,
    };
    async function seed(id) {
      await db.doc(`contracts/${id}`).set(base);
      await db.doc(`contracts/${id}/tasks/task`).set({
        familyId: 'family',
        contractId: id,
        assigneeUid: 'child',
        title: 'Task',
        targetCount: 1,
        completedCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      await db.doc(`contracts/${id}/reviews/${contractReviewId(id, 2)}`).set({
        familyId: 'family',
        contractId: id,
        cycle: 2,
        reviewerUid: 'parent',
        decision: 'REQUEST_CHANGES',
        note: 'Private feedback',
        createdAt: now,
      });
    }
    for (let i = 0; i < 4; i++) {
      const id = `race-${i}`;
      await seed(id);
      const calls = [0, 1].map((n) =>
        executeSubmitContractForReview(db, 'child', {
          contractId: id,
          idempotencyKey: `resubmit-race-${i}-${n}`,
        }),
      );
      const results = await Promise.allSettled(calls);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        results.find((r) => r.status === 'rejected').reason.code,
        'INVALID_STATE',
      );
      assert.equal(
        (await db.doc(`contracts/${id}`).get()).data().reviewCycle,
        3,
      );
      assert.equal(
        (
          await db
            .collection('activityEvents')
            .where('entityId', '==', id)
            .get()
        ).size,
        1,
      );
      assert.equal(
        (await db.collection(`contracts/${id}/reviews`).get()).size,
        1,
      );
    }
    await seed('transport');
    const input = {
      contractId: 'transport',
      idempotencyKey: 'transport-resubmit',
    };
    const result = await executeSubmitContractForReview(db, 'child', input);
    assert.deepEqual(
      await executeSubmitContractForReview(db, 'child', input),
      result,
    );
    const events = await db
      .collection('activityEvents')
      .where('entityId', '==', 'transport')
      .get();
    assert.equal(events.size, 1);
    const eventId = events.docs[0].id;
    let sends = 0;
    await assert.rejects(() =>
      dispatchNegotiationNotification(db, eventId, async () => {
        sends++;
        throw new Error('INJECTED_TRANSPORT');
      }),
    );
    assert.equal(
      (await db.doc('contracts/transport').get()).data().status,
      'READY_FOR_REVIEW',
    );
    await dispatchNegotiationNotification(db, eventId, async (messages) => {
      sends++;
      assert.equal(
        JSON.stringify(messages).includes('Private feedback'),
        false,
      );
      assert.equal(messages[0].data.type, 'CONTRACT_SUBMITTED');
      return [{ status: 'ok', id: 'test-ticket' }];
    });
    await dispatchNegotiationNotification(db, eventId, async () => {
      throw new Error('DUPLICATE_SEND');
    });
    assert.equal(sends, 2);
    assert.equal((await db.collection('rewards').get()).size, 0);
    await seed('abort');
    const failing = {
      doc: (path) => db.doc(path),
      collection: (path) => db.collection(path),
      runTransaction: (op) =>
        db.runTransaction(async (tx) => {
          await op(tx);
          throw new Error('INJECTED_ABORT');
        }),
    };
    await assert.rejects(
      () =>
        executeSubmitContractForReview(failing, 'child', {
          contractId: 'abort',
          idempotencyKey: 'abort-resubmit',
        }),
      /INJECTED_ABORT/,
    );
    assert.equal(
      (await db.doc('contracts/abort').get()).data().status,
      'CHANGES_REQUESTED',
    );
    assert.equal(
      (
        await db
          .collection('activityEvents')
          .where('entityId', '==', 'abort')
          .get()
      ).size,
      0,
    );
    console.info(
      'PASS: four real Firestore different-key races open cycle 2 -> 3 once, immutable review preservation, aborted transaction has no effects, transport failure retains committed state and effect redelivery deduplicates',
    );
  } finally {
    await deleteApp(app);
  }
}
