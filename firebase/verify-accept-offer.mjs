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
