import {
  familyClientErrorCodes,
  isFamilyClientError,
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

export function getAcceptOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return 'This offer could not be accepted. Try again.';
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return 'Your Parent session has ended. Sign in again.';
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

export function getCounterOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return 'This counteroffer could not be sent. Try again.';
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return 'Your Parent session has ended. Sign in again.';
    case familyClientErrorCodes.invalidInput:
      return 'Check the tasks, deadline and reward details and try again.';
    case familyClientErrorCodes.invalidState:
      return 'This offer is no longer waiting for your response.';
    case familyClientErrorCodes.staleRevision:
      return 'This offer changed. Refresh it before countering.';
    case familyClientErrorCodes.deadlinePassed:
      return 'This offer deadline has passed.';
    case familyClientErrorCodes.networkUnavailable:
      return 'The local offer service is unavailable. Check your connection and try again.';
    case familyClientErrorCodes.forbidden:
    case familyClientErrorCodes.familyMembershipRequired:
    case familyClientErrorCodes.wrongActorRole:
      return 'You cannot counter this offer.';
    default:
      return 'This counteroffer could not be sent. Try again.';
  }
}
