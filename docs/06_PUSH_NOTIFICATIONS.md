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
2. listen for native token-change signals and reacquire the current Expo token;
3. create or update `/users/{uid}/devices/{deviceId}`;
4. update `lastSeenAt`, platform, app variant, and version;
5. on sign-out, disable or remove the registration for that account on that installation.

Do not use a hardware identifier as `deviceId`. Generate a random installation ID and persist it in SecureStore.

### Implemented permission and registration lifecycle (Phase 5 Slice 3)

Parent education appears in the authenticated, readable-family Home after family setup. Child education appears only after successful pairing and a readable family Home. The shared inline card explains the benefit and optional nature of notifications, with explicit **Enable notifications** and **Not now** actions. A small installation-local SecureStore education-seen flag prevents repeat education; it does not store permission or push-registration truth. Explicit Enable can reopen the explanation. Startup, Auth restoration and notification responses never request OS permission.

The Expo permission result is canonical. Undetermined permission may be requested only by an explicit action. Denied permission keeps all agreement flows usable; permanent denial exposes an explicit system Settings action. iOS provisional/ephemeral authorization can register, with quiet copy for provisional authorization. Restoring permission in Settings reconciles on foreground return without another automatic prompt.

Each binary keeps its existing opaque random UUID in SecureStore. Authenticated bootstrap, foreground return and native-token signals reconcile the same owner/installation document; version and Expo token updates replace metadata without changing an existing `createdAt`. The firebase-client adapter validates the shared strict metadata schema and commits a transaction with server `lastSeenAt`. No raw native token is persisted. Successful registration is shown only after the transaction confirms; token/configuration/network failures remain auxiliary to Auth and domain flows. Expo acquisition is bounded to 15 seconds; no polling or generic offline queue is introduced.

A revoked/unusable permission removes only the current user's installation registration using the existing owner-delete Rules. Receipt-worker invalidation remains the separate Admin-only `pushEnabled: false` state. Later valid self-registration can reactivate that document with a new server generation; Slice 1 fingerprint/generation guards remain unchanged. Sign-out pauses registration, waits for in-flight reconciliation and confirms own-registration deletion before Firebase Auth sign-out. Failed cleanup retains Auth and permits retry. A subsequent account uses the same installation ID under its own UID, after the previous registration is removed. This is push targeting cleanup, not individual-device Auth revocation (OPEN-014 remains open).

See [Slice 3 acceptance evidence](PHASE_5_SLICE_3_ACCEPTANCE.md). The user later supplied existing EAS IDs and approved native rebuilds: real native token acquisition and device registration succeeded in both apps. Physical delivery remains unverified; deterministic dependencies also cover lifecycle behavior. See the follow-up in the Slice 3 report.

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

`notifyOfferNegotiation` is a Firestore document-created trigger on `/activityEvents/{eventId}`. The Phase 2 paths dispatch `OFFER_PUBLISHED`, `OFFER_COUNTERED` (both actor directions), and `OFFER_ACCEPTED` (both actor directions). Phase 4 submission/resubmission dispatch CONTRACT_SUBMITTED to the active Parent; review decisions additionally dispatch `CONTRACT_APPROVED` and `CONTRACT_CHANGES_REQUESTED`; Reward delivery dispatches `REWARD_DELIVERED` to the active Child and receipt confirmation dispatches `REWARD_RECEIVED_CONFIRMED` to the active Parent. Rejection remains an activity event without a push requirement.

The dispatcher loads the authoritative Offer, the event's immutable revision, and active recipient membership; acceptance additionally verifies the committed Contract source. Historical committed events may be processed after later revisions become current. It never reads terms into copy or payloads, accepts client-selected recipients, or participates in a command transaction. Only the intended participant's `pushEnabled: true` registrations for the correct app variant are targeted, with identical tokens deduplicated.

One server-only `/activityEvents/{eventId}/notificationEffects/expo` record identifies each logical effect. A transaction claims a two-minute lease; concurrent/repeated trigger delivery cannot independently claim the same effect. `COMPLETE` and `SKIPPED` are terminal. Transient failures use event retry/backoff, bounded to three claims; exhaustion records `FAILED`. Effect records contain only operational state, recipient UID, minimal routing metadata and ticket IDs, never push tokens or negotiated content. These are delivery records, not a second domain lifecycle or command idempotency system.

Expo sends are batched at 100. Immediately reported `DeviceNotRegistered` registrations are disabled only if their token has not rotated. `COMPLETE` means tickets accepted or no eligible registrations, not confirmed physical delivery. Expo does not provide an exactly-once send operation: an ambiguous network failure or crash after sending can repeat a physical push, while the committed event still owns one logical effect. Receipt polling/retention was deferred from Phase 2 and is now implemented by Phase 5 Slice 1 (section 10).

