import { randomUUID } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  onSnapshot,
  orderBy,
  disableNetwork,
  deleteDoc,
  enableNetwork,
  getDocFromCache,
  getDocsFromCache,
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
if (!['chorex-dev', 'chorex-phase3-test'].includes(projectId)) {
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
  console.error('FAIL: Contract reads emulator verification timed out');
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
      tasks: [
        {
          title: 'Load the dishwasher',
          description: 'After dinner',
          targetCount: 2,
        },
        { title: 'Take out the trash', targetCount: 1 },
      ],
      reward: {
        title: 'Cinema',
        description: 'Choose a movie',
        type: 'EXPERIENCE',
        iconKey: 'cinema',
      },
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

const stops = [];
function watch(reference) {
  let latest;
  let error;
  const pending = [];
  stops.push(
    onSnapshot(
      reference,
      { includeMetadataChanges: true },
      (snapshot) => {
        latest = snapshot;
        for (const waiter of [...pending])
          if (waiter.predicate(snapshot)) {
            pending.splice(pending.indexOf(waiter), 1);
            waiter.resolve(snapshot);
          }
      },
      (failure) => {
        error = failure;
        for (const waiter of pending.splice(0)) waiter.reject(failure);
      },
    ),
  );
  return {
    wait(predicate) {
      if (error) return Promise.reject(error);
      if (latest && predicate(latest)) return Promise.resolve(latest);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve: (snapshot) => {
            clearTimeout(timer);
            resolve(snapshot);
          },
          reject: (failure) => {
            clearTimeout(timer);
            reject(failure);
          },
        };
        const timer = setTimeout(() => {
          pending.splice(pending.indexOf(waiter), 1);
          reject(new Error('Realtime Contract read timeout'));
        }, 10000);
        pending.push(waiter);
      });
    },
  };
}
function activeQuery(firestore, familyId, uid) {
  return query(
    collection(firestore, 'contracts'),
    where('familyId', '==', familyId),
    where('participantUids', 'array-contains', uid),
    where('status', '==', 'ACTIVE'),
    orderBy('createdAt', 'desc'),
  );
}
try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: emulatorAddress(emulatorHosts.firestore),
  });
  const parent = await createIdentity('contract-parent');
  const child = await createIdentity('contract-child');
  const sibling = await createIdentity('contract-sibling');
  const other = await createIdentity('contract-outside');
  const sameFamilyParent = await createIdentity('contract-other-parent');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Alex', familyName: 'Contract read family' },
    parent.idToken,
  );
  const familyId = family.family.id;
  await callFunction(
    'createFamily',
    { displayName: 'Outside Parent', familyName: 'Other family' },
    other.idToken,
  );
  await withAdmin(async (firestore) => {
    for (const person of [child, sibling, sameFamilyParent])
      await setDoc(
        doc(firestore, `families/${familyId}/members/${person.localId}`),
        {
          role: person === sameFamilyParent ? 'PARENT' : 'CHILD',
          displayName: 'Member',
          status: 'ACTIVE',
          joinedAt: Timestamp.now(),
        },
      );
  });
  const parentFirestore = environment
    .authenticatedContext(parent.localId)
    .firestore();
  const childFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  const parentList = activeQuery(parentFirestore, familyId, parent.localId);
  const childList = activeQuery(childFirestore, familyId, child.localId);
  const parentWatch = watch(parentList);
  const childWatch = watch(childList);
  await Promise.all([
    parentWatch.wait(
      (snapshot) => snapshot.empty && !snapshot.metadata.fromCache,
    ),
    childWatch.wait(
      (snapshot) => snapshot.empty && !snapshot.metadata.fromCache,
    ),
  ]);
  const draft = await createDraft(
    parent,
    familyId,
    child.localId,
    'contract-read-draft-001',
  );
  await publish(parent, draft, 'contract-read-publish-001');
  const waitingQuery = query(
    collection(childFirestore, 'offers'),
    where('familyId', '==', familyId),
    where('participantUids', 'array-contains', child.localId),
    where('status', '==', 'AWAITING_CHILD'),
    orderBy('updatedAt', 'desc'),
  );
  const waiting = watch(waitingQuery);
  await waiting.wait((snapshot) =>
    snapshot.docs.some((item) => item.id === draft.offer.id),
  );
  const revisionPath = `offers/${draft.offer.id}/revisions/${draft.revision.id}`;
  const revisionBefore = normalized((await readAdmin(revisionPath)).data());
  const accepted = await callFunction(
    'acceptOffer',
    {
      offerId: draft.offer.id,
      currentRevisionId: draft.revision.id,
      idempotencyKey: 'contract-read-accept-001',
    },
    child.idToken,
  );
  const contractId = accepted.contract.id;
  await Promise.all([
    parentWatch.wait((snapshot) =>
      snapshot.docs.some((item) => item.id === contractId),
    ),
    childWatch.wait((snapshot) =>
      snapshot.docs.some((item) => item.id === contractId),
    ),
    waiting.wait(
      (snapshot) => !snapshot.docs.some((item) => item.id === draft.offer.id),
    ),
  ]);
  const contractPath = `contracts/${contractId}`;
  const contractRef = doc(childFirestore, contractPath);
  const tasksRef = collection(childFirestore, `${contractPath}/tasks`);
  const taskPath = `${contractPath}/tasks/${accepted.tasks[0].id}`;
  const childContract = await assertSucceeds(getDoc(contractRef));
  const parentContract = await assertSucceeds(
    getDoc(doc(parentFirestore, contractPath)),
  );
  const childTasks = await assertSucceeds(getDocs(tasksRef));
  const parentTasks = await assertSucceeds(
    getDocs(collection(parentFirestore, `${contractPath}/tasks`)),
  );
  assert(
    JSON.stringify(normalized(childContract.data())) ===
      JSON.stringify(normalized(parentContract.data())),
    'Participants read different Contract snapshots',
  );
  assert(
    JSON.stringify(childTasks.docs.map((item) => normalized(item.data()))) ===
      JSON.stringify(parentTasks.docs.map((item) => normalized(item.data()))),
    'Participants read different task snapshots',
  );
  const frozen = childContract.data();
  assert(
    frozen.status === 'ACTIVE' && frozen.reviewCycle === 0,
    'Acceptance lifecycle changed',
  );
  assert(
    frozen.source.offerId === draft.offer.id &&
      frozen.source.revisionId === draft.revision.id,
    'Frozen source changed',
  );
  assert(
    JSON.stringify(normalized(frozen.rewardTerms)) ===
      JSON.stringify(normalized(draft.revision.reward)),
    'Frozen reward differs',
  );
  assert(
    frozen.deadlineAt.toDate().toISOString() === draft.revision.deadlineAt,
    'Frozen deadline differs',
  );
  assert(
    childTasks.docs.every(
      (item) =>
        item.data().contractId === contractId &&
        item.data().completedCount === 0,
    ),
    'Task scope/progress differs',
  );
  assert(
    JSON.stringify(childTasks.docs.map((item) => item.id)) ===
      JSON.stringify(childTasks.docs.map((item) => item.id).sort()),
    'Task document ordering is not deterministic',
  );
  assert(
    JSON.stringify(
      childTasks.docs
        .map((item) => ({
          title: item.data().title,
          description: item.data().description,
          targetCount: item.data().targetCount,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    ) ===
      JSON.stringify(
        draft.revision.tasks
          .map((item) => ({
            title: item.title,
            description: item.description,
            targetCount: item.targetCount,
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      ),
    'Task requirements differ',
  );
  // A separate later Offer must never become the source of the accepted Contract display.
  const laterDraft = await callFunction(
    'createOfferDraft',
    {
      familyId,
      childUid: child.localId,
      tasks: [{ title: 'Different chore', targetCount: 7 }],
      reward: { title: 'Different promise', type: 'ITEM', iconKey: 'gift' },
      deadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      idempotencyKey: 'contract-read-later-draft-001',
    },
    parent.idToken,
  );
  assert(
    laterDraft.offer.id !== draft.offer.id,
    'Later Offer reused old identity',
  );
  await publish(parent, laterDraft, 'contract-read-later-publish-001');
  await callFunction(
    'acceptOffer',
    {
      offerId: laterDraft.offer.id,
      currentRevisionId: laterDraft.revision.id,
      idempotencyKey: 'contract-read-later-accept-001',
    },
    child.idToken,
  );
  await Promise.all([
    parentWatch.wait((snapshot) => snapshot.size === 2),
    childWatch.wait((snapshot) => snapshot.size === 2),
  ]);
  assert(
    JSON.stringify(normalized((await readAdmin(revisionPath)).data())) ===
      JSON.stringify(revisionBefore),
    'Immutable revision was changed',
  );
  assert(
    JSON.stringify(normalized((await getDoc(contractRef)).data())) ===
      JSON.stringify(normalized(frozen)),
    'Reading later negotiation changed frozen Contract',
  );
  // Native Firestore uses the same metadata contract. Emulator verifies cache semantics;
  // persistence across a native process restart still requires a device/dev build.
  const detailWatch = watch(contractRef);
  const tasksWatch = watch(tasksRef);
  await Promise.all([
    detailWatch.wait((snapshot) => !snapshot.metadata.fromCache),
    tasksWatch.wait((snapshot) => !snapshot.metadata.fromCache),
  ]);
  await disableNetwork(childFirestore);
  await Promise.all([
    detailWatch.wait(
      (snapshot) => snapshot.metadata.fromCache && snapshot.exists(),
    ),
    tasksWatch.wait(
      (snapshot) =>
        snapshot.metadata.fromCache && snapshot.size === accepted.tasks.length,
    ),
  ]);
  assert(
    (await getDocFromCache(contractRef)).data().rewardTerms.title === 'Cinema',
    'Cached promise disappeared',
  );
  assert(
    (await getDocsFromCache(tasksRef)).size === accepted.tasks.length,
    'Cached tasks disappeared',
  );
  await enableNetwork(childFirestore);
  await detailWatch.wait((snapshot) => !snapshot.metadata.fromCache);
  for (const firestore of [
    environment.authenticatedContext(sibling.localId).firestore(),
    environment.authenticatedContext(sameFamilyParent.localId).firestore(),
    environment.authenticatedContext(other.localId).firestore(),
    environment.authenticatedContext('non-member').firestore(),
    environment.unauthenticatedContext().firestore(),
  ]) {
    await assertFails(getDoc(doc(firestore, contractPath)));
    await assertFails(getDoc(doc(firestore, taskPath)));
    await assertFails(getDocs(collection(firestore, `${contractPath}/tasks`)));
  }
  for (const firestore of [parentFirestore, childFirestore]) {
    await assertFails(
      updateDoc(doc(firestore, contractPath), { status: 'APPROVED' }),
    );
    await assertFails(
      updateDoc(doc(firestore, taskPath), { completedCount: 1 }),
    );
  }
  await assertFails(
    getDocs(
      query(
        collection(parentFirestore, 'contracts'),
        where('familyId', '==', familyId),
        where('status', '==', 'ACTIVE'),
      ),
    ),
  );
  // Detach listeners before intentionally revoking membership.
  stops.splice(0).forEach((stop) => stop());
  for (const person of [parent, child]) {
    await withAdmin((firestore) =>
      updateDoc(
        doc(firestore, `families/${familyId}/members/${person.localId}`),
        { status: 'INACTIVE' },
      ),
    );
    const firestore = environment
      .authenticatedContext(person.localId)
      .firestore();
    await assertFails(getDoc(doc(firestore, contractPath)));
    await assertFails(getDocs(collection(firestore, `${contractPath}/tasks`)));
    await assertFails(
      getDocs(activeQuery(firestore, familyId, person.localId)),
    );
  }
  await withAdmin((firestore) =>
    deleteDoc(doc(firestore, `families/${familyId}/members/${child.localId}`)),
  );
  const nonMemberChildFirestore = environment
    .authenticatedContext(child.localId)
    .firestore();
  await assertFails(getDoc(doc(nonMemberChildFirestore, contractPath)));
  await assertFails(
    getDocs(collection(nonMemberChildFirestore, `${contractPath}/tasks`)),
  );
  await withAdmin(async (firestore) =>
    assert(
      (await getDocs(collection(firestore, 'rewards'))).empty,
      'Read/navigation created a Reward',
    ),
  );
  console.info(
    'PASS: Contract realtime discovery, waiting Offer removal, participant rules, server-only writes, frozen snapshots, deterministic tasks, cached reads/reconnect, and Reward boundary',
  );
} finally {
  stops.forEach((stop) => stop());
  try {
    if (environment) await environment.cleanup();
  } finally {
    for (const identity of identities)
      if (identity.idToken)
        await authRequest('delete', { idToken: identity.idToken });
    clearTimeout(timeout);
  }
}
