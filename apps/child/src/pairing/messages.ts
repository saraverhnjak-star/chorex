import {
  authErrorCodes,
  isAuthClientError,
  isPairingClientError,
  pairingClientErrorCodes,
  type PairingClientErrorCode,
} from '@chorex/firebase-client';

const pairingErrorMessages: Record<PairingClientErrorCode, string> = {
  [pairingClientErrorCodes.authRequired]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.invalidInput]: 'Enter the pairing code again.',
  [pairingClientErrorCodes.familyMembershipRequired]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.wrongActorRole]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.childMembershipRequired]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.idempotencyConflict]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.pairingInvalid]:
    'That pairing code is not valid. Ask your parent for a new one.',
  [pairingClientErrorCodes.pairingExpired]:
    'That pairing code has expired. Ask your parent for a new one.',
  [pairingClientErrorCodes.pairingInvalidated]:
    'A newer pairing code was created. Ask your parent for the latest one.',
  [pairingClientErrorCodes.pairingAlreadyUsed]:
    'That pairing code has already been used.',
  [pairingClientErrorCodes.pairingRateLimited]:
    'Too many pairing attempts. Wait before trying again.',
  [pairingClientErrorCodes.pairingServiceUnavailable]:
    'Pairing is temporarily unavailable. Try again.',
  [pairingClientErrorCodes.networkUnavailable]:
    'The pairing service is unavailable. Check your connection and try again.',
  [pairingClientErrorCodes.unknown]:
    'Pairing could not be completed. Try again.',
};

export function getPairingErrorMessage(error: unknown): string {
  if (isPairingClientError(error)) return pairingErrorMessages[error.code];
  if (
    isAuthClientError(error) &&
    error.code === authErrorCodes.networkUnavailable
  ) {
    return pairingErrorMessages[pairingClientErrorCodes.networkUnavailable];
  }
  return pairingErrorMessages[pairingClientErrorCodes.unknown];
}
