# notifications

Owns contextual notification permission requests and authenticated Expo push registration for both mobile apps.

The package generates a random installation ID with `expo-crypto`, persists it in SecureStore, and writes only the signed-in user's shape-restricted Firestore device record. It removes that account's record before local sign-out. Registration removal does not revoke a Firebase Auth session or resolve individual Child-device access revocation.

The canonical routing payload lives in `packages/domain`; `parseNotificationRoutingIntent` validates the strict semantic fields and event/entity relationship. `listenForNotificationResponses` handles explicit Expo responses, captures the initial native response and deduplicates by request/action ID for the current JS process. App roots register during startup and call `updateNotificationRoutingReadiness` with Auth status, UID and root navigation readiness. Signed-out/error sessions discard pending intents. No notification-arrival listener forces navigation.

Actual paths belong to each app's `src/notifications/routing.ts`. Offer taps use the existing home/inbox; Contract and Reward taps use their existing detail routes, including OFFER_ACCEPTED → Contract. Destination screens perform their ordinary authenticated Firestore reads. The package stores no domain snapshot, persistent response history, selected-family state or offline mutation queue, and response routing does not request permissions or alter device/receipt records.

Run `pnpm --filter @chorex/notifications test` for pure schema/response/readiness tests and each app's notification-routing suite for root wiring. Native verification and unsupported Offer detail destinations are documented in `docs/PHASE_5_SLICE_2_ACCEPTANCE.md`.
