import {
  isOfferInboxClientError,
  offerInboxClientErrorCodes,
} from '@chorex/firebase-client';

export function getOfferInboxErrorMessage(error: unknown): string {
  if (!isOfferInboxClientError(error)) {
    return 'Your offers could not be loaded. Try again.';
  }
  switch (error.code) {
    case offerInboxClientErrorCodes.authRequired:
      return 'Your Child session has ended. Pair this device again.';
    case offerInboxClientErrorCodes.networkUnavailable:
      return 'The local offer service is unavailable. Check your connection and try again.';
    case offerInboxClientErrorCodes.malformedData:
      return 'One of your offers is incomplete. Ask your parent to publish it again.';
    default:
      return 'Your offers could not be loaded. Try again.';
  }
}
