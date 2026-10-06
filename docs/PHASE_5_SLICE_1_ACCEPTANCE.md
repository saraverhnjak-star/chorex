# Phase 5 Slice 1 — Expo receipts and invalid-device cleanup

Verified 2026-10-06. Slice 1 is implemented; the whole Phase 5 acceptance gate is **not** complete. No commit, push or deployment was performed. No physical Expo/APNs/FCM delivery was claimed.

## Scope and architecture audit

The existing `dispatchNegotiationNotification` constructs generic messages from committed authoritative activity events, verifies the associated Offer/Contract/Review/Reward and active recipient membership, and loads that recipient's device collection with `pushEnabled == true`. Correct app variant and Expo token shape are required; duplicate tokens are sent once. Routing remains the same minimal four fields. The existing Expo transport batches 100 sends with a ten-second timeout.

One deterministic event `notificationEffects/expo` document owns the delivery lease and up to three attempts. Completed effects deduplicate redelivery. Ticket IDs were retained only on the effect, with no registration linkage or subsequent lookup. Immediate DeviceNotRegistered tickets already disabled registrations. Other failed send tickets used the existing bounded delivery retry. Expo does not support exactly-once sends; an ambiguous send failure can repeat a physical push. This limitation remains separate from receipt processing.

This slice reuses those paths, Firebase Cloud Functions, existing device registration and Expo Push Service. It adds no dependency, external queue, domain command, business notification, permission UI or domain transition. No ADR is necessary: ADR-018/019 and the existing notification architecture already govern this work.

## Changed files

- `functions/src/negotiationNotifications.ts`: bind accepted tickets to registrations; persist accepted batches immediately, reuse safe invalidation for immediate tickets.
- `functions/src/pushReceipts.ts`: receipt transport, classification, exact-registration invalidation and bounded leased processor.
- `functions/src/index.ts`: scheduled `processExpoPushReceipts` export.
- `functions/tests/negotiation-notifications.test.mjs` and `push-receipt-fixture.mjs`: extend existing focused coverage with a small deterministic Firestore test double.
- `firebase/firestore.indexes.json`: pending-work and retention query indexes.
- `firebase/verify-push-receipts.mjs`: actual Firestore/Auth and client Rules integration with injected Expo fakes.
- `firebase/verify-device-registration.mjs`: allow the isolated localhost verification port as well as existing default port; assertions remain unchanged.
- `package.json`: reproducible receipt emulator command.
- `docs/04_FIRESTORE_SCHEMA.md`, `05_AUTH_AND_SECURITY.md`, `06_PUSH_NOTIFICATIONS.md`, `07_IMPLEMENTATION_ROADMAP.md`, `functions/README.md` and this report: schema, boundary, operating model and acceptance evidence.

## Ticket and receipt persistence

Successful send tickets create `pushReceipts/{workId}`, deterministic SHA-256 of event ID, ticket ID and message index. Work captures ticket/event identity and each intended registration document path, token SHA-256 fingerprint and native `lastSeenAt` generation. Token deduplication binds all matching eligible registrations. No raw push token, notification body, private child content, credential or domain snapshot is stored in work or logs.

Records have native UTC timestamps, complete/status, attempts, eligibility and expiry; claims add a lease ID, and terminal processing adds normalized category and seven-day deletion timestamp. Repeated persistence does not reset state. Pre-ticket failure creates no work. Accepted first batches remain processable if a later send batch fails. Existing event effect ticket bookkeeping is preserved.

## Processing model and classifications

The Cloud Functions scheduler runs every 15 minutes UTC, timeout 120 seconds and maxInstances 1. It claims at most 100 due work records, with two-minute per-record transaction leases. `nextAttemptAt` also represents lease expiry for crash recovery. Transactions recheck eligibility and attempt/expiry bounds; only the current lease may finalize. No global lock is used.

First lookup waits 15 minutes. Expo's supported POST `getReceipts` transport uses a ten-second timeout and sends ticket IDs only. The worker deduplicates IDs in a lookup batch and never invokes the send transport. Terminal cleanup removes at most 100 records per run, seven days after completion/exhaustion. Pending and cleanup queries have checked-in composite indexes.

| Result                                                     | Classification and action                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `status: ok`                                               | SUCCEEDED / PROVIDER_ACCEPTED; provider handoff, registration unchanged                  |
| `DeviceNotRegistered`                                      | DEVICE_INVALID; atomically disable only matching current registrations and complete work |
| Missing receipt                                            | NOT_AVAILABLE; bounded lookup retry                                                      |
| Network failure, HTTP 429/5xx, top-level TOO_MANY_REQUESTS | TRANSIENT_TRANSPORT; bounded lookup retry                                                |
| `MessageRateExceeded`                                      | Bounded lookup retry; never resend from this worker                                      |
| `MessageTooBig`                                            | Terminal MESSAGE_ERROR, no device invalidation                                           |
| `MismatchSenderId`, `InvalidCredentials`                   | Terminal PROVIDER_ERROR, no device invalidation                                          |
| Other non-success HTTP requests                            | Terminal PERMANENT_REQUEST, no device invalidation                                       |
| Malformed envelope/receipt                                 | Terminal MALFORMED_RESPONSE, no device invalidation                                      |
| Unknown provider error                                     | Terminal UNRECOGNIZED_ERROR, raw strings not logged, no device invalidation              |

