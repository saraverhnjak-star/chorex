import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  assertFails,
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
  console.error('createPairingSession verification exceeded 60 seconds');
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
  return sha256(`createPairingSession:${actorUid}:${key}`);
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
    if (error.callable?.details?.code === code) return;
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

async function queryAdmin(path, field, value) {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDocs(
      query(collection(context.firestore(), path), where(field, '==', value)),
    );
  });
  return snapshot;
}

async function readLocalLogs() {
  return new Promise((resolve, reject) => {
    const entries = [];
    const socket = new WebSocket('ws://127.0.0.1:4500');
    const timer = setTimeout(() => {
      socket.close();
      resolve(entries);
    }, 250);
    socket.onmessage = (event) => entries.push(JSON.parse(event.data));
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Unable to read local emulator logs'));
    };
  });
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  });

  await expectCallableError('AUTH_REQUIRED', () =>
    callFunction('createPairingSession', {
      familyId: 'missing-family',
      childUid: 'missing-child',
      idempotencyKey: 'unauthenticated-pairing-001',
    }),
  );

  const parent = await createIdentity('pairing-parent');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Pairing Family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  const child = await callFunction(
    'createChild',
    {
      familyId,
      displayName: 'Mia',
      idempotencyKey: 'pairing-child-identity-001',
    },
    parent.idToken,
  );
  const childUid = child.profile.uid;

  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'createPairingSession',
      {
        familyId,
        childUid,
        idempotencyKey: 'invalid-pairing-input-001',
        token: 'client-controlled',
      },
      parent.idToken,
    ),
  );

  const otherParent = await createIdentity('other-pairing-parent');
  const otherFamily = await callFunction(
    'createFamily',
    { displayName: 'Jordan', familyName: 'Other Pairing Family' },
    otherParent.idToken,
  );
  const otherChild = await callFunction(
    'createChild',
    {
      familyId: otherFamily.family.id,
      displayName: 'Noah',
      idempotencyKey: 'other-pairing-child-001',
    },
    otherParent.idToken,
  );

  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'createPairingSession',
      {
        familyId,
        childUid,
        idempotencyKey: 'wrong-family-actor-001',
      },
      otherParent.idToken,
    ),
  );
  await expectCallableError('CHILD_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'createPairingSession',
      {
        familyId,
        childUid: otherChild.profile.uid,
        idempotencyKey: 'wrong-family-child-001',
      },
      parent.idToken,
    ),
  );
  await expectCallableError('CHILD_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'createPairingSession',
      {
        familyId,
        childUid: parent.localId,
        idempotencyKey: 'parent-is-not-child-001',
      },
      parent.idToken,
    ),
  );

  const nonParent = await createIdentity('pairing-non-parent');
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
      'createPairingSession',
      {
        familyId,
        childUid,
        idempotencyKey: 'wrong-actor-role-001',
      },
      nonParent.idToken,
    ),
  );

  const payload = {
    familyId,
    childUid,
    idempotencyKey: 'pairing-session-001',
  };
  const created = await callFunction(
    'createPairingSession',
    payload,
    parent.idToken,
  );
  assert(typeof created.sessionId === 'string', 'Missing pairing session ID');
  assert(
    typeof created.token === 'string' &&
      /^[A-Za-z0-9_-]{22}$/.test(created.token),
    'Pairing token is not 128-bit base64url',
  );
  assert(
    Buffer.from(created.token, 'base64url').length === 16,
    'Pairing token is not 128 bits',
  );

  const session = await readAdmin(`pairingSessions/${created.sessionId}`);
  const sessionData = session.data();
  assert(session.exists(), 'Pairing session missing');
  assert(sessionData?.familyId === familyId, 'Wrong pairing Family');
  assert(sessionData?.childUid === childUid, 'Wrong paired Child');
  assert(sessionData?.createdBy === parent.localId, 'Wrong session creator');
  assert(sessionData?.attemptCount === 0, 'Wrong initial attempt count');
  assert(sessionData?.status === 'ACTIVE', 'Session is not active');
  assert(
    sessionData?.tokenHash === sha256(created.token),
    'Stored token hash does not match plaintext',
  );
  assert(!('token' in sessionData), 'Plaintext token persisted in session');
  assert(sessionData?.createdAt instanceof Timestamp, 'Missing createdAt');
  assert(sessionData?.expiresAt instanceof Timestamp, 'Missing expiresAt');
  assert(
    sessionData.expiresAt.toMillis() - sessionData.createdAt.toMillis() ===
      600_000,
    'Pairing session TTL is not exactly 10 minutes',
  );
  assert(
    sessionData.expiresAt.toDate().toISOString() === created.expiresAt,
    'Output expiry does not match persisted expiry',
  );

  const replayed = await callFunction(
    'createPairingSession',
    payload,
    parent.idToken,
  );
  assert(replayed.sessionId === created.sessionId, 'Replay changed session ID');
  assert(replayed.expiresAt === created.expiresAt, 'Replay changed expiry');
  assert(!('token' in replayed), 'Replay returned the plaintext token');
  assert(
    (await queryAdmin('pairingSessions', 'childUid', childUid)).size === 1,
    'Replay created a duplicate pairing session',
  );
  await expectCallableError('IDEMPOTENCY_CONFLICT', () =>
    callFunction(
      'createPairingSession',
      { ...payload, childUid: otherChild.profile.uid },
      parent.idToken,
    ),
  );

  const replacement = await callFunction(
    'createPairingSession',
    {
      familyId,
      childUid,
      idempotencyKey: 'pairing-session-replacement-001',
    },
    parent.idToken,
  );
  assert(replacement.token !== created.token, 'Replacement reused token');
  const replacedSession = await readAdmin(
    `pairingSessions/${created.sessionId}`,
  );
  assert(
    replacedSession.data()?.status === 'INVALIDATED',
    'Previous active session was not invalidated',
  );
  assert(
    replacedSession.data()?.invalidatedBySessionId === replacement.sessionId,
    'Replacement invalidation link is missing',
  );
  assert(
    (await readAdmin(`pairingSessions/${replacement.sessionId}`)).data()
      ?.status === 'ACTIVE',
    'Replacement session is not active',
  );
  const replayAfterReplacement = await callFunction(
    'createPairingSession',
    payload,
    parent.idToken,
  );
  assert(
    replayAfterReplacement.sessionId === created.sessionId &&
      replayAfterReplacement.expiresAt === created.expiresAt &&
      !('token' in replayAfterReplacement),
    'Replay changed after the original session was replaced',
  );

  const concurrentPayload = {
    familyId,
    childUid,
    idempotencyKey: 'pairing-session-concurrent-001',
  };
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      callFunction('createPairingSession', concurrentPayload, parent.idToken),
    ),
  );
  assert(
    new Set(concurrent.map((result) => result.sessionId)).size === 1,
    'Concurrent retries returned different session IDs',
  );
  assert(
    new Set(concurrent.map((result) => result.expiresAt)).size === 1,
    'Concurrent retries returned different expiries',
  );
  const concurrentTokens = concurrent
    .map((result) => result.token)
    .filter((token) => typeof token === 'string');
  assert(
    concurrentTokens.length === 1,
    'Concurrent retries did not return plaintext exactly once',
  );

  const idempotency = await readAdmin(
    `idempotency/${idempotencyId(parent.localId, payload.idempotencyKey)}`,
  );
  const activities = await queryAdmin(
    'activityEvents',
    'entityId',
    created.sessionId,
  );
  assert(activities.size === 1, 'Expected one pairing activity event');
  for (const serialized of [
    JSON.stringify(sessionData),
    JSON.stringify(idempotency.data()),
    JSON.stringify(activities.docs[0].data()),
  ]) {
    assert(
      !serialized.includes(created.token),
      'Plaintext pairing token persisted in Firestore',
    );
  }
  const logs = JSON.stringify(await readLocalLogs());
  for (const token of [created.token, replacement.token, ...concurrentTokens]) {
    assert(
      !logs.includes(token),
      'Plaintext pairing token appeared in emulator logs',
    );
  }

  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  await assertFails(
    getDoc(doc(parentFirestore, `pairingSessions/${created.sessionId}`)),
  );
  await assertFails(getDocs(collection(parentFirestore, 'pairingSessions')));
  await assertFails(
    setDoc(doc(parentFirestore, 'pairingSessions/client-write'), {
      denied: true,
    }),
  );

  console.info(
    'PASS: createPairingSession authorization, hashing, expiry, replay, invalidation, and secrecy',
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
