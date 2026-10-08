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
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT;
if (projectId !== 'chorex-dev') {
  throw new Error(`Refusing project ${String(projectId)}`);
}
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
const [emulatorHost, emulatorPortValue] = emulatorAddress?.split(':') ?? [];
const emulatorPort = Number(emulatorPortValue);
if (
  emulatorHost !== '127.0.0.1' ||
  !Number.isInteger(emulatorPort) ||
  emulatorPort <= 0
) {
  throw new Error(
    `Refusing FIRESTORE_EMULATOR_HOST=${String(emulatorAddress)}`,
  );
}

const timeout = setTimeout(() => {
  console.error('FAIL: realtime Offer inbox verification timed out');
  process.exit(1);
}, 30_000);
let environment;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function childInboxQuery(firestore, familyId, uid) {
  return query(
    collection(firestore, 'offers'),
    where('familyId', '==', familyId),
    where('participantUids', 'array-contains', uid),
    where('status', '==', 'AWAITING_CHILD'),
    orderBy('updatedAt', 'desc'),
  );
}

function parentInboxQuery(firestore, familyId, uid) {
  return query(
    collection(firestore, 'offers'),
    where('familyId', '==', familyId),
    where('parentUid', '==', uid),
    where('participantUids', 'array-contains', uid),
    where('status', '==', 'AWAITING_PARENT'),
    orderBy('updatedAt', 'desc'),
  );
}

