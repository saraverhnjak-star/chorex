import {
  familyClientErrorCodes,
  isFamilyClientError,
  type FamilyClientErrorCode,
} from '@chorex/firebase-client';

const familyErrorMessages: Record<FamilyClientErrorCode, string> = {
  [familyClientErrorCodes.authRequired]:
    'Your session has ended. Sign in and try again.',
  [familyClientErrorCodes.invalidInput]: 'Check the details, then try again.',
  [familyClientErrorCodes.forbidden]:
    'You do not have permission to publish this offer.',
  [familyClientErrorCodes.familyMembershipRequired]:
    'Your active family membership could not be verified.',
  [familyClientErrorCodes.childMembershipRequired]:
    'The selected active Child membership could not be verified.',
  [familyClientErrorCodes.wrongActorRole]:
    'Only an active Parent can make this change.',
  [familyClientErrorCodes.idempotencyConflict]:
    'This request was already completed with different details. Refresh and try again.',
  [familyClientErrorCodes.invalidState]:
    'This offer can no longer be published from its current state.',
  [familyClientErrorCodes.staleRevision]:
    'This offer changed. Refresh before publishing it.',
  [familyClientErrorCodes.deadlinePassed]:
    'The offer deadline has passed. Create a new draft.',
  [familyClientErrorCodes.pairingInvalid]: 'This pairing token is invalid.',
  [familyClientErrorCodes.pairingExpired]: 'This pairing token has expired.',
  [familyClientErrorCodes.pairingInvalidated]:
    'This pairing token was replaced by a newer one.',
  [familyClientErrorCodes.pairingAlreadyUsed]:
    'This pairing token has already been used.',
  [familyClientErrorCodes.pairingRateLimited]:
    'Too many pairing attempts. Wait and try again.',
  [familyClientErrorCodes.pairingServiceUnavailable]:
    'Pairing is temporarily unavailable. Try again.',
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
