import { t } from '@chorex/ui';
import {
  familyClientErrorCodes,
  isFamilyClientError,
  isOfferInboxClientError,
  offerInboxClientErrorCodes,
} from '@chorex/firebase-client';

export function getParentNegotiationInboxErrorMessage(error: unknown): string {
  if (!isOfferInboxClientError(error)) {
    return t('Counteroffers could not be loaded. Try again.');
  }
  switch (error.code) {
    case offerInboxClientErrorCodes.authRequired:
      return t('Your Parent session has ended. Sign in again.');
    case offerInboxClientErrorCodes.networkUnavailable:
      return t(
        'The local offer service is unavailable. Check your connection and try again.',
      );
    case offerInboxClientErrorCodes.malformedData:
      return t('A counteroffer is incomplete and cannot be shown safely.');
    default:
      return t('Counteroffers could not be loaded. Try again.');
  }
}

export function getAcceptOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return t('This offer could not be accepted. Try again.');
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return t('Your Parent session has ended. Sign in again.');
    case familyClientErrorCodes.invalidState:
      return t('This offer is no longer waiting for your response.');
    case familyClientErrorCodes.staleRevision:
      return t('This offer changed. Refresh it before accepting.');
    case familyClientErrorCodes.deadlinePassed:
      return t('This offer deadline has passed.');
    case familyClientErrorCodes.networkUnavailable:
      return t(
        'The local offer service is unavailable. Check your connection and try again.',
      );
    case familyClientErrorCodes.forbidden:
    case familyClientErrorCodes.familyMembershipRequired:
    case familyClientErrorCodes.wrongActorRole:
      return t('You cannot accept this offer.');
    default:
      return t('This offer could not be accepted. Try again.');
  }
}

export function getCounterOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return t('This counteroffer could not be sent. Try again.');
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return t('Your Parent session has ended. Sign in again.');
    case familyClientErrorCodes.invalidInput:
      return t('Check the tasks, deadline and reward details and try again.');
    case familyClientErrorCodes.invalidState:
      return t('This offer is no longer waiting for your response.');
    case familyClientErrorCodes.staleRevision:
      return t('This offer changed. Refresh it before countering.');
    case familyClientErrorCodes.deadlinePassed:
      return t('This offer deadline has passed.');
    case familyClientErrorCodes.networkUnavailable:
      return t(
        'The local offer service is unavailable. Check your connection and try again.',
      );
    case familyClientErrorCodes.forbidden:
    case familyClientErrorCodes.familyMembershipRequired:
    case familyClientErrorCodes.wrongActorRole:
      return t('You cannot counter this offer.');
    default:
      return t('This counteroffer could not be sent. Try again.');
  }
}

export function getRejectOfferErrorMessage(error: unknown): string {
  if (!isFamilyClientError(error)) {
    return t('This offer could not be rejected. Try again.');
  }
  switch (error.code) {
    case familyClientErrorCodes.authRequired:
      return t('Your Parent session has ended. Sign in again.');
    case familyClientErrorCodes.invalidState:
      return t('This offer is no longer waiting for your response.');
    case familyClientErrorCodes.staleRevision:
      return t('This offer changed. Refresh it before rejecting.');
    case familyClientErrorCodes.networkUnavailable:
      return t(
        'The local offer service is unavailable. Check your connection and try again.',
      );
    case familyClientErrorCodes.forbidden:
    case familyClientErrorCodes.familyMembershipRequired:
    case familyClientErrorCodes.wrongActorRole:
      return t('You cannot reject this offer.');
    default:
      return t('This offer could not be rejected. Try again.');
  }
}
