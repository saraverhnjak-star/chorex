# Phase 5 Slice 4A — Contract deadline reminders

Verified 2026-10-07. Slice 4A implements the backend reminder pipeline; it does not make optional reminders release-ready for live users. Phase 5 remains incomplete. No commit, push or deployment was performed.

## Architecture and eligibility

`functions/src/contractDeadlineReminders.ts` implements server generation, exported as `generateDeadlineReminders` using the existing v2 scheduled Function infrastructure. Cadence is every 60 minutes, UTC; timeout 120 seconds and maxInstances 1. Correctness does not depend on single-instance scheduling.

Queries constrain status ACTIVE and `now < deadlineAt <= now + 24 hours`. A checked-in `(status, deadlineAt)` composite index supports pages of at most 100, ordered by deadline and document ID. Pagination continues through only the eligible deadline window, rather than scanning all Contracts. Already-generated early pages do not hide later candidates. Server Timestamp.now supplies production time; tests inject a deterministic server clock, re-read inside each transaction. Hourly cadence normally creates work 23–24 hours before deadline, but scheduler downtime or delayed transport can deliver later; no exact delivery-time guarantee is claimed.

Each candidate transaction rereads the Contract, permanent logical event and active Child membership before writing. It checks ACTIVE, future/24-hour deadline and authoritative CHILD role/ACTIVE membership under the Contract family. READY_FOR_REVIEW, CHANGES_REQUESTED, APPROVED, CANCELLED, EXPIRED, passed deadlines and inactive/nonmember recipients produce no new intent.

## Identity, races and notification integration

The permanent event ID is `deadline_<sha256(contractId)>_24h`. Frozen accepted deadlines need one identity per Contract, without a Contract marker. Atomic `create` plus reading that identity makes repeats, retries and concurrent workers create at most one logical intent. A Contract submission that commits before the reminder transaction validates/retries prevents intent creation. Submission after the reminder commits is a legally later operation, not a competing Contract mutation.

The SYSTEM activity event contains only Contract/family identifiers, deadline Timestamp and creation Timestamp, with no actor UID or private terms. The existing activity-event trigger and `dispatchNegotiationNotification` resolve the Child and target only enabled CHILD registrations. The dispatcher additionally checks deterministic event identity, matching frozen deadline, ACTIVE status, current future window and active Child membership before claiming its normal effect lease. Changed-state reminders become SKIPPED. After a successful delivery claim, an external state change may still precede the physical push; stale taps use current authoritative detail reads.

Copy is “Deadline tomorrow” / “Your contract is due tomorrow.” The strict canonical payload carries only `CONTRACT_DEADLINE_REMINDER`, `entityType: CONTRACT`, Contract ID and Family ID. The shared schema recognizes this documented reminder category; existing Child Contract routing is reused unchanged. No local scheduler/navigation framework was added.

Normal effect leases, three-attempt transport retry, token deduplication, ticket retention, receipts and exact-generation invalid-device cleanup are reused. Multiple installations do not create extra logical intents. Receipt processing never generates reminder events. Ambiguous Expo network outcomes can repeat a physical push; logical identity is unique, physical exactly-once delivery is not promised.

No Contract, deadline, task, completion, review, Reward, membership or Auth mutation is performed. Existing catch-all Rules deny client access to event/effect/receipt work, and clients cannot invoke this worker through a callable. Cloud Scheduler invocation uses the standard scheduled-function IAM boundary. No new Rules exception exists.

## Preference and lifecycle boundaries

There is no documented deadline-reminder preference field or product opt-in/opt-out default. The server operational parameter `CONTRACT_DEADLINE_REMINDERS_ENABLED` therefore defaults to false. The exported hourly schedule exists but generates no live work until policy is decided. This is a release gate, not a new user preference/default. Do not enable it for live users before deciding and implementing the optional-reminder policy in the next slice. Tests call the generation implementation directly with controlled fixtures.

