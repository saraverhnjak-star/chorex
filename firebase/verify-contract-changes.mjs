import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  disableNetwork,
  enableNetwork,
} from 'firebase/firestore';

// Uses the existing accepted -> completed -> submitted fixture and Rules/listener harness.
export async function verifyContractChanges(ctx) {
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
  const path = `contracts/${contractId}`,
    memberPath = `families/${familyId}/members/${parent.localId}`;
  const before = normalized((await readAdmin(path)).data());
  const taskBefore = await Promise.all(
    tasks.map(async (task) => ({
      data: normalized((await readAdmin(`${path}/tasks/${task.id}`)).data()),
      history: await audit(familyId, contractId, task.id),
    })),
  );
  const offerBefore = normalized(
    (await readAdmin(`offers/${before.source.offerId}`)).data(),
  );
  const revisionBefore = normalized(
    (
      await readAdmin(
        `offers/${before.source.offerId}/revisions/${before.source.revisionId}`,
      )
    ).data(),
  );
  const parentDb = environment.authenticatedContext(parent.localId).firestore(),
    childDb = environment.authenticatedContext(child.localId).firestore();
  const input = {
    contractId,
    idempotencyKey: 'changes-emulator-001',
    note: '  Please check the result carefully.  ',
  };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', child.idToken],
    ['WRONG_ACTOR_ROLE', sibling.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ])
    await expectCode(code, () =>
      callFunction('requestContractChanges', input, token),
    );
  for (const note of ['', ' \n ', 'x'.repeat(501)])
    await expectCode('INVALID_INPUT', () =>
      callFunction(
        'requestContractChanges',
        { ...input, note },
        parent.idToken,
      ),
    );
  await expectCode('INVALID_INPUT', () =>
    callFunction(
      'requestContractChanges',
      { ...input, cycle: 0 },
      parent.idToken,
    ),
  );
  const member = (await readAdmin(memberPath)).data();
  for (const status of ['DISABLED', 'INACTIVE']) {
    await withAdmin((db) => updateDoc(doc(db, memberPath), { status }));
    await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
      callFunction('requestContractChanges', input, parent.idToken),
    );
  }
  await withAdmin((db) => deleteDoc(doc(db, memberPath)));
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('requestContractChanges', input, parent.idToken),
  );
  await withAdmin((db) => setDoc(doc(db, memberPath), member));
  await withAdmin((db) =>
    setDoc(doc(db, `families/${familyId}/members/${outside.localId}`), {
      role: 'PARENT',
      status: 'ACTIVE',
    }),
  );
  await expectCode('FORBIDDEN', () =>
    callFunction('requestContractChanges', input, outside.idToken),
  );
  await withAdmin((db) =>
    deleteDoc(doc(db, `families/${familyId}/members/${outside.localId}`)),
  );
  for (const db of [parentDb, childDb]) {
    await assertFails(
      updateDoc(doc(db, path), { status: 'CHANGES_REQUESTED' }),
    );
    await assertFails(
      setDoc(doc(db, `${path}/reviews/forged`), {
        familyId,
        contractId,
        cycle: 0,
        decision: 'REQUEST_CHANGES',
        note: 'Forged',
      }),
    );
    await assertFails(
      updateDoc(doc(db, `${path}/tasks/${tasks[0].id}`), { completedCount: 0 }),
    );
    await assertFails(
      setDoc(doc(db, `rewards/forged-${contractId}`), { familyId, contractId }),
    );
    await assertFails(
      setDoc(doc(db, `activityEvents/forged-${contractId}`), {
        familyId,
        type: 'CONTRACT_CHANGES_REQUESTED',
      }),
    );
  }
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
  const reviewQuery = (db) =>
    query(
      collection(db, `${path}/reviews`),
      where('familyId', '==', familyId),
      where('contractId', '==', contractId),
      where('cycle', '==', before.reviewCycle),
      limit(2),
    );
  const feedback = [parentDb, childDb].map((db) => watch(reviewQuery(db)));
  await queue.wait(
    (s) => s.docs.some((d) => d.id === contractId) && !s.metadata.fromCache,
  );
  await Promise.all(
    feedback.map((l) => l.wait((s) => s.empty && !s.metadata.fromCache)),
  );
  const readRecords = async () => {
    let result;
    await withAdmin(async (db) => {
      result = {
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
            where('type', '==', 'CONTRACT_CHANGES_REQUESTED'),
          ),
        ),
      };
    });
    return result;
  };
  assert.equal((await readRecords()).rewards.size, 0);
  const results = await Promise.all([
    callFunction('requestContractChanges', input, parent.idToken),
    callFunction(
      'requestContractChanges',
      { ...input, note: input.note.trim() },
      parent.idToken,
    ),
  ]);
  assert.deepEqual(results[0], results[1]);
  const result = results[0];
  await Promise.all(
    listeners.map((l) =>
      l.wait(
        (s) =>
          s.data()?.status === 'CHANGES_REQUESTED' && !s.metadata.fromCache,
      ),
    ),
  );
  await Promise.all(
    feedback.map((l) =>
      l.wait(
        (s) =>
          s.size === 1 &&
          s.docs[0].data().note === input.note.trim() &&
          !s.metadata.fromCache,
      ),
    ),
  );
  await queue.wait(
    (s) => s.docs.every((d) => d.id !== contractId) && !s.metadata.fromCache,
  );
  assert.equal(result.review.decision, 'REQUEST_CHANGES');
  assert.equal(result.review.cycle, before.reviewCycle);
  assert.equal(result.contract.reviewCycle, before.reviewCycle);
  assert.equal(result.review.reviewerUid, parent.localId);
  assert.equal(result.review.note, input.note.trim());
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'requestContractChanges',
      { ...input, note: 'Different feedback' },
      parent.idToken,
    ),
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'requestContractChanges',
      { ...input, contractId: 'other' },
      parent.idToken,
    ),
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'requestContractChanges',
      { ...input, idempotencyKey: 'changes-later-key' },
      parent.idToken,
    ),
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'approveContract',
      { contractId, idempotencyKey: 'approval-after-changes' },
      parent.idToken,
    ),
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'submitContractForReview',
      { contractId, idempotencyKey: 'resubmission-forbidden' },
      child.idToken,
    ),
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'recordTaskCompletion',
      {
        contractId,
        taskId: tasks[0].id,
        idempotencyKey: 'correction-progress-forbidden',
      },
      child.idToken,
    ),
  );
  const after = normalized((await readAdmin(path)).data());
  assert.deepEqual(after, {
    ...before,
    status: 'CHANGES_REQUESTED',
    updatedAt: after.updatedAt,
  });
  for (let i = 0; i < tasks.length; i++) {
    assert.deepEqual(
      normalized((await readAdmin(`${path}/tasks/${tasks[i].id}`)).data()),
      taskBefore[i].data,
    );
    assert.deepEqual(
      await audit(familyId, contractId, tasks[i].id),
      taskBefore[i].history,
    );
  }
  assert.deepEqual(
    normalized((await readAdmin(`offers/${before.source.offerId}`)).data()),
    offerBefore,
  );
  assert.deepEqual(
    normalized(
      (
        await readAdmin(
          `offers/${before.source.offerId}/revisions/${before.source.revisionId}`,
        )
      ).data(),
    ),
    revisionBefore,
  );
  const records = await readRecords();
  assert.equal(records.reviews.size, 1);
  assert.equal(records.rewards.size, 0);
  assert.equal(records.events.size, 1);
  const reviewPath = `${path}/reviews/${result.review.id}`;
  for (const db of [parentDb, childDb]) {
    assert.equal(
      (await getDoc(doc(db, reviewPath))).data().note,
      input.note.trim(),
    );
    await assertFails(updateDoc(doc(db, reviewPath), { note: 'Edit' }));
    await assertFails(deleteDoc(doc(db, reviewPath)));
    await assertFails(getDocs(collection(db, `${path}/reviews`)));
  }
  for (const uid of [undefined, sibling.localId, outside.localId]) {
    const db = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, reviewPath)));
    await assertFails(getDocs(reviewQuery(db)));
  }
  await withAdmin((db) =>
    updateDoc(doc(db, memberPath), { status: 'DISABLED' }),
  );
  await assertFails(getDoc(doc(parentDb, reviewPath)));
  await withAdmin((db) => setDoc(doc(db, memberPath), member));
  await withAdmin((db) =>
    setDoc(doc(db, `${path}/reviews/old-cycle`), {
      ...result.review,
      cycle: before.reviewCycle + 1,
      createdAt: Timestamp.now(),
    }),
  );
  await assertFails(getDoc(doc(childDb, `${path}/reviews/old-cycle`)));
  await withAdmin((db) => deleteDoc(doc(db, `${path}/reviews/old-cycle`)));
  await disableNetwork(childDb);
  await feedback[1].wait((s) => s.size === 1 && s.metadata.fromCache);
  await enableNetwork(childDb);
  await feedback[1].wait((s) => s.size === 1 && !s.metadata.fromCache);
  const event = records.events.docs[0];
  assert.equal(event.data().actorType, 'PARENT');
  assert.equal(event.data().actorUid, parent.localId);
  assert.equal(JSON.stringify(event.data()).includes(input.note.trim()), false);
  let effect;
  for (let i = 0; i < 100; i++) {
    effect = (
      await readAdmin(`activityEvents/${event.id}/notificationEffects/expo`)
    ).data();
    if (effect?.status === 'COMPLETE') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(effect?.status, 'COMPLETE');
  assert.equal(effect.recipientUid, child.localId);
  assert.deepEqual(effect.data, {
    type: 'CONTRACT_CHANGES_REQUESTED',
    entityType: 'CONTRACT',
    entityId: contractId,
    familyId,
  });
  assert.equal(JSON.stringify(effect).includes(input.note.trim()), false);
  await verifyChangesRacesAndTransport();
  console.info(
    'PASS: requestContractChanges full submitted path, feedback/current-cycle Rules/cache/reconnect, frozen execution/negotiation history, no Reward/remediation, canonical retries, mixed-decision races and committed notification',
  );
}

