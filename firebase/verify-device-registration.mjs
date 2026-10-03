import { randomUUID } from 'node:crypto';
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
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'chorex-dev';
if (process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('Emulator guard failed: GCLOUD_PROJECT');
}
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
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
    firestore: { host: '127.0.0.1', port: 8080 },
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
  console.info(
    'PASS: device registrations are shape-restricted, self-only, and removable by their owner',
  );
} finally {
  if (environment) await environment.cleanup();
  clearTimeout(deadline);
}