function observeIds(targetQuery) {
  const history = [];
  const waiters = new Set();
  let subscriptionError;
  const unsubscribe = onSnapshot(
    targetQuery,
    (snapshot) => {
      history.push(snapshot.docs.map((item) => item.id));
      for (const notify of waiters) notify();
    },
    (error) => {
      subscriptionError = error;
      for (const notify of waiters) notify();
    },
  );

  return {
    history,
    unsubscribe,
    waitFor(predicate, label) {
      if (predicate(history)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(
            subscriptionError ??
              new Error(`${label}; history=${JSON.stringify(history)}`),
          );
        }, 5_000);
        function check() {
          if (subscriptionError) {
            clearTimeout(timer);
            waiters.delete(check);
            reject(subscriptionError);
          } else if (predicate(history)) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve();
          }
        }
        waiters.add(check);
      });
    },
  };
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: emulatorHost, port: emulatorPort },
  });
  await environment.clearFirestore();

  const familyId = 'realtime-family';
  const parentUid = 'realtime-parent';
  const childUid = 'realtime-child';
  const siblingUid = 'realtime-sibling';
  const otherParentUid = 'realtime-other-parent';
  const offerId = 'realtime-offer';
  const parentRevisionId = 'revision-parent';
  const childRevisionId = 'revision-child';
  const now = Timestamp.now();
  const deadline = Timestamp.fromMillis(Date.now() + 86_400_000);

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `families/${familyId}`), {
      name: 'Realtime family',
      createdBy: parentUid,
      createdAt: now,
      updatedAt: now,
    });
    for (const [uid, role] of [
      [parentUid, 'PARENT'],
      [otherParentUid, 'PARENT'],
      [childUid, 'CHILD'],
      [siblingUid, 'CHILD'],
    ]) {
      await setDoc(doc(firestore, `families/${familyId}/members/${uid}`), {
        role,
        displayName: uid,
        status: 'ACTIVE',
        joinedAt: now,
      });
    }
  });

  const parentFirestore = environment
    .authenticatedContext(parentUid)
    .firestore();
  const childFirestore = environment.authenticatedContext(childUid).firestore();
  const siblingFirestore = environment
    .authenticatedContext(siblingUid)
    .firestore();
  const otherParentFirestore = environment
    .authenticatedContext(otherParentUid)
    .firestore();
  const childObserver = observeIds(
    childInboxQuery(childFirestore, familyId, childUid),
  );
  const parentObserver = observeIds(
    parentInboxQuery(parentFirestore, familyId, parentUid),
  );

  await childObserver.waitFor(
    (history) => history.some((ids) => ids.length === 0),
    'Child inbox did not emit its initial empty snapshot',
  );
  await parentObserver.waitFor(
    (history) => history.some((ids) => ids.length === 0),
    'Parent inbox did not emit its initial empty snapshot',
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(
      doc(firestore, `offers/${offerId}/revisions/${parentRevisionId}`),
      {
        revisionNumber: 1,
        proposedByUid: parentUid,
        proposedByRole: 'PARENT',
        tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
        reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' },
        deadlineAt: deadline,
        createdAt: now,
      },
    );
    await setDoc(doc(firestore, `offers/${offerId}`), {
      familyId,
      parentUid,
      childUid,
      participantUids: [parentUid, childUid],
      status: 'AWAITING_CHILD',
      currentRevisionId: parentRevisionId,
      createdAt: now,
      updatedAt: now,
    });
  });

  await childObserver.waitFor(
    (history) => history.some((ids) => ids.length === 1 && ids[0] === offerId),
    'Published Offer was not added to the Child subscription',
  );
  const childCurrentRevision = await assertSucceeds(
    getDoc(
      doc(childFirestore, `offers/${offerId}/revisions/${parentRevisionId}`),
    ),
  );
  assert(
    childCurrentRevision.exists(),
    'Child could not read current revision',
  );

  await assertSucceeds(
    getDocs(childInboxQuery(siblingFirestore, familyId, siblingUid)),
  );
  await assertFails(
    getDocs(childInboxQuery(siblingFirestore, familyId, childUid)),
  );
  await assertSucceeds(
    getDocs(parentInboxQuery(otherParentFirestore, familyId, otherParentUid)),
  );
  await assertFails(
    getDocs(parentInboxQuery(otherParentFirestore, familyId, parentUid)),
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const counteredAt = Timestamp.fromMillis(now.toMillis() + 1_000);
    await setDoc(
      doc(firestore, `offers/${offerId}/revisions/${childRevisionId}`),
      {
        revisionNumber: 2,
        proposedByUid: childUid,
        proposedByRole: 'CHILD',
        tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
        reward: {
          title: 'One hour of games',
          type: 'PRIVILEGE',
          iconKey: 'screen-time',
        },
        note: 'This feels fair.',
        deadlineAt: deadline,
        createdAt: counteredAt,
      },
    );
    await updateDoc(doc(firestore, `offers/${offerId}`), {
      status: 'AWAITING_PARENT',
      currentRevisionId: childRevisionId,
      updatedAt: counteredAt,
    });
  });

  await childObserver.waitFor(
    (history) =>
      history.length >= 3 && history[history.length - 1].length === 0,
    'Countered Offer was not removed from the Child subscription',
  );
  await parentObserver.waitFor(
    (history) => history.some((ids) => ids.length === 1 && ids[0] === offerId),
    'Countered Offer was not added to the Parent subscription',
  );
  const parentCurrentRevision = await assertSucceeds(
    getDoc(
      doc(parentFirestore, `offers/${offerId}/revisions/${childRevisionId}`),
    ),
  );
  assert(
    parentCurrentRevision.exists() &&
      parentCurrentRevision.data().note === 'This feels fair.',
    'Parent did not load the exact current counteroffer revision',
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `offers/${offerId}`), {
      status: 'REJECTED',
      updatedAt: Timestamp.fromMillis(now.toMillis() + 2_000),
    });
  });
  await parentObserver.waitFor(
    (history) =>
      history.length >= 3 && history[history.length - 1].length === 0,
    'Terminal Offer was not removed from the Parent subscription',
  );

  for (const operation of [
    setDoc(doc(childFirestore, 'offers/client-created'), {
      familyId,
      status: 'AWAITING_CHILD',
    }),
    updateDoc(doc(parentFirestore, `offers/${offerId}`), {
      status: 'AWAITING_PARENT',
    }),
    deleteDoc(doc(childFirestore, `offers/${offerId}`)),
  ]) {
    await assertFails(operation);
  }

  const childHistorySize = childObserver.history.length;
  const parentHistorySize = parentObserver.history.length;
  childObserver.unsubscribe();
  parentObserver.unsubscribe();
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `offers/${offerId}`), {
      updatedAt: Timestamp.fromMillis(now.toMillis() + 3_000),
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    childObserver.history.length === childHistorySize &&
      parentObserver.history.length === parentHistorySize,
    'An unsubscribed inbox received another snapshot',
  );

  console.info(
    'PASS: realtime Child/Parent Offer inbox add/remove, query boundaries, exact revisions, cleanup, and write denial',
  );
} finally {
  if (environment) await environment.cleanup();
  clearTimeout(timeout);
}
