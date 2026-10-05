import { randomUUID } from 'node:crypto';
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
if (!['chorex-dev', 'chorex-counter-test'].includes(projectId)) {
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
  console.error('FAIL: counterOffer emulator verification timed out');
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
  const url = `http://${emulatorHosts.functions}/${projectId}/us-central1/${name}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Callable ${name} returned ${response.status} from ${url}: ${responseText}`,
    );
  }
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

async function allAdmin(collectionPath) {
  let snapshot;
  await withAdmin(async (firestore) => {
    snapshot = await getDocs(collection(firestore, collectionPath));
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
          description: 'Before dinner',
          targetCount: 2,
        },
      ],
      reward: { title: 'Cinema', type: 'EXPERIENCE' },
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
  environment = await initializeTestEnvironment({
    projectId,
    firestore: emulatorAddress(emulatorHosts.firestore),
  });

  const parent = await createIdentity('counter-parent');
  const child = await createIdentity('counter-child');
  const sibling = await createIdentity('counter-sibling');
  const otherChild = await createIdentity('counter-other-child');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Rivera Family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  const otherParent = await createIdentity('counter-other-parent');
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
    'counter-main-draft-001',
  );
  await publish(parent, draft, 'counter-main-publish-001');
  const input = {
    offerId: draft.offer.id,
    currentRevisionId: draft.revision.id,
    reward: {
      title: 'One hour of games',
      description: 'After dinner',
      type: 'PRIVILEGE',
    },
    note: 'This feels fair.',
    idempotencyKey: 'counter-offer-001',
  };

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('counterOffer', input),
  );
  for (const authoritativeField of [
    { tasks: [{ title: 'Different task', targetCount: 1 }] },
    { deadlineAt: new Date(Date.now() + 100_000).toISOString() },
    { proposedByRole: 'CHILD' },
  ]) {
    await expectCallableError('INVALID_INPUT', () =>
      callFunction(
        'counterOffer',
        { ...input, ...authoritativeField },
        child.idToken,
      ),
    );
  }
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction('counterOffer', input, parent.idToken),
  );
  await expectCallableError('FORBIDDEN', () =>
    callFunction('counterOffer', input, sibling.idToken),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('counterOffer', input, otherChild.idToken),
  );
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'counterOffer',
      {
        ...input,
        currentRevisionId: 'revision-that-is-not-current',
        idempotencyKey: 'counter-stale-001',
      },
      child.idToken,
    ),
  );

  const draftState = await createDraft(
    parent,
    familyId,
    child.localId,
    'counter-draft-state-001',
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'counterOffer',
      {
        ...input,
        offerId: draftState.offer.id,
        currentRevisionId: draftState.revision.id,
        idempotencyKey: 'counter-wrong-state-001',
      },
      child.idToken,
    ),
  );

  const childProposed = await createDraft(
    parent,
    familyId,
    child.localId,
    'counter-child-proposer-draft-001',
  );
  await publish(parent, childProposed, 'counter-child-proposer-publish-001');
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
      'counterOffer',
      {
        ...input,
        offerId: childProposed.offer.id,
        currentRevisionId: childProposed.revision.id,
        idempotencyKey: 'counter-child-proposer-001',
      },
      child.idToken,
    ),
  );

  const expired = await createDraft(
    parent,
    familyId,
    child.localId,
    'counter-expired-draft-001',
  );
  await publish(parent, expired, 'counter-expired-publish-001');
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
      'counterOffer',
      {
        ...input,
        offerId: expired.offer.id,
        currentRevisionId: expired.revision.id,
        idempotencyKey: 'counter-expired-001',
      },
      child.idToken,
    ),
  );

  const offerPath = `offers/${draft.offer.id}`;
  const sourceRevisionPath = `${offerPath}/revisions/${draft.revision.id}`;
  const sourceBefore = (await readAdmin(sourceRevisionPath)).data();
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('counterOffer', input, child.idToken),
    ),
  );
  const first = concurrent[0];
  assert(
    concurrent.every(
      (result) => JSON.stringify(result) === JSON.stringify(first),
    ),
    'Concurrent same-key retries did not return one counteroffer',
  );
  assert(
    first.offer.status === 'AWAITING_PARENT' &&
      first.offer.currentRevisionId === first.revision.id,
    'Counteroffer did not become the current AWAITING_PARENT revision',
  );
  assert(
    first.revision.revisionNumber === draft.revision.revisionNumber + 1 &&
      first.revision.proposedByUid === child.localId &&
      first.revision.proposedByRole === 'CHILD',
    'Counteroffer revision author or sequence is incorrect',
  );
  assert(
    JSON.stringify(first.revision.tasks) ===
      JSON.stringify(draft.revision.tasks) &&
      first.revision.deadlineAt === draft.revision.deadlineAt,
    'Counteroffer did not copy tasks and deadline exactly',
  );
  assert(
    JSON.stringify(first.revision.reward) === JSON.stringify(input.reward) &&
      first.revision.note === input.note,
    'Counteroffer did not persist only the supplied reward and note',
  );
  const retried = await callFunction('counterOffer', input, child.idToken);
  assert(
    JSON.stringify(retried) === JSON.stringify(first),
    'Same-key retry did not return the same revision',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'counterOffer',
      {
        ...input,
        reward: { title: 'Different reward', type: 'CUSTOM' },
      },
      child.idToken,
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'counterOffer',
      { ...input, idempotencyKey: 'counter-again-002' },
      child.idToken,
    ),
  );

  const sourceAfter = (await readAdmin(sourceRevisionPath)).data();
  assert(
    JSON.stringify(normalized(sourceAfter)) ===
      JSON.stringify(normalized(sourceBefore)),
    'Counteroffer mutated the source revision',
  );
  const resultRevisionPath = `${offerPath}/revisions/${first.revision.id}`;
  const persistedResult = (await readAdmin(resultRevisionPath)).data();
  assert(
    JSON.stringify(normalized(persistedResult.tasks)) ===
      JSON.stringify(normalized(sourceBefore.tasks)) &&
      normalized(persistedResult.deadlineAt) ===
        normalized(sourceBefore.deadlineAt),
    'Persisted counteroffer changed tasks or deadline',
  );
  assert(
    !(await allAdmin('contracts')).docs.some(
      (item) => item.data().source?.offerId === draft.offer.id,
    ),
    'Counteroffer created a Contract',
  );

  let counterEvents;
  await withAdmin(async (firestore) => {
    counterEvents = await getDocs(
      query(
        collection(firestore, 'activityEvents'),
        where('type', '==', 'OFFER_COUNTERED'),
      ),
    );
  });
  assert(
    counterEvents.docs.filter(
      (event) => event.data().entityId === draft.offer.id,
    ).length === 1,
    'Counteroffer did not create exactly one activity event',
  );

  // Parent continuation uses the same command and immutable sequential history.
  const parentInput = {
    offerId: draft.offer.id,
    currentRevisionId: first.revision.id,
    tasks: [
      { title: 'Set the table', description: 'For everyone', targetCount: 3 },
      { title: 'Water plants', targetCount: 1 },
    ],
    deadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    reward: {
      title: 'Museum trip',
      description: 'On Saturday',
      type: 'EXPERIENCE',
    },
    note: 'How about these terms?',
    idempotencyKey: 'parent-counter-main-001',
  };
  const parentMemberPath = `families/${familyId}/members/${parent.localId}`;
  const childMemberPath = `families/${familyId}/members/${child.localId}`;
  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('counterOffer', parentInput),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('counterOffer', parentInput, otherParent.idToken),
  );
  await withAdmin((db) =>
    setDoc(doc(db, `families/${familyId}/members/${otherParent.localId}`), {
      status: 'ACTIVE',
      role: 'PARENT',
    }),
  );
  await expectCallableError('FORBIDDEN', () =>
    callFunction('counterOffer', parentInput, otherParent.idToken),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, parentMemberPath), { status: 'DISABLED' }),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('counterOffer', parentInput, parent.idToken),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, parentMemberPath), { status: 'ACTIVE', role: 'INVALID' }),
  );
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction('counterOffer', parentInput, parent.idToken),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, parentMemberPath), { role: 'PARENT' }),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, childMemberPath), { status: 'DISABLED' }),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('counterOffer', parentInput, parent.idToken),
  );
  await withAdmin((db) =>
    updateDoc(doc(db, childMemberPath), { status: 'ACTIVE' }),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction('counterOffer', parentInput, child.idToken),
  );
  for (const status of [
    'DRAFT',
    'AWAITING_CHILD',
    'ACCEPTED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ]) {
    await withAdmin((db) => updateDoc(doc(db, offerPath), { status }));
    await expectCallableError('INVALID_STATE', () =>
      callFunction('counterOffer', parentInput, parent.idToken),
    );
  }
  await withAdmin((db) =>
    updateDoc(doc(db, offerPath), { status: 'AWAITING_PARENT' }),
  );
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'counterOffer',
      { ...parentInput, currentRevisionId: draft.revision.id },
      parent.idToken,
    ),
  );
  for (const patch of [
    { proposedByRole: 'PARENT' },
    { proposedByUid: sibling.localId },
  ]) {
    await withAdmin((db) => updateDoc(doc(db, resultRevisionPath), patch));
    await expectCallableError('INVALID_STATE', () =>
      callFunction('counterOffer', parentInput, parent.idToken),
    );
    await withAdmin((db) =>
      updateDoc(doc(db, resultRevisionPath), {
        proposedByRole: 'CHILD',
        proposedByUid: child.localId,
      }),
    );
  }
  for (const invalidTerms of [
    { tasks: [] },
    { tasks: [{ title: 'Invalid', targetCount: 0 }] },
    { deadlineAt: 'bad' },
    { proposedByRole: 'PARENT' },
  ]) {
    await expectCallableError('INVALID_INPUT', () =>
      callFunction(
        'counterOffer',
        { ...parentInput, ...invalidTerms },
        parent.idToken,
      ),
    );
  }
  const { tasks: omittedTasks, ...missingTasks } = parentInput;
  assert(omittedTasks.length > 0, 'Expected task fixture');
  await expectCallableError('INVALID_INPUT', () =>
    callFunction('counterOffer', missingTasks, parent.idToken),
  );
  await expectCallableError('DEADLINE_PASSED', () =>
    callFunction(
      'counterOffer',
      { ...parentInput, deadlineAt: new Date(Date.now() - 1).toISOString() },
      parent.idToken,
    ),
  );
  const parentResults = await Promise.all(
    Array.from({ length: 4 }, () =>
      callFunction('counterOffer', parentInput, parent.idToken),
    ),
  );
  const parentFirst = parentResults[0];
  assert(
    parentResults.every(
      (r) => JSON.stringify(r) === JSON.stringify(parentFirst),
    ),
    'Parent same-key concurrency duplicated revision',
  );
  assert(
    parentFirst.offer.status === 'AWAITING_CHILD' &&
      parentFirst.offer.currentRevisionId === parentFirst.revision.id,
    'Parent proposal did not become current AWAITING_CHILD',
  );
  assert(
    parentFirst.revision.revisionNumber === 3 &&
      parentFirst.revision.proposedByUid === parent.localId &&
      parentFirst.revision.proposedByRole === 'PARENT',
    'Parent revision author or sequence incorrect',
  );
  assert(
    JSON.stringify(parentFirst.revision.tasks) ===
      JSON.stringify(parentInput.tasks) &&
      JSON.stringify(parentFirst.revision.reward) ===
        JSON.stringify(parentInput.reward) &&
      parentFirst.revision.deadlineAt === parentInput.deadlineAt &&
      parentFirst.revision.note === parentInput.note,
    'Parent complete terms snapshot incorrect',
  );
  assert(
    JSON.stringify(
      await callFunction('counterOffer', parentInput, parent.idToken),
    ) === JSON.stringify(parentFirst),
    'Parent retry did not return original proposal',
  );
  for (const changed of [
    { tasks: [{ title: 'Other', targetCount: 1 }] },
    { deadlineAt: new Date(Date.now() + 100000).toISOString() },
    { reward: { title: 'Other', type: 'CUSTOM' } },
  ]) {
    await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
      callFunction(
        'counterOffer',
        { ...parentInput, ...changed },
        parent.idToken,
      ),
    );
  }
  assert(
    JSON.stringify(normalized((await readAdmin(sourceRevisionPath)).data())) ===
      JSON.stringify(normalized(sourceBefore)),
    'Parent mutated revision 1',
  );
  assert(
    JSON.stringify(normalized((await readAdmin(resultRevisionPath)).data())) ===
      JSON.stringify(normalized(persistedResult)),
    'Parent mutated revision 2',
  );
  const parentRevisionPath = `${offerPath}/revisions/${parentFirst.revision.id}`;
  const parentBefore = (await readAdmin(parentRevisionPath)).data();
  const revisionHistory = await allAdmin(`${offerPath}/revisions`);
  assert(
    revisionHistory.size === 3 &&
      revisionHistory.docs
        .map((d) => d.data().revisionNumber)
        .sort()
        .join(',') === '1,2,3',
    'Parent created branching history',
  );
  await withAdmin(async (db) => {
    const events = await getDocs(
      query(
        collection(db, 'activityEvents'),
        where('entityId', '==', draft.offer.id),
        where('type', '==', 'OFFER_COUNTERED'),
      ),
    );
    const parentEvents = events.docs.filter(
      (d) => d.data().actorType === 'PARENT',
    );
    assert(
      parentEvents.length === 1 &&
        parentEvents[0].data().actorUid === parent.localId &&
        parentEvents[0].data().revisionId === parentFirst.revision.id,
      'Parent activity actor incorrect',
    );
    const waiting = await getDocs(
      query(
        collection(db, 'offers'),
        where('parentUid', '==', parent.localId),
        where('status', '==', 'AWAITING_PARENT'),
      ),
    );
    assert(
      !waiting.docs.some((d) => d.id === draft.offer.id),
      'Parent waiting inbox still includes sent offer',
    );
  });
  const childAgain = await callFunction(
    'counterOffer',
    {
      offerId: draft.offer.id,
      currentRevisionId: parentFirst.revision.id,
      reward: { title: 'Games again', type: 'PRIVILEGE' },
      idempotencyKey: 'child-after-parent',
    },
    child.idToken,
  );
  assert(
    childAgain.revision.revisionNumber === 4 &&
      JSON.stringify(childAgain.revision.tasks) ===
        JSON.stringify(parentInput.tasks) &&
      childAgain.revision.deadlineAt === parentInput.deadlineAt,
    'Child path changed after Parent terms proposal',
  );
  assert(
    JSON.stringify(normalized((await readAdmin(parentRevisionPath)).data())) ===
      JSON.stringify(normalized(parentBefore)),
    'Later Child action mutated Parent revision',
  );
  const competing = await Promise.allSettled(
    ['parent-competing-one', 'parent-competing-two'].map((idempotencyKey) =>
      callFunction(
        'counterOffer',
        {
          ...parentInput,
          currentRevisionId: childAgain.revision.id,
          idempotencyKey,
        },
        parent.idToken,
      ),
    ),
  );
  assert(
    competing.filter((r) => r.status === 'fulfilled').length === 1 &&
      competing.some(
        (r) =>
          r.status === 'rejected' &&
          r.reason.callable?.details?.code === 'INVALID_STATE',
      ),
    'Parent competing requests did not serialize',
  );
  const completeHistory = await allAdmin(`${offerPath}/revisions`);
  assert(
    completeHistory.size === 5 &&
      completeHistory.docs
        .map((d) => d.data().revisionNumber)
        .sort()
        .join(',') === '1,2,3,4,5',
    'Competing Parent requests branched history',
  );
  assert(
    !(await allAdmin('contracts')).docs.some(
      (d) => d.data().source?.offerId === draft.offer.id,
    ),
    'Parent counter created Contract',
  );
  assert((await allAdmin('rewards')).empty, 'Counteroffer created Reward');

  const raceDraft = await createDraft(
    parent,
    familyId,
    child.localId,
    'counter-race-draft-001',
  );
  await publish(parent, raceDraft, 'counter-race-publish-001');
  const raceBase = {
    offerId: raceDraft.offer.id,
    currentRevisionId: raceDraft.revision.id,
  };
  const raceResults = await Promise.allSettled([
    callFunction(
      'acceptOffer',
      { ...raceBase, idempotencyKey: 'counter-race-accept-001' },
      child.idToken,
    ),
    callFunction(
      'rejectOffer',
      { ...raceBase, idempotencyKey: 'counter-race-reject-001' },
      child.idToken,
    ),
    callFunction(
      'counterOffer',
      {
        ...raceBase,
        reward: { title: 'Race reward', type: 'CUSTOM' },
        idempotencyKey: 'counter-race-counter-001',
      },
      child.idToken,
    ),
  ]);
  assert(
    raceResults.filter((result) => result.status === 'fulfilled').length === 1,
    'Accept/reject/counter race did not produce exactly one winner',
  );
  assert(
    raceResults
      .filter((result) => result.status === 'rejected')
      .every(
        (result) => result.reason?.callable?.details?.code === 'INVALID_STATE',
      ),
    'Losing race commands did not fail with INVALID_STATE',
  );
  const racedOffer = (await readAdmin(`offers/${raceDraft.offer.id}`)).data();
  assert(
    ['ACCEPTED', 'REJECTED', 'AWAITING_PARENT'].includes(racedOffer.status),
    'Race produced an invalid Offer state',
  );
  const raceContracts = (await allAdmin('contracts')).docs.filter(
    (item) => item.data().source?.offerId === raceDraft.offer.id,
  );
  assert(
    (racedOffer.status === 'ACCEPTED' && raceContracts.length === 1) ||
      (racedOffer.status !== 'ACCEPTED' && raceContracts.length === 0),
    'Race created a Contract inconsistent with its winner',
  );

  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  for (const firestore of [parentFirestore, childFirestore]) {
    await assertSucceeds(getDoc(doc(firestore, offerPath)));
    await assertSucceeds(getDoc(doc(firestore, resultRevisionPath)));
  }
  for (const path of [offerPath, sourceRevisionPath, resultRevisionPath]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
    await assertFails(setDoc(doc(childFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: counterOffer Child reward-only and Parent complete terms, authorization, immutable sequential history, idempotency, concurrency, activity roles, no Contract/Reward, and rules',
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