async function verifyChangesRacesAndTransport() {
  const require = createRequire(
    new URL('../functions/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const { executeApproveContract } = require('./lib/approveContract.js');
  const {
    executeRequestContractChanges,
  } = require('./lib/requestContractChanges.js');
  const {
    dispatchNegotiationNotification,
  } = require('./lib/negotiationNotifications.js');
  const app = initializeApp(
      { projectId: `${process.env.GCLOUD_PROJECT}-changes-fakes` },
      `changes-fakes-${Date.now()}`,
    ),
    db = getFirestore(app);
  try {
    const now = Timestamp.now(),
      base = {
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        participantUids: ['parent', 'child'],
        source: { type: 'OFFER', offerId: 'offer', revisionId: 'revision' },
        rewardTerms: { title: 'Frozen promise', type: 'EXPERIENCE' },
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
    await db.doc('users/child/devices/active').set({
      appVariant: 'CHILD',
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[changes_fake]',
    });
    await db.doc('contracts/contract').set(base);
    const input = {
      contractId: 'contract',
      idempotencyKey: 'changes-fake-key',
      note: 'Private feedback',
    };
    let sends = 0;
    const transport = async (messages) => {
      sends++;
      assert.equal(messages.length, 1);
      assert.equal(JSON.stringify(messages).includes(input.note), false);
      return [{ status: 'ok', id: 'changes-ticket' }];
    };
    await dispatchNegotiationNotification(db, 'absent', transport);
    assert.equal(sends, 0);
    await assert.rejects(
      executeRequestContractChanges(
        {
          doc: (p) => db.doc(p),
          runTransaction: (fn) =>
            db.runTransaction(async (tx) => {
              await fn(tx);
              throw new Error('INJECTED_ABORT');
            }),
        },
        'parent',
        input,
      ),
      /INJECTED_ABORT/,
    );
    assert.equal((await db.collection('activityEvents').get()).empty, true);
    assert.equal(
      (await db.collection('contracts/contract/reviews').get()).empty,
      true,
    );
    assert.equal(
      (await db.doc('contracts/contract').get()).data().status,
      'READY_FOR_REVIEW',
    );
    const result = await executeRequestContractChanges(db, 'parent', input);
    assert.equal(result.review.cycle, 2);
    assert.equal(result.contract.reviewCycle, 2);
    assert.equal((await db.collection('rewards').get()).empty, true);
    const event = (await db.collection('activityEvents').get()).docs[0];
    await assert.rejects(
      dispatchNegotiationNotification(db, event.id, async () => {
        throw new Error('transport failure');
      }),
      /NOTIFICATION_DELIVERY_RETRY/,
    );
    assert.equal(
      (await db.doc('contracts/contract').get()).data().status,
      'CHANGES_REQUESTED',
    );
    assert.equal((await db.collection('rewards').get()).empty, true);
    await dispatchNegotiationNotification(db, event.id, transport);
    await executeRequestContractChanges(db, 'parent', input);
    await dispatchNegotiationNotification(db, event.id, transport);
    assert.equal(sends, 1);
    assert.equal(
      (
        await event.ref.collection('notificationEffects').doc('expo').get()
      ).data().attempts,
      2,
    );
    // Same-command races and mixed review races, with simultaneous and both biased start orders.
    const wins = { APPROVE: 0, REQUEST_CHANGES: 0 };
    for (let i = 0; i < 12; i++) {
      const id = `race-${i}`;
      await db
        .doc(`contracts/${id}`)
        .set({ ...base, reviewCycle: i % 2 === 0 ? 0 : 2 });
      const changesInput = {
        contractId: id,
        idempotencyKey: `changes-race-${i}`,
        note: 'Race feedback',
      };
      const change = () =>
        executeRequestContractChanges(db, 'parent', changesInput);
      const approve = () =>
        executeApproveContract(db, 'parent', {
          contractId: id,
          idempotencyKey: `approve-race-${i}`,
        });
      let results;
      if (i < 3)
        results = await Promise.allSettled([
          change(),
          executeRequestContractChanges(db, 'parent', {
            ...changesInput,
            idempotencyKey: `changes-other-${i}`,
          }),
        ]);
      else if (i < 6) {
        const first = approve();
        await new Promise((r) => setTimeout(r, 50));
        results = await Promise.allSettled([first, change()]);
      } else if (i < 9) {
        const first = change();
        await new Promise((r) => setTimeout(r, 50));
        results = await Promise.allSettled([first, approve()]);
      } else results = await Promise.allSettled([approve(), change()]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        results.find((r) => r.status === 'rejected').reason.code,
        'INVALID_STATE',
      );
      const current = (await db.doc(`contracts/${id}`).get()).data();
      const reviews = await db.collection(`contracts/${id}/reviews`).get();
      const rewards = await db
        .collection('rewards')
        .where('contractId', '==', id)
        .get();
      const events = await db
        .collection('activityEvents')
        .where('entityId', '==', id)
        .get();
      assert.equal(reviews.size, 1);
      assert.equal(events.size, 1);
      assert.equal(current.reviewCycle, i % 2 === 0 ? 0 : 2);
      assert.equal(reviews.docs[0].data().cycle, current.reviewCycle);
      const decision = reviews.docs[0].data().decision;
      wins[decision]++;
      assert.equal(
        current.status,
        decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED',
      );
      assert.equal(rewards.size, decision === 'APPROVE' ? 1 : 0);
    }
    assert(wins.APPROVE > 0 && wins.REQUEST_CHANGES > 0);
    console.info(
      `PASS: 12 Firestore review races; approvals=${wins.APPROVE}, requests=${wins.REQUEST_CHANGES}; one decision/event and matching Reward boundary`,
    );
    for (const status of [
      'ACTIVE',
      'CHANGES_REQUESTED',
      'APPROVED',
      'CANCELLED',
      'EXPIRED',
    ]) {
      await db.doc('contracts/invalid').set({ ...base, status });
      await assert.rejects(
        executeRequestContractChanges(db, 'parent', {
          ...input,
          contractId: 'invalid',
          idempotencyKey: 'changes-invalid-key',
        }),
        (e) => e.code === 'INVALID_STATE',
      );
    }
  } finally {
    await deleteApp(app);
  }
}
