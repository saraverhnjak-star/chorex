import {
  isOfferInboxClientError,
  offerInboxClientErrorCodes,
} from '@chorex/firebase-client';

export function getParentNegotiationInboxErrorMessage(error: unknown): string {
  if (!isOfferInboxClientError(error)) {
    return 'Counteroffers could not be loaded. Try again.';
  }
  switch (error.code) {
    case offerInboxClientErrorCodes.authRequired:
      return 'Your Parent session has ended. Sign in again.';
    case offerInboxClientErrorCodes.networkUnavailable:
      return 'The local offer service is unavailable. Check your connection and try again.';
    case offerInboxClientErrorCodes.malformedData:
      return 'A counteroffer is incomplete and cannot be shown safely.';
    default:
      return 'Counteroffers could not be loaded. Try again.';
  }
}
