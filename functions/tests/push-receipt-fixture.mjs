import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const { Timestamp } = require('firebase-admin/firestore');
const copy = (value) =>
  value instanceof Timestamp
    ? value
    : Array.isArray(value)
      ? value.map(copy)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, copy(v)]),
          )
        : value;
export function receiptDatabase() {
  const records = new Map();
  let tail = Promise.resolve();
  const doc = (path) => ({
    path,
    id: path.split('/').at(-1),
    parent: {
      parent: path.includes('/') ? { id: path.split('/').at(-3) } : null,
    },
    delete: async () => records.delete(path),
    collection: (name) => query(`${path}/${name}`),
    get: async () => snapshot(path),
  });
  const snapshot = (path) => ({
    ref: doc(path),
    id: path.split('/').at(-1),
    exists: records.has(path),
    data: () => copy(records.get(path)),
  });
  const number = (v) => (v instanceof Timestamp ? v.toMillis() : v);
  function query(path, filters = [], sort, count = Infinity, cursor) {
    return {
      doc: (id) => doc(`${path}/${id}`),
      where: (...filter) =>
        query(path, [...filters, filter], sort, count, cursor),
      orderBy: (field) =>
        query(
          path,
          filters,
          field === '__name__' ? sort : field,
          count,
          cursor,
        ),
      limit: (limit) => query(path, filters, sort, limit, cursor),
      startAfter: (snapshot, ref) =>
        query(
          path,
          filters,
          sort,
          count,
          ref ? { id: ref.id, data: () => ({ [sort]: snapshot }) } : snapshot,
        ),
      get: async () => {
        let docs = [...records.keys()]
          .filter((key) =>
            path.startsWith('__group_')
              ? key.split('/').at(-2) === path.slice(8)
              : key.startsWith(`${path}/`) &&
                key.split('/').length === path.split('/').length + 1,
          )
          .map(snapshot)
          .filter((snap) =>
            filters.every(([field, op, value]) =>
              op === 'array-contains'
                ? Array.isArray(snap.data()[field]) &&
                  snap.data()[field].includes(value)
                : op === '=='
                  ? snap.data()[field] === value
                  : op === '>'
                    ? number(
                        field === '__name__' ? snap.id : snap.data()[field],
                      ) > number(field === '__name__' ? value.id : value)
                    : number(snap.data()[field]) <= number(value),
            ),
          );
        if (sort)
          docs.sort(
            (a, b) =>
              number(a.data()[sort]) - number(b.data()[sort]) ||
              a.id.localeCompare(b.id),
          );
        if (cursor)
          docs = docs.filter(
            (d) =>
              number(d.data()[sort]) > number(cursor.data()[sort]) ||
              (number(d.data()[sort]) === number(cursor.data()[sort]) &&
                d.id.localeCompare(cursor.id) > 0),
          );
        docs = docs.slice(0, count);
        return { docs, empty: !docs.length, size: docs.length };
      },
    };
  }
  const db = {
    records,
    doc,
    collection: query,
    collectionGroup: (name) => query(`__group_${name}`),
    recursiveDelete: async (ref) => {
      for (const path of [...records.keys()])
        if (path === ref.path || path.startsWith(`${ref.path}/`))
          records.delete(path);
    },
    batch: () => {
      const changes = [];
      return {
        delete: (ref) => changes.push(() => records.delete(ref.path)),
        commit: async () => changes.forEach((change) => change()),
      };
    },
    runTransaction: (callback) => {
      const run = tail.then(async () => {
        const changes = [];
        const write = (ref, value, merge) =>
          changes.push(() =>
            records.set(
              ref.path,
              copy(merge ? { ...records.get(ref.path), ...value } : value),
            ),
          );
        const tx = {
          get: async (ref) => (ref.path ? snapshot(ref.path) : ref.get()),
          set: (ref, value) => write(ref, value, false),
          update: (ref, value) => write(ref, value, true),
          create: (ref, value) => {
            if (records.has(ref.path)) throw Error('ALREADY_EXISTS');
            write(ref, value, false);
          },
        };
        const result = await callback(tx);
        changes.forEach((change) => change());
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return db;
}
export function seedNotification(db, eventId = 'event') {
  db.records.set(`activityEvents/${eventId}`, {
    type: 'OFFER_PUBLISHED',
    entityType: 'OFFER',
    entityId: 'offer',
    revisionId: 'revision',
    familyId: 'family',
    actorUid: 'parent',
    actorType: 'PARENT',
  });
  db.records.set('offers/offer', {
    familyId: 'family',
    parentUid: 'parent',
    childUid: 'child',
  });
  db.records.set('offers/offer/revisions/revision', {
    proposedByUid: 'parent',
    proposedByRole: 'PARENT',
  });
  db.records.set('families/family/members/child', {
    status: 'ACTIVE',
    role: 'CHILD',
  });
  for (const id of ['a', 'b'])
    db.records.set(`users/child/devices/${id}`, {
      appVariant: 'CHILD',
      expoPushToken: `ExponentPushToken[${id}]`,
      pushEnabled: true,
      lastSeenAt: Timestamp.fromMillis(1),
    });
}
