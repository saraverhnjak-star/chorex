import assert from 'node:assert/strict';
import { assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where,
} from 'firebase/firestore';

// Extends the existing real acceptance -> completion verification and its safe
// emulator/auth/listener harness; does not duplicate Phase 3 setup.
export async function verifyContractSubmission({
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
}) {
  const memberPath = `families/${familyId}/members/${child.localId}`;
  await withAdmin((db) =>
    setDoc(doc(db, memberPath), {
      role: 'CHILD',
      status: 'ACTIVE',
      displayName: 'Child',
      joinedAt: Timestamp.now(),
    }),
  );
  const input = { contractId, idempotencyKey: 'submission-emulator-001' };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', parent.idToken],
    ['FORBIDDEN', sibling.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ])
    await expectCode(code, () =>
      callFunction('submitContractForReview', input, token),
    );
  for (const status of ['INACTIVE', 'DISABLED']) {
    await withAdmin((db) => updateDoc(doc(db, memberPath), { status }));
    await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
      callFunction('submitContractForReview', input, child.idToken),
    );
  }
  await withAdmin((db) => deleteDoc(doc(db, memberPath)));
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('submitContractForReview', input, child.idToken),
  );
  await withAdmin((db) =>
    setDoc(doc(db, memberPath), {
      role: 'CHILD',
      status: 'ACTIVE',
      displayName: 'Child',
    }),
  );
  await expectCode('INVALID_INPUT', () =>
    callFunction(
      'submitContractForReview',
      { ...input, allTasksComplete: true },
      child.idToken,
    ),
  );
  const path = `contracts/${contractId}`;
  const before = normalized((await readAdmin(path)).data());
  const taskBefore = await Promise.all(
    tasks.map(async (task) => ({
      data: normalized((await readAdmin(`${path}/tasks/${task.id}`)).data()),
      audit: await audit(familyId, contractId, task.id),
    })),
  );
  const dbs = [parent, child].map((person) =>
    environment.authenticatedContext(person.localId).firestore(),
  );
  const listeners = dbs.map((db) => watch(doc(db, path)));
  await Promise.all(
    listeners.map((listener) =>
      listener.wait(
        (snapshot) =>
          snapshot.data()?.status === 'ACTIVE' && !snapshot.metadata.fromCache,
      ),
    ),
  );
  for (const db of dbs) {
    for (const patch of [
      { status: 'READY_FOR_REVIEW' },
      { updatedAt: Timestamp.now() },
    ])
      await assertFails(updateDoc(doc(db, path), patch));
    await assertFails(
      setDoc(doc(db, `${path}/reviews/forged`), {
        decision: 'APPROVE',
        familyId,
      }),
    );
    await assertFails(
      setDoc(doc(db, `rewards/forged-${contractId}`), { familyId, contractId }),
    );
    await assertFails(
      setDoc(doc(db, `activityEvents/forged-${contractId}`), {
        familyId,
        type: 'CONTRACT_SUBMITTED',
      }),
    );
  }
  const results = await Promise.all([
    callFunction('submitContractForReview', input, child.idToken),
    callFunction('submitContractForReview', input, child.idToken),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].contract.status, 'READY_FOR_REVIEW');
  assert.equal(results[0].contract.reviewCycle, 0);
  await Promise.all(
    listeners.map((listener) =>
      listener.wait(
        (snapshot) =>
          snapshot.data()?.status === 'READY_FOR_REVIEW' &&
          !snapshot.metadata.fromCache,
      ),
    ),
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'submitContractForReview',
      { ...input, idempotencyKey: 'submission-after-sent' },
      child.idToken,
    ),
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'submitContractForReview',
      { ...input, contractId: 'other' },
      child.idToken,
    ),
  );
  await expectCode('INVALID_STATE', () =>
    callFunction(
      'recordTaskCompletion',
      {
        contractId,
        taskId: tasks[0].id,
        idempotencyKey: 'completion-after-submission',
      },
      child.idToken,
    ),
  );
  const after = normalized((await readAdmin(path)).data());
  assert.deepEqual(after, {
    ...before,
    status: 'READY_FOR_REVIEW',
    updatedAt: after.updatedAt,
  });
  for (let index = 0; index < tasks.length; index++) {
    assert.deepEqual(
      normalized((await readAdmin(`${path}/tasks/${tasks[index].id}`)).data()),
      taskBefore[index].data,
    );
    assert.deepEqual(
      await audit(familyId, contractId, tasks[index].id),
      taskBefore[index].audit,
    );
  }
  await withAdmin(async (db) => {
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', contractId),
        where('type', '==', 'CONTRACT_SUBMITTED'),
      ),
    );
    assert.equal(events.size, 1);
    assert.equal(events.docs[0].data().actorUid, child.localId);
    assert.equal(events.docs[0].data().actorType, 'CHILD');
    assert.equal(events.docs[0].data().entityType, 'CONTRACT');
    assert.equal((await getDocs(collection(db, `${path}/reviews`))).size, 0);
    assert.equal((await getDocs(collection(db, 'rewards'))).size, 0);
    assert.equal(
      (
        await getDocs(
          collection(
            db,
            `activityEvents/${events.docs[0].id}/notificationEffects`,
          ),
        )
      ).size,
      0,
    );
    const receipts = await getDocs(
      query(
        collection(db, 'idempotency'),
        where('command', '==', 'submitContractForReview'),
        where('contractId', '==', contractId),
      ),
    );
    assert.equal(receipts.size, 1);
    assert.deepEqual(receipts.docs[0].data().result, results[0]);
  });
  // Fresh controlled ACTIVE fixtures cover query/transaction serialization with
  // concurrent writes, without changing the accepted flow's immutable history.
  for (const mode of ['different-keys', 'final-completion']) {
    const raceId = `${contractId}-${mode}`;
    const racePath = `contracts/${raceId}`;
    await withAdmin(async (db) => {
      await setDoc(doc(db, racePath), {
        ...(await readAdmin(path)).data(),
        status: 'ACTIVE',
      });
      await setDoc(doc(db, `${racePath}/tasks/race-task`), {
        ...(await readAdmin(`${path}/tasks/${tasks[0].id}`)).data(),
        contractId: raceId,
        targetCount: 1,
        completedCount: mode === 'final-completion' ? 0 : 1,
      });
    });
    const submit = (key) =>
      callFunction(
        'submitContractForReview',
        { contractId: raceId, idempotencyKey: `submission-${mode}-${key}` },
        child.idToken,
      );
    await expectCode('FORBIDDEN', () =>
      callFunction(
        'submitContractForReview',
        { contractId: raceId, idempotencyKey: 'submission-sibling-race' },
        sibling.idToken,
      ),
    );
    if (mode === 'final-completion')
      await expectCode('TASKS_INCOMPLETE', () => submit('incomplete'));
    const race = await Promise.allSettled([
      submit('a'),
      mode === 'different-keys'
        ? submit('b')
        : callFunction(
            'recordTaskCompletion',
            {
              contractId: raceId,
              taskId: 'race-task',
              idempotencyKey: 'final-completion-submit-race',
            },
            child.idToken,
          ),
    ]);
    if (mode === 'different-keys') {
      assert.equal(
        race.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.equal(
        race.find((result) => result.status === 'rejected').reason.callable
          .details.code,
        'INVALID_STATE',
      );
    } else {
      assert.equal(race[1].status, 'fulfilled');
      if (race[0].status === 'rejected') {
        assert.equal(race[0].reason.callable.details.code, 'TASKS_INCOMPLETE');
        await submit('retry');
      }
      assert.equal(
        (await readAdmin(`${racePath}/tasks/race-task`)).data().completedCount,
        1,
      );
      assert.equal(
        (await audit(familyId, raceId, 'race-task')).completions.length,
        1,
      );
    }
    assert.equal((await readAdmin(racePath)).data().status, 'READY_FOR_REVIEW');
    await withAdmin(async (db) => {
      const events = await getDocs(
        query(
          collection(db, 'activityEvents'),
          where('entityId', '==', raceId),
          where('type', '==', 'CONTRACT_SUBMITTED'),
        ),
      );
      assert.equal(events.size, 1);
    });
  }
  console.info(
    'PASS: submitContractForReview full accepted/completed flow, authorization, strict input, bilateral realtime, immutable terms/counts/history, unchanged cycle, canonical retries, concurrent submissions/final completion, denied direct writes, no Review/Reward/push',
  );
}
