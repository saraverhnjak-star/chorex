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
  [pairingClientErrorCodes.invalidInput]: 'Enter the pairing token again.',
  [pairingClientErrorCodes.familyMembershipRequired]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.wrongActorRole]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.childMembershipRequired]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.idempotencyConflict]:
    'This pairing request could not be completed.',
  [pairingClientErrorCodes.pairingInvalid]:
    'That pairing token is not valid. Ask your parent for a new one.',
  [pairingClientErrorCodes.pairingExpired]:
    'That pairing token has expired. Ask your parent for a new one.',
  [pairingClientErrorCodes.pairingInvalidated]:
    'A newer pairing token was created. Ask your parent for the latest one.',
  [pairingClientErrorCodes.pairingAlreadyUsed]:
    'That pairing token has already been used.',
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
