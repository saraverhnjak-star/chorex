import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
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
if (process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('Emulator guard failed: GCLOUD_PROJECT');
}
const emulatorHosts = {
  firestore: process.env.FIRESTORE_EMULATOR_HOST,
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  functions: process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001',
  logging: process.env.FIREBASE_LOGGING_EMULATOR_HOST ?? '127.0.0.1:4500',
};
for (const [service, host] of Object.entries(emulatorHosts)) {
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error(`Emulator guard failed: ${service}`);
  }
}
const deadline = setTimeout(() => {
  console.error('redeemPairingSession verification exceeded 90 seconds');
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

async function clearCollection(path) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDocs(collection(context.firestore(), path));
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  });
}

async function seedSession({
  id,
  token,
  familyId,
  childUid,
  status,
  expiresAt,
}) {
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), `pairingSessions/${id}`), {
      familyId,
      childUid,
      tokenHash: sha256(token),
      expiresAt,
      createdBy: 'test-parent',
      attemptCount: 0,
      status,
      createdAt: Timestamp.now(),
    }),
  );
}

async function readRateLimitRecord() {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDocs(
      collection(context.firestore(), 'pairingRateLimits'),
    );
  });
  assert(snapshot.size === 1, 'Expected one rate-limit record');
  return snapshot.docs[0].data();
}

