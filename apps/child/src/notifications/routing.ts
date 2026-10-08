import type { NotificationRoutingIntent } from '@chorex/notifications';

type ChildNotificationRoute =
  '/offers' | `/contracts/${string}` | `/rewards/${string}`;
// These paths belong to the Child binary. Offer detail does not exist yet.
export function resolveChildNotificationRoute(
  intent: NotificationRoutingIntent,
): ChildNotificationRoute {
  switch (intent.entityType) {
    case 'OFFER':
      return '/offers';
    case 'CONTRACT':
      return `/contracts/${encodeURIComponent(intent.entityId)}`;
    case 'REWARD':
      return `/rewards/${encodeURIComponent(intent.entityId)}`;
  }
}
