import { t } from '@chorex/ui';
import {
  contractClientErrorCodes,
  isContractClientError,
} from '@chorex/firebase-client';

export function getTaskCompletionErrorMessage(error: unknown): string {
  if (!isContractClientError(error))
    return t(
      'We could not confirm this completion. Try again to confirm the same action.',
    );
  switch (error.code) {
    case contractClientErrorCodes.authRequired:
      return t('Your Child session has ended. Pair this device again.');
    case contractClientErrorCodes.forbidden:
    case contractClientErrorCodes.familyMembershipRequired:
    case contractClientErrorCodes.wrongActorRole:
      return t('You cannot record progress on this task.');
    case contractClientErrorCodes.invalidState:
      return t(
        'This Contract is no longer active. Progress updates are unavailable.',
      );
    case contractClientErrorCodes.taskAlreadyComplete:
      return t(
        'This task is already complete. Its progress will update automatically.',
      );
    case contractClientErrorCodes.contractNotFound:
    case contractClientErrorCodes.taskNotFound:
      return t('This Contract or task is no longer available.');
    case contractClientErrorCodes.networkUnavailable:
      return t(
        'Unable to confirm completion. Check your connection and try again. Your displayed progress has not been changed locally.',
      );
    case contractClientErrorCodes.idempotencyConflict:
      return t(
        'This retry does not match the original action. Reopen the Contract before trying again.',
      );
    case contractClientErrorCodes.invalidInput:
      return t(
        'This task completion could not be sent. Reopen the Contract and try again.',
      );
    default:
      return t(
        'We could not confirm this completion. Try again to confirm the same action.',
      );
  }
}

export function getSubmissionErrorMessage(error: unknown): string {
  if (!isContractClientError(error))
    return t(
      'We could not confirm submission. Try again to confirm the same action.',
    );
  switch (error.code) {
    case contractClientErrorCodes.authRequired:
      return t('Your Child session has ended. Pair this device again.');
    case contractClientErrorCodes.forbidden:
    case contractClientErrorCodes.familyMembershipRequired:
    case contractClientErrorCodes.wrongActorRole:
      return t('You cannot submit this Contract.');
    case contractClientErrorCodes.tasksIncomplete:
      return t('Complete all tasks before submitting for review.');
    case contractClientErrorCodes.invalidState:
      return t(
        'This Contract is no longer active. Its status will update automatically.',
      );
    case contractClientErrorCodes.contractNotFound:
      return t('This Contract is no longer available.');
    case contractClientErrorCodes.networkUnavailable:
      return t(
        'Unable to confirm submission. Check your connection and try again. Your Contract status has not been changed locally.',
      );
    case contractClientErrorCodes.idempotencyConflict:
      return t(
        'This retry does not match the original action. Reopen the Contract before trying again.',
      );
    case contractClientErrorCodes.invalidInput:
      return t(
        'This submission could not be sent. Reopen the Contract and try again.',
      );
    default:
      return t(
        'We could not confirm submission. Try again to confirm the same action.',
      );
  }
}
