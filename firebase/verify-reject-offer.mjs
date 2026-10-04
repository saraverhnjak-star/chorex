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
if (!['chorex-dev', 'chorex-reject-test'].includes(projectId)) {
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
  console.error('FAIL: rejectOffer emulator verification timed out');
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
      tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
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

async function allAdmin(collectionPath) {
  let snapshot;
  await withAdmin(async (firestore) => {
    snapshot = await getDocs(collection(firestore, collectionPath));
  });
  return snapshot;
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: emulatorAddress(emulatorHosts.firestore),
  });

  const parent = await createIdentity('reject-parent');
  const child = await createIdentity('reject-child');
  const sibling = await createIdentity('reject-sibling');
  const otherChild = await createIdentity('reject-other-child');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Rivera Family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  const otherParent = await createIdentity('reject-other-parent');
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
    'reject-main-draft-001',
  );
  await publish(parent, draft, 'reject-main-publish-001');
  const input = {
    offerId: draft.offer.id,
    currentRevisionId: draft.revision.id,
    idempotencyKey: 'reject-offer-001',
  };

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('rejectOffer', input),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'rejectOffer',
      { ...input, childUid: child.localId },
      child.idToken,
    ),
  );
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction('rejectOffer', input, parent.idToken),
  );
  await expectCallableError('FORBIDDEN', () =>
    callFunction('rejectOffer', input, sibling.idToken),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('rejectOffer', input, otherChild.idToken),
  );
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'rejectOffer',
      {
        ...input,
        currentRevisionId: 'revision-that-is-not-current',
        idempotencyKey: 'reject-stale-001',
      },
      child.idToken,
    ),
  );

  const draftState = await createDraft(
    parent,
    familyId,
    child.localId,
    'reject-draft-state-001',
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'rejectOffer',
      {
        offerId: draftState.offer.id,
        currentRevisionId: draftState.revision.id,
        idempotencyKey: 'reject-wrong-state-001',
      },
      child.idToken,
    ),
  );

  const childProposed = await createDraft(
    parent,
    familyId,
    child.localId,
    'reject-child-proposer-draft-001',
  );
  await publish(parent, childProposed, 'reject-child-proposer-publish-001');
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
      'rejectOffer',
      {
        offerId: childProposed.offer.id,
        currentRevisionId: childProposed.revision.id,
        idempotencyKey: 'reject-child-proposer-001',
      },
      child.idToken,
    ),
  );

  const offerPath = `offers/${draft.offer.id}`;
  const revisionPath = `${offerPath}/revisions/${draft.revision.id}`;
  const revisionBefore = (await readAdmin(revisionPath)).data();
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('rejectOffer', input, child.idToken),
    ),
  );
  assert(
    concurrent.every(
      (result) =>
        result.offer.id === draft.offer.id &&
        result.offer.status === 'REJECTED' &&
        result.offer.currentRevisionId === draft.revision.id,
    ),
    'Concurrent retries did not return one rejected Offer',
  );
  assert(
    new Set(concurrent.map((result) => result.offer.updatedAt)).size === 1,
    'Concurrent retries returned different transition timestamps',
  );
  const retried = await callFunction('rejectOffer', input, child.idToken);
  assert(
    JSON.stringify(retried) === JSON.stringify(concurrent[0]),
    'Same-key retry did not return the same rejected Offer',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'rejectOffer',
      { ...input, currentRevisionId: 'changed-revision' },
      child.idToken,
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'rejectOffer',
      { ...input, idempotencyKey: 'reject-again-002' },
      child.idToken,
    ),
  );

  const revisionAfter = (await readAdmin(revisionPath)).data();
  assert(
    JSON.stringify(normalized(revisionAfter)) ===
      JSON.stringify(normalized(revisionBefore)),
    'Rejection mutated the immutable revision',
  );
  const contractsBeforeRace = await allAdmin('contracts');
  assert(
    !contractsBeforeRace.docs.some(
      (item) => item.data().source?.offerId === draft.offer.id,
    ),
    'Rejection created a Contract',
  );
  const rewardsBeforeRace = await allAdmin('rewards');
  assert(rewardsBeforeRace.empty, 'Rejection created a Reward');

  let rejectionEvents;
  await withAdmin(async (firestore) => {
    rejectionEvents = await getDocs(
      query(
        collection(firestore, 'activityEvents'),
        where('type', '==', 'OFFER_REJECTED'),
      ),
    );
  });
  assert(
    rejectionEvents.docs.filter(
      (event) => event.data().entityId === draft.offer.id,
    ).length === 1,
    'Rejection did not create exactly one activity event',
  );

  const raceDraft = await createDraft(
    parent,
    familyId,
    child.localId,
    'reject-race-draft-001',
  );
  await publish(parent, raceDraft, 'reject-race-publish-001');
  const raceBase = {
    offerId: raceDraft.offer.id,
    currentRevisionId: raceDraft.revision.id,
  };
  const raceResults = await Promise.allSettled([
    callFunction(
      'acceptOffer',
      { ...raceBase, idempotencyKey: 'accept-race-001' },
      child.idToken,
    ),
    callFunction(
      'rejectOffer',
      { ...raceBase, idempotencyKey: 'reject-race-001' },
      child.idToken,
    ),
  ]);
  assert(
    raceResults.filter((result) => result.status === 'fulfilled').length === 1,
    'Accept/reject race did not produce exactly one winner',
  );
  const failedRace = raceResults.find((result) => result.status === 'rejected');
  assert(
    failedRace?.reason?.callable?.details?.code === 'INVALID_STATE',
    'Losing accept/reject race did not fail with INVALID_STATE',
  );
  const racedOffer = (await readAdmin(`offers/${raceDraft.offer.id}`)).data();
  assert(
    ['ACCEPTED', 'REJECTED'].includes(racedOffer.status),
    'Race produced a non-terminal Offer state',
  );
  const contractsAfterRace = await allAdmin('contracts');
  const raceContracts = contractsAfterRace.docs.filter(
    (item) => item.data().source?.offerId === raceDraft.offer.id,
  );
  assert(
    (racedOffer.status === 'ACCEPTED' && raceContracts.length === 1) ||
      (racedOffer.status === 'REJECTED' && raceContracts.length === 0),
    'Race created state inconsistent with its terminal outcome',
  );

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
  for (const firestore of [parentFirestore, childFirestore]) {
    await assertSucceeds(getDoc(doc(firestore, offerPath)));
    await assertSucceeds(getDoc(doc(firestore, revisionPath)));
  }
  for (const firestore of [siblingFirestore, otherFirestore]) {
    await assertFails(getDoc(doc(firestore, offerPath)));
    await assertFails(getDoc(doc(firestore, revisionPath)));
  }
  for (const path of [offerPath, revisionPath]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
    await assertFails(setDoc(doc(childFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: rejectOffer authorization, idempotency, accept/reject race, immutable revision, record absence, activity, and rules',
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
