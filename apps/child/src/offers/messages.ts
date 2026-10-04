import {
  familyClientErrorCodes,
  isFamilyClientError,
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

export function getAcceptOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return 'This offer could not be accepted. Try again.';
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return 'Your Child session has ended. Pair this device again.';
    case familyClientErrorCodes.invalidState:
      return 'This offer is no longer waiting for your response.';
    case familyClientErrorCodes.staleRevision:
      return 'This offer changed. Refresh it before accepting.';
    case familyClientErrorCodes.deadlinePassed:
      return 'This offer deadline has passed.';
    case familyClientErrorCodes.networkUnavailable:
      return 'The local offer service is unavailable. Check your connection and try again.';
    case familyClientErrorCodes.forbidden:
    case familyClientErrorCodes.familyMembershipRequired:
    case familyClientErrorCodes.wrongActorRole:
      return 'You cannot accept this offer.';
    default:
      return 'This offer could not be accepted. Try again.';
  }
}

export function getRejectOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return 'This offer could not be rejected. Try again.';
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return 'Your Child session has ended. Pair this device again.';
    case familyClientErrorCodes.invalidState:
      return 'This offer is no longer waiting for your response.';
    case familyClientErrorCodes.staleRevision:
      return 'This offer changed. Refresh it before rejecting.';
    case familyClientErrorCodes.networkUnavailable:
      return 'The local offer service is unavailable. Check your connection and try again.';
    case familyClientErrorCodes.forbidden:
    case familyClientErrorCodes.familyMembershipRequired:
    case familyClientErrorCodes.wrongActorRole:
      return 'You cannot reject this offer.';
    default:
      return 'This offer could not be rejected. Try again.';
  }
}