Retries wait 15/30/60/120 minutes after attempts 1–4, then stop at five attempts or 24-hour work expiry. Interrupted claims also count toward this cap. Success is not evidence of physical receipt by a phone. Operational terminal warnings contain only stable work ID and normalized category, emitted only for an effective terminal transition; retries create no domain activity/audit events.

API timing and categories follow [Expo's receipt documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

## Invalidation, refresh and security

The transaction compares the ticket's captured token fingerprint **and** registration generation against the current document. Only a still-enabled matching registration receives `pushEnabled: false`. Other devices, replacement tokens and later legitimate re-registration remain active. Immediate send-ticket invalidation reuses this guard. A legacy binding without a native generation does not invalidate a current registration that now has one.

Normal owner registration/update already permits a new valid token and pushEnabled true, with server lastSeenAt and preserved createdAt. This implementation adds no competing token state, metadata or custom cache. Receipt cleanup cannot re-enable a device. Auth users/refresh tokens/sessions and family membership are never mutated. OPEN-014 remains unresolved.

Receipt documents are server-only under existing catch-all Rules denial; no Rules relaxation was needed. Emulator tests deny receipt get/list/create/update for the owner, another authenticated user and unauthenticated context. Another user cannot invalidate a device, and the owner cannot forge pushEnabled false through direct update. Legitimate owner refresh/reactivation succeeds. Existing device shape/ownership/delete tests also pass.

## Automated evidence and reproduction

Focused notification coverage: **30 passing tests**. Backend suite: **175 passing tests**. Parent: **58 passing tests**. Child: **70 passing tests**; **303 total**. Coverage includes ticket capture and pre-ticket failures; mixed and partial batch persistence; successful/permanent/transient/malformed categories; bounded backoff, 24-hour expiry and seven-day cleanup; 100-record processing/deletion bounds; concurrent claims and stale lease responses; token rotation and same-token re-registration; immediate invalidation; sender effect deduplication and unchanged Phase 2–4 routing intents.

Commands:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm functions:build
pnpm emulators:verify:push-receipts
pnpm emulators:verify:device-registration
pnpm emulators:verify:phase2
pnpm emulators:verify:contract-review-history
pnpm emulators:verify:fulfill-reward
CI=1 pnpm --filter @chorex/parent exec expo export --platform ios --output-dir /tmp/chorex-receipts-parent-export
CI=1 pnpm --filter @chorex/child exec expo export --platform ios --output-dir /tmp/chorex-receipts-child-export
```

For this session, existing app emulators were preserved. A temporary configuration copied firebase.json and changed Auth to 19099, Firestore to 18080, Functions to 15001, hub to 14400, logging to 14500 and disabled UI. Use `firebase emulators:exec --config <temporary-config> --project dev` with these ports when default services are already running. Receipt verification uses `--only auth,firestore`, calling the actual dispatcher/processor with injected fakes; no function trigger competes for its event. The scheduled callback intentionally avoids live Expo networking in emulators.

The receipt integration seeds a committed Offer event, registers two devices through client Rules, sends fake Expo messages, persists tickets, concurrently processes valid/unregistered receipts, and dispatches a second event. Only the valid registration is targeted. Repeating processing and redelivering the event causes no lookup/send duplication. Auth user and membership snapshots remain identical. Owner refresh activates the invalid installation; the old token is excluded. A late receipt for a superseded token leaves the newer registration active, and a final successful receipt preserves it.

The full existing completion/submission/changes/resubmission/multi-round history/approval/fulfillment harness passed against Auth/Firestore/Functions with fake Expo send tickets, including committed effects, transport failure, redelivery, real transaction races and direct-write denials. Existing acceptance, rejection, counteroffer, Phase 2 notification and Contract-read harnesses were verified separately with clean isolated Firestore data. One initial combined run failed a harness's global “no Rewards” assertion because the preceding fulfillment suite had deliberately created Rewards; rerunning with isolated clean data resolves the test fixture contamination. Domain code was not changed.

The final validation includes whole-workspace typecheck/lint/format checks, Functions build and both iOS bundle exports. No native binary rebuild is required by this backend-only change. No physical development-device push delivery, live Expo call or deployed Cloud Scheduler execution was performed. Production scheduling requires normal future deployment of the checked-in function and indexes; this task did not deploy them.

## Remaining Phase 5 work

Slice 1 is complete. The Phase 5 gate remains open for notification deep-link hardening, contextual permission/token-lifecycle UX, deadline and pending-Reward reminders and optional reminder preferences. The next safe slice is **notification deep-link routing hardening**, validating authenticated entity navigation and stale/inaccessible targets in both apps. Permission UX is a separate subsequent slice. OPEN-010, OPEN-011 and OPEN-014 remain unresolved; no lifecycle/expiry/cancellation/undo behavior is added.
