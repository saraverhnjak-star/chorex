import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { familyCommandErrorCodes } from '@chorex/domain';
import { CreateFamilyCommandError, executeCreateFamily } from './createFamily';

if (getApps().length === 0) initializeApp();

const firestore = getFirestore();

function callableError(error: CreateFamilyCommandError): HttpsError {
  const details = { code: error.code };
  switch (error.code) {
    case familyCommandErrorCodes.invalidInput:
      return new HttpsError('invalid-argument', error.code, details);
    case familyCommandErrorCodes.wrongActorRole:
      return new HttpsError('permission-denied', error.code, details);
    case familyCommandErrorCodes.idempotencyConflict:
      return new HttpsError('failed-precondition', error.code, details);
    case familyCommandErrorCodes.authRequired:
      return new HttpsError('unauthenticated', error.code, details);
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
