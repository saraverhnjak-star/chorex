import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';

// Extends the accepted -> completed -> submitted fixture and existing Rules/listener harness.
export async function verifyContractApproval(ctx) {
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
  } = ctx;
  const path = `contracts/${contractId}`;
  const before = normalized((await readAdmin(path)).data());
  const parentDb = environment.authenticatedContext(parent.localId).firestore();
  const childDb = environment.authenticatedContext(child.localId).firestore();
  const queue = watch(
    query(
      collection(parentDb, 'contracts'),
      where('familyId', '==', familyId),
      where('participantUids', 'array-contains', parent.localId),
      where('status', '==', 'READY_FOR_REVIEW'),
      orderBy('createdAt', 'desc'),
    ),
  );
  const listeners = [parentDb, childDb].map((db) => watch(doc(db, path)));
  await queue.wait(
    (s) => s.docs.some((d) => d.id === contractId) && !s.metadata.fromCache,
  );
  const input = { contractId, idempotencyKey: 'approval-emulator-001' };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', child.idToken],
    ['WRONG_ACTOR_ROLE', sibling.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ])
    await expectCode(code, () => callFunction('approveContract', input, token));
  await expectCode('INVALID_INPUT', () =>
    callFunction(
      'approveContract',
      { ...input, reviewCycle: 0 },
      parent.idToken,
    ),
  );
  for (const db of [parentDb, childDb]) {
    await assertFails(updateDoc(doc(db, path), { status: 'APPROVED' }));
    await assertFails(
      setDoc(doc(db, `${path}/reviews/forged`), {
        familyId,
        contractId,
        cycle: 0,
        decision: 'APPROVE',
      }),
    );
    await assertFails(
      setDoc(doc(db, `rewards/forged-${contractId}`), {
        familyId,
        contractId,
        status: 'PENDING_FULFILLMENT',
      }),
    );
    await assertFails(
      setDoc(doc(db, `activityEvents/forged-approval-${contractId}`), {
        familyId,
        type: 'CONTRACT_APPROVED',
      }),
    );
  }
  const taskBefore = await Promise.all(
    tasks.map(async (task) =>
      normalized((await readAdmin(`${path}/tasks/${task.id}`)).data()),
    ),
  );
  const countRecords = async () => {
    let records;
    await withAdmin(async (db) => {
      records = {
        reviews: await getDocs(collection(db, `${path}/reviews`)),
        rewards: await getDocs(
          query(
            collection(db, 'rewards'),
            where('contractId', '==', contractId),
          ),
        ),
        events: await getDocs(
          query(
            collection(db, 'activityEvents'),
            where('entityId', '==', contractId),
            where('type', '==', 'CONTRACT_APPROVED'),
          ),
        ),
      };
    });
    return records;
  };
  const empty = await countRecords();
  assert.equal(empty.rewards.size, 0);
  assert.equal(empty.reviews.size, 0);
  const attempts = await Promise.allSettled([
    callFunction('approveContract', input, parent.idToken),
    callFunction(
      'approveContract',
      { ...input, idempotencyKey: 'approval-emulator-competing' },
      parent.idToken,
    ),
  ]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    attempts.find((r) => r.status === 'rejected').reason.callable.details.code,
    'INVALID_STATE',
  );
  const result = attempts.find((r) => r.status === 'fulfilled').value;
  const winningInput =
    attempts[0].status === 'fulfilled'
      ? input
      : { ...input, idempotencyKey: 'approval-emulator-competing' };
  await Promise.all(
    listeners.map((l) =>
      l.wait((s) => s.data()?.status === 'APPROVED' && !s.metadata.fromCache),
    ),
  );
  await queue.wait(
    (s) => s.docs.every((d) => d.id !== contractId) && !s.metadata.fromCache,
  );
  assert.equal(result.review.cycle, 0);
  assert.equal(result.contract.reviewCycle, 0);
  assert.equal(result.review.reviewerUid, parent.localId);
  assert.equal(result.review.decision, 'APPROVE');
  assert.equal(result.reward.status, 'PENDING_FULFILLMENT');
  assert.deepEqual(result.reward.terms, before.rewardTerms);
  assert.equal('fulfilledAt' in result.reward, false);
  assert.equal('deliveredByUid' in result.reward, false);
  assert.deepEqual(
    await callFunction('approveContract', winningInput, parent.idToken),
    result,
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'approveContract',
      { ...winningInput, contractId: 'other' },
      parent.idToken,
    ),
  );
  const after = normalized((await readAdmin(path)).data());
  assert.deepEqual(after, {
    ...before,
    status: 'APPROVED',
    approvedAt: after.approvedAt,
    updatedAt: after.updatedAt,
  });
  for (let i = 0; i < tasks.length; i++)
    assert.deepEqual(
      normalized((await readAdmin(`${path}/tasks/${tasks[i].id}`)).data()),
      taskBefore[i],
    );
  const records = await countRecords();
  assert.equal(records.reviews.size, 1);
  assert.equal(records.rewards.size, 1);
  assert.equal(records.events.size, 1);
  const event = records.events.docs[0];
  assert.equal(event.data().actorType, 'PARENT');
  assert.equal(event.data().actorUid, parent.localId);
  let effectData;
  for (let attempt = 0; attempt < 100; attempt++) {
    effectData = (
      await readAdmin(`activityEvents/${event.id}/notificationEffects/expo`)
    ).data();
    if (effectData?.status === 'COMPLETE') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(effectData?.status, 'COMPLETE');
  assert.equal(effectData.recipientUid, child.localId);
  assert.deepEqual(effectData.data, {
    type: 'CONTRACT_APPROVED',
    entityType: 'CONTRACT',
    entityId: contractId,
    familyId,
  });
  await verifyApprovalTransactionsAndTransport();
  console.info(
    'PASS: approveContract accepted/completed/submitted flow, Parent queue, current-round review, atomic earned Reward, retry/different-key race, bilateral realtime, denied writes and committed notification effect',
  );
}

