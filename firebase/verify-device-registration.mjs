import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const loadCore = createRequire(import.meta.url)(
  '../packages/notifications/tests/load-typescript.cjs',
);
const { createRegistrationSessionCoordinator } = loadCore('../src/core.ts');

const projectId = 'chorex-dev';
if (process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('Emulator guard failed: GCLOUD_PROJECT');
}
if (
  !/^127\.0\.0\.1:(8080|18080)$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')
) {
  throw new Error('Emulator guard failed: FIRESTORE_EMULATOR_HOST');
}

const deadline = setTimeout(() => {
  console.error(
    'Device registration emulator verification exceeded 40 seconds',
  );
  process.exit(1);
}, 40_000);
const ownerUid = `owner-${randomUUID()}`;
const otherUid = `other-${randomUUID()}`;
const installationId = randomUUID();
let environment;

function registration(overrides = {}) {
  return {
    platform: 'ios',
    appVariant: 'PARENT',
    appVersion: '0.0.0',
    expoPushToken: 'ExponentPushToken[emulator-only]',
    pushEnabled: true,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    ...overrides,
  };
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]),
    },
  });
  const ownerFirestore = environment.authenticatedContext(ownerUid).firestore();
  const otherFirestore = environment.authenticatedContext(otherUid).firestore();
  const anonymousFirestore = environment.unauthenticatedContext().firestore();
  const ownerDevice = doc(
    ownerFirestore,
    `users/${ownerUid}/devices/${installationId}`,
  );

  await assertSucceeds(setDoc(ownerDevice, registration()));
  await assertSucceeds(getDoc(ownerDevice));
  await assertSucceeds(
    getDocs(collection(ownerFirestore, `users/${ownerUid}/devices`)),
  );
  await assertSucceeds(
    updateDoc(ownerDevice, {
      expoPushToken: 'ExponentPushToken[updated-emulator-only]',
      lastSeenAt: serverTimestamp(),
    }),
  );

  await assertFails(
    getDoc(doc(otherFirestore, `users/${ownerUid}/devices/${installationId}`)),
  );
  await assertFails(
    getDocs(collection(otherFirestore, `users/${ownerUid}/devices`)),
  );
  await assertFails(
    setDoc(
      doc(otherFirestore, `users/${ownerUid}/devices/${randomUUID()}`),
      registration(),
    ),
  );
  await assertFails(
    getDoc(
      doc(anonymousFirestore, `users/${ownerUid}/devices/${installationId}`),
    ),
  );

  await assertFails(
    setDoc(
      doc(ownerFirestore, `users/${ownerUid}/devices/${randomUUID()}`),
      registration({ role: 'PARENT' }),
    ),
  );
  await assertFails(
    setDoc(
      doc(ownerFirestore, `users/${ownerUid}/devices/${randomUUID()}`),
      registration({ pushEnabled: false }),
    ),
  );
  await assertFails(
    updateDoc(ownerDevice, {
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(ownerFirestore, `users/${ownerUid}`), {
      accountType: 'PARENT',
    }),
  );

  await assertSucceeds(deleteDoc(ownerDevice));
  await assertFails(
    deleteDoc(
      doc(otherFirestore, `users/${ownerUid}/devices/${installationId}`),
    ),
  );
  // Exercise the real shared lifecycle with deterministic OS/token dependencies
  // and authenticated Firestore transactions under the existing owner Rules.
  let uid = ownerUid;
  let permission = {
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
  };
  let storedId = null;
  let tokenGeneration = 1;
  let prompts = 0;
  const databases = new Map([
    [ownerUid, ownerFirestore],
    [otherUid, otherFirestore],
  ]);
  const coordinator = createRegistrationSessionCoordinator({
    getAuthenticatedUid: () => uid,
    getPermission: async () => permission,
    requestPermission: async () => {
      prompts++;
      permission = { status: 'granted', granted: true, canAskAgain: true };
      return permission;
    },
    prepareAndroidChannel: async () => {},
    getProjectId: () => 'token-double-dependency',
    getAppVersion: () => '1.2.3',
    getPlatform: () => 'ios',
    getExpoPushToken: async () => `ExpoPushToken[lifecycle-${tokenGeneration}]`,
    getInstallationId: async () => storedId,
    createInstallationId: () => installationId,
    setInstallationId: async (id) => {
      storedId = id;
    },
    upsertDevice: async (expectedUid, id, metadata) => {
      assert.equal(uid, expectedUid);
      const database = databases.get(expectedUid);
      const reference = doc(database, `users/${expectedUid}/devices/${id}`);
      await runTransaction(database, async (transaction) => {
        const existing = await transaction.get(reference);
        assert.equal(uid, expectedUid);
        transaction.set(reference, {
          ...metadata,
          createdAt: existing.exists()
            ? existing.data().createdAt
            : serverTimestamp(),
          lastSeenAt: serverTimestamp(),
        });
      });
    },
    deleteDevice: async (expectedUid, id) => {
      assert.equal(uid, expectedUid);
      const database = databases.get(expectedUid);
      await runTransaction(database, async (transaction) => {
        const reference = doc(database, `users/${expectedUid}/devices/${id}`);
        const existing = await transaction.get(reference);
        assert.equal(uid, expectedUid);
        if (existing.exists()) transaction.delete(reference);
      });
    },
  });
  assert.deepEqual(
    await coordinator.register('PARENT', { requestPermission: false }),
    { status: 'denied' },
  );
  assert.equal(prompts, 0);
  assert.equal(storedId, null);
  assert.deepEqual(await coordinator.register('PARENT'), {
    status: 'registered',
  });
  assert.equal(prompts, 1);
  const createdAt = (await getDoc(ownerDevice)).data().createdAt;
  tokenGeneration++;
  await coordinator.register('PARENT', { requestPermission: false });
  assert.equal(
    (await getDocs(collection(ownerFirestore, `users/${ownerUid}/devices`)))
      .size,
    1,
  );
  assert.ok((await getDoc(ownerDevice)).data().createdAt.isEqual(createdAt));
  assert.equal(
    (await getDoc(ownerDevice)).data().expoPushToken,
    'ExpoPushToken[lifecycle-2]',
  );
  permission = { status: 'denied', granted: false, canAskAgain: false };
  await coordinator.register('PARENT', { requestPermission: false });
  assert.equal((await getDoc(ownerDevice)).exists(), false);
  assert.equal(uid, ownerUid);
  permission = { status: 'granted', granted: true, canAskAgain: true };
  await coordinator.register('PARENT', { requestPermission: false });
  assert.equal(storedId, installationId);
  assert.equal((await getDoc(ownerDevice)).exists(), true);
  await coordinator.remove(); // complete before Auth account switching
  assert.equal((await getDoc(ownerDevice)).exists(), false);
  uid = otherUid;
  coordinator.resume(uid);
  await coordinator.register('CHILD', { requestPermission: false });
  const otherDevice = doc(
    otherFirestore,
    `users/${otherUid}/devices/${installationId}`,
  );
  assert.equal((await getDoc(otherDevice)).data().appVariant, 'CHILD');
  assert.equal((await getDoc(ownerDevice)).exists(), false);
  await assertFails(getDoc(doc(ownerFirestore, otherDevice.path)));
  await coordinator.remove();
  console.info(
    'PASS: shared registration lifecycle, explicit permission, restart identity, token replacement, immutable createdAt, permission revoke/restore and account switching under owner Rules',
  );
  console.info(
    'PASS: device registrations are shape-restricted, self-only, and removable by their owner',
  );
} finally {
  if (environment) await environment.cleanup();
  clearTimeout(deadline);
}
