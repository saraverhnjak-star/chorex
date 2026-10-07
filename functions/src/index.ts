import { generatePendingRewardReminders } from './pendingRewardReminders';
import { generateContractDeadlineReminders } from './contractDeadlineReminders';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { processPushReceipts, getExpoReceipts } from './pushReceipts';
import {
  executeFulfillReward,
  FulfillRewardCommandError,
} from './fulfillReward';
import {
  executeRequestContractChanges,
  RequestContractChangesCommandError,
} from './requestContractChanges';
import {
  executeApproveContract,
  ApproveContractCommandError,
} from './approveContract';
import {
  executeSubmitContractForReview,
  SubmitContractForReviewCommandError,
} from './submitContractForReview';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
  dispatchNegotiationNotification,
  sendExpoMessages,
} from './negotiationNotifications';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { warn } from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  rewardCommandErrorCodes,
  contractCommandErrorCodes,
  familyCommandErrorCodes,
  offerCommandErrorCodes,
  pairingCommandErrorCodes,
} from '@chorex/domain';
import {
  executeRecordTaskCompletion,
  RecordTaskCompletionCommandError,
} from './recordTaskCompletion';
import { AcceptOfferCommandError, executeAcceptOffer } from './acceptOffer';
import { CounterOfferCommandError, executeCounterOffer } from './counterOffer';
import { CreateChildCommandError, executeCreateChild } from './createChild';
import { CreateFamilyCommandError, executeCreateFamily } from './createFamily';
import {
  CreateOfferDraftCommandError,
  executeCreateOfferDraft,
} from './createOfferDraft';
import { executePublishOffer, PublishOfferCommandError } from './publishOffer';
import { executeRejectOffer, RejectOfferCommandError } from './rejectOffer';
import {
  CreatePairingSessionCommandError,
  executeCreatePairingSession,
} from './createPairingSession';
import {
  RedeemPairingSessionCommandError,
  executeRedeemPairingSession,
} from './redeemPairingSession';

if (getApps().length === 0) initializeApp();

const firestore = getFirestore();
const auth = getAuth();
const pairingRateLimitHmacSecret = defineSecret(
  'PAIRING_RATE_LIMIT_HMAC_SECRET',
);

function callableError(
  error:
    | FulfillRewardCommandError
    | RequestContractChangesCommandError
    | ApproveContractCommandError
    | SubmitContractForReviewCommandError
    | RecordTaskCompletionCommandError
    | CreateFamilyCommandError
    | CreateChildCommandError
    | CreateOfferDraftCommandError
    | PublishOfferCommandError
    | AcceptOfferCommandError
    | CounterOfferCommandError
    | RejectOfferCommandError
    | CreatePairingSessionCommandError
    | RedeemPairingSessionCommandError,
): HttpsError {
  const details = { code: error.code };
  switch (error.code) {
    case familyCommandErrorCodes.invalidInput:
      return new HttpsError('invalid-argument', error.code, details);
    case familyCommandErrorCodes.wrongActorRole:
    case familyCommandErrorCodes.familyMembershipRequired:
    case offerCommandErrorCodes.forbidden:
    case offerCommandErrorCodes.childMembershipRequired:
      return new HttpsError('permission-denied', error.code, details);
    case rewardCommandErrorCodes.rewardAlreadyFulfilled:
    case familyCommandErrorCodes.idempotencyConflict:
    case contractCommandErrorCodes.tasksIncomplete:
    case contractCommandErrorCodes.taskAlreadyComplete:
    case offerCommandErrorCodes.invalidState:
    case offerCommandErrorCodes.staleRevision:
    case offerCommandErrorCodes.deadlinePassed:
      return new HttpsError('failed-precondition', error.code, details);
    case familyCommandErrorCodes.authRequired:
      return new HttpsError('unauthenticated', error.code, details);
    case rewardCommandErrorCodes.rewardNotFound:
    case contractCommandErrorCodes.contractNotFound:
    case contractCommandErrorCodes.taskNotFound:
    case pairingCommandErrorCodes.pairingInvalid:
      return new HttpsError('not-found', error.code, details);
    case pairingCommandErrorCodes.pairingExpired:
    case pairingCommandErrorCodes.pairingInvalidated:
    case pairingCommandErrorCodes.pairingAlreadyUsed:
      return new HttpsError('failed-precondition', error.code, details);
    case pairingCommandErrorCodes.pairingRateLimited:
      return new HttpsError('resource-exhausted', error.code, details);
    case pairingCommandErrorCodes.pairingServiceUnavailable:
      return new HttpsError('unavailable', error.code, details);
  }
}