async function verifyApprovalTransactionsAndTransport() {
  // Separate emulator-only project avoids trigger races with injected transport.
  const require = createRequire(
    new URL('../functions/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const {
    getFirestore,
    Timestamp: AdminTimestamp,
  } = require('firebase-admin/firestore');
  const {
    executeApproveContract,
    contractReviewId,
  } = require('./lib/approveContract.js');
  const {
    dispatchNegotiationNotification,
  } = require('./lib/negotiationNotifications.js');
  const app = initializeApp(
    { projectId: `${process.env.GCLOUD_PROJECT}-approval-fakes` },
    `approval-fakes-${Date.now()}`,
  );
  const db = getFirestore(app);
  try {
    const now = AdminTimestamp.now();
    const contract = {
      familyId: 'family',
      parentUid: 'parent',
      childUid: 'child',
      participantUids: ['parent', 'child'],
      source: { type: 'OFFER', offerId: 'offer', revisionId: 'revision' },
      rewardTerms: { title: 'Frozen cinema', type: 'EXPERIENCE' },
      deadlineAt: now,
      status: 'READY_FOR_REVIEW',
      reviewCycle: 2,
      createdAt: now,
      updatedAt: now,
    };
    await db
      .doc('families/family/members/parent')
      .set({ role: 'PARENT', status: 'ACTIVE' });
    await db
      .doc('families/family/members/child')
      .set({ role: 'CHILD', status: 'ACTIVE' });
    await db
      .doc('families/family/members/other')
      .set({ role: 'PARENT', status: 'ACTIVE' });
    await db.doc('users/child/devices/active').set({
      appVariant: 'CHILD',
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[approval_fake]',
    });
    await db.doc('contracts/contract').set(contract);
    let sends = 0;
    const transport = async (messages) => {
      sends++;
      assert.equal(messages.length, 1);
      assert.equal(messages[0].data.entityId, 'contract');
      return [{ status: 'ok', id: 'approval-ticket' }];
    };
    await dispatchNegotiationNotification(db, 'missing-event', transport);
    assert.equal(sends, 0);
    for (const actor of ['other', 'outside'])
      await assert.rejects(
        executeApproveContract(db, actor, {
          contractId: 'contract',
          idempotencyKey: 'approval-fake-key',
        }),
      );
    assert.equal((await db.collection('activityEvents').get()).empty, true);
    // Inject a commit failure after all writes are staged using a real Firestore transaction.
    await assert.rejects(
      executeApproveContract(
        {
          doc: (p) => db.doc(p),
          runTransaction: (fn) =>
            db.runTransaction(async (tx) => {
              await fn(tx);
              throw new Error('INJECTED_ABORT');
            }),
        },
        'parent',
        { contractId: 'contract', idempotencyKey: 'approval-fake-key' },
      ),
      /INJECTED_ABORT/,
    );
    assert.equal(
      (await db.doc('contracts/contract').get()).data().status,
      'READY_FOR_REVIEW',
    );
    assert.equal((await db.collection('rewards').get()).empty, true);
    assert.equal(
      (await db.collection('contracts/contract/reviews').get()).empty,
      true,
    );
    assert.equal((await db.collection('activityEvents').get()).empty, true);
    const input = {
      contractId: 'contract',
      idempotencyKey: 'approval-fake-key',
    };
    const results = await Promise.all([
      executeApproveContract(db, 'parent', input),
      executeApproveContract(db, 'parent', input),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0].review.cycle, 2);
    assert.equal(results[0].contract.reviewCycle, 2);
    const event = (await db.collection('activityEvents').get()).docs[0];
    await assert.rejects(
      dispatchNegotiationNotification(db, event.id, async () => {
        throw new Error('transport failure');
      }),
      /NOTIFICATION_DELIVERY_RETRY/,
    );
    assert.equal(
      (await db.doc('contracts/contract').get()).data().status,
      'APPROVED',
    );
    assert.equal((await db.collection('rewards').get()).size, 1);
    assert.equal(
      (await db.collection('contracts/contract/reviews').get()).size,
      1,
    );
    await dispatchNegotiationNotification(db, event.id, transport);
    await dispatchNegotiationNotification(db, event.id, transport);
    assert.equal(sends, 1);
    const effect = (
      await event.ref.collection('notificationEffects').doc('expo').get()
    ).data();
    assert.equal(effect.status, 'COMPLETE');
    assert.equal(effect.attempts, 2);
    await db.doc('contracts/blocked').set(contract);
    await db
      .doc(`contracts/blocked/reviews/${contractReviewId('blocked', 2)}`)
      .set({ decision: 'REQUEST_CHANGES', cycle: 2 });
    await assert.rejects(
      executeApproveContract(db, 'parent', {
        contractId: 'blocked',
        idempotencyKey: 'approval-blocked-key',
      }),
      (e) => e.code === 'INVALID_STATE',
    );
    assert.equal(
      (await db.doc('contracts/blocked').get()).data().status,
      'READY_FOR_REVIEW',
    );
    for (const status of [
      'ACTIVE',
      'CHANGES_REQUESTED',
      'APPROVED',
      'CANCELLED',
      'EXPIRED',
    ]) {
      await db.doc('contracts/invalid').set({ ...contract, status });
      await assert.rejects(
        executeApproveContract(db, 'parent', {
          contractId: 'invalid',
          idempotencyKey: 'approval-invalid-key',
        }),
        (e) => e.code === 'INVALID_STATE',
      );
    }
    assert.equal((await db.collection('activityEvents').get()).size, 1);
  } finally {
    await deleteApp(app);
  }
}