Both apps suppress foreground banners/sounds for this realtime-first workflow. Explicit notification responses validate shared minimal routing metadata, wait for Auth and navigation readiness, then use app-owned destinations (section 7). Offer responses use the existing home/inbox; Contract and Reward responses open their existing detail screens. No notification handler mutates domain state or requests push permission.

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
| Reward delivered     | Child             | "Confirm when you receive your reward."       |
| Reward confirmed     | Parent            | "The reward was confirmed as received."       |
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

Phase 5 Slice 2 implements a shared response coordinator in `packages/notifications`. The canonical strict Zod payload remains `type`, `entityType`, `entityId`, `familyId`, with the existing event/entity compatibility matrix. IDs must be single document IDs: empty, dot segments, surrounding whitespace, path/query/fragment separators and control characters are rejected. Extra URL, terms, notes and credential fields are rejected; no generic URL navigation is supported.

Each app owns an explicit mapping in its `src/notifications/routing.ts`: OFFER → `/` (existing negotiation inbox), CONTRACT → `/contracts/{encodedId}`, REWARD → `/rewards/{encodedId}`. OFFER_ACCEPTED identifies a CONTRACT and now opens Contract detail; CONTRACT_APPROVED retains its existing Contract semantics. Parent and Child use separate Expo Router trees and their unchanged distinct schemes. There is no individual Offer detail route or selected-family store to update. The existing home projection supports its current single-family context; a notification does not create a new multi-family selector or privileged read.

Both roots listen during session restoration. Only default-action notification responses are normalized, using request identifier + action identifier. A validated pending intent stays in memory until Auth resolves and the root navigation key exists. Signed-out/error resolution drops it; a pending intent bound to a UID is discarded on account switch. Live listeners register before synchronous Expo last-response retrieval, and the matching native last response is cleared. Consumed identifiers survive root/listener remounts for the current JS process; no payload or navigation history is persisted. Pending state is consumed before navigation, preventing reentrant duplicate navigation and retry loops. A newer invalid tap discards any earlier pending intent.

Destination screens use their normal authenticated Firestore readers and Rules. They show current authoritative state even for stale notifications. Missing or inaccessible entities use existing safe unavailable/error UX without revealing another family's contents. Native cached reads and uncached offline errors retain ADR-020 semantics; reconnect uses the existing listeners. Routing never changes a domain lifecycle, infers ownership from familyId, writes receipt state, queues a mutation or creates a custom entity cache. See [Slice 2 acceptance evidence](PHASE_5_SLICE_2_ACCEPTANCE.md).

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

Phase 5 Slice 1 extends the existing dispatcher and Expo gateway. Successful tickets create deterministic server-only `pushReceipts/{workId}` records, keyed by a SHA-256 digest of event ID, ticket ID and message index. Records contain the ticket/event identity, registration document paths, SHA-256 token fingerprints and captured `lastSeenAt`, plus processing timestamps/status/attempt count. They never contain raw push tokens, message copy, credentials or domain snapshots. Identical eligible tokens are sent once and bind all matching registrations. Accepted send batches are retained before requesting subsequent batches.

`processExpoPushReceipts` is a Cloud Functions scheduled worker, every 15 minutes UTC. Each run claims at most 100 due records with transactional two-minute leases; only the current lease may finalize work. First lookup is eligible 15 minutes after sending. `nextAttemptAt` doubles as lease expiry so interrupted work is reclaimable without a global lock. Receipt lookup uses Expo's `getReceipts` endpoint and never invokes the sender.

Receipt success means provider handoff, not confirmation of physical device delivery. `DeviceNotRegistered` completes work and disables only registrations whose token fingerprint and registration generation still match, atomically with terminal receipt state. The canonical device field remains `pushEnabled: false`; the document, Auth session/user and membership remain intact. A late receipt cannot invalidate a rotated token or a legitimate later self-registration, including one using the same token. Normal self-registration may activate a refreshed token under unchanged ownership/shape Rules.

Missing receipts, network errors, HTTP 429/5xx, top-level `TOO_MANY_REQUESTS` and `MessageRateExceeded` retry only lookup, at 15/30/60/120-minute delays after the preceding attempt. Work stops after five attempts or 24 hours. `MessageTooBig` is a terminal message failure. `MismatchSenderId`, `InvalidCredentials`, other HTTP request failures, malformed responses and unknown provider errors stop without disabling devices. Unknown raw error strings are normalized rather than logged. Terminal failures log only a stable work ID and category once per effective transition.

Completed/exhausted records retain minimal evidence for seven days, then the same worker deletes at most 100 eligible records per run. Two composite indexes support pending and cleanup queries. Clients have no receipt read/write access under the existing catch-all denial. Receipt processing creates no activity/domain events, rewards or authentication changes. The existing three-attempt event delivery retry remains separate; an ambiguous send failure can still repeat a physical push, as Expo has no exactly-once send operation.

