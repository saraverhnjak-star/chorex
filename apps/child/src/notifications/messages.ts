import { t } from '@chorex/ui';
import {
  isNotificationRegistrationError,
  notificationRegistrationErrorCodes,
} from '@chorex/notifications';

export function getNotificationErrorMessage(error: unknown): string {
  if (
    isNotificationRegistrationError(error) &&
    error.code === notificationRegistrationErrorCodes.configurationMissing
  ) {
    return t('Notifications are not configured for this Child app build.');
  }
  return t(
    'Notifications could not be enabled. Check your connection and try again.',
  );
}
