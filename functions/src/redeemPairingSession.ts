import { createHash } from 'node:crypto';
import {
  pairingCommandErrorCodes,
  pairingSessionTokenSchema,
  redeemPairingSessionInputSchema,
  redeemPairingSessionOutputSchema,
  type PairingCommandErrorCode,
  type RedeemPairingSessionOutput,
} from '@chorex/domain';
import type { Auth } from 'firebase-admin/auth';
import { warn } from 'firebase-functions/logger';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

const rateLimitWindowMs = 10 * 60 * 1000;
const maximumRequestsPerWindow = 20;
const maximumFailuresPerWindow = 10;

interface RateLimitState {
  totalCount: number;
  failedCount: number;
}

type RedemptionResult =
  | { status: 'ready'; childUid: string }
  | { status: 'error'; code: PairingCommandErrorCode };

export class RedeemPairingSessionCommandError extends Error {
  constructor(readonly code: PairingCommandErrorCode) {
    super(code);
    this.name = 'RedeemPairingSessionCommandError';
  }
}

async function mintCustomToken(auth: Auth, childUid: string): Promise<string> {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return JSON.stringify({ uid: childUid });
  }
  return auth.createCustomToken(childUid);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseRateLimitState(data: DocumentData | undefined): RateLimitState {
  if (!data) return { totalCount: 0, failedCount: 0 };
  if (
    !Number.isInteger(data.totalCount) ||
    data.totalCount < 0 ||
    !Number.isInteger(data.failedCount) ||
    data.failedCount < 0
  ) {
    throw new RedeemPairingSessionCommandError(
      pairingCommandErrorCodes.pairingServiceUnavailable,
    );
  }
  return {
    totalCount: data.totalCount,
    failedCount: data.failedCount,
  };
}

function errorForSession(
  data: DocumentData | undefined,
  now: Timestamp,
  idempotencyKeyHash: string,
): RedemptionResult {
  if (
    !data ||
    typeof data.childUid !== 'string' ||
    typeof data.familyId !== 'string' ||
    !(data.expiresAt instanceof Timestamp)
  ) {
    return {
      status: 'error',
      code: pairingCommandErrorCodes.pairingInvalid,
    };
  }
  if (data.status === 'INVALIDATED') {
    return {
      status: 'error',
      code: pairingCommandErrorCodes.pairingInvalidated,
    };
  }
  if (data.status === 'REDEEMED') {
    return data.redemptionIdempotencyKeyHash === idempotencyKeyHash
      ? { status: 'ready', childUid: data.childUid }
      : {
          status: 'error',
          code: pairingCommandErrorCodes.pairingAlreadyUsed,
        };
  }
  if (data.status !== 'ACTIVE') {
    return {
      status: 'error',
      code: pairingCommandErrorCodes.pairingInvalid,
    };
  }
  if (data.expiresAt.toMillis() <= now.toMillis()) {
    return {
      status: 'error',
      code: pairingCommandErrorCodes.pairingExpired,
    };
  }
  return { status: 'ready', childUid: data.childUid };
}

export async function executeRedeemPairingSession(
  firestore: Firestore,
  auth: Auth,
  sourceKey: string,
  rawInput: unknown,
): Promise<RedeemPairingSessionOutput> {
  const parsedInput = redeemPairingSessionInputSchema.safeParse(rawInput);
  const input = parsedInput.success ? parsedInput.data : undefined;
  const now = Timestamp.now();
  const windowStartedAtMillis =
    Math.floor(now.toMillis() / rateLimitWindowMs) * rateLimitWindowMs;
  const windowStartedAt = Timestamp.fromMillis(windowStartedAtMillis);
  const windowExpiresAt = Timestamp.fromMillis(
    windowStartedAtMillis + rateLimitWindowMs,
  );
  const rateLimitReference = firestore.doc(
    `pairingRateLimits/${sourceKey}_${windowStartedAtMillis}`,
  );
  const idempotencyKeyHash = input ? sha256(input.idempotencyKey) : undefined;
  const tokenIsValid = input
    ? pairingSessionTokenSchema.safeParse(input.token).success
    : false;
  const tokenHash = tokenIsValid && input ? sha256(input.token) : undefined;

  const result = await firestore.runTransaction<RedemptionResult>(
    async (transaction) => {
      const rateLimitSnapshot = await transaction.get(rateLimitReference);
      const rateLimit = parseRateLimitState(rateLimitSnapshot.data());
      if (
        rateLimit.totalCount >= maximumRequestsPerWindow ||
        rateLimit.failedCount >= maximumFailuresPerWindow
      ) {
        return {
          status: 'error',
          code: pairingCommandErrorCodes.pairingRateLimited,
        };
      }

      const sessionQuery = tokenHash
        ? firestore
            .collection('pairingSessions')
            .where('tokenHash', '==', tokenHash)
            .limit(2)
        : undefined;
      const sessionSnapshot = sessionQuery
        ? await transaction.get(sessionQuery)
        : undefined;
      const sessionDocument =
        sessionSnapshot?.size === 1 ? sessionSnapshot.docs[0] : undefined;
      const sessionResult =
        !input || !idempotencyKeyHash
          ? {
              status: 'error' as const,
              code: pairingCommandErrorCodes.invalidInput,
            }
          : sessionDocument
            ? errorForSession(sessionDocument.data(), now, idempotencyKeyHash)
            : {
                status: 'error' as const,
                code: pairingCommandErrorCodes.pairingInvalid,
              };
      const failed = sessionResult.status === 'error';

      transaction.set(rateLimitReference, {
        sourceKey,
        windowStartedAt,
        expiresAt: windowExpiresAt,
        totalCount: rateLimit.totalCount + 1,
        failedCount: rateLimit.failedCount + (failed ? 1 : 0),
      });

      if (failed) {
        if (sessionDocument) {
          transaction.update(sessionDocument.ref, {
            attemptCount: FieldValue.increment(1),
          });
        }
        return sessionResult;
      }

      if (sessionDocument?.data().status === 'ACTIVE') {
        const activityReference = firestore.collection('activityEvents').doc();
        transaction.update(sessionDocument.ref, {
          status: 'REDEEMED',
          redeemedAt: now,
          redemptionIdempotencyKeyHash: idempotencyKeyHash,
        });
        transaction.create(activityReference, {
          familyId: sessionDocument.data().familyId,
          actorUid: sessionResult.childUid,
          actorType: 'CHILD',
          type: 'PAIRING_SESSION_REDEEMED',
          entityType: 'PAIRING_SESSION',
          entityId: sessionDocument.id,
          childUid: sessionResult.childUid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return sessionResult;
    },
  );

  if (result.status === 'error') {
    throw new RedeemPairingSessionCommandError(result.code);
  }

  try {
    const customToken = await mintCustomToken(auth, result.childUid);
    return redeemPairingSessionOutputSchema.parse({ customToken });
  } catch {
    warn('Pairing redemption service unavailable', {
      reason: 'CUSTOM_TOKEN_MINT_FAILED',
    });
    throw new RedeemPairingSessionCommandError(
      pairingCommandErrorCodes.pairingServiceUnavailable,
    );
  }
}
