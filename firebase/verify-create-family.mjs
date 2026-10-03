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
  console.error('createFamily emulator verification exceeded 60 seconds');
  process.exit(1);
}, 60_000);
const identities = [];
let environment;

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

async function callCreateFamily(data, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const response = await fetch(
    `http://127.0.0.1:5001/${projectId}/us-central1/createFamily`,
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function idempotencyId(uid) {
  return createHash('sha256').update(`createFamily:${uid}`).digest('hex');
}

async function readAdmin(path) {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDoc(doc(context.firestore(), path));
  });
  return snapshot;
}

async function countAdmin(collectionPath, field, value) {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDocs(
      query(
        collection(context.firestore(), collectionPath),
        where(field, '==', value),
      ),
    );
  });
  return snapshot.size;
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  });

  await expectCallableError('AUTH_REQUIRED', () =>
    callCreateFamily({ displayName: 'Alex', familyName: 'Rivera Family' }),
  );

  const invalidIdentity = await createIdentity('invalid');
  await expectCallableError('INVALID_INPUT', () =>
    callCreateFamily(
      {
        displayName: 'Alex',
        familyName: 'Rivera Family',
        role: 'PARENT',
      },
      invalidIdentity.idToken,
    ),
  );

  const childIdentity = await createIdentity('child');
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${childIdentity.localId}`), {
      displayName: 'Mia',
      accountType: 'CHILD',
      createdAt: Timestamp.fromDate(new Date('2026-10-03T12:34:56.789Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-10-03T12:34:56.789Z')),
    });
  });
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callCreateFamily(
      { displayName: 'Mia', familyName: 'Rivera Family' },
      childIdentity.idToken,
    ),
  );

  const parentIdentity = await createIdentity('parent');
  const payload = { displayName: 'Alex', familyName: 'Rivera Family' };
  const created = await callCreateFamily(payload, parentIdentity.idToken);
  assert(created.profile.uid === parentIdentity.localId, 'Wrong profile UID');
  assert(created.profile.accountType === 'PARENT', 'Wrong profile role');
  assert(created.family.createdBy === parentIdentity.localId, 'Wrong owner');
  assert(created.membership.role === 'PARENT', 'Wrong membership role');
  assert(created.membership.status === 'ACTIVE', 'Wrong membership status');
  for (const value of [
    created.profile.createdAt,
    created.family.createdAt,
    created.family.updatedAt,
    created.membership.joinedAt,
  ]) {
    assert(new Date(value).toISOString() === value, 'Non-canonical timestamp');
  }

  const retried = await callCreateFamily(payload, parentIdentity.idToken);
  assert(retried.family.id === created.family.id, 'Retry changed family ID');
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callCreateFamily(
      { displayName: 'Alex', familyName: 'Changed Family' },
      parentIdentity.idToken,
    ),
  );

  assert(
    (await readAdmin(`users/${parentIdentity.localId}`)).exists(),
    'Parent profile missing',
  );
  assert(
    (await readAdmin(`families/${created.family.id}`)).exists(),
    'Family missing',
  );
  assert(
    (
      await readAdmin(
        `families/${created.family.id}/members/${parentIdentity.localId}`,
      )
    ).exists(),
    'Parent membership missing',
  );
  assert(
    (await countAdmin('activityEvents', 'familyId', created.family.id)) === 1,
    'Expected one FAMILY_CREATED activity event',
  );
  assert(
    (
      await readAdmin(`idempotency/${idempotencyId(parentIdentity.localId)}`)
    ).exists(),
    'Idempotency record missing',
  );

  const concurrentIdentity = await createIdentity('concurrent');
  const concurrentResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      callCreateFamily(
        { displayName: 'Sam', familyName: 'Concurrent Family' },
        concurrentIdentity.idToken,
      ),
    ),
  );
  const concurrentFamilyIds = new Set(
    concurrentResults.map((result) => result.family.id),
  );
  assert(concurrentFamilyIds.size === 1, 'Concurrent calls created duplicates');
  assert(
    (await countAdmin('families', 'createdBy', concurrentIdentity.localId)) ===
      1,
    'Expected one concurrent Family document',
  );
  assert(
    (await countAdmin(
      'activityEvents',
      'actorUid',
      concurrentIdentity.localId,
    )) === 1,
    'Expected one concurrent activity event',
  );
  assert(
    (await countAdmin('idempotency', 'uid', concurrentIdentity.localId)) === 1,
    'Expected one concurrent idempotency record',
  );

  const parentContext = environment.authenticatedContext(
    parentIdentity.localId,
  );
  const parentFirestore = parentContext.firestore();
  await assertSucceeds(
    getDoc(doc(parentFirestore, `users/${parentIdentity.localId}`)),
  );
  await assertFails(
    getDoc(doc(parentFirestore, `users/${childIdentity.localId}`)),
  );
  for (const path of [
    `families/${created.family.id}`,
    `families/${created.family.id}/members/${parentIdentity.localId}`,
    `idempotency/${idempotencyId(parentIdentity.localId)}`,
  ]) {
    await assertFails(getDoc(doc(parentFirestore, path)));
  }
  await assertFails(getDocs(collection(parentFirestore, 'activityEvents')));
  await assertFails(getDocs(collection(parentFirestore, 'users')));
  for (const path of [
    `users/${parentIdentity.localId}`,
    `families/${created.family.id}`,
    `families/${created.family.id}/members/${parentIdentity.localId}`,
    `activityEvents/client-write`,
    `idempotency/client-write`,
  ]) {
    await assertFails(setDoc(doc(parentFirestore, path), { denied: true }));
  }

  console.info(
    'PASS: createFamily callable, idempotency, persistence, and client rules',
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
