import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  familyCommandErrorCodes,
  pairingCommandErrorCodes,
} from '@chorex/domain';
import { CreateChildCommandError, executeCreateChild } from './createChild';
import { CreateFamilyCommandError, executeCreateFamily } from './createFamily';
import {
  CreatePairingSessionCommandError,
  executeCreatePairingSession,
} from './createPairingSession';

if (getApps().length === 0) initializeApp();

const firestore = getFirestore();
const auth = getAuth();

function callableError(
  error:
    | CreateFamilyCommandError
    | CreateChildCommandError
    | CreatePairingSessionCommandError,
): HttpsError {
  const details = { code: error.code };
  switch (error.code) {
    case familyCommandErrorCodes.invalidInput:
      return new HttpsError('invalid-argument', error.code, details);
    case familyCommandErrorCodes.wrongActorRole:
    case familyCommandErrorCodes.familyMembershipRequired:
      return new HttpsError('permission-denied', error.code, details);
    case familyCommandErrorCodes.idempotencyConflict:
      return new HttpsError('failed-precondition', error.code, details);
    case familyCommandErrorCodes.authRequired:
      return new HttpsError('unauthenticated', error.code, details);
    case pairingCommandErrorCodes.childMembershipRequired:
      return new HttpsError('permission-denied', error.code, details);
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
