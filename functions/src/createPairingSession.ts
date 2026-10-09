import { requireAccountActive } from './accountDeletionAuthorization';
import { createHash, randomBytes } from 'node:crypto';
import {
  createPairingSessionInputSchema,
  createPairingSessionOutputSchema,
  pairingCommandErrorCodes,
  type CreatePairingSessionInput,
  type CreatePairingSessionOutput,
  type PairingCommandErrorCode,
} from '@chorex/domain';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const commandName = 'createPairingSession';
const pairingSessionTtlMs = 10 * 60 * 1000;

interface IdempotencyRecord {
  command: typeof commandName;
  actorUid: string;
  familyId: string;
  childUid: string;
  payloadHash: string;
  sessionId: string;
  expiresAt: Timestamp;
}

interface PairingSessionResult {
  sessionId: string;
  expiresAt: Timestamp;
  token?: string;
}

export class CreatePairingSessionCommandError extends Error {
  constructor(readonly code: PairingCommandErrorCode) {
    super(code);
    this.name = 'CreatePairingSessionCommandError';
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseInput(rawInput: unknown): CreatePairingSessionInput {
  const result = createPairingSessionInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new CreatePairingSessionCommandError(
      pairingCommandErrorCodes.invalidInput,
    );
  }
  return result.data;
}

function payloadHash(input: CreatePairingSessionInput): string {
  return hash(
    JSON.stringify({ familyId: input.familyId, childUid: input.childUid }),
  );
}

function idempotencyDocumentId(actorUid: string, key: string): string {
  return hash(`${commandName}:${actorUid}:${key}`);
}

function parseIdempotencyRecord(
  data: DocumentData | undefined,
): IdempotencyRecord {
  if (
    !data ||
    data.command !== commandName ||
    typeof data.actorUid !== 'string' ||
    typeof data.familyId !== 'string' ||
    typeof data.childUid !== 'string' ||
    typeof data.payloadHash !== 'string' ||
    typeof data.sessionId !== 'string' ||
    !(data.expiresAt instanceof Timestamp)
  ) {
    throw new Error('INVALID_IDEMPOTENCY_RECORD');
  }
  return {
    command: commandName,
    actorUid: data.actorUid,
    familyId: data.familyId,
    childUid: data.childUid,
    payloadHash: data.payloadHash,
    sessionId: data.sessionId,
    expiresAt: data.expiresAt,
  };
}

function requireMatchingRequest(
  record: IdempotencyRecord,
  actorUid: string,
  input: CreatePairingSessionInput,
  requestHash: string,
): void {
  if (
    record.actorUid !== actorUid ||
    record.familyId !== input.familyId ||
    record.childUid !== input.childUid ||
    record.payloadHash !== requestHash
  ) {
    throw new CreatePairingSessionCommandError(
      pairingCommandErrorCodes.idempotencyConflict,
    );
  }
}

function requireActiveParentMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE') {
    throw new CreatePairingSessionCommandError(
      pairingCommandErrorCodes.familyMembershipRequired,
    );
  }
  if (data.role !== 'PARENT') {
    throw new CreatePairingSessionCommandError(
      pairingCommandErrorCodes.wrongActorRole,
    );
  }
}

function requireActiveChildMembership(data: DocumentData | undefined): void {
  if (!data || data.status !== 'ACTIVE' || data.role !== 'CHILD') {
    throw new CreatePairingSessionCommandError(
      pairingCommandErrorCodes.childMembershipRequired,
    );
  }
}

function serializeResult(
  result: PairingSessionResult,
): CreatePairingSessionOutput {
  return createPairingSessionOutputSchema.parse({
    sessionId: result.sessionId,
    expiresAt: result.expiresAt.toDate().toISOString(),
    ...(result.token ? { token: result.token } : {}),
  });
}

export async function executeCreatePairingSession(
  firestore: Firestore,
  actorUid: string,
  rawInput: unknown,
): Promise<CreatePairingSessionOutput> {
  const input = parseInput(rawInput);
  const requestHash = payloadHash(input);
  const plaintextToken = randomBytes(16).toString('base64url');
  const tokenHash = hash(plaintextToken);
  const createdAt = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    createdAt.toMillis() + pairingSessionTtlMs,
  );
  const sessionReference = firestore.collection('pairingSessions').doc();
  const activityReference = firestore.collection('activityEvents').doc();
  const idempotencyReference = firestore.doc(
    `idempotency/${idempotencyDocumentId(actorUid, input.idempotencyKey)}`,
  );
  const parentMembershipReference = firestore.doc(
    `families/${input.familyId}/members/${actorUid}`,
  );
  const childMembershipReference = firestore.doc(
    `families/${input.familyId}/members/${input.childUid}`,
  );

  const result = await firestore.runTransaction<PairingSessionResult>(
    async (transaction) => {
      await requireAccountActive(firestore, transaction, actorUid);
      const [
        idempotencySnapshot,
        parentMembershipSnapshot,
        childMembershipSnapshot,
      ] = await Promise.all([
        transaction.get(idempotencyReference),
        transaction.get(parentMembershipReference),
        transaction.get(childMembershipReference),
      ]);

      if (idempotencySnapshot.exists) {
        const record = parseIdempotencyRecord(idempotencySnapshot.data());
        requireMatchingRequest(record, actorUid, input, requestHash);
        requireActiveParentMembership(parentMembershipSnapshot.data());
        requireActiveChildMembership(childMembershipSnapshot.data());
        return {
          sessionId: record.sessionId,
          expiresAt: record.expiresAt,
        };
      }

      requireActiveParentMembership(parentMembershipSnapshot.data());
      requireActiveChildMembership(childMembershipSnapshot.data());

      const priorSessions = await transaction.get(
        firestore
          .collection('pairingSessions')
          .where('childUid', '==', input.childUid),
      );
      for (const snapshot of priorSessions.docs) {
        if (snapshot.data().status === 'ACTIVE') {
          transaction.update(snapshot.ref, {
            status: 'INVALIDATED',
            invalidatedAt: createdAt,
            invalidatedBySessionId: sessionReference.id,
          });
        }
      }

      transaction.create(sessionReference, {
        familyId: input.familyId,
        childUid: input.childUid,
        tokenHash,
        expiresAt,
        createdBy: actorUid,
        attemptCount: 0,
        status: 'ACTIVE',
        createdAt,
      });
      transaction.create(activityReference, {
        familyId: input.familyId,
        actorUid,
        actorType: 'PARENT',
        type: 'PAIRING_SESSION_CREATED',
        entityType: 'PAIRING_SESSION',
        entityId: sessionReference.id,
        childUid: input.childUid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(idempotencyReference, {
        command: commandName,
        actorUid,
        familyId: input.familyId,
        childUid: input.childUid,
        payloadHash: requestHash,
        sessionId: sessionReference.id,
        activityEventId: activityReference.id,
        expiresAt,
        completedAt: FieldValue.serverTimestamp(),
      });

      return {
        sessionId: sessionReference.id,
        expiresAt,
        token: plaintextToken,
      };
    },
  );

  return serializeResult(result);
}
