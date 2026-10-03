import {
  familyClientErrorCodes,
  isFamilyClientError,
  type FamilyClientErrorCode,
} from '@chorex/firebase-client';

const familyErrorMessages: Record<FamilyClientErrorCode, string> = {
  [familyClientErrorCodes.authRequired]:
    'Your session has ended. Sign in and try again.',
  [familyClientErrorCodes.invalidInput]:
    'Check your name and family name, then try again.',
  [familyClientErrorCodes.wrongActorRole]:
    'This account cannot create a Parent family.',
  [familyClientErrorCodes.idempotencyConflict]:
    'Family setup was already completed with different details.',
  [familyClientErrorCodes.networkUnavailable]:
    'The local family service is unavailable. Check your connection and try again.',
  [familyClientErrorCodes.profileReadFailed]:
    'Your Parent profile could not be loaded. Try again.',
  [familyClientErrorCodes.unknown]:
    'Family setup could not be completed. Try again.',
};

export function getFamilyErrorMessage(error: unknown): string {
  return familyErrorMessages[
    isFamilyClientError(error) ? error.code : familyClientErrorCodes.unknown
  ];
}
