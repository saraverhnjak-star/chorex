import {
  authErrorCodes,
  isAuthClientError,
  type AuthErrorCode,
} from '@chorex/firebase-client';

const authErrorMessages: Record<AuthErrorCode, string> = {
  [authErrorCodes.invalidCredentials]:
    'The email or password is incorrect. Try again.',
  [authErrorCodes.invalidEmail]: 'Enter a valid email address.',
  [authErrorCodes.emailAlreadyInUse]:
    'An account already exists for this email address.',
  [authErrorCodes.weakPassword]:
    'The password does not meet the current minimum requirements.',
  [authErrorCodes.tooManyAttempts]:
    'Too many attempts. Wait a moment before trying again.',
  [authErrorCodes.networkUnavailable]:
    'The local authentication service is unavailable. Check your connection and try again.',
  [authErrorCodes.unknown]: 'Authentication could not be completed. Try again.',
};

export function getAuthErrorMessage(error: unknown): string {
  return authErrorMessages[
    isAuthClientError(error) ? error.code : authErrorCodes.unknown
  ];
}