export const createFamily = onCall(async (request) => {
  if (!request.auth) {
    const error = new CreateFamilyCommandError(
      familyCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeCreateFamily(firestore, request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof CreateFamilyCommandError) throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const createChild = onCall(async (request) => {
  if (!request.auth) {
    const error = new CreateChildCommandError(
      familyCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeCreateChild(
      firestore,
      auth,
      request.auth.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof CreateChildCommandError) throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const createOfferDraft = onCall(async (request) => {
  if (!request.auth) {
    const error = new CreateOfferDraftCommandError(
      offerCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeCreateOfferDraft(
      firestore,
      request.auth.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof CreateOfferDraftCommandError) {
      throw callableError(error);
    }
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const publishOffer = onCall(async (request) => {
  if (!request.auth) {
    const error = new PublishOfferCommandError(
      offerCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executePublishOffer(firestore, request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof PublishOfferCommandError) {
      throw callableError(error);
    }
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const acceptOffer = onCall(async (request) => {
  if (!request.auth) {
    const error = new AcceptOfferCommandError(
      offerCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeAcceptOffer(firestore, request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof AcceptOfferCommandError) {
      throw callableError(error);
    }
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const rejectOffer = onCall(async (request) => {
  if (!request.auth) {
    const error = new RejectOfferCommandError(
      offerCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeRejectOffer(firestore, request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof RejectOfferCommandError) {
      throw callableError(error);
    }
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const counterOffer = onCall(async (request) => {
  if (!request.auth) {
    const error = new CounterOfferCommandError(
      offerCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeCounterOffer(firestore, request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof CounterOfferCommandError) {
      throw callableError(error);
    }
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const createPairingSession = onCall(async (request) => {
  if (!request.auth) {
    const error = new CreatePairingSessionCommandError(
      pairingCommandErrorCodes.authRequired,
    );
    throw callableError(error);
  }

  try {
    return await executeCreatePairingSession(
      firestore,
      request.auth.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof CreatePairingSessionCommandError) {
      throw callableError(error);
    }
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const redeemPairingSession = onCall(
  { secrets: [pairingRateLimitHmacSecret] },
  async (request) => {
    const sourceIp =
      request.rawRequest.ip ||
      request.rawRequest.socket.remoteAddress ||
      (process.env.FIREBASE_AUTH_EMULATOR_HOST
        ? 'LOCAL_FIREBASE_EMULATOR'
        : undefined);
    let secret: string;
    try {
      secret = process.env.FIREBASE_AUTH_EMULATOR_HOST
        ? (process.env.PAIRING_RATE_LIMIT_HMAC_SECRET_EMULATOR ??
          pairingRateLimitHmacSecret.value())
        : pairingRateLimitHmacSecret.value();
    } catch {
      warn('Pairing redemption service unavailable', {
        reason: 'HMAC_SECRET_ACCESS_FAILED',
      });
      const error = new RedeemPairingSessionCommandError(
        pairingCommandErrorCodes.pairingServiceUnavailable,
      );
      throw callableError(error);
    }
    if (!sourceIp || !secret) {
      warn('Pairing redemption service unavailable', {
        reason: !sourceIp ? 'SOURCE_ADDRESS_MISSING' : 'HMAC_SECRET_MISSING',
      });
      const error = new RedeemPairingSessionCommandError(
        pairingCommandErrorCodes.pairingServiceUnavailable,
      );
      throw callableError(error);
    }
    const sourceKey = createHmac('sha256', secret)
      .update(sourceIp)
      .digest('hex');

    try {
      return await executeRedeemPairingSession(
        firestore,
        auth,
        sourceKey,
        request.data,
      );
    } catch (error) {
      if (error instanceof RedeemPairingSessionCommandError) {
        throw callableError(error);
      }
      throw new HttpsError('internal', 'INTERNAL');
    }
  },
);

export const notifyOfferNegotiation = onDocumentCreated(
  { document: 'activityEvents/{eventId}', retry: true, timeoutSeconds: 60 },
  async (event) => {
    // Local verification records fake tickets and never calls the Expo network.
    const transport = process.env.FIRESTORE_EMULATOR_HOST
      ? async (
          messages: readonly import('./negotiationNotifications').ExpoMessage[],
        ) =>
          messages.map((_, index) => ({
            status: 'ok' as const,
            id: `emulator-${event.params.eventId}-${index}`,
          }))
      : sendExpoMessages;
    await dispatchNegotiationNotification(
      firestore,
      event.params.eventId,
      transport,
    );
  },
);

export const recordTaskCompletion = onCall(async (request) => {
  if (!request.auth)
    throw callableError(
      new RecordTaskCompletionCommandError(
        contractCommandErrorCodes.authRequired,
      ),
    );
  try {
    return await executeRecordTaskCompletion(
      firestore,
      request.auth.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof RecordTaskCompletionCommandError)
      throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const submitContractForReview = onCall(async (request) => {
  try {
    return await executeSubmitContractForReview(
      firestore,
      request.auth?.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof SubmitContractForReviewCommandError)
      throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const approveContract = onCall(async (request) => {
  try {
    return await executeApproveContract(
      firestore,
      request.auth?.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof ApproveContractCommandError)
      throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const requestContractChanges = onCall(async (request) => {
  try {
    return await executeRequestContractChanges(
      firestore,
      request.auth?.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof RequestContractChangesCommandError)
      throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const fulfillReward = onCall(async (request) => {
  try {
    return await executeFulfillReward(
      firestore,
      request.auth?.uid,
      request.data,
    );
  } catch (error) {
    if (error instanceof FulfillRewardCommandError) throw callableError(error);
    throw new HttpsError('internal', 'INTERNAL');
  }
});

export const processExpoPushReceipts = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    // Local integration explicitly injects deterministic receipt fakes; no live Expo calls.
    if (process.env.FIRESTORE_EMULATOR_HOST) return;
    await processPushReceipts(firestore, getExpoReceipts);
  },
);

export const generateDeadlineReminders = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    await generateContractDeadlineReminders(firestore);
  },
);

export const generateRewardReminders = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    await generatePendingRewardReminders(firestore);
  },
);
