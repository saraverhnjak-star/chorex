import type { NotificationRoutingIntent } from '@chorex/notifications';

type ParentNotificationRoute =
  '/offers' | `/contracts/${string}` | `/rewards/${string}`;
// These paths belong to the Parent binary. Offer detail does not exist yet.
export function resolveParentNotificationRoute(
  intent: NotificationRoutingIntent,
): ParentNotificationRoute {
  switch (intent.entityType) {
    case 'OFFER':
      return '/offers';
    case 'CONTRACT':
      return `/contracts/${encodeURIComponent(intent.entityId)}`;
    case 'REWARD':
      return `/rewards/${encodeURIComponent(intent.entityId)}`;
  }
}
