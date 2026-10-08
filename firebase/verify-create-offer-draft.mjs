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
  where,
} from 'firebase/firestore';

const projectId = 'chorex-dev';
const required = {
  GCLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
};
for (const [key, value] of Object.entries(required)) {
  if (process.env[key] !== value) {
    throw new Error(`Emulator guard failed: ${key}`);
  }
}

const deadline = setTimeout(() => {
  console.error('createOfferDraft emulator verification exceeded 60 seconds');
  process.exit(1);
}, 60_000);
const identities = [];
let environment;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function idempotencyId(actorUid, key) {
  return hash(`createOfferDraft:${actorUid}:${key}`);
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

async function readAdmin(path) {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDoc(doc(context.firestore(), path));
  });
  return snapshot;
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  });

  const futureDeadline = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString();
  const baseInput = {
    familyId: 'unresolved',
    childUid: 'unresolved',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'plant' },
    deadlineAt: futureDeadline,
    idempotencyKey: 'offer-draft-001',
  };

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('createOfferDraft', baseInput),
  );

  const parent = await createIdentity('offer-parent');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Rivera Family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  const child = await createIdentity('offer-child');
  const inactiveChild = await createIdentity('inactive-child');
  const otherChild = await createIdentity('other-child');
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
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
      doc(firestore, `families/${familyId}/members/${inactiveChild.localId}`),
      {
        role: 'CHILD',
        displayName: 'Inactive Child',
        status: 'DISABLED',
        joinedAt: Timestamp.now(),
      },
    );
  });

  const otherParent = await createIdentity('other-parent');
  const otherFamily = await callFunction(
    'createFamily',
    { displayName: 'Jordan', familyName: 'Other Family' },
    otherParent.idToken,
  );
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(
        context.firestore(),
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

  const input = { ...baseInput, familyId, childUid: child.localId };
  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'createOfferDraft',
      { ...input, parentUid: parent.localId },
      parent.idToken,
    ),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'createOfferDraft',
      { ...input, deadlineAt: '2020-01-01T00:00:00.000Z' },
      parent.idToken,
    ),
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction('createOfferDraft', input, otherParent.idToken),
  );
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction('createOfferDraft', input, child.idToken),
  );
  await expectCallableError('CHILD_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'createOfferDraft',
      { ...input, childUid: otherChild.localId },
      parent.idToken,
    ),
  );
  await expectCallableError('CHILD_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'createOfferDraft',
      { ...input, childUid: inactiveChild.localId },
      parent.idToken,
    ),
  );

  const created = await callFunction('createOfferDraft', input, parent.idToken);
  assert(created.offer.status === 'DRAFT', 'Offer was not a draft');
  assert(
    created.offer.parentUid === parent.localId,
    'Parent UID was not derived',
  );
  assert(created.offer.childUid === child.localId, 'Wrong child UID');
  assert(created.revision.revisionNumber === 1, 'Wrong revision number');
  assert(created.revision.proposedByRole === 'PARENT', 'Wrong proposer role');
  assert(
    created.offer.currentRevisionId === created.revision.id,
    'Current revision mismatch',
  );
  assert(
    new Date(created.revision.deadlineAt).toISOString() === futureDeadline,
    'Deadline did not round-trip as canonical UTC',
  );

  const retried = await callFunction('createOfferDraft', input, parent.idToken);
  assert(retried.offer.id === created.offer.id, 'Retry changed Offer ID');
  assert(
    retried.revision.id === created.revision.id,
    'Retry changed revision ID',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'createOfferDraft',
      {
        ...input,
        tasks: [{ title: 'Changed task', targetCount: 1 }],
      },
      parent.idToken,
    ),
  );

  const concurrentInput = {
    ...input,
    idempotencyKey: 'offer-draft-concurrent-001',
  };
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('createOfferDraft', concurrentInput, parent.idToken),
    ),
  );
  assert(
    new Set(concurrent.map((result) => result.offer.id)).size === 1,
    'Concurrent calls created duplicate Offers',
  );
  assert(
    new Set(concurrent.map((result) => result.revision.id)).size === 1,
    'Concurrent calls created duplicate revisions',
  );

  const offerSnapshot = await readAdmin(`offers/${created.offer.id}`);
  const revisionSnapshot = await readAdmin(
    `offers/${created.offer.id}/revisions/${created.revision.id}`,
  );
  const idempotencySnapshot = await readAdmin(
    `idempotency/${idempotencyId(parent.localId, input.idempotencyKey)}`,
  );
  const offerData = offerSnapshot.data();
  const revisionData = revisionSnapshot.data();
  assert(
    JSON.stringify(Object.keys(offerData).sort()) ===
      JSON.stringify(
        [
          'childUid',
          'createdAt',
          'currentRevisionId',
          'familyId',
          'parentUid',
          'participantUids',
          'status',
          'updatedAt',
        ].sort(),
      ),
    'Unexpected persisted Offer shape',
  );
  assert(
    JSON.stringify(Object.keys(revisionData).sort()) ===
      JSON.stringify(
        [
          'createdAt',
          'deadlineAt',
          'proposedByRole',
          'proposedByUid',
          'revisionNumber',
          'reward',
          'tasks',
        ].sort(),
      ),
    'Unexpected persisted revision shape',
  );
  assert(
    !('description' in revisionData.tasks[0]),
    'Task description was not omitted',
  );
  assert(
    !('description' in revisionData.reward),
    'Reward description was not omitted',
  );
  assert(
    revisionData.deadlineAt instanceof Timestamp,
    'Deadline is not a Timestamp',
  );
  assert(
    idempotencySnapshot.data()?.status === 'COMPLETE',
    'Idempotency incomplete',
  );

  let concurrentMatches;
  await environment.withSecurityRulesDisabled(async (context) => {
    concurrentMatches = await getDocs(
      query(
        collection(context.firestore(), 'offers'),
        where('currentRevisionId', '==', concurrent[0].offer.currentRevisionId),
      ),
    );
  });
  assert(concurrentMatches.size === 1, 'Expected exactly one concurrent draft');

  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  const otherParentFirestore = environment
    .authenticatedContext(otherParent.localId)
    .firestore();
  const offerPath = `offers/${created.offer.id}`;
  const revisionPath = `${offerPath}/revisions/${created.revision.id}`;
  await assertSucceeds(getDoc(doc(parentFirestore, offerPath)));
  await assertSucceeds(getDoc(doc(parentFirestore, revisionPath)));
  await assertFails(getDoc(doc(childFirestore, offerPath)));
  await assertFails(getDoc(doc(childFirestore, revisionPath)));
  await assertFails(getDoc(doc(otherParentFirestore, offerPath)));
  await assertFails(getDoc(doc(otherParentFirestore, revisionPath)));

  for (const path of [
    offerPath,
    revisionPath,
    `idempotency/${idempotencyId(parent.localId, 'client-write')}`,
  ]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
    await assertFails(setDoc(doc(childFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: createOfferDraft validation, authorization, idempotency, shapes, and draft security',
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
    clearTimeout(deadline);
  }
}