The scheduled callback avoids live Expo calls in the emulator; deterministic integration invokes the same processor with fake Expo transport. See [Phase 5 Slice 1 acceptance](PHASE_5_SLICE_1_ACCEPTANCE.md) and [Expo receipt documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

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

## Bilateral Reward committed-event effects — ADR-046

REWARD_DELIVERED validates Parent actor/deliveredBy and native deliveredAt against the authoritative awaiting or subsequently fulfilled Reward, deterministic identity and matching APPROVED Contract. It notifies the active Child: “Reward delivered” / “Your parent marked your reward as delivered. Confirm when you receive it.” REWARD_RECEIVED_CONFIRMED validates Child actor/confirmedBy, FULFILLED status and equal confirmedAt/fulfilledAt, then notifies the active Parent: “Reward confirmed” / “The reward was confirmed as received.” No reward content is included.

Both use existing device/token filtering, Expo leases, ticket/receipt processing, retries and completed-effect deduplication. Payloads contain only type, entityType REWARD, Reward ID and familyId. App-owned `/rewards/[rewardId]` routes load current state; taps never confirm receipt. These transactional events have no new optional preference. Transport failure cannot roll back committed domain state. Physical delivery is not implied by a successful receipt.

## 11. Contract deadline reminders (Phase 5 Slice 4A)

`generateDeadlineReminders` is an hourly UTC scheduled Function. Indexed ACTIVE/deadline-range queries select only future deadlines in the next 24 hours, in pages of 100 ordered by deadline and document ID. Each candidate transaction rechecks current Contract state, deadline and active Child membership and creates one deterministic SYSTEM `CONTRACT_DEADLINE_REMINDER` activity event. Identity is `deadline_<sha256(contractId)>_24h`; accepted deadlines are frozen, and the event remains the permanent deduplication record. No Contract marker or lifecycle mutation is written.

The existing activity-event dispatcher owns the normal Expo effect/lease, tickets, receipt processing, device filtering and retries. It rechecks ACTIVE status, matching deadline and active Child membership before claiming delivery; obsolete intents are skipped. Generic copy is “Deadline tomorrow” / “Your contract is due tomorrow.” The strict payload carries only CONTRACT_DEADLINE_REMINDER, CONTRACT, Contract ID and Family ID. Existing Child entity routing opens current Contract detail, including changed states for stale taps. A state change after the delivery claim or an ambiguous transport outcome can still produce a stale/duplicate physical push; the logical event remains unique.

ADR-045 now defines default-enabled account preferences: Child deadline and Parent pending-Reward reminders. Slice 4B removes the temporary Slice 4A operational activation gate. Generation and dispatch check the recipient preference; missing preference means enabled. No expiry behavior is added; OPEN-011 remains unresolved. See [Slice 4A evidence](PHASE_5_SLICE_4A_ACCEPTANCE.md) and [Slice 4B evidence](PHASE_5_SLICE_4B_ACCEPTANCE.md).

## Approved reminder policy — ADR-045 / Phase 5 Slice 4B

Optional reminders are account-scoped and default enabled when no preference is stored. `users/{uid}/preferences/reminders` contains exactly `deadlineRemindersEnabled: boolean` for a Child or `pendingRewardRemindersEnabled: boolean` for a Parent. Only that authenticated owner may read/write; Rules derive allowed fields from the server-owned profile accountType. No tokens, device data, role field or domain state is stored here.

Child deadline reminders retain the future 24-hour ACTIVE window. Parent pending-Reward reminders are eligible once earnedAt is at least 48 hours old and status is exactly PENDING_FULFILLMENT, with matching approved Contract and active owning Parent. Each has one deterministic logical identity, transactional preference/state validation and the existing Expo delivery/receipt model. No recurring reminders or transactional-notification toggles exist. OS permission remains separate; enabled preference alone does not claim deliverability. ADR-045 resolves Slice 4A's activation-policy boundary; its hourly schedule is now active under preferences. No deployment is part of implementation. OPEN-010/011/014 remain unresolved.

### Pending Reward reminder implementation

`generateRewardReminders` runs hourly UTC. Indexed `(status, earnedAt)` queries select PENDING_FULFILLMENT Rewards at least 48 hours old, at most 100 candidates per run. A server-only `reminderJobs/pendingRewards` cursor stores earnedAt/document ID, advances conditionally after processing, and wraps at the end; concurrent workers cannot overwrite a newer cursor. This prevents old already-generated work starving later Rewards while bounding each hourly run. Backlog or re-enabled older items may wait for subsequent scan cycles. Each transaction checks the current Reward, matching deterministic approved Contract/source terms/earning timestamp, active owning Parent and Parent preference. It creates a permanent SYSTEM `PENDING_REWARD_REMINDER` event keyed `pending_reward_<sha256(rewardId)>_48h`. The existing dispatcher rechecks eligibility/preferences and sends “Reward still waiting” / “You still have an earned reward to fulfill.” Routing data has only type, REWARD, Reward ID and familyId, opening the current Parent Reward detail. No Reward/Contract mutation or recurring send is introduced. Unusable/absent devices follow existing COMPLETE-with-zero-targets behavior; preference ON does not imply OS permission. Once an intent exists, re-enabling cannot create a second logical reminder, including after skipped/no-channel delivery. State/preference changes after delivery claim can still yield stale physical pushes, whose taps load current state.
