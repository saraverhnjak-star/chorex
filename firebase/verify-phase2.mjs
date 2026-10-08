import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT;
if (!['chorex-dev', 'chorex-phase2-test'].includes(projectId)) {
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
  console.error('FAIL: Phase 2 emulator verification timed out');
  process.exit(1);
}, 180_000);
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
  const url = `http://${emulatorHosts.functions}/${projectId}/us-central1/${name}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Callable ${name} returned ${response.status} from ${url}: ${responseText}`,
    );
  }
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

async function allAdmin(collectionPath) {
  let snapshot;
  await withAdmin(async (firestore) => {
    snapshot = await getDocs(collection(firestore, collectionPath));
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
          description: 'Before dinner',
          targetCount: 2,
        },
      ],
      reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' },
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

const requireFunctions = createRequire(
  new URL('../functions/package.json', import.meta.url),
);
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { dispatchNegotiationNotification } = requireFunctions(
  './lib/negotiationNotifications.js',
);
const unsubscriptions = [];
let fakeApp;

async function waitFor(check, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}

try {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: emulatorAddress(emulatorHosts.firestore),
  });
  const parent = await createIdentity('phase2-parent');
  const child = await createIdentity('phase2-child');
  const outsider = await createIdentity('phase2-outsider');
  const family = await callFunction(
    'createFamily',
    { displayName: 'Parent', familyName: 'Phase 2' },
    parent.idToken,
  );
  const familyId = family.family.id;
  await withAdmin(async (db) => {
    await setDoc(doc(db, `families/${familyId}/members/${child.localId}`), {
      role: 'CHILD',
      status: 'ACTIVE',
      displayName: 'Child',
      joinedAt: Timestamp.now(),
    });
    for (const [identity, role] of [
      [parent, 'PARENT'],
      [child, 'CHILD'],
    ]) {
      await setDoc(doc(db, `users/${identity.localId}/devices/active`), {
        pushEnabled: true,
        expoPushToken: `ExponentPushToken[${role}-phase2]`,
        appVariant: role,
        platform: 'ios',
        appVersion: 'test',
        createdAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
      });
      await setDoc(doc(db, `users/${identity.localId}/devices/disabled`), {
        pushEnabled: false,
        expoPushToken: 'ExponentPushToken[disabled]',
        appVariant: role,
      });
    }
  });
  const parentDb = environment.authenticatedContext(parent.localId).firestore();
  const childDb = environment.authenticatedContext(child.localId).firestore();
  const waiting = { PARENT: [], CHILD: [] };
  for (const [db, uid, role] of [
    [parentDb, parent.localId, 'PARENT'],
    [childDb, child.localId, 'CHILD'],
  ]) {
    const constraints = [
      where('familyId', '==', familyId),
      where('participantUids', 'array-contains', uid),
      where(
        'status',
        '==',
        role === 'PARENT' ? 'AWAITING_PARENT' : 'AWAITING_CHILD',
      ),
      orderBy('updatedAt', 'desc'),
    ];
    if (role === 'PARENT') constraints.push(where('parentUid', '==', uid));
    unsubscriptions.push(
      onSnapshot(
        query(collection(db, 'offers'), ...constraints),
        (snapshot) => {
          waiting[role] = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));
        },
        (error) => {
          throw error;
        },
      ),
    );
  }
  async function bothSee(offerId, revisionId) {
    for (const db of [parentDb, childDb]) {
      const offer = (await getDoc(doc(db, `offers/${offerId}`))).data();
      assert(
        offer.currentRevisionId === revisionId,
        'Participants disagree on current revision',
      );
      await assertSucceeds(
        getDoc(doc(db, `offers/${offerId}/revisions/${revisionId}`)),
      );
    }
  }
  async function effects(offerId) {
    const events = (await allAdmin('activityEvents')).docs.filter(
      (d) => d.data().entityId === offerId,
    );
    const relevant = events.filter((d) =>
      ['OFFER_PUBLISHED', 'OFFER_COUNTERED', 'OFFER_ACCEPTED'].includes(
        d.data().type,
      ),
    );
    for (const event of relevant)
      await waitFor(
        async () =>
          (await readAdmin(`${event.ref.path}/notificationEffects/expo`)).data()
            ?.status === 'COMPLETE',
        'committed notification effect',
      );
    return Promise.all(
      relevant.map(async (event) => ({
        event: event.data(),
        effect: (
          await readAdmin(`${event.ref.path}/notificationEffects/expo`)
        ).data(),
      })),
    );
  }
  async function assertEffects(offerId, expected) {
    const work = await effects(offerId);
    assert(
      work.length === expected.length,
      'Duplicate or missing logical effects',
    );
    for (const [type, actorType, recipientUid] of expected) {
      const effect = work.find(
        (w) => w.event.type === type && w.event.actorType === actorType,
      );
      assert(
        effect?.effect.recipientUid === recipientUid &&
          effect.effect.deviceCount === 1,
        'Notification recipient/device filtering incorrect',
      );
      assert(
        Object.keys(effect.effect.data).sort().join(',') ===
          'entityId,entityType,familyId,type',
        'Notification leaked extra payload fields',
      );
      assert(
        effect.effect.data.type === type &&
          effect.effect.data.familyId === familyId,
        'Notification routing incorrect',
      );
      assert(
        effect.effect.data.entityType ===
          (type === 'OFFER_ACCEPTED' ? 'CONTRACT' : 'OFFER'),
        'Notification entity type incorrect',
      );
    }
  }
  async function newPublished(key) {
    const draft = await createDraft(
      parent,
      familyId,
      child.localId,
      `${key}-draft`,
    );
    await publish(parent, draft, `${key}-publish`);
    await waitFor(
      () => waiting.CHILD.some((o) => o.id === draft.offer.id),
      'Child waiting inbox publication',
    );
    await bothSee(draft.offer.id, draft.revision.id);
    return draft;
  }
  async function counter(identity, offerId, revisionId, key, terms = {}) {
    return callFunction(
      'counterOffer',
      {
        offerId,
        currentRevisionId: revisionId,
        reward: {
          title: 'Private reward title',
          description: 'Private reward description',
          type: 'CUSTOM',
          iconKey: 'gift',
        },
        note: 'Private note',
        ...terms,
        idempotencyKey: key,
      },
      identity.idToken,
    );
  }
  async function accept(identity, source, key) {
    const input = {
      offerId: source.offer.id,
      currentRevisionId: source.revision.id,
      idempotencyKey: key,
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        callFunction('acceptOffer', input, identity.idToken),
      ),
    );
    assert(
      results.every((r) => JSON.stringify(r) === JSON.stringify(results[0])),
      'Acceptance retry changed canonical Contract',
    );
    const result = results[0];
    assert(
      result.offer.status === 'ACCEPTED' &&
        result.contract.status === 'ACTIVE' &&
        result.contract.reviewCycle === 0,
      'Incorrect accepted state',
    );
    assert(
      result.contract.source.revisionId === source.revision.id,
      'Contract source wrong',
    );
    assert(
      JSON.stringify(normalized(result.contract.rewardTerms)) ===
        JSON.stringify(normalized(source.revision.reward)) &&
        result.contract.deadlineAt === source.revision.deadlineAt,
      'Contract reward/deadline snapshot changed',
    );
    assert(
      JSON.stringify(
        normalized(
          result.tasks.map(({ title, description, targetCount }) => ({
            title,
            ...(description ? { description } : {}),
            targetCount,
          })),
        ),
      ) === JSON.stringify(normalized(source.revision.tasks)),
      'Task snapshot changed',
    );
    const contracts = (await allAdmin('contracts')).docs.filter(
      (d) => d.data().source?.offerId === source.offer.id,
    );
    assert(contracts.length === 1, 'Duplicate Contracts');
    assert((await allAdmin('rewards')).empty, 'Preapproval Reward exists');
    await bothSee(source.offer.id, source.revision.id);
    return result;
  }
  const direct = await newPublished('phase2-direct');
  await expectCallableError('FAMILY_MEMBERSHIP_REQUIRED', () =>
    callFunction(
      'acceptOffer',
      {
        offerId: direct.offer.id,
        currentRevisionId: direct.revision.id,
        idempotencyKey: 'outsider',
      },
      outsider.idToken,
    ),
  );
  await expectCallableError('WRONG_ACTOR_ROLE', () =>
    callFunction(
      'acceptOffer',
      {
        offerId: direct.offer.id,
        currentRevisionId: direct.revision.id,
        idempotencyKey: 'wrong-role',
      },
      parent.idToken,
    ),
  );
  await expectCallableError('INVALID_INPUT', () =>
    callFunction(
      'publishOffer',
      {
        offerId: direct.offer.id,
        currentRevisionId: direct.revision.id,
        idempotencyKey: 'choose-recipient',
        recipientUid: outsider.localId,
      },
      parent.idToken,
    ),
  );
  const acceptedDirect = await accept(child, direct, 'direct-accept');
  await assertEffects(direct.offer.id, [
    ['OFFER_PUBLISHED', 'PARENT', child.localId],
    ['OFFER_ACCEPTED', 'CHILD', parent.localId],
  ]);
  const acceptanceWork = await effects(direct.offer.id);
  assert(
    acceptanceWork.find((w) => w.event.type === 'OFFER_ACCEPTED').effect.data
      .entityId === acceptedDirect.contract.id,
    'Acceptance did not route to committed Contract',
  );

  const parentAccept = await newPublished('phase2-parent-accept');
  const childProposal = await counter(
    child,
    parentAccept.offer.id,
    parentAccept.revision.id,
    'child-proposal',
  );
  await waitFor(
    () =>
      waiting.PARENT.some(
        (o) =>
          o.id === parentAccept.offer.id &&
          o.currentRevisionId === childProposal.revision.id,
      ),
    'Parent current Child proposal',
  );
  await bothSee(parentAccept.offer.id, childProposal.revision.id);
  await accept(parent, childProposal, 'parent-accept');
  await waitFor(
    () => !waiting.PARENT.some((o) => o.id === parentAccept.offer.id),
    'Parent accepted removal',
  );
  await assertEffects(parentAccept.offer.id, [
    ['OFFER_PUBLISHED', 'PARENT', child.localId],
    ['OFFER_COUNTERED', 'CHILD', parent.localId],
    ['OFFER_ACCEPTED', 'PARENT', child.localId],
  ]);

  const rounds = await newPublished('phase2-rounds');
  const rev2 = await counter(
    child,
    rounds.offer.id,
    rounds.revision.id,
    'rounds-child',
  );
  const prior = await Promise.all(
    [rounds.revision.id, rev2.revision.id].map(async (id) =>
      normalized(
        (await readAdmin(`offers/${rounds.offer.id}/revisions/${id}`)).data(),
      ),
    ),
  );
  const parentTerms = {
    tasks: [
      {
        title: 'Changed task',
        description: 'Private task description',
        targetCount: 3,
      },
    ],
    deadlineAt: new Date(Date.now() + 48 * 3600000).toISOString(),
  };
  const rev3Input = {
    offerId: rounds.offer.id,
    currentRevisionId: rev2.revision.id,
    reward: { title: 'New reward', type: 'CUSTOM', iconKey: 'gift' },
    ...parentTerms,
    idempotencyKey: 'rounds-parent',
  };
  const revisions = await Promise.all(
    Array.from({ length: 3 }, () =>
      callFunction('counterOffer', rev3Input, parent.idToken),
    ),
  );
  assert(
    revisions.every((r) => JSON.stringify(r) === JSON.stringify(revisions[0])),
    'Counter retry duplicated revision',
  );
  const rev3 = revisions[0];
  await waitFor(
    () =>
      waiting.CHILD.some(
        (o) =>
          o.id === rounds.offer.id && o.currentRevisionId === rev3.revision.id,
      ),
    'Child sees Parent revision 3',
  );
  await bothSee(rounds.offer.id, rev3.revision.id);
  await expectCallableError('STALE_REVISION', () =>
    callFunction(
      'acceptOffer',
      {
        offerId: rounds.offer.id,
        currentRevisionId: rounds.revision.id,
        idempotencyKey: 'stale-child-accept',
      },
      child.idToken,
    ),
  );
  await accept(child, rev3, 'rounds-accept');
  for (const [index, id] of [rounds.revision.id, rev2.revision.id].entries())
    assert(
      JSON.stringify(
        normalized(
          (await readAdmin(`offers/${rounds.offer.id}/revisions/${id}`)).data(),
        ),
      ) === JSON.stringify(prior[index]),
      'Earlier revision mutated',
    );
  assert(
    (await allAdmin(`offers/${rounds.offer.id}/revisions`)).size === 3,
    'Branching negotiation history',
  );
  await assertEffects(rounds.offer.id, [
    ['OFFER_PUBLISHED', 'PARENT', child.localId],
    ['OFFER_COUNTERED', 'CHILD', parent.localId],
    ['OFFER_COUNTERED', 'PARENT', child.localId],
    ['OFFER_ACCEPTED', 'CHILD', parent.localId],
  ]);

  for (const role of ['CHILD', 'PARENT']) {
    const draft = await newPublished(`phase2-reject-${role}`);
    const source =
      role === 'PARENT'
        ? await counter(
            child,
            draft.offer.id,
            draft.revision.id,
            'parent-reject-source',
          )
        : draft;
    await callFunction(
      'rejectOffer',
      {
        offerId: draft.offer.id,
        currentRevisionId: source.revision.id,
        idempotencyKey: `reject-${role}`,
      },
      (role === 'PARENT' ? parent : child).idToken,
    );
    assert(
      (await readAdmin(`offers/${draft.offer.id}`)).data().status ===
        'REJECTED',
      'Rejection state incorrect',
    );
    assert(
      !(await allAdmin('contracts')).docs.some(
        (d) => d.data().source?.offerId === draft.offer.id,
      ),
      'Rejection created Contract',
    );
    await effects(draft.offer.id);
    const rejectEvent = (await allAdmin('activityEvents')).docs.find(
      (d) =>
        d.data().entityId === draft.offer.id &&
        d.data().type === 'OFFER_REJECTED',
    );
    assert(
      !(
        await readAdmin(`${rejectEvent.ref.path}/notificationEffects/expo`)
      ).exists(),
      'Invented rejection notification',
    );
  }

  // Cross-command races: only the winning committed transition has notification work.
  for (const competitor of ['counterOffer', 'rejectOffer']) {
    const draft = await newPublished(`phase2-race-${competitor}`);
    const childTerms = await counter(
      child,
      draft.offer.id,
      draft.revision.id,
      `phase2-race-${competitor}-child`,
    );
    const base = {
      offerId: draft.offer.id,
      currentRevisionId: childTerms.revision.id,
    };
    const results = await Promise.allSettled([
      callFunction(
        'acceptOffer',
        { ...base, idempotencyKey: `phase2-race-${competitor}-accept` },
        parent.idToken,
      ),
      callFunction(
        competitor,
        {
          ...base,
          idempotencyKey: `phase2-race-${competitor}-other`,
          ...(competitor === 'counterOffer'
            ? {
                tasks: childTerms.revision.tasks,
                deadlineAt: childTerms.revision.deadlineAt,
                reward: {
                  title: 'Other terms',
                  type: 'CUSTOM',
                  iconKey: 'gift',
                },
              }
            : {}),
        },
        parent.idToken,
      ),
    ]);
    assert(
      results.filter((r) => r.status === 'fulfilled').length === 1,
      'Multiple race winners',
    );
    const committed = (await readAdmin(`offers/${draft.offer.id}`)).data();
    const work = await effects(draft.offer.id);
    assert(
      work.length === (committed.status === 'REJECTED' ? 2 : 3),
      'Notification work exists for a failed race transition',
    );
    const finalType =
      committed.status === 'ACCEPTED'
        ? 'OFFER_ACCEPTED'
        : committed.status === 'AWAITING_CHILD'
          ? 'OFFER_COUNTERED'
          : 'OFFER_REJECTED';
    const events = (await allAdmin('activityEvents')).docs.filter(
      (d) =>
        d.data().entityId === draft.offer.id &&
        d.data().actorType === 'PARENT' &&
        d.data().type !== 'OFFER_PUBLISHED',
    );
    assert(
      events.length === 1 && events[0].data().type === finalType,
      'Duplicate winner activity or illegal race outcome',
    );
    const contracts = (await allAdmin('contracts')).docs.filter(
      (d) => d.data().source?.offerId === draft.offer.id,
    );
    assert(
      contracts.length === (committed.status === 'ACCEPTED' ? 1 : 0),
      'Race duplicated Contract or created one after rejection',
    );
    assert(
      (await allAdmin(`offers/${draft.offer.id}/revisions`)).size ===
        (committed.status === 'AWAITING_CHILD' ? 3 : 2),
      'Race branched negotiation',
    );
  }

  // Test dispatcher transport failures in a separate emulator-only project so the real trigger cannot race the injected fake.
  fakeApp = initializeApp(
    { projectId: `${projectId}-notification-fakes` },
    'phase2-notification-fakes',
  );
  const fakeDb = getFirestore(fakeApp);
  const eventId = 'fake-published';
  await fakeDb.doc('offers/offer').set({
    familyId: 'family',
    parentUid: 'parent',
    childUid: 'child',
    status: 'AWAITING_CHILD',
  });
  await fakeDb
    .doc('offers/offer/revisions/revision')
    .set({ proposedByUid: 'parent', proposedByRole: 'PARENT' });
  await fakeDb
    .doc('families/family/members/child')
    .set({ role: 'CHILD', status: 'ACTIVE' });
  const eventData = {
    type: 'OFFER_PUBLISHED',
    actorType: 'PARENT',
    actorUid: 'parent',
    entityType: 'OFFER',
    entityId: 'offer',
    revisionId: 'revision',
    familyId: 'family',
  };
  let sends = 0;
  const transport = async (messages) => {
    sends += messages.length;
    return messages.map(() => ({ status: 'ok', id: 'fake-ticket' }));
  };
  await dispatchNegotiationNotification(fakeDb, eventId, transport);
  assert(sends === 0, 'Dispatched before committed event');
  await fakeDb
    .runTransaction(async (tx) => {
      tx.set(fakeDb.doc('activityEvents/aborted'), eventData);
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    })
    .catch((error) =>
      assert(
        error.message === 'SIMULATED_TRANSACTION_FAILURE',
        'Wrong failure',
      ),
    );
  await dispatchNegotiationNotification(fakeDb, 'aborted', transport);
  assert(
    !(await fakeDb.doc('activityEvents/aborted/notificationEffects/expo').get())
      .exists && sends === 0,
    'Failed transaction produced notification work',
  );
  await fakeDb.doc(`activityEvents/${eventId}`).set(eventData);
  await dispatchNegotiationNotification(fakeDb, eventId, transport);
  assert(
    sends === 0 &&
      (
        await fakeDb
          .doc(`activityEvents/${eventId}/notificationEffects/expo`)
          .get()
      ).data().status === 'COMPLETE',
    'Missing registrations failed delivery',
  );
  await fakeDb.doc('users/child/devices/disabled').set({
    pushEnabled: false,
    appVariant: 'CHILD',
    expoPushToken: 'ExponentPushToken[disabled]',
  });
  await fakeDb.doc('users/child/devices/active').set({
    pushEnabled: true,
    appVariant: 'CHILD',
    expoPushToken: 'ExponentPushToken[active]',
  });
  await fakeDb.doc('activityEvents/failure').set(eventData);
  await dispatchNegotiationNotification(fakeDb, 'failure', async () => {
    throw new Error('fake failure');
  }).then(
    () => {
      throw new Error('Expected retry');
    },
    (error) =>
      assert(
        error.message === 'NOTIFICATION_DELIVERY_RETRY',
        'Wrong delivery error',
      ),
  );
  assert(
    (await fakeDb.doc('offers/offer').get()).data().status === 'AWAITING_CHILD',
    'Delivery failure changed committed authoritative state',
  );
  await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      dispatchNegotiationNotification(fakeDb, 'failure', transport),
    ),
  );
  await dispatchNegotiationNotification(fakeDb, 'failure', transport);
  assert(
    sends === 1,
    'Duplicate dispatcher invocation sent logical work twice',
  );
  await fakeDb.doc('activityEvents/invalid-token').set(eventData);
  await dispatchNegotiationNotification(
    fakeDb,
    'invalid-token',
    async (messages) =>
      messages.map(() => ({
        status: 'error',
        details: { error: 'DeviceNotRegistered' },
      })),
  );
  assert(
    (await fakeDb.doc('users/child/devices/active').get()).data()
      .pushEnabled === false,
    'Unregistered token not disabled',
  );
  await fakeDb.doc('activityEvents/disabled').set(eventData);
  await dispatchNegotiationNotification(fakeDb, 'disabled', transport);
  assert(sends === 1, 'Disabled token sent');
  await assertFails(
    getDoc(doc(parentDb, `activityEvents/test/notificationEffects/expo`)),
  );
  await assertFails(
    setDoc(doc(parentDb, 'activityEvents/client-event'), eventData),
  );
  assert((await allAdmin('rewards')).empty, 'Phase 2 created Reward');
  console.info(
    'PASS: Phase 2 bilateral realtime negotiation, five notification paths, same-key retries, immutable snapshots/history, stale/authorization failures, rejections without pushes, no preapproval Rewards, event deduplication, disabled/missing devices, and transport failure isolation',
  );
} finally {
  for (const unsubscribe of unsubscriptions) unsubscribe();
  if (fakeApp) await deleteApp(fakeApp);
  if (environment) await environment.cleanup();
  for (const identity of identities)
    await authRequest('delete', { idToken: identity.idToken });
  clearTimeout(timeout);
}
