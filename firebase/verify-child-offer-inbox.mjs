import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
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
  console.error('FAIL: Child Offer inbox verification timed out');
  process.exit(1);
}, 30_000);
let environment;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function inboxQuery(firestore, familyId, uid, offerId) {
  return query(
    collection(firestore, 'offers'),
    where('familyId', '==', familyId),
    where('participantUids', 'array-contains', uid),
    where('status', '==', 'AWAITING_CHILD'),
    ...(offerId
      ? [where(documentId(), '==', offerId)]
      : [orderBy('updatedAt', 'desc')]),
  );
}

async function loadExactCurrentRevisions(firestore, familyId, uid) {
  const offers = await getDocs(inboxQuery(firestore, familyId, uid));
  return Promise.all(
    offers.docs.map(async (offer) => {
      const currentRevisionId = offer.data().currentRevisionId;
      if (typeof currentRevisionId !== 'string' || !currentRevisionId) {
        throw new Error('MALFORMED_OFFER_DATA');
      }
      const revision = await getDoc(
        doc(firestore, `offers/${offer.id}/revisions/${currentRevisionId}`),
      );
      if (!revision.exists()) throw new Error('MALFORMED_OFFER_DATA');
      return { offerId: offer.id, revisionId: revision.id };
    }),
  );
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: emulatorHost, port: emulatorPort },
  });

  const familyId = 'inbox-family';
  const otherFamilyId = 'inbox-other-family';
  const parentUid = 'inbox-parent';
  const childUid = 'inbox-child';
  const siblingUid = 'inbox-sibling';
  const otherChildUid = 'inbox-other-child';
  const publishedOfferId = 'inbox-published-offer';
  const draftOfferId = 'inbox-draft-offer';
  const currentRevisionId = 'revision-current';
  const staleRevisionId = 'revision-stale';
  const now = Timestamp.now();
  const deadline = Timestamp.fromMillis(Date.now() + 86_400_000);

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    for (const [id, createdBy] of [
      [familyId, parentUid],
      [otherFamilyId, 'inbox-other-parent'],
    ]) {
      await setDoc(doc(firestore, `families/${id}`), {
        name: id,
        createdBy,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const [family, uid, role] of [
      [familyId, parentUid, 'PARENT'],
      [familyId, childUid, 'CHILD'],
      [familyId, siblingUid, 'CHILD'],
      [otherFamilyId, otherChildUid, 'CHILD'],
    ]) {
      await setDoc(doc(firestore, `families/${family}/members/${uid}`), {
        role,
        displayName: uid,
        status: 'ACTIVE',
        joinedAt: now,
      });
    }

    const baseOffer = {
      familyId,
      parentUid,
      childUid,
      participantUids: [parentUid, childUid],
      currentRevisionId,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(firestore, `offers/${publishedOfferId}`), {
      ...baseOffer,
      status: 'AWAITING_CHILD',
    });
    await setDoc(doc(firestore, `offers/${draftOfferId}`), {
      ...baseOffer,
      currentRevisionId: 'draft-revision',
      status: 'DRAFT',
    });
    for (const revisionId of [currentRevisionId, staleRevisionId]) {
      await setDoc(
        doc(firestore, `offers/${publishedOfferId}/revisions/${revisionId}`),
        {
          revisionNumber: revisionId === currentRevisionId ? 2 : 1,
          proposedByUid: parentUid,
          proposedByRole: 'PARENT',
          tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
          reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' },
          deadlineAt: deadline,
          createdAt: now,
        },
      );
    }
    await setDoc(
      doc(firestore, `offers/${draftOfferId}/revisions/draft-revision`),
      {
        revisionNumber: 1,
        proposedByUid: parentUid,
        proposedByRole: 'PARENT',
        tasks: [{ title: 'Private draft', targetCount: 1 }],
        reward: { title: 'Private reward', type: 'CUSTOM', iconKey: 'gift' },
        deadlineAt: deadline,
        createdAt: now,
      },
    );
    await setDoc(doc(firestore, 'offers/inbox-other-family-offer'), {
      ...baseOffer,
      familyId: otherFamilyId,
      childUid: otherChildUid,
      participantUids: ['inbox-other-parent', otherChildUid],
      status: 'AWAITING_CHILD',
    });
  });

  const parentFirestore = environment
    .authenticatedContext(parentUid)
    .firestore();
  const childFirestore = environment.authenticatedContext(childUid).firestore();
  const siblingFirestore = environment
    .authenticatedContext(siblingUid)
    .firestore();
  const otherChildFirestore = environment
    .authenticatedContext(otherChildUid)
    .firestore();

  const inbox = await assertSucceeds(
    getDocs(inboxQuery(childFirestore, familyId, childUid)),
  );
  assert(inbox.size === 1, 'Child inbox did not return one published Offer');
  assert(
    inbox.docs[0].id === publishedOfferId,
    'Child inbox returned the wrong Offer',
  );
  const detail = await assertSucceeds(
    getDocs(inboxQuery(childFirestore, familyId, childUid, publishedOfferId)),
  );
  assert(
    detail.size === 1 && detail.docs[0].id === publishedOfferId,
    'Scoped detail query did not return the selected Offer',
  );
  await assertFails(
    getDocs(inboxQuery(childFirestore, familyId, childUid, draftOfferId)),
  );
  const loaded = await loadExactCurrentRevisions(
    childFirestore,
    familyId,
    childUid,
  );
  assert(
    loaded.length === 1 && loaded[0].revisionId === currentRevisionId,
    'Inbox did not load the exact current revision',
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    for (const status of [
      'ACTIVE',
      'CHANGES_REQUESTED',
      'READY_FOR_REVIEW',
      'APPROVED',
    ]) {
      await setDoc(doc(context.firestore(), `contracts/status-${status}`), {
        familyId,
        parentUid,
        childUid,
        participantUids: [parentUid, childUid],
        status,
        createdAt: now,
        updatedAt: now,
        reviewCycle: 0,
        source: {
          type: 'OFFER',
          offerId: publishedOfferId,
          revisionId: currentRevisionId,
        },
        rewardTerms: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' },
        deadlineAt: deadline,
      });
    }
  });
  for (const status of [
    'ACTIVE',
    'CHANGES_REQUESTED',
    'READY_FOR_REVIEW',
    'APPROVED',
  ]) {
    const result = await assertSucceeds(
      getDocs(
        query(
          collection(childFirestore, 'contracts'),
          where('familyId', '==', familyId),
          where('participantUids', 'array-contains', childUid),
          where('status', '==', status),
          orderBy('createdAt', 'desc'),
        ),
      ),
    );
    assert(result.size === 1, `Missing contract status ${status}`);
  }
  await assertFails(getDoc(doc(siblingFirestore, 'contracts/status-APPROVED')));

  const publishedStatuses = [
    'AWAITING_CHILD',
    'AWAITING_PARENT',
    'ACCEPTED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ];
  const historyQuery = (db, uid) =>
    query(
      collection(db, 'offers'),
      where('familyId', '==', familyId),
      where('participantUids', 'array-contains', uid),
      where('status', 'in', publishedStatuses),
      orderBy('updatedAt', 'desc'),
    );
  for (const status of publishedStatuses) {
    await environment.withSecurityRulesDisabled(async (context) =>
      updateDoc(doc(context.firestore(), `offers/${publishedOfferId}`), {
        status,
      }),
    );
    const history = await assertSucceeds(
      getDocs(historyQuery(childFirestore, childUid)),
    );
    assert(
      history.size === 1 && history.docs[0].data().status === status,
      `Missing history status ${status}`,
    );
    await assertSucceeds(
      getDoc(
        doc(
          childFirestore,
          `offers/${publishedOfferId}/revisions/${currentRevisionId}`,
        ),
      ),
    );
  }
  await assertFails(
    getDocs(
      query(
        collection(childFirestore, 'offers'),
        where('familyId', '==', familyId),
        where('status', 'in', publishedStatuses),
      ),
    ),
  );
  await assertFails(
    getDocs(
      query(
        collection(childFirestore, 'offers'),
        where('familyId', '==', familyId),
        where('participantUids', 'array-contains', childUid),
      ),
    ),
  );
  await environment.withSecurityRulesDisabled(async (context) =>
    updateDoc(doc(context.firestore(), `offers/${publishedOfferId}`), {
      status: 'AWAITING_CHILD',
    }),
  );

  await assertSucceeds(getDoc(doc(parentFirestore, `offers/${draftOfferId}`)));
  await assertFails(getDoc(doc(childFirestore, `offers/${draftOfferId}`)));
  await assertFails(
    getDoc(
      doc(childFirestore, `offers/${draftOfferId}/revisions/draft-revision`),
    ),
  );
  await assertFails(
    getDoc(doc(siblingFirestore, `offers/${publishedOfferId}`)),
  );
  await assertFails(
    getDoc(doc(otherChildFirestore, `offers/${publishedOfferId}`)),
  );
  await assertFails(
    getDocs(
      query(
        collection(childFirestore, 'offers'),
        where('familyId', '==', familyId),
        where('status', '==', 'AWAITING_CHILD'),
      ),
    ),
  );

  const siblingInbox = await assertSucceeds(
    getDocs(inboxQuery(siblingFirestore, familyId, siblingUid)),
  );
  assert(siblingInbox.empty, 'Sibling saw a non-participant Offer');
  const otherFamilyInbox = await assertSucceeds(
    getDocs(inboxQuery(otherChildFirestore, otherFamilyId, otherChildUid)),
  );
  assert(otherFamilyInbox.size === 1, 'Other-family query was not isolated');

  for (const operation of [
    setDoc(doc(childFirestore, 'offers/client-created'), {
      familyId,
      status: 'AWAITING_CHILD',
    }),
    updateDoc(doc(childFirestore, `offers/${publishedOfferId}`), {
      status: 'ACCEPTED',
    }),
    deleteDoc(doc(childFirestore, `offers/${publishedOfferId}`)),
    setDoc(
      doc(
        childFirestore,
        `offers/${publishedOfferId}/revisions/client-created`,
      ),
      { revisionNumber: 3 },
    ),
  ]) {
    await assertFails(operation);
  }

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'offers/inbox-malformed'), {
      familyId,
      parentUid,
      childUid,
      participantUids: [parentUid, childUid],
      status: 'AWAITING_CHILD',
      createdAt: now,
      updatedAt: Timestamp.fromMillis(now.toMillis() + 1),
    });
  });
  let malformedRejected = false;
  try {
    await loadExactCurrentRevisions(childFirestore, familyId, childUid);
  } catch (error) {
    malformedRejected = error.message === 'MALFORMED_OFFER_DATA';
  }
  assert(malformedRejected, 'Malformed Offer data was not rejected');

  console.info(
    'PASS: Child Offer inbox query, exact revision, participant reads, malformed data, and write denial',
  );
} finally {
  if (environment) await environment.cleanup();
  clearTimeout(timeout);
}
