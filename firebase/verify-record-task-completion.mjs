import { randomUUID } from 'node:crypto';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  onSnapshot,
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT;
if (!['chorex-dev', 'chorex-phase3-test'].includes(projectId)) {
  throw new Error('Emulator guard failed: GCLOUD_PROJECT');
}
const emulatorHosts = {
  firestore: process.env.FIRESTORE_EMULATOR_HOST,
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  functions: process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001',
};
for (const [service, host] of Object.entries(emulatorHosts)) {
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error(`Emulator guard failed: ${service}`);
  }
}

const timeout = setTimeout(() => {
  console.error('FAIL: recordTaskCompletion emulator verification timed out');
  process.exit(1);
}, 90_000);
const identities = [];
let environment;

function emulatorAddress(value) {
  const [host, port] = value.split(':');
  return { host, port: Number(port) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function authRequest(operation, body) {
  const response = await fetch(
    `http://${emulatorHosts.auth}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=emulator-only`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) {
    throw new Error(`Auth emulator ${operation} failed: ${response.status}`);
  }
  return response.json();
}

async function createIdentity(label) {
  const identity = await authRequest('signUp', {
    email: `${label}-${randomUUID()}@example.invalid`,
    password: randomUUID(),
    returnSecureToken: true,
  });
  if (
    typeof identity.localId !== 'string' ||
    typeof identity.idToken !== 'string'
  ) {
    throw new Error('Invalid Auth emulator response');
  }
  identities.push(identity);
  return identity;
}

async function callFunction(name, data, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const response = await fetch(
    `http://${emulatorHosts.functions}/${projectId}/us-central1/${name}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json();
  if (body.error) {
    const error = new Error(body.error.message);
    error.callable = body.error;
    throw error;
  }
  return body.result;
}

async function withAdmin(operation) {
  return environment.withSecurityRulesDisabled((context) =>
    operation(context.firestore()),
  );
}

async function readAdmin(path) {
  let snapshot;
  await withAdmin(async (firestore) => {
    snapshot = await getDoc(doc(firestore, path));
  });
  return snapshot;
}

function normalized(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalized(nested)]),
    );
  }
  return value;
}

async function publish(parent, draft, key) {
  return callFunction(
    'publishOffer',
    {
      offerId: draft.offer.id,
      currentRevisionId: draft.revision.id,
      idempotencyKey: key,
    },
    parent.idToken,
  );
}

const stops = [];
function watch(reference) {
  let latest;
  let error;
  const pending = [];
  stops.push(
    onSnapshot(
      reference,
      { includeMetadataChanges: true },
      (snapshot) => {
        latest = snapshot;
        for (const waiter of [...pending])
          if (waiter.predicate(snapshot)) {
            pending.splice(pending.indexOf(waiter), 1);
            waiter.resolve(snapshot);
          }
      },
      (failure) => {
        error = failure;
        for (const waiter of pending.splice(0)) waiter.reject(failure);
      },
    ),
  );
  return {
    wait(predicate) {
      if (error) return Promise.reject(error);
      if (latest && predicate(latest)) return Promise.resolve(latest);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve: (snapshot) => {
            clearTimeout(timer);
            resolve(snapshot);
          },
          reject: (failure) => {
            clearTimeout(timer);
            reject(failure);
          },
        };
        const timer = setTimeout(() => {
          pending.splice(pending.indexOf(waiter), 1);
          reject(new Error('Realtime Contract read timeout'));
        }, 10000);
        pending.push(waiter);
      });
    },
  };
}

async function expectCode(code, operation) {
  try {
    await operation();
  } catch (error) {
    if (error.callable?.details?.code === code) return;
    throw new Error(
      `Expected ${code}, got ${JSON.stringify(error.callable ?? error.message)}`,
    );
  }
  throw new Error(`Expected ${code}`);
}
async function audit(familyId, contractId, taskId) {
  let result;
  await withAdmin(async (firestore) => {
    const completions = await getDocs(
      collection(
        firestore,
        `contracts/${contractId}/tasks/${taskId}/completions`,
      ),
    );
    const events = await getDocs(
      query(
        collection(firestore, 'activityEvents'),
        where('familyId', '==', familyId),
        where('type', '==', 'TASK_COMPLETED'),
      ),
    );
    result = {
      completions: completions.docs.map((item) => ({
        id: item.id,
        ...normalized(item.data()),
      })),
      events: events.docs
        .filter((item) => item.data().entityId === taskId)
        .map((item) => ({ id: item.id, ...normalized(item.data()) })),
    };
  });
  return result;
}
try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: emulatorAddress(emulatorHosts.firestore),
  });
  const parent = await createIdentity('completion-parent');
  const child = await createIdentity('completion-child');
  const sibling = await createIdentity('completion-sibling');
  const outside = await createIdentity('completion-outside');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Completion family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  await callFunction(
    'createFamily',
    { displayName: 'Other Parent', familyName: 'Other family' },
    outside.idToken,
  );
  await withAdmin(async (firestore) => {
    for (const person of [child, sibling])
      await setDoc(
        doc(firestore, `families/${familyId}/members/${person.localId}`),
        {
          role: 'CHILD',
          displayName: 'Child',
          status: 'ACTIVE',
          joinedAt: Timestamp.now(),
        },
      );
  });
  const draft = await callFunction(
    'createOfferDraft',
    {
      familyId,
      childUid: child.localId,
      tasks: [
        { title: 'One-time chore', targetCount: 1 },
        {
          title: 'Repeated chore',
          description: 'One occurrence at a time',
          targetCount: 100,
        },
        { title: 'Concurrent chore', targetCount: 3 },
      ],
      reward: { title: 'Cinema', type: 'EXPERIENCE' },
      deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      idempotencyKey: 'completion-draft-001',
    },
    parent.idToken,
  );
  await publish(parent, draft, 'completion-publish-001');
  const accepted = await callFunction(
    'acceptOffer',
    {
      offerId: draft.offer.id,
      currentRevisionId: draft.revision.id,
      idempotencyKey: 'completion-accept-001',
    },
    child.idToken,
  );
  const contractId = accepted.contract.id;
  const [single, repeated, concurrentTask] = accepted.tasks;
  const contractBefore = normalized(
    (await readAdmin(`contracts/${contractId}`)).data(),
  );
  const revisionPath = `offers/${draft.offer.id}/revisions/${draft.revision.id}`;
  const revisionBefore = normalized((await readAdmin(revisionPath)).data());
  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  const tasksPath = `contracts/${contractId}/tasks`;
  const parentWatch = watch(collection(parentFirestore, tasksPath));
  const childWatch = watch(collection(childFirestore, tasksPath));
  await Promise.all([
    parentWatch.wait(
      (snapshot) => snapshot.size === 3 && !snapshot.metadata.fromCache,
    ),
    childWatch.wait(
      (snapshot) => snapshot.size === 3 && !snapshot.metadata.fromCache,
    ),
  ]);
  const input = {
    contractId,
    taskId: single.id,
    idempotencyKey: 'completion-single-001',
  };
  for (const [code, token] of [
    ['AUTH_REQUIRED', undefined],
    ['WRONG_ACTOR_ROLE', parent.idToken],
    ['FORBIDDEN', sibling.idToken],
    ['FAMILY_MEMBERSHIP_REQUIRED', outside.idToken],
  ])
    await expectCode(code, () =>
      callFunction('recordTaskCompletion', input, token),
    );
  for (const field of [
    'childUid',
    'assigneeUid',
    'completedCount',
    'targetCount',
    'ordinal',
    'role',
    'familyId',
    'status',
    'note',
  ])
    await expectCode('INVALID_INPUT', () =>
      callFunction(
        'recordTaskCompletion',
        { ...input, [field]: field === 'completedCount' ? 999 : 'untrusted' },
        child.idToken,
      ),
    );
  await expectCode('CONTRACT_NOT_FOUND', () =>
    callFunction(
      'recordTaskCompletion',
      {
        ...input,
        contractId: 'missing-contract',
        idempotencyKey: 'completion-missing-contract',
      },
      child.idToken,
    ),
  );
  await expectCode('TASK_NOT_FOUND', () =>
    callFunction(
      'recordTaskCompletion',
      {
        ...input,
        taskId: 'missing-task',
        idempotencyKey: 'completion-missing-task',
      },
      child.idToken,
    ),
  );
  assert(
    (await audit(familyId, contractId, single.id)).events.length === 0,
    'Failed action created audit event',
  );
  if (process.env.CHOREX_VERIFY_SUBMISSION === '1')
    await expectCode('TASKS_INCOMPLETE', () =>
      callFunction(
        'submitContractForReview',
        { contractId, idempotencyKey: 'submission-before-completions' },
        child.idToken,
      ),
    );
  const [first, duplicate] = await Promise.all([
    callFunction('recordTaskCompletion', input, child.idToken),
    callFunction('recordTaskCompletion', input, child.idToken),
  ]);
  assert(
    JSON.stringify(first) === JSON.stringify(duplicate),
    'Concurrent same-key results differ',
  );
  assert(
    first.task.completedCount === 1 && first.completion.ordinal === 1,
    'Single task did not complete exactly once',
  );
  await Promise.all([
    parentWatch.wait(
      (snapshot) =>
        snapshot.docs.find((item) => item.id === single.id)?.data()
          .completedCount === 1,
    ),
    childWatch.wait(
      (snapshot) =>
        snapshot.docs.find((item) => item.id === single.id)?.data()
          .completedCount === 1,
    ),
  ]);
  const singleAudit = await audit(familyId, contractId, single.id);
  assert(
    singleAudit.completions.length === 1 && singleAudit.events.length === 1,
    'Same key duplicated completion/audit',
  );
  const completion = singleAudit.completions[0];
  assert(
    completion.familyId === familyId &&
      completion.contractId === contractId &&
      completion.taskId === single.id &&
      completion.childUid === child.localId &&
      completion.ordinal === 1 &&
      completion.createdAt === first.completion.createdAt,
    'Completion shape/identity differs',
  );
  const event = singleAudit.events[0];
  assert(
    event.actorUid === child.localId &&
      event.actorType === 'CHILD' &&
      event.type === 'TASK_COMPLETED' &&
      event.entityType === 'TASK' &&
      event.entityId === single.id,
    'Incorrect activity actor/type',
  );
  assert(
    JSON.stringify(event.metadata) ===
      JSON.stringify(
        normalized({
          contractId,
          taskId: single.id,
          completionId: first.completion.id,
          ordinal: 1,
        }),
      ),
    'Activity metadata differs',
  );
  await expectCode('TASK_ALREADY_COMPLETE', () =>
    callFunction(
      'recordTaskCompletion',
      { ...input, idempotencyKey: 'completion-single-again' },
      child.idToken,
    ),
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'recordTaskCompletion',
      { ...input, taskId: repeated.id },
      child.idToken,
    ),
  );
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'recordTaskCompletion',
      { ...input, contractId: 'different-contract' },
      child.idToken,
    ),
  );
  const repeatedInput = {
    contractId,
    taskId: repeated.id,
    idempotencyKey: 'completion-repeat-001',
  };
  const firstRepeated = await callFunction(
    'recordTaskCompletion',
    repeatedInput,
    child.idToken,
  );
  assert(
    firstRepeated.task.completedCount === 1,
    'Repeated task first occurrence failed',
  );
  if (process.env.CHOREX_VERIFY_SUBMISSION === '1')
    await expectCode('TASKS_INCOMPLETE', () =>
      callFunction(
        'submitContractForReview',
        { contractId, idempotencyKey: 'submission-partial-repeated' },
        child.idToken,
      ),
    );
  const repeatedBefore = await audit(familyId, contractId, repeated.id);
  for (let ordinal = 2; ordinal <= 99; ordinal++) {
    const result = await callFunction(
      'recordTaskCompletion',
      { ...repeatedInput, idempotencyKey: `completion-repeat-${ordinal}` },
      child.idToken,
    );
    assert(
      result.task.completedCount === ordinal &&
        result.completion.ordinal === ordinal,
      'Repeated ordinals skipped or duplicated',
    );
  }
  const finalRace = await Promise.allSettled(
    ['a', 'b'].map((key) =>
      callFunction(
        'recordTaskCompletion',
        { ...repeatedInput, idempotencyKey: `completion-final-race-${key}` },
        child.idToken,
      ),
    ),
  );
  assert(
    finalRace.filter((item) => item.status === 'fulfilled').length === 1,
    'Final occurrence race has wrong winner count',
  );
  const loser = finalRace.find((item) => item.status === 'rejected');
  assert(
    loser?.reason.callable?.details?.code === 'TASK_ALREADY_COMPLETE',
    'Final occurrence loser has wrong error',
  );
  const repeatedAudit = await audit(familyId, contractId, repeated.id);
  assert(
    repeatedAudit.completions.length === 100 &&
      repeatedAudit.events.length === 100,
    'Final race duplicated completion or event',
  );
  assert(
    JSON.stringify(
      repeatedAudit.completions
        .map((item) => item.ordinal)
        .sort((a, b) => a - b),
    ) === JSON.stringify(Array.from({ length: 100 }, (_, index) => index + 1)),
    'Completion ordinals not contiguous',
  );
  assert(
    JSON.stringify(
      repeatedAudit.completions.find(
        (item) => item.id === repeatedBefore.completions[0].id,
      ),
    ) === JSON.stringify(repeatedBefore.completions[0]),
    'Prior completion rewritten',
  );
  const repeatedRetry = await callFunction(
    'recordTaskCompletion',
    repeatedInput,
    child.idToken,
  );
  assert(
    JSON.stringify(repeatedRetry) === JSON.stringify(firstRepeated),
    'Retry returned later progress instead of original result',
  );
  assert(
    (await readAdmin(`${tasksPath}/${repeated.id}`)).data().completedCount ===
      100,
    'Counter exceeds or misses target',
  );
  const concurrentResults = await Promise.all(
    ['a', 'b', 'c'].map((key) =>
      callFunction(
        'recordTaskCompletion',
        {
          contractId,
          taskId: concurrentTask.id,
          idempotencyKey: `completion-open-race-${key}`,
        },
        child.idToken,
      ),
    ),
  );
  assert(
    JSON.stringify(
      concurrentResults
        .map((item) => item.completion.ordinal)
        .sort((a, b) => a - b),
    ) === '[1,2,3]',
    'Concurrent increments did not serialize',
  );
  const concurrentAudit = await audit(familyId, contractId, concurrentTask.id);
  assert(
    concurrentAudit.completions.length === 3 &&
      concurrentAudit.events.length === 3,
    'Concurrent increments duplicated event/history',
  );
  await Promise.all([
    parentWatch.wait(
      (snapshot) =>
        snapshot.docs.find((item) => item.id === repeated.id)?.data()
          .completedCount === 100,
    ),
    childWatch.wait(
      (snapshot) =>
        snapshot.docs.find((item) => item.id === repeated.id)?.data()
          .completedCount === 100,
    ),
  ]);
  for (const firestore of [parentFirestore, childFirestore]) {
    await assertFails(
      updateDoc(doc(firestore, `${tasksPath}/${single.id}`), {
        completedCount: 2,
      }),
    );
    await assertFails(
      setDoc(doc(firestore, `${tasksPath}/${single.id}/completions/forged`), {
        childUid: child.localId,
        ordinal: 2,
      }),
    );
    await assertFails(
      updateDoc(
        doc(
          firestore,
          `${tasksPath}/${single.id}/completions/${first.completion.id}`,
        ),
        { ordinal: 99 },
      ),
    );
    await assertFails(
      deleteDoc(
        doc(
          firestore,
          `${tasksPath}/${single.id}/completions/${first.completion.id}`,
        ),
      ),
    );
    await assertFails(
      updateDoc(doc(firestore, `contracts/${contractId}`), {
        status: 'READY_FOR_REVIEW',
      }),
    );
    await assertFails(
      setDoc(doc(firestore, `activityEvents/forged-${randomUUID()}`), {
        familyId,
        type: 'TASK_COMPLETED',
      }),
    );
  }
  const siblingFirestore = environment
    .authenticatedContext(sibling.localId)
    .firestore();
  await assertFails(getDocs(collection(siblingFirestore, tasksPath)));
  // No review/expiry semantics are implemented. Controlled persisted-state fixtures
  // exercise each non-ACTIVE guard while leaving task/completion history intact.
  stops.splice(0).forEach((stop) => stop());
  for (const status of [
    'READY_FOR_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'CANCELLED',
    'EXPIRED',
  ]) {
    await withAdmin((firestore) =>
      updateDoc(doc(firestore, `contracts/${contractId}`), { status }),
    );
    await expectCode('INVALID_STATE', () =>
      callFunction(
        'recordTaskCompletion',
        {
          contractId,
          taskId: repeated.id,
          idempotencyKey: `completion-state-${status}`,
        },
        child.idToken,
      ),
    );
    if (process.env.CHOREX_VERIFY_SUBMISSION === '1')
      await expectCode('INVALID_STATE', () =>
        callFunction(
          'submitContractForReview',
          { contractId, idempotencyKey: `submission-state-${status}` },
          child.idToken,
        ),
      );
    assert(
      JSON.stringify(
        await callFunction('recordTaskCompletion', input, child.idToken),
      ) === JSON.stringify(first),
      'Committed retry changed after Contract state changed',
    );
  }
  await withAdmin((firestore) =>
    updateDoc(doc(firestore, `contracts/${contractId}`), { status: 'ACTIVE' }),
  );
  for (const status of ['INACTIVE', 'DISABLED']) {
    await withAdmin((firestore) =>
      updateDoc(
        doc(firestore, `families/${familyId}/members/${child.localId}`),
        { status },
      ),
    );
    await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
      callFunction('recordTaskCompletion', input, child.idToken),
    );
  }
  await withAdmin((firestore) =>
    deleteDoc(doc(firestore, `families/${familyId}/members/${child.localId}`)),
  );
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('recordTaskCompletion', input, child.idToken),
  );
  assert(
    JSON.stringify(
      normalized((await readAdmin(`contracts/${contractId}`)).data()),
    ) === JSON.stringify(contractBefore),
    'Completion mutated Contract terms/lifecycle',
  );
  assert(
    JSON.stringify(normalized((await readAdmin(revisionPath)).data())) ===
      JSON.stringify(revisionBefore),
    'Completion mutated accepted revision',
  );
  await withAdmin(async (firestore) => {
    assert(
      (await getDocs(collection(firestore, 'rewards'))).empty,
      'Completion created Reward',
    );
    assert(
      (await getDocs(collection(firestore, `contracts/${contractId}/reviews`)))
        .empty,
      'Completion created review',
    );
    const records = await getDocs(
      query(
        collection(firestore, 'idempotency'),
        where('command', '==', 'recordTaskCompletion'),
        where('contractId', '==', contractId),
      ),
    );
    assert(
      records.size === 104 &&
        records.docs.every((item) => item.data().status === 'COMPLETE'),
      'Failed actions created idempotency entries or committed entries incomplete',
    );
    const effects = await getDocs(
      collection(firestore, `activityEvents/${event.id}/notificationEffects`),
    );
    assert(effects.empty, 'Completion created a push notification effect');
  });
  assert(
    (await audit(familyId, contractId, single.id)).events.length === 1,
    'Retries/failures duplicated activity',
  );
  if (process.env.CHOREX_VERIFY_SUBMISSION === '1') {
    const { verifyContractSubmission } =
      await import('./verify-contract-submission.mjs');
    await verifyContractSubmission({
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
      tasks: accepted.tasks,
      audit,
    });
  }
  console.info(
    'PASS: recordTaskCompletion callable authorization, one-time/100x progress, canonical retries, immutable completion audit, final/open concurrency, bilateral realtime, denied client writes, and no review/Reward/push',
  );
} finally {
  stops.forEach((stop) => stop());
  try {
    if (environment) await environment.cleanup();
  } finally {
    for (const identity of identities)
      if (identity.idToken)
        await authRequest('delete', { idToken: identity.idToken });
    clearTimeout(timeout);
  }
}
