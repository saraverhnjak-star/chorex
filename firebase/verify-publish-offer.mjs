import { createHash, randomUUID } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT;
const expectedProjectId = 'chorex-dev';
const expectedEndpoints = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
};

if (projectId !== expectedProjectId) {
  throw new Error(`Refusing project ${String(projectId)}`);
}
for (const [name, expected] of Object.entries(expectedEndpoints)) {
  if (process.env[name] !== expected) {
    throw new Error(`Refusing ${name}=${String(process.env[name])}`);
  }
}

const timeout = setTimeout(() => {
  console.error('FAIL: publishOffer emulator verification timed out');
  process.exit(1);
}, 60_000);
const identities = [];
let environment;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function idempotencyId(actorUid, key) {
  return sha256(`publishOffer:${actorUid}:${key}`);
}

async function authRequest(operation, body) {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=emulator-only`,
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
    `http://127.0.0.1:5001/${projectId}/us-central1/${name}`,
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
    if (
      error.callable?.details?.code === code ||
      error.callable?.message === code ||
      error.callable?.status === code
    ) {
      return;
    }
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

async function createDraft(parent, familyId, childUid, key, deadlineAt) {
  return callFunction(
    'createOfferDraft',
    {
      familyId,
      childUid,
      tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
      reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' },
      deadlineAt,
      idempotencyKey: key,
    },
    parent.idToken,
  );
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  });

  const parent = await createIdentity('publish-parent');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Rivera Family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  const child = await createIdentity('publish-child');
  const coParent = await createIdentity('publish-co-parent');
  const otherParent = await createIdentity('publish-other-parent');
  await callFunction(
    'createFamily',
    { displayName: 'Jordan', familyName: 'Other Family' },
    otherParent.idToken,
  );

  await withAdmin(async (firestore) => {
    await setDoc(
      doc(firestore, `families/${familyId}/members/${child.localId}`),
      {
        role: 'CHILD',
        displayName: 'Mia',
        status: 'ACTIVE',
        joinedAt: Timestamp.now(),
      },
    );
    await setDoc(
      doc(firestore, `families/${familyId}/members/${coParent.localId}`),
      {
        role: 'PARENT',
        displayName: 'Taylor',
        status: 'ACTIVE',
        joinedAt: Timestamp.now(),
      },
    );
  });

  const futureDeadline = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString();
  const draft = await createDraft(
    parent,
    familyId,
    child.localId,
    'publish-source-draft-001',
    futureDeadline,
  );
  const input = {
    offerId: draft.offer.id,
    currentRevisionId: draft.revision.id,
    idempotencyKey: 'publish-offer-001',
  };

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('publishOffer', input),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'publishOffer',
      { ...input, parentUid: parent.localId },
      parent.idToken,
    ),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('publishOffer', input, otherParent.idToken),
  );
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction('publishOffer', input, child.idToken),
  );
  await expectCallableError('FORBIDDEN', () =>
    callFunction('publishOffer', input, coParent.idToken),
  );
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'publishOffer',
      {
        ...input,
        currentRevisionId: 'revision-that-is-not-current',
        idempotencyKey: 'publish-stale-revision-001',
      },
      parent.idToken,
    ),
  );

  await withAdmin((firestore) =>
    updateDoc(doc(firestore, `families/${familyId}/members/${child.localId}`), {
      status: 'DISABLED',
    }),
  );
  await expectCallableError('CHILD_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'publishOffer',
      { ...input, idempotencyKey: 'publish-disabled-child-001' },
      parent.idToken,
    ),
  );
  await withAdmin((firestore) =>
    updateDoc(doc(firestore, `families/${familyId}/members/${child.localId}`), {
      status: 'ACTIVE',
    }),
  );

  const expiredDraft = await createDraft(
    parent,
    familyId,
    child.localId,
    'publish-expired-source-001',
    futureDeadline,
  );
  await withAdmin((firestore) =>
    updateDoc(
      doc(
        firestore,
        `offers/${expiredDraft.offer.id}/revisions/${expiredDraft.revision.id}`,
      ),
      { deadlineAt: Timestamp.fromMillis(Date.now() - 1000) },
    ),
  );
  await expectCallableError('DEADLINE_PASSED', () =>
    callFunction(
      'publishOffer',
      {
        offerId: expiredDraft.offer.id,
        currentRevisionId: expiredDraft.revision.id,
        idempotencyKey: 'publish-expired-001',
      },
      parent.idToken,
    ),
  );

  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  const otherParentFirestore = environment
    .authenticatedContext(otherParent.localId)
    .firestore();
  const offerPath = `offers/${draft.offer.id}`;
  const revisionPath = `${offerPath}/revisions/${draft.revision.id}`;
  await assertSucceeds(getDoc(doc(parentFirestore, offerPath)));
  await assertFails(getDoc(doc(childFirestore, offerPath)));
  await assertFails(getDoc(doc(childFirestore, revisionPath)));

  const offerBefore = (await readAdmin(offerPath)).data();
  const revisionBefore = (await readAdmin(revisionPath)).data();
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('publishOffer', input, parent.idToken),
    ),
  );
  assert(
    concurrent.every(
      (result) =>
        result.offer.id === draft.offer.id &&
        result.offer.status === 'AWAITING_CHILD' &&
        result.offer.currentRevisionId === draft.revision.id,
    ),
    'Concurrent calls did not return one published Offer',
  );
  assert(
    new Set(concurrent.map((result) => result.offer.updatedAt)).size === 1,
    'Concurrent calls returned different transition timestamps',
  );

  const retried = await callFunction('publishOffer', input, parent.idToken);
  assert(
    JSON.stringify(retried) === JSON.stringify(concurrent[0]),
    'Identical retry did not return the same published Offer',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'publishOffer',
      { ...input, currentRevisionId: 'changed-revision' },
      parent.idToken,
    ),
  );
  await expectCallableError('INVALID_STATE', () =>
    callFunction(
      'publishOffer',
      { ...input, idempotencyKey: 'publish-again-with-new-key-001' },
      parent.idToken,
    ),
  );

  const offerAfter = (await readAdmin(offerPath)).data();
  const revisionAfter = (await readAdmin(revisionPath)).data();
  assert(offerAfter.status === 'AWAITING_CHILD', 'Offer was not published');
  assert(
    offerAfter.currentRevisionId === draft.revision.id,
    'Publishing changed the current revision',
  );
  assert(
    offerAfter.updatedAt.toMillis() > offerBefore.updatedAt.toMillis(),
    'Publishing did not update the Offer timestamp',
  );
  assert(
    JSON.stringify(normalized(revisionAfter)) ===
      JSON.stringify(normalized(revisionBefore)),
    'Publishing mutated the immutable revision',
  );

  let publishEvents;
  await withAdmin(async (firestore) => {
    publishEvents = await getDocs(
      query(
        collection(firestore, 'activityEvents'),
        where('type', '==', 'OFFER_PUBLISHED'),
      ),
    );
  });
  const matchingEvents = publishEvents.docs.filter(
    (event) => event.data().entityId === draft.offer.id,
  );
  assert(matchingEvents.length === 1, 'Expected one OFFER_PUBLISHED event');
  assert(
    matchingEvents[0].data().revisionId === draft.revision.id,
    'Activity event references the wrong revision',
  );
  const idempotency = await readAdmin(
    `idempotency/${idempotencyId(parent.localId, input.idempotencyKey)}`,
  );
  assert(idempotency.data()?.status === 'COMPLETE', 'Idempotency incomplete');

  await assertSucceeds(getDoc(doc(childFirestore, offerPath)));
  await assertSucceeds(getDoc(doc(childFirestore, revisionPath)));
  await assertFails(getDoc(doc(otherParentFirestore, offerPath)));
  await assertFails(getDoc(doc(otherParentFirestore, revisionPath)));
  await assertFails(
    getDoc(doc(childFirestore, `offers/${expiredDraft.offer.id}`)),
  );

  for (const path of [offerPath, revisionPath]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
    await assertFails(setDoc(doc(childFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: publishOffer authorization, transition, idempotency, immutable revision, activity, and rules',
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