OPEN-011 remains unresolved: no expiry, cancellation, at-deadline alert or completion cutoff was added. OPEN-010 and OPEN-014 remain unresolved. No Reward reminder, recurring daily reminder or preference screen was implemented. Real native registration succeeded previously in both applications; physical Expo/APNs delivery and deployed Scheduler execution remain unverified.

## Files changed for this slice

- `functions/src/contractDeadlineReminders.ts`, `index.ts`, `negotiationNotifications.ts`: hourly gated generator and existing delivery integration.
- `packages/domain/src/notification.ts`: canonical deadline-reminder payload category/entity compatibility.
- `firebase/firestore.indexes.json`, `verify-contract-deadline-reminders.mjs`: query index and guarded integration verification.
- `functions/tests/contract-deadline-reminders.test.mjs`: six focused tests; existing receipt fixture gains range/cursor support.
- `packages/notifications/tests/response-routing.test.cjs`: extend the existing category table, without new UI tests.
- `docs/04_FIRESTORE_SCHEMA.md`, `06_PUSH_NOTIFICATIONS.md`, `07_IMPLEMENTATION_ROADMAP.md` and this report: implementation, release boundary and evidence. Existing Slice 3 changes in the working tree were preserved.

## Verification and reproduction

Passed **181 Functions tests**, including six new reminder tests and all existing dispatcher/receipt/command regressions. Passed **51 shared notification tests**, including the new deadline semantic intent case and existing response coordinator/device lifecycle tests. Focused coverage includes exact 24-hour inclusion, now/past/beyond exclusions, active Child recipient, all excluded statuses, concurrent workers, repeat deduplication, 105-record pagination, state/membership/time changes after candidate lookup, immutable Contract data, minimal copy/payload, token deduplication and receipt reuse.

The isolated Firestore harness verifies actual concurrent transactions, one intent, fake Expo dispatch/ticket retention, duplicate run/delivery, already-submitted exclusion, a state change between lookup and transaction, unchanged Contract snapshots, and denied client reads/writes to event/effect/receipt work and direct Contract status mutation. It does not call live Expo. Existing app/emulator sessions were preserved. An initial run with the temporary config and `--project dev` resolved the project as literal `dev` and correctly failed the local safety guard; explicitly using `--project chorex-dev` passed. This was environment routing, not a domain defect.

```sh
pnpm functions:build
node --test functions/tests/contract-deadline-reminders.test.mjs functions/tests/negotiation-notifications.test.mjs
pnpm --filter @chorex/functions test
pnpm --filter @chorex/notifications test
pnpm exec firebase emulators:exec --project chorex-dev --only firestore 'node firebase/verify-contract-deadline-reminders.mjs'
pnpm typecheck
pnpm lint
pnpm format:check
pnpm exec prettier --check docs/PHASE_5_SLICE_4A_ACCEPTANCE.md docs/04_FIRESTORE_SCHEMA.md docs/06_PUSH_NOTIFICATIONS.md docs/07_IMPLEMENTATION_ROADMAP.md
CI=1 pnpm --filter @chorex/parent exec expo export --platform ios --output-dir /tmp/chorex-4a-parent-export
CI=1 pnpm --filter @chorex/child exec expo export --platform ios --output-dir /tmp/chorex-4a-child-export
```

For isolation while default app emulators run, the verification used a temporary copy of firebase.json with Firestore 18080, websocket 19150, hub 14400, logging 14500 and UI disabled, preserving absolute Rules/index paths. Pass `--config <temporary-config>` and keep the explicit project. Emulator guard permits loopback 8080/18080 only. Composite index deployment is still required later; emulator query execution does not prove production index provisioning.

Existing Parent and Child notification-routing regressions also passed (four tests per app). Workspace typecheck, lint, formatting, Functions build and both iOS bundle exports passed. No native binary rebuild was needed. No UI behavior changed; no new UI test suite was created.

## Completion

Slice 4A backend infrastructure is complete and locally verified. Live-user activation is blocked on the missing optional-reminder preference decision, and physical delivery remains unverified. The next slice must define/enforce reminder preferences and address pending-Reward reminders. The entire Phase 5 acceptance gate is not complete.
