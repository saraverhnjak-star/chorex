# ChoreX - Push Notification Architecture

## 1. Decision

Use:

```text
Client:  expo-notifications
Server:  Firebase Cloud Functions
Gateway: Expo Push Service
Final delivery: APNs (iOS) / FCM (Android)
```

This keeps the client cross-platform and avoids separate APNs/FCM backend implementations in the MVP.

## 2. Development requirement

Use Expo development builds from the beginning. Remote push notifications are not a valid Expo Go-dependent workflow, and the app already requires React Native Firebase native modules.

## 3. Device registration

After authentication and notification permission handling:

1. obtain the Expo push token;
2. optionally obtain/store the native push token for future portability;
3. create or update `/users/{uid}/devices/{deviceId}`;
4. update `lastSeenAt`, platform, app variant, and version;
5. on sign-out, disable or remove the registration for that account on that installation.

Do not use a hardware identifier as `deviceId`. Generate a random installation ID and persist it in SecureStore.

## 4. Notification event flow

Notifications should follow committed domain state:

```text
Client command
    |
    v
Cloud Function validates + commits Firestore transaction
    |
    v
Domain/activity event exists
    |
    v
Notification dispatcher resolves recipients
    |
    v
Expo Push Service
    |
    +--> APNs
    +--> FCM
```

Do not let clients send notifications directly to other users.

### Implemented Phase 2 dispatcher

`notifyOfferNegotiation` is a Firestore document-created trigger on `/activityEvents/{eventId}`. The Phase 2 paths dispatch `OFFER_PUBLISHED`, `OFFER_COUNTERED` (both actor directions), and `OFFER_ACCEPTED` (both actor directions). Phase 4 submission/resubmission dispatch CONTRACT_SUBMITTED to the active Parent; review decisions additionally dispatch `CONTRACT_APPROVED` and `CONTRACT_CHANGES_REQUESTED`; Reward fulfillment dispatches `REWARD_FULFILLED` to the active Child. Rejection remains an activity event without a push requirement.

The dispatcher loads the authoritative Offer, the event's immutable revision, and active recipient membership; acceptance additionally verifies the committed Contract source. Historical committed events may be processed after later revisions become current. It never reads terms into copy or payloads, accepts client-selected recipients, or participates in a command transaction. Only the intended participant's `pushEnabled: true` registrations for the correct app variant are targeted, with identical tokens deduplicated.

One server-only `/activityEvents/{eventId}/notificationEffects/expo` record identifies each logical effect. A transaction claims a two-minute lease; concurrent/repeated trigger delivery cannot independently claim the same effect. `COMPLETE` and `SKIPPED` are terminal. Transient failures use event retry/backoff, bounded to three claims; exhaustion records `FAILED`. Effect records contain only operational state, recipient UID, minimal routing metadata and ticket IDs, never push tokens or negotiated content. These are delivery records, not a second domain lifecycle or command idempotency system.

Expo sends are batched at 100. Immediately reported `DeviceNotRegistered` registrations are disabled only if their token has not rotated. `COMPLETE` means tickets accepted or no eligible registrations, not confirmed physical delivery. Expo does not provide an exactly-once send operation: an ambiguous network failure or crash after sending can repeat a physical push, while the committed event still owns one logical effect. Receipt polling/retention and further receipt hardening remain outside this Phase 2 sender slice.

Both apps suppress foreground banners/sounds for this realtime-first workflow. After authentication, notification responses validate shared minimal routing metadata and open the existing home/inbox surface, where Firestore loads authoritative data. Contract payloads identify the committed Contract but also open home until Phase 3 supplies Contract detail screens. No notification handler mutates domain state or requests push permission.

The local Functions emulator substitutes fake Expo tickets; verification makes no real Expo calls. Deterministic transport tests cover payloads, direction, batching and failures.

### Implemented Contract approval effect

The same dispatcher handles CONTRACT_APPROVED after verifying the authoritative approved Contract, deterministic APPROVE review at its current cycle, and matching earned Reward. It resolves the active Child participant, using the existing Expo effect lease, bounded retry and device/token filters. Generic copy is “Reward earned” / “You earned your promised reward. Delivery is still pending.” Routing data contains only CONTRACT_APPROVED, CONTRACT, Contract ID and Family ID. The approval response handler opens the existing stable Contract detail route. Offer routing remains unchanged. Transport failure never rolls back approval; no receipt polling is added.

### Implemented changes-requested effect

The same dispatcher validates a committed REQUEST_CHANGES Review at its deterministic Contract/cycle identity and resolves the active Child participant. The immutable Review validates delayed event processing even after a future round advances; current Contract status is not used to erase committed review history. Existing effect leases, bounded retries and device filtering are reused.

Copy is “Changes requested” / “A change was requested before approval.” Payload contains only CONTRACT_CHANGES_REQUESTED, CONTRACT, Contract ID and Family ID and opens the existing stable Contract detail. Parent feedback remains only in the immutable Review and never enters lock-screen copy, payload or delivery bookkeeping. Retry/event redelivery owns one logical effect; transport failure cannot roll back the decision. No receipt polling is added.

## 5. Initial notification matrix