async function readLocalLogs() {
  return new Promise((resolve, reject) => {
    const entries = [];
    const socket = new WebSocket(`ws://${emulatorHosts.logging}`);
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
  const firestoreAddress = emulatorAddress(emulatorHosts.firestore);
  environment = await initializeTestEnvironment({
    projectId,
    firestore: firestoreAddress,
  });
  await clearCollection('pairingRateLimits');

  const parent = await createIdentity('redemption-parent');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Redemption Family' },
    parent.idToken,
  );
  const child = await callFunction(
    'createChild',
    {
      familyId: family.family.id,
      displayName: 'Mia',
      idempotencyKey: 'redemption-child-001',
    },
    parent.idToken,
  );
  const childUid = child.profile.uid;
  const created = await callFunction(
    'createPairingSession',
    {
      familyId: family.family.id,
      childUid,
      idempotencyKey: 'redemption-session-001',
    },
    parent.idToken,
  );
  const redemptionKey = 'redemption-attempt-001';
  const redeemed = await callFunction('redeemPairingSession', {
    token: created.token,
    idempotencyKey: redemptionKey,
  });
  assert(typeof redeemed.customToken === 'string', 'Missing custom token');
  const signedIn = await authRequest('signInWithCustomToken', {
    token: redeemed.customToken,
    returnSecureToken: true,
  });
  const signedInAccount = await authRequest('lookup', {
    idToken: signedIn.idToken,
  });
  assert(
    signedInAccount.users?.[0]?.localId === childUid,
    'Custom token signed in wrong Child',
  );

  const session = await readAdmin(`pairingSessions/${created.sessionId}`);
  const sessionData = session.data();
  assert(
    sessionData?.status === 'REDEEMED',
    `Session ${created.sessionId} was not redeemed on ${emulatorHosts.firestore}: ${String(sessionData?.status)}`,
  );
  assert(sessionData?.redeemedAt instanceof Timestamp, 'Missing redeemedAt');
  assert(
    sessionData?.redemptionIdempotencyKeyHash === sha256(redemptionKey),
    'Redemption idempotency key was not bound',
  );
  assert(
    !JSON.stringify(sessionData).includes(redemptionKey),
    'Plaintext redemption key was persisted',
  );
  const activities = await queryAdmin(
    'activityEvents',
    'entityId',
    created.sessionId,
  );
  assert(
    activities.docs.filter(
      (activity) => activity.data().type === 'PAIRING_SESSION_REDEEMED',
    ).length === 1,
    'Expected one redemption activity event',
  );

  const retry = await callFunction('redeemPairingSession', {
    token: created.token,
    idempotencyKey: redemptionKey,
  });
  const retrySignIn = await authRequest('signInWithCustomToken', {
    token: retry.customToken,
    returnSecureToken: true,
  });
  const retryAccount = await authRequest('lookup', {
    idToken: retrySignIn.idToken,
  });
  assert(
    retryAccount.users?.[0]?.localId === childUid,
    'Retry minted for wrong Child',
  );
  assert(
    (
      await queryAdmin('activityEvents', 'entityId', created.sessionId)
    ).docs.filter(
      (activity) => activity.data().type === 'PAIRING_SESSION_REDEEMED',
    ).length === 1,
    'Idempotent retry duplicated the activity event',
  );
  await expectCallableError('PAIRING_ALREADY_USED', () =>
    callFunction('redeemPairingSession', {
      token: created.token,
      idempotencyKey: 'different-redemption-attempt',
    }),
  );

  await clearCollection('pairingRateLimits');
  const expiredToken = Buffer.from(randomUUID())
    .toString('base64url')
    .slice(0, 22);
  await seedSession({
    id: 'expired-session',
    token: expiredToken,
    familyId: family.family.id,
    childUid,
    status: 'ACTIVE',
    expiresAt: Timestamp.fromMillis(Date.now() - 1),
  });
  await expectCallableError('PAIRING_EXPIRED', () =>
    callFunction('redeemPairingSession', {
      token: expiredToken,
      idempotencyKey: 'expired-attempt-001',
    }),
  );

  await clearCollection('pairingRateLimits');
  const invalidatedToken = Buffer.from(randomUUID())
    .toString('base64url')
    .slice(0, 22);
  await seedSession({
    id: 'invalidated-session',
    token: invalidatedToken,
    familyId: family.family.id,
    childUid,
    status: 'INVALIDATED',
    expiresAt: Timestamp.fromMillis(Date.now() + 600_000),
  });
  await expectCallableError('PAIRING_INVALIDATED', () =>
    callFunction('redeemPairingSession', {
      token: invalidatedToken,
      idempotencyKey: 'invalidated-attempt-001',
    }),
  );

  await clearCollection('pairingRateLimits');
  const invalidTokens = Array.from({ length: 11 }, (_, index) =>
    Buffer.from(`invalid-token-${index.toString().padStart(2, '0')}`)
      .toString('base64url')
      .slice(0, 22),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction('redeemPairingSession', {
      token: '',
      idempotencyKey: 'malformed-attempt-001',
    }),
  );
  for (let index = 0; index < 9; index += 1) {
    await expectCallableError('PAIRING_INVALID', () =>
      callFunction('redeemPairingSession', {
        token: invalidTokens[index],
        idempotencyKey: `invalid-attempt-${index}`,
      }),
    );
  }
  await expectCallableError('PAIRING_RATE_LIMITED', () =>
    callFunction('redeemPairingSession', {
      token: invalidTokens[9],
      idempotencyKey: 'invalid-attempt-09',
    }),
  );
  const failedLimit = await readRateLimitRecord();
  assert(failedLimit.totalCount === 10, 'Wrong failed-limit total count');
  assert(failedLimit.failedCount === 10, 'Wrong failed-limit failure count');
  assert(
    /^[a-f0-9]{64}$/.test(failedLimit.sourceKey),
    'Rate-limit source key is not an HMAC digest',
  );
  assert(
    failedLimit.windowStartedAt instanceof Timestamp &&
      failedLimit.expiresAt instanceof Timestamp &&
      failedLimit.expiresAt.toMillis() -
        failedLimit.windowStartedAt.toMillis() ===
        600_000,
    'Rate-limit record does not have a 10-minute expiry',
  );
  const serializedRateLimit = JSON.stringify(failedLimit);
  assert(
    !serializedRateLimit.includes('127.0.0.1') &&
      !serializedRateLimit.includes('::1'),
    'Raw source IP was persisted',
  );

  await clearCollection('pairingRateLimits');
  const totalLimitSession = await callFunction(
    'createPairingSession',
    {
      familyId: family.family.id,
      childUid,
      idempotencyKey: 'redemption-total-limit-session',
    },
    parent.idToken,
  );
  const totalLimitInput = {
    token: totalLimitSession.token,
    idempotencyKey: 'redemption-total-limit-attempt',
  };
  for (let index = 0; index < 20; index += 1) {
    await callFunction('redeemPairingSession', totalLimitInput);
  }
  await expectCallableError('PAIRING_RATE_LIMITED', () =>
    callFunction('redeemPairingSession', totalLimitInput),
  );
  const totalLimit = await readRateLimitRecord();
  assert(totalLimit.totalCount === 20, 'Wrong total request limit');
  assert(
    totalLimit.failedCount === 0,
    'Successful retries counted as failures',
  );

  const logs = JSON.stringify(await readLocalLogs());
  for (const secretValue of [
    created.token,
    expiredToken,
    invalidatedToken,
    ...invalidTokens,
    redeemed.customToken,
    retry.customToken,
  ]) {
    assert(!logs.includes(secretValue), 'A pairing or Auth token reached logs');
  }

  console.log(
    'PASS: pairing redemption, custom Auth, retry safety, states, and IP rate limits',
  );
} finally {
  clearTimeout(deadline);
  await environment?.cleanup();
  for (const identity of identities) {
    if (!identity?.localId) continue;
    await fetch(
      `http://${emulatorHosts.auth}/identitytoolkit.googleapis.com/v1/accounts:delete?key=emulator-only`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: identity.idToken }),
      },
    ).catch(() => undefined);
  }
}
