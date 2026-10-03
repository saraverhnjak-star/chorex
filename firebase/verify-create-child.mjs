import { createHash, randomUUID } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
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
  console.error('createChild emulator verification exceeded 60 seconds');
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

function createChildIdempotencyId(actorUid, key) {
  return hash(`createChild:${actorUid}:${key}`);
}

function derivedChildUid(actorUid, familyId, key) {
  return `child_${hash(`createChild:${actorUid}:${familyId}:${key}`)}`;
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

async function lookupAuthUser(localId) {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localId: [localId] }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) {
    throw new Error(`Auth emulator lookup failed: ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body.users)
    ? body.users.find((candidate) => candidate.localId === localId)
    : undefined;
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

async function readCollectionAdmin(path, field, value) {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDocs(
      query(collection(context.firestore(), path), where(field, '==', value)),
    );
  });
  return snapshot;
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  });

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('createChild', {
      familyId: 'missing-family',
      displayName: 'Mia',
      idempotencyKey: 'unauthenticated-001',
    }),
  );

  const parent = await createIdentity('parent');
  const parentFamily = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Rivera Family' },
    parent.idToken,
  );
  const familyId = parentFamily.family.id;

  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'createChild',
      {
        familyId,
        displayName: 'Mia',
        idempotencyKey: 'invalid-fields-001',
        role: 'CHILD',
      },
      parent.idToken,
    ),
  );

  const otherParent = await createIdentity('other-parent');
  await callFunction(
    'createFamily',
    { displayName: 'Jordan', familyName: 'Other Family' },
    otherParent.idToken,
  );
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'createChild',
      {
        familyId,
        displayName: 'Mia',
        idempotencyKey: 'wrong-family-001',
      },
      otherParent.idToken,
    ),
  );

  const nonParent = await createIdentity('non-parent');
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(
        context.firestore(),
        `families/${familyId}/members/${nonParent.localId}`,
      ),
      {
        role: 'CHILD',
        displayName: 'Existing Child',
        status: 'ACTIVE',
        joinedAt: Timestamp.now(),
      },
    );
  });
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction(
      'createChild',
      {
        familyId,
        displayName: 'Mia',
        idempotencyKey: 'wrong-role-001',
      },
      nonParent.idToken,
    ),
  );

  const payload = {
    familyId,
    displayName: 'Mia',
    idempotencyKey: 'create-mia-001',
  };
  const created = await callFunction('createChild', payload, parent.idToken);
  assert(created.profile.accountType === 'CHILD', 'Wrong child account type');
  assert(created.profile.displayName === 'Mia', 'Wrong profile display name');
  assert(created.membership.role === 'CHILD', 'Wrong membership role');
  assert(created.membership.status === 'ACTIVE', 'Wrong membership status');
  assert(created.membership.familyId === familyId, 'Wrong membership Family');
  assert(created.profile.uid === created.membership.uid, 'Child UID mismatch');
  assert(
    created.profile.uid.startsWith('child_'),
    'UID was not server-derived',
  );
  for (const value of [
    created.profile.createdAt,
    created.membership.joinedAt,
  ]) {
    assert(new Date(value).toISOString() === value, 'Non-canonical timestamp');
  }

  const retried = await callFunction('createChild', payload, parent.idToken);
  assert(
    retried.profile.uid === created.profile.uid,
    'Retry changed child UID',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'createChild',
      { ...payload, displayName: 'Changed Name' },
      parent.idToken,
    ),
  );

  const concurrentPayload = {
    familyId,
    displayName: 'Noah',
    idempotencyKey: 'create-noah-concurrent-001',
  };
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('createChild', concurrentPayload, parent.idToken),
    ),
  );
  assert(
    new Set(concurrent.map((result) => result.profile.uid)).size === 1,
    'Concurrent calls created duplicate children',
  );
  const concurrentChildUid = concurrent[0].profile.uid;
  assert(
    (
      await readCollectionAdmin(
        'activityEvents',
        'entityId',
        concurrentChildUid,
      )
    ).size === 1,
    'Concurrent calls created duplicate activities',
  );

  const recoveryPayload = {
    familyId,
    displayName: 'Avery',
    idempotencyKey: 'create-avery-recovery-001',
  };
  const recoveryUid = derivedChildUid(
    parent.localId,
    familyId,
    recoveryPayload.idempotencyKey,
  );
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${recoveryUid}`), {
      blocksFinalTransaction: true,
    });
  });
  await expectCallableError('INTERNAL', () =>
    callFunction('createChild', recoveryPayload, parent.idToken),
  );
  const pendingRecovery = await readAdmin(
    `idempotency/${createChildIdempotencyId(parent.localId, recoveryPayload.idempotencyKey)}`,
  );
  assert(
    pendingRecovery.data()?.status === 'PENDING',
    'Interrupted request did not preserve a pending reservation',
  );
  assert(
    await lookupAuthUser(recoveryUid),
    'Interrupted request did not preserve the deterministic Auth identity',
  );
  await environment.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), `users/${recoveryUid}`));
  });
  const recovered = await callFunction(
    'createChild',
    recoveryPayload,
    parent.idToken,
  );
  assert(
    recovered.profile.uid === recoveryUid,
    'Retry did not finish with the deterministic Auth identity',
  );

  const profile = await readAdmin(`users/${created.profile.uid}`);
  const membership = await readAdmin(
    `families/${familyId}/members/${created.profile.uid}`,
  );
  assert(profile.data()?.accountType === 'CHILD', 'Child profile missing');
  assert(membership.data()?.role === 'CHILD', 'Child membership missing');
  const activities = await readCollectionAdmin(
    'activityEvents',
    'entityId',
    created.profile.uid,
  );
  assert(activities.size === 1, 'Expected one CHILD_CREATED activity');
  assert(
    activities.docs[0].data().type === 'CHILD_CREATED',
    'Wrong activity type',
  );
  const idempotency = await readAdmin(
    `idempotency/${createChildIdempotencyId(parent.localId, payload.idempotencyKey)}`,
  );
  assert(idempotency.data()?.status === 'COMPLETE', 'Idempotency incomplete');

  const childAuthUser = await lookupAuthUser(created.profile.uid);
  assert(childAuthUser, 'Child Auth identity missing');
  assert(!childAuthUser.email, 'Child Auth identity unexpectedly has email');
  assert(
    !Array.isArray(childAuthUser.providerUserInfo) ||
      childAuthUser.providerUserInfo.length === 0,
    'Child Auth identity unexpectedly has a provider',
  );

  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childMembershipsQuery = query(
    collection(parentFirestore, `families/${familyId}/members`),
    where('role', '==', 'CHILD'),
    where('status', '==', 'ACTIVE'),
  );
  const visibleChildren = await assertSucceeds(getDocs(childMembershipsQuery));
  assert(
    visibleChildren.docs.some(
      (snapshot) => snapshot.id === created.profile.uid,
    ),
    'Parent could not list the created child',
  );
  const childFirestore = environment
    .authenticatedContext(nonParent.localId)
    .firestore();
  await assertSucceeds(
    getDocs(collection(childFirestore, `families/${familyId}/members`)),
  );
  await assertSucceeds(
    getDoc(
      doc(childFirestore, `families/${familyId}/members/${parent.localId}`),
    ),
  );
  const otherParentFirestore = environment
    .authenticatedContext(otherParent.localId)
    .firestore();
  await assertFails(
    getDocs(collection(otherParentFirestore, `families/${familyId}/members`)),
  );
  await assertFails(
    getDoc(
      doc(
        otherParentFirestore,
        `families/${familyId}/members/${created.profile.uid}`,
      ),
    ),
  );

  for (const path of [
    `users/${created.profile.uid}`,
    `families/${familyId}/members/${created.profile.uid}`,
    `activityEvents/client-write`,
    `idempotency/client-write`,
  ]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: createChild authorization, idempotency, records, reads, and denied writes',
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