| Event                | Recipient         | Example                                       |
| -------------------- | ----------------- | --------------------------------------------- |
| Offer published      | Child             | "You have a new chore offer."                 |
| Child counteroffers  | Parent            | "Mia proposed different terms."               |
| Parent counteroffers | Child             | "Your offer has new terms."                   |
| Offer accepted       | Other participant | "Agreement reached. Your contract is active." |
| Task milestone       | Optional parent   | Avoid noisy per-task pushes by default.       |
| Contract submitted   | Parent            | "An agreement is waiting for your review."    |
| Changes requested    | Child             | "A change was requested before approval."     |
| Contract approved    | Child             | "You earned: Cinema."                         |
| Reward fulfilled     | Child             | "Your reward was marked as delivered."        |
| Auction opened       | Eligible children | "New family auction: Cinema."                 |
| Bid placed/updated   | Parent            | "A new auction bid is ready."                 |
| Bid selected         | Winner            | "Your bid won. A contract is now active."     |
| Auction closed       | Non-winners       | Optional, configurable.                       |
| Deadline reminder    | Child             | "Your contract is due tomorrow."              |
| Reward reminder      | Parent            | "You still owe an earned reward."             |

## 6. Notification payload

Keep payload data small and non-sensitive.

Example:

```json
{
  "title": "Ready for review",
  "body": "An agreement is waiting for your review.",
  "data": {
    "type": "CONTRACT_SUBMITTED",
    "entityType": "CONTRACT",
    "entityId": "contractId",
    "familyId": "familyId"
  }
}
```

Do not include chore details or private notes in push payloads if they are unnecessary. Push notifications may be visible on a locked screen.

## 7. Deep-link routing

Use different schemes for the two apps, for example:

```text
chorex-parent://contracts/{id}
chorex-child://contracts/{id}
```

The notification payload should specify an entity, not hard-code a URL generated by the backend. The app maps entity type + ID to a route.

This allows route refactors without changing server notification history.

## 8. Foreground behavior

When the app is open:

- do not blindly show every remote notification as a system banner;
- refresh/invalidate relevant listeners naturally through Firestore realtime updates;
- optionally show a lightweight in-app toast for cross-user actions.

Avoid duplicate UX where a screen updates in realtime and immediately shows a redundant banner for the same event.

## 9. Permission strategy

Do not ask for push permission on first frame.

Prefer a contextual prompt after the user understands the benefit, e.g.:

- parent after creating a family/child;
- child after pairing or accepting the first offer.

If permission is denied, the app must remain fully usable and show an in-app notification/activity inbox where appropriate.

## 10. Token lifecycle and receipts

The notification sender should:

- batch Expo push messages;
- record ticket IDs temporarily if needed;
- check push receipts;
- deactivate tokens reported as invalid/unregistered;
- never retry permanently invalid tokens;
- use bounded retry/backoff for transient failures.

A device may have multiple historical tokens. Only active tokens should be targeted.

## 11. Notification preferences

MVP can start with a small set:

```text
transactional notifications: mandatory toggle only where platform/policy allows
reminders: user configurable
auction updates: configurable
```

Do not allow users to disable critical in-app state changes themselves; disabling push only affects delivery channel, not underlying activity records.

## 12. Deadline reminders

For MVP, use a scheduled Cloud Function (for example hourly) to find contracts entering reminder windows and send deduplicated reminders.

Store a deduplication marker such as:

```text
contractId + reminderType + deadlineVersion
```

so a retry does not send the same reminder repeatedly.

Suggested initial reminders:

- 24 hours before deadline;
- at deadline, if incomplete;
- optional parent reminder for old pending rewards.

Do not build a highly granular scheduling engine initially.

## 13. Notification copy principles

- supportive rather than punitive;
- no shaming language;
- no sensitive content on lock screen;
- short titles and clear action context;
- localizable from the beginning;
- use display name only when appropriate.

## 14. Direct FCM/APNs later

Expo's notification client API does not lock ChoreX into Expo Push Service. If the product later needs advanced platform-specific delivery, the server may send directly through FCM/APNs while retaining `expo-notifications` on the client.

## Submission and resubmission effect

CONTRACT_SUBMITTED uses the existing committed-event dispatcher, effect lease, device filtering and retries. The completed server-only submission receipt verifies the immutable event even after a later Parent decision. Both submission modes notify the active Parent with “Ready for review” / “An agreement is waiting for your review.” Routing contains only type, CONTRACT, Contract ID and family ID; no Parent feedback or terms. Parent taps open the existing Contract detail. Same-key retries create no second event/effect. Transport failure does not undo submission; no receipt polling is added.

## Reward fulfillment committed-event effect

The existing dispatcher validates REWARD_FULFILLED against the persisted FULFILLED Reward (including owning Parent/fulfilledBy), deterministic Reward identity and matching APPROVED Contract. It resolves the active Child, reuses device/token filters and the existing effect lease, bounded retry and completed-effect deduplication. Copy is “Reward delivered” / “Your reward was marked as delivered.” No reward title, description or feedback is included. The four routing fields are type REWARD_FULFILLED, entityType REWARD, entityId Reward ID and familyId. Both apps recognize the stable `/rewards/[rewardId]` detail route; access is still enforced by authenticated reads. Transport failure never rolls back fulfillment. No receipt polling, reminders or new transport is introduced.
