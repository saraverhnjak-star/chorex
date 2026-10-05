import { createHash, randomUUID } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
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
if (!['chorex-dev', 'chorex-accept-test'].includes(projectId)) {
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
  console.error('FAIL: acceptOffer emulator verification timed out');
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function expectedContractId(offerId, revisionId) {
  return `contract_${sha256(`acceptOffer:${offerId}:${revisionId}`)}`;
}

function expectedTaskId(contractId, index) {
  return `task_${sha256(`${contractId}:${index}`)}`;
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

async function expectCallableError(code, operation) {
  try {
    await operation();
  } catch (error) {
    if (error.callable?.details?.code === code) return;
    throw new Error(
      `Expected ${code}, received ${JSON.stringify(error.callable ?? error.message)}`,
    );
  }
  throw new Error(`Expected callable error ${code}`);
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

async function createDraft(parent, familyId, childUid, key) {
  return callFunction(
    'createOfferDraft',
    {
      familyId,
      childUid,
      tasks: [
        {
          title: 'Load the dishwasher',
          description: 'After dinner',
          targetCount: 2,
        },
        { title: 'Take out the trash', targetCount: 1 },
      ],
      reward: {
        title: 'Cinema',
        description: 'Choose a movie',
        type: 'EXPERIENCE',
      },
      deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      idempotencyKey: key,
    },
    parent.idToken,
  );
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

try {
  const firestoreAddress = emulatorAddress(emulatorHosts.firestore);
  environment = await initializeTestEnvironment({
    projectId,
    firestore: firestoreAddress,
  });

  const parent = await createIdentity('accept-parent');
  const child = await createIdentity('accept-child');
  const sibling = await createIdentity('accept-sibling');
  const otherChild = await createIdentity('accept-other-child');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Rivera Family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  const otherParent = await createIdentity('accept-other-parent');
  const otherFamily = await callFunction(
    'createFamily',
    { displayName: 'Jordan', familyName: 'Other Family' },
    otherParent.idToken,
  );

  await withAdmin(async (firestore) => {
    for (const identity of [child, sibling]) {
      await setDoc(
        doc(firestore, `families/${familyId}/members/${identity.localId}`),
        {
          role: 'CHILD',
          displayName: 'Child',
          status: 'ACTIVE',
          joinedAt: Timestamp.now(),
        },
      );
    }
    await setDoc(
      doc(
        firestore,
        `families/${otherFamily.family.id}/members/${otherChild.localId}`,
      ),
      {
        role: 'CHILD',
        displayName: 'Other Child',
        status: 'ACTIVE',
        joinedAt: Timestamp.now(),
      },
    );
  });

  const draft = await createDraft(
    parent,
    familyId,
    child.localId,
    'accept-main-draft-001',
  );
  await publish(parent, draft, 'accept-main-publish-001');
  const input = {
    offerId: draft.offer.id,
    currentRevisionId: draft.revision.id,
    idempotencyKey: 'accept-offer-001',
  };

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('acceptOffer', input),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'acceptOffer',
      { ...input, childUid: child.localId },
      child.idToken,
    ),
  );
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction('acceptOffer', input, parent.idToken),
  );
  await expectCallableError('FORBIDDEN', () =>
    callFunction('acceptOffer', input, sibling.idToken),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('acceptOffer', input, otherChild.idToken),
  );
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'acceptOffer',
      {
        ...input,
        currentRevisionId: 'revision-that-is-not-current',
        idempotencyKey: 'accept-stale-001',
      },
      child.idToken,
    ),
  );

  const draftState = await createDraft(
    parent,
    familyId,
    child.localId,
    'accept-draft-state-001',
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'acceptOffer',
      {
        offerId: draftState.offer.id,
        currentRevisionId: draftState.revision.id,
        idempotencyKey: 'accept-wrong-state-001',
      },
      child.idToken,
    ),
  );

  const expired = await createDraft(
    parent,
    familyId,
    child.localId,
    'accept-expired-draft-001',
  );
  await publish(parent, expired, 'accept-expired-publish-001');
  await withAdmin((firestore) =>
    updateDoc(
      doc(
        firestore,
        `offers/${expired.offer.id}/revisions/${expired.revision.id}`,
      ),
      { deadlineAt: Timestamp.fromMillis(Date.now() - 1000) },
    ),
  );
  await expectCallableError('DEADLINE_PASSED', () =>
    callFunction(
      'acceptOffer',
      {
        offerId: expired.offer.id,
        currentRevisionId: expired.revision.id,
        idempotencyKey: 'accept-expired-001',
      },
      child.idToken,
    ),
  );

  const childProposed = await createDraft(
    parent,
    familyId,
    child.localId,
    'accept-child-proposer-draft-001',
  );
  await publish(parent, childProposed, 'accept-child-proposer-publish-001');
  await withAdmin((firestore) =>
    updateDoc(
      doc(
        firestore,
        `offers/${childProposed.offer.id}/revisions/${childProposed.revision.id}`,
      ),
      { proposedByUid: child.localId, proposedByRole: 'CHILD' },
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'acceptOffer',
      {
        offerId: childProposed.offer.id,
        currentRevisionId: childProposed.revision.id,
        idempotencyKey: 'accept-child-proposer-001',
      },
      child.idToken,
    ),
  );

  // Extend the existing acceptance verification with the opposite actor path.
  const parentDraft = await createDraft(
    parent,
    familyId,
    child.localId,
    'parent-accept-draft',
  );
  await publish(parent, parentDraft, 'parent-accept-publish');
  const counter = await callFunction(
    'counterOffer',
    {
      offerId: parentDraft.offer.id,
      currentRevisionId: parentDraft.revision.id,
      reward: { title: 'Games', type: 'PRIVILEGE' },
      idempotencyKey: 'parent-accept-counter',
    },
    child.idToken,
  );
  const parentInput = {
    offerId: parentDraft.offer.id,
    currentRevisionId: counter.revision.id,
    idempotencyKey: 'parent-accept-main',
  };
  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('acceptOffer', parentInput),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('acceptOffer', parentInput, otherParent.idToken),
  );
  await withAdmin((db) =>
    setDoc(doc(db, `families/${familyId}/members/${otherParent.localId}`), {
      role: 'PARENT',
      status: 'ACTIVE',
    }),
  );
  await expectCallableError('FORBIDDEN', () =>
    callFunction('acceptOffer', parentInput, otherParent.idToken),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction('acceptOffer', parentInput, child.idToken),
  );
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'acceptOffer',
      { ...parentInput, currentRevisionId: parentDraft.revision.id },
      parent.idToken,
    ),
  );
  const counterPath = `offers/${parentDraft.offer.id}/revisions/${counter.revision.id}`;
  const counterBefore = (await readAdmin(counterPath)).data();
  for (const patch of [
    { proposedByRole: 'PARENT' },
    { proposedByUid: sibling.localId },
  ]) {
    await withAdmin((db) => updateDoc(doc(db, counterPath), patch));
    await expectCallableError('INVALID_STATE', () =>
      callFunction('acceptOffer', parentInput, parent.idToken),
    );
    await withAdmin((db) =>
      updateDoc(doc(db, counterPath), {
        proposedByRole: 'CHILD',
        proposedByUid: child.localId,
      }),
    );
  }
  await withAdmin((db) =>
    updateDoc(doc(db, `families/${familyId}/members/${child.localId}`), {
      status: 'DISABLED',
    }),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('acceptOffer', parentInput, parent.idToken),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, `families/${familyId}/members/${child.localId}`), {
      status: 'ACTIVE',
    }),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, counterPath), {
      deadlineAt: Timestamp.fromMillis(Date.now() - 1),
    }),
  );
  await expectCallableError('DEADLINE_PASSED', () =>
    callFunction('acceptOffer', parentInput, parent.idToken),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, counterPath), { deadlineAt: counterBefore.deadlineAt }),
  );
  const parentResults = await Promise.all(
    Array.from({ length: 4 }, () =>
      callFunction('acceptOffer', parentInput, parent.idToken),
    ),
  );
  const parentContractId = expectedContractId(
    parentInput.offerId,
    parentInput.currentRevisionId,
  );
  assert(
    parentResults.every(
      (r) =>
        r.contract.id === parentContractId &&
        r.contract.status === 'ACTIVE' &&
        r.contract.reviewCycle === 0,
    ),
    'Parent concurrent acceptance failed',
  );
  assert(
    JSON.stringify(
      await callFunction('acceptOffer', parentInput, parent.idToken),
    ) === JSON.stringify(parentResults[0]),
    'Parent retry changed result',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'acceptOffer',
      { ...parentInput, currentRevisionId: parentDraft.revision.id },
      parent.idToken,
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'acceptOffer',
      { ...parentInput, idempotencyKey: 'parent-competing' },
      parent.idToken,
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'counterOffer',
      {
        offerId: parentInput.offerId,
        currentRevisionId: parentInput.currentRevisionId,
        reward: { title: 'Other', type: 'CUSTOM' },
        idempotencyKey: 'later-counter',
      },
      child.idToken,
    ),
  );
  const parentContract = (
    await readAdmin(`contracts/${parentContractId}`)
  ).data();
  assert(
    JSON.stringify(normalized(parentContract.rewardTerms)) ===
      JSON.stringify(normalized(counterBefore.reward)),
    'Parent reward snapshot changed',
  );
  assert(
    parentContract.deadlineAt.toMillis() ===
      counterBefore.deadlineAt.toMillis(),
    'Parent deadline snapshot changed',
  );
  assert(
    JSON.stringify(normalized((await readAdmin(counterPath)).data())) ===
      JSON.stringify(normalized(counterBefore)),
    'Parent acceptance mutated revision',
  );
  for (const [index, task] of counterBefore.tasks.entries()) {
    const frozen = (
      await readAdmin(
        `contracts/${parentContractId}/tasks/${expectedTaskId(parentContractId, index)}`,
      )
    ).data();
    assert(
      frozen.title === task.title &&
        frozen.description === task.description &&
        frozen.targetCount === task.targetCount &&
        frozen.completedCount === 0,
      'Parent task snapshot changed',
    );
  }
  await withAdmin(async (db) => {
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', parentInput.offerId),
        where('type', '==', 'OFFER_ACCEPTED'),
      ),
    );
    assert(
      events.size === 1 &&
        events.docs[0].data().actorType === 'PARENT' &&
        events.docs[0].data().actorUid === parent.localId,
      'Parent acceptance actor/event incorrect',
    );
    const allContracts = await getDocs(collection(db, 'contracts'));
    assert(
      allContracts.docs.filter(
        (d) => d.data().source.offerId === parentInput.offerId,
      ).length === 1,
      'Duplicate Parent Contract',
    );
  });

  const raceDraft = await createDraft(
    parent,
    familyId,
    child.localId,
    'parent-race-draft',
  );
  await publish(parent, raceDraft, 'parent-race-publish');
  const raceCounter = await callFunction(
    'counterOffer',
    {
      offerId: raceDraft.offer.id,
      currentRevisionId: raceDraft.revision.id,
      reward: { title: 'Games', type: 'PRIVILEGE' },
      idempotencyKey: 'parent-race-counter',
    },
    child.idToken,
  );
  const raceInput = {
    offerId: raceDraft.offer.id,
    currentRevisionId: raceCounter.revision.id,
  };
  const race = await Promise.allSettled(
    ['race-key-one', 'race-key-two'].map((idempotencyKey) =>
      callFunction(
        'acceptOffer',
        { ...raceInput, idempotencyKey },
        parent.idToken,
      ),
    ),
  );
  assert(
    race.filter((r) => r.status === 'fulfilled').length === 1,
    'Competing acceptance keys did not produce one winner',
  );
  assert(
    race.some(
      (r) =>
        r.status === 'rejected' &&
        r.reason.callable?.details?.code === 'INVALID_STATE',
    ),
    'Competing acceptance did not fail with INVALID_STATE',
  );
  await withAdmin(async (db) => {
    const contracts = await getDocs(collection(db, 'contracts'));
    assert(
      contracts.docs.filter(
        (d) => d.data().source.offerId === raceInput.offerId,
      ).length === 1,
      'Competing keys duplicated Contract',
    );
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', raceInput.offerId),
        where('type', '==', 'OFFER_ACCEPTED'),
      ),
    );
    assert(events.size === 1, 'Competing keys duplicated acceptance event');
  });

  const revisionPath = `offers/${draft.offer.id}/revisions/${draft.revision.id}`;
  const revisionBefore = (await readAdmin(revisionPath)).data();
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('acceptOffer', input, child.idToken),
    ),
  );
  const contractId = expectedContractId(draft.offer.id, draft.revision.id);
  assert(
    concurrent.every(
      (result) =>
        result.offer.status === 'ACCEPTED' &&
        result.contract.id === contractId &&
        result.contract.status === 'ACTIVE' &&
        result.contract.reviewCycle === 0 &&
        result.tasks.length === 2 &&
        result.tasks.every((task) => task.completedCount === 0),
    ),
    'Concurrent calls did not return one initial Contract',
  );
  assert(
    new Set(concurrent.map((result) => result.contract.createdAt)).size === 1,
    'Concurrent calls returned different Contracts',
  );
  const retried = await callFunction('acceptOffer', input, child.idToken);
  assert(
    JSON.stringify(retried) === JSON.stringify(concurrent[0]),
    'Same-key retry did not return the same Contract',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'acceptOffer',
      { ...input, currentRevisionId: 'changed-revision' },
      child.idToken,
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'acceptOffer',
      { ...input, idempotencyKey: 'accept-again-002' },
      child.idToken,
    ),
  );

  const offerPath = `offers/${draft.offer.id}`;
  const contractPath = `contracts/${contractId}`;
  const contract = (await readAdmin(contractPath)).data();
  const revisionAfter = (await readAdmin(revisionPath)).data();
  assert(contract.status === 'ACTIVE', 'Contract is not ACTIVE');
  assert(contract.reviewCycle === 0, 'Contract reviewCycle is not zero');
  assert(
    contract.source.type === 'OFFER' &&
      contract.source.offerId === draft.offer.id &&
      contract.source.revisionId === draft.revision.id,
    'Contract source does not freeze the Offer revision',
  );
  assert(
    JSON.stringify(normalized(contract.rewardTerms)) ===
      JSON.stringify(normalized(revisionBefore.reward)),
    'Contract reward terms were not frozen',
  );
  assert(
    contract.deadlineAt.toMillis() === revisionBefore.deadlineAt.toMillis(),
    'Contract deadline was not frozen',
  );
  assert(
    JSON.stringify(normalized(revisionAfter)) ===
      JSON.stringify(normalized(revisionBefore)),
    'Acceptance mutated the immutable Offer revision',
  );

  for (const [index, sourceTask] of revisionBefore.tasks.entries()) {
    const taskId = expectedTaskId(contractId, index);
    const task = (await readAdmin(`${contractPath}/tasks/${taskId}`)).data();
    assert(task.contractId === contractId, 'Task references wrong Contract');
    assert(task.assigneeUid === child.localId, 'Task has wrong assignee');
    assert(task.title === sourceTask.title, 'Task title was not frozen');
    assert(
      task.description === sourceTask.description,
      'Task description changed',
    );
    assert(task.targetCount === sourceTask.targetCount, 'Task target changed');
    assert(task.completedCount === 0, 'Task did not start at zero');
  }

  let contracts;
  let acceptanceEvents;
  let rewards;
  await withAdmin(async (firestore) => {
    contracts = await getDocs(collection(firestore, 'contracts'));
    acceptanceEvents = await getDocs(
      query(
        collection(firestore, 'activityEvents'),
        where('type', '==', 'OFFER_ACCEPTED'),
      ),
    );
    rewards = await getDocs(collection(firestore, 'rewards'));
  });
  assert(
    contracts.docs.filter((item) => item.id === contractId).length === 1,
    'Acceptance created duplicate Contracts',
  );
  assert(
    acceptanceEvents.docs.filter(
      (event) => event.data().entityId === draft.offer.id,
    ).length === 1,
    'Acceptance did not create exactly one activity event',
  );
  assert(rewards.empty, 'Acceptance created a Reward before approval');

  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  const siblingFirestore = environment
    .authenticatedContext(sibling.localId)
    .firestore();
  const otherFirestore = environment
    .authenticatedContext(otherChild.localId)
    .firestore();
  const firstTaskPath = `${contractPath}/tasks/${expectedTaskId(contractId, 0)}`;
  for (const firestore of [parentFirestore, childFirestore]) {
    await assertSucceeds(getDoc(doc(firestore, contractPath)));
    await assertSucceeds(getDoc(doc(firestore, firstTaskPath)));
    await assertSucceeds(
      getDocs(collection(firestore, `${contractPath}/tasks`)),
    );
  }
  for (const firestore of [siblingFirestore, otherFirestore]) {
    await assertFails(getDoc(doc(firestore, contractPath)));
    await assertFails(getDoc(doc(firestore, firstTaskPath)));
    await assertFails(getDocs(collection(firestore, `${contractPath}/tasks`)));
  }
  for (const path of [offerPath, contractPath, firstTaskPath]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
    await assertFails(setDoc(doc(childFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: acceptOffer authorization, state validation, idempotency, frozen snapshots, deterministic tasks, reward absence, and rules',
  );
} finally {
  try {
    if (environment) await environment.cleanup();
  } finally {
    for (const identity of identities) {
      if (identity.idToken) {
        await authRequest('delete', { idToken: identity.idToken });
      }
    }
    clearTimeout(timeout);
  }
}
