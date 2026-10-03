import {
  familyClientErrorCodes,
  isFamilyClientError,
} from '@chorex/firebase-client';

export function getChildFamilyErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return 'Your family setup could not be loaded. Try again.';
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return 'Your Child session has ended. Pair this device again.';
    case familyClientErrorCodes.wrongActorRole:
      return 'This session is not linked to a Child profile.';
    case familyClientErrorCodes.multipleFamiliesUnsupported:
      return 'This version cannot open Child profiles in more than one family yet.';
    case familyClientErrorCodes.networkUnavailable:
      return 'The local family service is unavailable. Check your connection and try again.';
    case familyClientErrorCodes.profileReadFailed:
      return 'Your Child family setup is incomplete. Ask your parent to finish setup.';
    default:
      return 'Your family setup could not be loaded. Try again.';
  }
}
