import {
  familyClientErrorCodes,
  isFamilyClientError,
  type FamilyClientErrorCode,
} from '@chorex/firebase-client';

const familyErrorMessages: Record<FamilyClientErrorCode, string> = {
  [familyClientErrorCodes.authRequired]:
    'Your session has ended. Sign in and try again.',
  [familyClientErrorCodes.invalidInput]: 'Check the details, then try again.',
  [familyClientErrorCodes.familyMembershipRequired]:
    'Your active family membership could not be verified.',
  [familyClientErrorCodes.childMembershipRequired]:
    'The selected active Child membership could not be verified.',
  [familyClientErrorCodes.wrongActorRole]:
    'Only an active Parent can make this change.',
  [familyClientErrorCodes.idempotencyConflict]:
    'This request was already completed with different details. Refresh and try again.',
  [familyClientErrorCodes.multipleFamiliesUnsupported]:
    'This version cannot open accounts with more than one family yet.',
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
