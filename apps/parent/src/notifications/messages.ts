import {
  isNotificationRegistrationError,
  notificationRegistrationErrorCodes,
} from '@chorex/notifications';

export function getNotificationErrorMessage(error: unknown): string {
  if (
    isNotificationRegistrationError(error) &&
    error.code === notificationRegistrationErrorCodes.configurationMissing
  ) {
    return 'Notifications are not configured for this Parent app build.';
  }
  return 'Notifications could not be enabled. Check your connection and try again.';
}
