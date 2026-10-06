import assert from 'node:assert/strict';
import { assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  disableNetwork,
  enableNetwork,
} from 'firebase/firestore';

// Extends real accepted/completed/submitted -> REQUEST_CHANGES -> resubmitted round 1.
export async function verifyContractReviewHistory(ctx) {
  const {
    environment,
    withAdmin,
    readAdmin,
    callFunction,
    watch,
    normalized,
    parent,
    child,
    sibling,
    outside,
    familyId,
    contractId,
  } = ctx;
  const path = `contracts/${contractId}`;
  const historyQuery = (db) =>
    query(
      collection(db, `${path}/reviews`),
      where('familyId', '==', familyId),
      where('contractId', '==', contractId),
      orderBy('cycle', 'asc'),
    );
  const parentDb = environment.authenticatedContext(parent.localId).firestore(),
    childDb = environment.authenticatedContext(child.localId).firestore();
  const histories = [parentDb, childDb].map((db) => watch(historyQuery(db)));
  const read = async (db) =>
    normalized(
      (await getDocs(historyQuery(db))).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
    );
  const initial = await read(childDb);
  assert.equal(initial.length, 1);
  assert.equal(initial[0].cycle, 0);
  assert.equal(initial[0].decision, 'REQUEST_CHANGES');
  const noteA = initial[0].note,
    noteB = 'Please check the finished agreement together once more.';
  assert.ok(noteA);
  assert.notEqual(noteA, noteB);
  assert.equal((await readAdmin(path)).data().reviewCycle, 1);
  // Submission/resubmission created no review for the newly opened round.
  for (const h of histories)
    await h.wait((s) => s.size === 1 && !s.metadata.fromCache);
  await callFunction(
    'requestContractChanges',
    { contractId, idempotencyKey: 'history-second-request', note: noteB },
    parent.idToken,
  );
  for (const h of histories)
    await h.wait((s) => s.size === 2 && !s.metadata.fromCache);
  const requested = await read(childDb);
  assert.deepEqual(
    requested.map((r) => [r.cycle, r.decision, r.note]),
    [
      [0, 'REQUEST_CHANGES', noteA],
      [1, 'REQUEST_CHANGES', noteB],
    ],
  );
  const resubmitted = await callFunction(
    'submitContractForReview',
    { contractId, idempotencyKey: 'history-second-resubmit' },
    child.idToken,
  );
  assert.equal(resubmitted.contract.reviewCycle, 2);
  assert.deepEqual(await read(childDb), requested);
  const approved = await callFunction(
    'approveContract',
    { contractId, idempotencyKey: 'history-final-approval' },
    parent.idToken,
  );
  assert.equal(approved.review.cycle, 2);
  assert.equal(approved.reward.status, 'PENDING_FULFILLMENT');
  for (const h of histories)
    await h.wait((s) => s.size === 3 && !s.metadata.fromCache);
  const expected = await read(childDb);
  assert.deepEqual(
    expected.map((r) => [r.cycle, r.decision, r.note]),
    [
      [0, 'REQUEST_CHANGES', noteA],
      [1, 'REQUEST_CHANGES', noteB],
      [2, 'APPROVE', undefined],
    ],
  );
  assert.deepEqual(expected.slice(0, 2), requested);
  for (const db of [parentDb, childDb]) {
    assert.deepEqual(await read(db), expected);
    for (const review of expected) {
      assert.equal(
        (await getDoc(doc(db, `${path}/reviews/${review.id}`))).data().cycle,
        review.cycle,
      );
      await assertFails(
        updateDoc(doc(db, `${path}/reviews/${review.id}`), {
          note: 'Attempted edit',
        }),
      );
      await assertFails(deleteDoc(doc(db, `${path}/reviews/${review.id}`)));
    }
    await assertFails(
      setDoc(doc(db, `${path}/reviews/client-created`), {
        familyId,
        contractId,
        cycle: 3,
        reviewerUid: parent.localId,
        decision: 'APPROVE',
      }),
    );
    await assertFails(getDocs(collection(db, `${path}/reviews`)));
    await assertFails(
      getDocs(
        query(
          collection(db, `${path}/reviews`),
          where('familyId', '==', 'unrelated'),
          where('contractId', '==', contractId),
          orderBy('cycle', 'asc'),
        ),
      ),
    );
  }
  for (const uid of [
    undefined,
    sibling.localId,
    outside.localId,
    'history-non-member',
  ]) {
    const db = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `${path}/reviews/${expected[0].id}`)));
    await assertFails(getDocs(historyQuery(db)));
  }
  // Fresh read contexts avoid retaining an error on the continuing happy-path listeners.
  for (const actor of [parent, child]) {
    const memberPath = `families/${familyId}/members/${actor.localId}`,
      member = (await readAdmin(memberPath)).data();
    for (const status of ['INACTIVE', 'DISABLED']) {
      await withAdmin((db) => updateDoc(doc(db, memberPath), { status }));
      const db = environment.authenticatedContext(actor.localId).firestore();
      await assertFails(getDocs(historyQuery(db)));
      await assertFails(getDoc(doc(db, `${path}/reviews/${expected[0].id}`)));
    }
    await withAdmin((db) => deleteDoc(doc(db, memberPath)));
    await assertFails(
      getDocs(
        historyQuery(
          environment.authenticatedContext(actor.localId).firestore(),
        ),
      ),
    );
    await withAdmin((db) => setDoc(doc(db, memberPath), member));
  }
  const { verifyRewardFulfillment } =
    await import('./verify-reward-fulfillment.mjs');
  await verifyRewardFulfillment(ctx);
  // Full history survives final approval and delivery; reads have no domain-write effects.
  const capture = async () => {
    const values = { contract: normalized((await readAdmin(path)).data()) };
    await withAdmin(async (db) => {
      for (const [name, q] of [
        ['reviews', collection(db, `${path}/reviews`)],
        ['tasks', collection(db, `${path}/tasks`)],
        [
          'rewards',
          query(
            collection(db, 'rewards'),
            where('contractId', '==', contractId),
          ),
        ],
        [
          'events',
          query(
            collection(db, 'activityEvents'),
            where('familyId', '==', familyId),
          ),
        ],
      ])
        values[name] = normalized(
          (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })),
        );
    });
    values.completions = await Promise.all(
      ctx.tasks.map((task) => ctx.audit(familyId, contractId, task.id)),
    );
    return values;
  };
  const before = await capture();
  assert.equal(before.contract.status, 'APPROVED');
  assert.equal(before.rewards[0].status, 'FULFILLED');
  const cached = watch(historyQuery(childDb));
  await cached.wait((s) => s.size === 3 && !s.metadata.fromCache);
  await disableNetwork(childDb);
  await cached.wait((s) => s.size === 3 && s.metadata.fromCache);
  assert.deepEqual(await read(childDb), expected);
  await enableNetwork(childDb);
  await cached.wait((s) => s.size === 3 && !s.metadata.fromCache);
  assert.deepEqual(await read(parentDb), expected);
  assert.deepEqual(await read(childDb), expected);
  assert.deepEqual(await capture(), before);
  console.info(
    'PASS: three immutable review rounds (0 REQUEST_CHANGES A, 1 REQUEST_CHANGES B, 2 APPROVE), bilateral realtime/history after fulfillment, no reviews on resubmission, scoped participant Rules/write denial, cached reads/reconnect and zero domain mutation from viewing',
  );
}
