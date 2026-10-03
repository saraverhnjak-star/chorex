import { createHash } from 'node:crypto';
import {
  createChildInputSchema,
  createChildOutputSchema,
  familyCommandErrorCodes,
  type CreateChildInput,
  type CreateChildOutput,
  type FamilyCommandErrorCode,
} from '@chorex/domain';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'createChild';

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  familyId: string;
  payloadHash: string;
  childUid: string;
  activityEventId: string;
  status: 'PENDING' | 'COMPLETE';
}

export class CreateChildCommandError extends Error {
  constructor(readonly code: FamilyCommandErrorCode) {
    super(code);
    this.name = 'CreateChildCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseTimestamp(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}

function parseInput(rawInput: unknown): CreateChildInput {
  const result = createChildInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new CreateChildCommandError(familyCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function requestPayloadHash(input: CreateChildInput): string {
  return hash(
    JSON.stringify({
      familyId: input.familyId,
      displayName: input.displayName,
    }),
  );
}

function idempotencyDocumentId(actorUid: string, key: string): string {
  return hash(`${commandName}:${actorUid}:${key}`);
}

function childUid(actorUid: string, familyId: string, key: string): string {
  return `child_${hash(`${commandName}:${actorUid}:${familyId}:${key}`)}`;
}

function parseIdempotencyRecord(
  data: DocumentData | undefined,
): IdempotencyRecord {
  if (
    !data ||
    data.command !== commandName ||
    typeof data.actorUid !== 'string' ||
    typeof data.familyId !== 'string' ||
    typeof data.payloadHash !== 'string' ||
    typeof data.childUid !== 'string' ||
    typeof data.activityEventId !== 'string' ||
    (data.status !== 'PENDING' && data.status !== 'COMPLETE')
  ) {
    throw new Error('INVALID_IDEMPOTENCY_RECORD');
  }
  return {
    command: commandName,
    actorUid: data.actorUid,
    familyId: data.familyId,
    payloadHash: data.payloadHash,
    childUid: data.childUid,
    activityEventId: data.activityEventId,
    status: data.status,
  };
}

function parseFamilyIds(data: DocumentData | undefined): string[] {
  if (!data || data.familyIds === undefined) return [];
  if (
    !Array.isArray(data.familyIds) ||
    data.familyIds.some(
      (familyId: unknown) => typeof familyId !== 'string' || !familyId,
    ) ||
    new Set(data.familyIds).size !== data.familyIds.length
  ) {
    throw new Error('INVALID_FAMILY_IDS_PROJECTION');
  }
  return data.familyIds;
}

function requireMatchingRequest(
  record: IdempotencyRecord,
  actorUid: string,
  familyId: string,
  payloadHash: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.familyId !== familyId ||
    record.payloadHash !== payloadHash
  ) {
    throw new CreateChildCommandError(
      familyCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveParentMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE') {
    throw new CreateChildCommandError(
      familyCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'PARENT') {
    throw new CreateChildCommandError(familyCommandErrorCodes.wrongActorRole);
  }
}

function readProviderErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

async function ensureChildAuthUser(
  auth: Auth,
  uid: string,
  displayName: string,
): Promise<UserRecord> {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (readProviderErrorCode(error) !== 'auth/user-not-found') throw error;
  }

  try {
    return await auth.createUser({ uid, displayName });
  } catch (error) {
    if (readProviderErrorCode(error) === 'auth/uid-already-exists') {
      return auth.getUser(uid);
    }
    throw error;
  }
}

export async function executeCreateChild(
  firestore: Firestore,
  auth: Auth,
  actorUid: string,
  rawInput: unknown,
): Promise<CreateChildOutput> {
  const input = parseInput(rawInput);
  const payloadHash = requestPayloadHash(input);
  const derivedChildUid = childUid(
    actorUid,
    input.familyId,
    input.idempotencyKey,
  );
  const activityEventId = hash(
    `${commandName}:activity:${actorUid}:${input.idempotencyKey}`,
  );
  const idempotencyReference = firestore.doc(
    `idempotency/${idempotencyDocumentId(actorUid, input.idempotencyKey)}`,
  );
  const actorMembershipReference = firestore.doc(
    `families/${input.familyId}/members/${actorUid}`,
  );

  await firestore.runTransaction(async (transaction) => {
    const [idempotencySnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(idempotencyReference),
      transaction.get(actorMembershipReference),
    ]);
    if (idempotencySnapshot.exists) {
      const record = parseIdempotencyRecord(idempotencySnapshot.data());
      requireMatchingRequest(record, actorUid, input.familyId, payloadHash);
      requireActiveParentMembership(membershipSnapshot.data());
      return;
    }
    requireActiveParentMembership(membershipSnapshot.data());
    transaction.create(idempotencyReference, {
      command: commandName,
      actorUid,
      familyId: input.familyId,
      payloadHash,
      childUid: derivedChildUid,
      activityEventId,
      status: 'PENDING',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  const authUser = await ensureChildAuthUser(
    auth,
    derivedChildUid,
    input.displayName,
  );
  if (authUser.email || authUser.providerData.length > 0) {
    throw new Error('INVALID_CHILD_AUTH_IDENTITY');
  }

  const profileReference = firestore.doc(`users/${derivedChildUid}`);
  const childMembershipReference = firestore.doc(
    `families/${input.familyId}/members/${derivedChildUid}`,
  );
  const activityReference = firestore.doc(`activityEvents/${activityEventId}`);

  await firestore.runTransaction(async (transaction) => {
    const [idempotencySnapshot, membershipSnapshot, profileSnapshot] =
      await Promise.all([
        transaction.get(idempotencyReference),
        transaction.get(actorMembershipReference),
        transaction.get(profileReference),
      ]);
    requireActiveParentMembership(membershipSnapshot.data());
    const record = parseIdempotencyRecord(idempotencySnapshot.data());
    requireMatchingRequest(record, actorUid, input.familyId, payloadHash);
    if (record.status === 'COMPLETE') {
      const profileData = profileSnapshot.data();
      if (
        !profileSnapshot.exists ||
        !profileData ||
        profileData.accountType !== 'CHILD'
      ) {
        throw new Error('INVALID_CHILD_PROFILE');
      }
      if (!parseFamilyIds(profileData).includes(input.familyId)) {
        transaction.update(profileReference, {
          familyIds: FieldValue.arrayUnion(input.familyId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }
    if (
      record.childUid !== derivedChildUid ||
      record.activityEventId !== activityEventId
    ) {
      throw new Error('INVALID_IDEMPOTENCY_RECORD');
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.create(profileReference, {
      displayName: input.displayName,
      accountType: 'CHILD',
      familyIds: [input.familyId],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.create(childMembershipReference, {
      role: 'CHILD',
      displayName: input.displayName,
      status: 'ACTIVE',
      joinedAt: timestamp,
    });
    transaction.create(activityReference, {
      familyId: input.familyId,
      actorUid,
      actorType: 'PARENT',
      type: 'CHILD_CREATED',
      entityType: 'USER',
      entityId: derivedChildUid,
      createdAt: timestamp,
    });
    transaction.update(idempotencyReference, {
      status: 'COMPLETE',
      completedAt: timestamp,
    });
  });

  const [profileSnapshot, membershipSnapshot] = await firestore.getAll(
    profileReference,
    childMembershipReference,
  );
  const profileData = profileSnapshot.data();
  const membershipData = membershipSnapshot.data();
  if (!profileSnapshot.exists || !profileData) {
    throw new Error('CHILD_PROFILE_NOT_FOUND');
  }
  if (!membershipSnapshot.exists || !membershipData) {
    throw new Error('CHILD_MEMBERSHIP_NOT_FOUND');
  }

  return createChildOutputSchema.parse({
    profile: {
      uid: derivedChildUid,
      displayName: profileData.displayName,
      accountType: profileData.accountType,
      createdAt: parseTimestamp(profileData.createdAt),
    },
    membership: {
      uid: derivedChildUid,
      familyId: input.familyId,
      role: membershipData.role,
      displayName: membershipData.displayName,
      status: membershipData.status,
      joinedAt: parseTimestamp(membershipData.joinedAt),
    },
  });
}
