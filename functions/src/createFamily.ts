import { createHash } from 'node:crypto';
import {
  createFamilyInputSchema,
  createFamilyOutputSchema,
  familyCommandErrorCodes,
  userProfileSchema,
  type CreateFamilyInput,
  type CreateFamilyOutput,
  type FamilyCommandErrorCode,
  type UserProfile,
} from '@chorex/domain';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'createFamily';

interface IdempotencyRecord {
  command: typeof commandName;
  uid: string;
  payloadHash: string;
  familyId: string;
}

export class CreateFamilyCommandError extends Error {
  constructor(readonly code: FamilyCommandErrorCode) {
    super(code);
    this.name = 'CreateFamilyCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseTimestamp(value: unknown): string {
  if (!(value instanceof Timestamp)) throw new Error('INVALID_TIMESTAMP');
  return value.toDate().toISOString();
}

function parseUserProfile(
  uid: string,
  snapshot: DocumentSnapshot<DocumentData>,
): UserProfile {
  const data = snapshot.data();
  if (!snapshot.exists || !data) throw new Error('PROFILE_NOT_FOUND');
  return userProfileSchema.parse({
    uid,
    displayName: data.displayName,
    accountType: data.accountType,
    createdAt: parseTimestamp(data.createdAt),
  });
}

function parseIdempotencyRecord(
  data: DocumentData | undefined,
): IdempotencyRecord {
  if (
    !data ||
    data.command !== commandName ||
    typeof data.uid !== 'string' ||
    typeof data.payloadHash !== 'string' ||
    typeof data.familyId !== 'string'
  ) {
    throw new Error('INVALID_IDEMPOTENCY_RECORD');
  }
  return {
    command: commandName,
    uid: data.uid,
    payloadHash: data.payloadHash,
    familyId: data.familyId,
  };
}

function parseInput(rawInput: unknown): CreateFamilyInput {
  const result = createFamilyInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new CreateFamilyCommandError(familyCommandErrorCodes.invalidInput);
  }
  return result.data;
}

function payloadHash(input: CreateFamilyInput): string {
  return hash(
    JSON.stringify({
      displayName: input.displayName,
      familyName: input.familyName,
    }),
  );
}

function idempotencyDocumentId(uid: string): string {
  return hash(`${commandName}:${uid}`);
}

export async function executeCreateFamily(
  firestore: Firestore,
  uid: string,
  rawInput: unknown,
): Promise<CreateFamilyOutput> {
  const input = parseInput(rawInput);
  const requestHash = payloadHash(input);
  const profileReference = firestore.doc(`users/${uid}`);
  const familyReference = firestore.collection('families').doc();
  const activityReference = firestore.collection('activityEvents').doc();
  const idempotencyReference = firestore.doc(
    `idempotency/${idempotencyDocumentId(uid)}`,
  );

  const familyId = await firestore.runTransaction(async (transaction) => {
    const idempotencySnapshot = await transaction.get(idempotencyReference);
    if (idempotencySnapshot.exists) {
      const record = parseIdempotencyRecord(idempotencySnapshot.data());
      if (record.uid !== uid || record.payloadHash !== requestHash) {
        throw new CreateFamilyCommandError(
          familyCommandErrorCodes.idempotencyConflict,
        );
      }
      return record.familyId;
    }

    const profileSnapshot = await transaction.get(profileReference);
    let memberDisplayName = input.displayName;
    if (profileSnapshot.exists) {
      const profile = parseUserProfile(uid, profileSnapshot);
      if (profile.accountType !== 'PARENT') {
        throw new CreateFamilyCommandError(
          familyCommandErrorCodes.wrongActorRole,
        );
      }
      memberDisplayName = profile.displayName;
    }

    const timestamp = FieldValue.serverTimestamp();
    if (!profileSnapshot.exists) {
      transaction.create(profileReference, {
        displayName: input.displayName,
        accountType: 'PARENT',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    transaction.create(familyReference, {
      name: input.familyName,
      createdBy: uid,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.create(familyReference.collection('members').doc(uid), {
      role: 'PARENT',
      displayName: memberDisplayName,
      status: 'ACTIVE',
      joinedAt: timestamp,
    });
    transaction.create(activityReference, {
      familyId: familyReference.id,
      actorUid: uid,
      actorType: 'PARENT',
      type: 'FAMILY_CREATED',
      entityType: 'FAMILY',
      entityId: familyReference.id,
      createdAt: timestamp,
    });
    transaction.create(idempotencyReference, {
      command: commandName,
      uid,
      payloadHash: requestHash,
      familyId: familyReference.id,
      activityEventId: activityReference.id,
      completedAt: timestamp,
    });
    return familyReference.id;
  });

  const [profileSnapshot, familySnapshot, membershipSnapshot] =
    await firestore.getAll(
      profileReference,
      firestore.doc(`families/${familyId}`),
      firestore.doc(`families/${familyId}/members/${uid}`),
    );
  const profile = parseUserProfile(uid, profileSnapshot);
  const familyData = familySnapshot.data();
  const membershipData = membershipSnapshot.data();
  if (!familySnapshot.exists || !familyData)
    throw new Error('FAMILY_NOT_FOUND');
  if (!membershipSnapshot.exists || !membershipData) {
    throw new Error('MEMBERSHIP_NOT_FOUND');
  }

  return createFamilyOutputSchema.parse({
    profile,
    family: {
      id: familyId,
      name: familyData.name,
      createdBy: familyData.createdBy,
      createdAt: parseTimestamp(familyData.createdAt),
      updatedAt: parseTimestamp(familyData.updatedAt),
    },
    membership: {
      uid,
      familyId,
      role: membershipData.role,
      displayName: membershipData.displayName,
      status: membershipData.status,
      joinedAt: parseTimestamp(membershipData.joinedAt),
    },
  });
}
