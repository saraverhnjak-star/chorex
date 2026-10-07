# Phase 5 Slice 4B — Reminder preferences and pending-Reward reminders

Verified 2026-10-07. ADR-045 records the user-approved default-enabled account policy before implementation. No commit, push, deployment, real Expo send or physical APNs delivery was performed.

## Decision and persistence

Optional reminders are enabled when no explicit preference exists. Child accounts control only `deadlineRemindersEnabled`; Parent accounts control only `pendingRewardRemindersEnabled`. The strict role-specific Zod schemas live in packages/domain. Persistence is one `users/{uid}/preferences/reminders` document containing exactly the account's boolean. No role, token, timestamp, device-specific preference or hypothetical category framework is stored.

Existing architecture permits narrowly scoped non-sensitive user-owned preference writes. Rules allow only authenticated owner get/create/update at the literal reminders document, derive allowed shape from the authoritative user profile accountType and reject opposite-role fields, extra data and writes to another account. List/delete are denied. Core family/domain/device Rules remain unchanged. Missing preference defaults ON; malformed persisted preference is not silently treated as a user opt-in.

The typed firebase-client adapter subscribes with cache metadata and persists through a native Firestore transaction, rechecking current Auth UID. It does not queue an offline write or claim saved success before backend confirmation. The shared hook removes old listeners, ignores obsolete account/save callbacks, retains errors as auxiliary and disables editing until loaded or while saving. Failed saves keep the confirmed setting available for retry. Cached settings are explicitly marked as saved data, not a competing source of truth.

## Minimal app controls and permission boundary

No dedicated Settings/Profile surface or preference persistence previously existed. Both Home surfaces now compose a shared accessible Switch card beside existing notification permission controls:

- Child: **Deadline reminders**.
- Parent: **Pending reward reminders**.

Only the appropriate role's setting appears. Switches have explicit accessible labels/checked/disabled state, loading/saving/error copy and existing design tokens/Dynamic Type. Copy states that this account preference controls optional reminders and delivery also requires device notification permission. A preference can remain ON while OS permission is denied. Changing it does not request permission, open Settings, modify registration or change any Contract/Reward state. Transactional notifications are unaffected.

## Deadline activation

Slice 4A generation is extended only at its existing transactional eligibility boundary to read Child preferences. OFF creates no intent; absent/ON preserves the verified ACTIVE/future/next-24-hour rules and existing deterministic Contract identity. The temporary `CONTRACT_DEADLINE_REMINDERS_ENABLED` operational gate is removed; the hourly export now generates under the approved preference policy. No deployment occurred, so this is checked-in activation rather than a claim of running production scheduling.

The existing dispatcher also checks Child preference before claiming delivery. Re-enabling an eligible ungenerated Contract can create its first event; it never creates a second event after any previous logical intent. Existing receipt processing generates no new reminder.

## Pending-Reward worker and race safety

`generateRewardReminders` runs every 60 minutes UTC through existing v2 scheduling, with 120-second timeout and maxInstances 1. Correctness does not depend on single-instance scheduling.

The indexed query is status PENDING_FULFILLMENT plus `earnedAt <= serverNow - 48 hours`, ordered by earnedAt/document ID, limited to **100 candidates per invocation**. A server-only `reminderJobs/pendingRewards` cursor stores lastRewardId/earnedAt, advances conditionally after processing and wraps at the end. Different current cursors cannot be overwritten by a competing older scan. This prevents old already-generated work repeatedly occupying the first page. Backlog, missed scheduling and re-enabling earlier items can delay eligibility processing until later scan cycles; exact wall-clock delivery is not promised.

Each candidate transaction rereads Reward/event, validates the canonical deterministic Reward identity and approved Contract, matching family/participants/frozen terms/earning timestamp, active owning Parent and Parent preference. Reward status/threshold and preference are authoritative transactional reads. Fulfillment or disablement that commits first prevents reminder creation; a concurrent write after those reads causes Firestore retry/validation. fulfillReward is not locked or delayed by any application-level mechanism.

The permanent event is `activityEvents/pending_reward_<sha256(rewardId)>_48h`, SYSTEM actor with no actor UID, PENDING_REWARD_REMINDER type, REWARD entity ID, familyId and server creation Timestamp. Exactly one logical identity survives retries, concurrent workers, preference re-enablement and multiple devices. No recurring daily reminders are implemented. Worker writes only activity intent and operational cursor, never Contract/Reward/task/review/membership/Auth state.

## Existing notification pipeline and routing

The same activity-event trigger/dispatcher owns effect leases, transport retry, device filtering/token deduplication, tickets, receipts and invalid-registration cleanup. Reward dispatch reuses the same transactional eligibility helper, including preference and pending status. A fulfilled/disabled/invalid source before delivery claim is SKIPPED. State/preference changes after the claim can still precede a physical push; this unavoidable effect timing is distinct from creating a new intent after fulfillment.

Copy is **Reward still waiting** / **You still have an earned reward to fulfill.** Strict payload includes only PENDING_REWARD_REMINDER, REWARD, Reward ID and familyId. Existing Parent semantic routing opens current Reward detail, so stale taps show the authoritative fulfilled state through normal readers. No URL or historical terms are carried. Shared schema adds only the already-requested reminder category; no navigation redesign was needed.

Normal usable registrations determine channels. No eligible registration follows the existing COMPLETE-with-zero-targets behavior; ON preference is not proof of permission or physical delivery. A generated intent remains consumed after no-channel or skipped dispatch, preventing retroactive duplicate logical reminders. Ambiguous Expo failures can duplicate physical sends; physical exactly-once delivery is not claimed.

## Security and focused evidence

Extended the existing deadline emulator utility instead of duplicating notification suites. Real Firestore Rules verify own reads/writes, Parent A versus Parent B, Child versus Parent setting, Parent versus Child setting, opposite-role fields/extra sensitive fields and unauthenticated writes. Internal activity/effect/receipt/job documents remain unreadable/unwritable; direct Contract lifecycle writes remain denied.

The isolated flow verifies Child OFF suppresses eligible deadline work, ON creates one concurrent intent, repeat generation/delivery deduplicates, submitted Contracts are excluded and Contract snapshots remain unchanged. Parent OFF suppresses old pending Rewards, ON creates exactly one concurrent reminder, before-48h and fulfilled fixtures are excluded, expected Parent payload/ticket is produced and Reward snapshots remain unchanged by reminder jobs. A real executeFulfillReward call is injected between candidate lookup and transaction: canonical fulfillment succeeds, the Reward becomes FULFILLED and no reminder event is created afterwards. No live Expo transport is used.

New/extended tests are limited to uncovered behavior:

- Existing deadline tests: one OFF/re-enable/dedup test.
- New Reward worker tests: five focused cases covering threshold/default/exclusions, OFF/re-enable/concurrency, fulfillment/member/preference/source race, existing dispatcher integration and bounded 105-record cursor progress/wrap.
- Existing shared routing category table: PENDING_REWARD_REMINDER semantic REWARD intent.
- Existing Child adapter suite: missing-default/role-specific confirmed write, offline failure and wrong current UID.
- Two shared-hook tests in the existing Parent native test environment: role-specific persistence, listener-owned values, pending/offline failure and account-switch cleanup. No trivial visual test suite was added.
- Existing Home bootstrap mocks now provide the shared hook; existing notification/permission/routing tests remain intact.

## Checks actually run

Passed final automated totals: **187 Functions**, **52 shared notification**, **70 Parent**, **77 Child** tests: **386 passing tests**. The full suite was used for final Phase 5 functional regression because canonical payload, preference Rules and shared client/UI plumbing changed. Existing dispatcher/receipts/device lifecycle/fulfillment/routing suites were reused; unrelated Phase 2–3 emulator scenarios were not duplicated.

Passed focused emulator verification against isolated Firestore 18080 (websocket 19150, hub 14400, logging 14500, UI disabled), explicit project chorex-dev and existing Rules/index files. Existing native app/emulator data was preserved. Passed workspace typecheck/lint/formatting, changed documentation formatting, Functions build and both iOS bundle exports. No native dependency/build configuration changed or binary rebuild was necessary. No new manual/native control inspection is claimed by this slice.

Reproduction:

```sh
pnpm functions:build
node --test functions/tests/contract-deadline-reminders.test.mjs functions/tests/pending-reward-reminders.test.mjs functions/tests/negotiation-notifications.test.mjs
pnpm --filter @chorex/notifications test
pnpm --filter @chorex/parent test 'reminder-preference|bootstrap|notification'
pnpm --filter @chorex/child test 'contract-adapter|bootstrap|notification'
pnpm exec firebase emulators:exec --project chorex-dev --only firestore 'node firebase/verify-contract-deadline-reminders.mjs'
pnpm --workspace-concurrency=1 -r --if-present test
pnpm typecheck
pnpm lint
pnpm format:check
CI=1 pnpm --filter @chorex/parent exec expo export --platform ios --output-dir /tmp/chorex-4b-parent-export
CI=1 pnpm --filter @chorex/child exec expo export --platform ios --output-dir /tmp/chorex-4b-child-export
```

When default emulators are running, use a temporary firebase.json copy with the isolated ports/absolute Rules/index paths and pass --config. The harness accepts only the declared loopback emulator ports/project. Production index provisioning and Scheduler deployment remain future deployment operations, not emulator-proven facts.

## Changed files and completion

ADR-045 and docs 04/05/06/07 record policy/security/architecture/roadmap. Shared domain adds reminderPreferences and canonical Reward reminder payload. Firebase-client adds preference adapters/hook; UI adds ReminderPreferenceCard; both Home surfaces compose their role control. Functions add pendingRewardReminders, extend deadline generation and dispatcher and activate both scheduled exports. Rules/indexes and the existing focused emulator utility are updated. The test files above plus the existing receipt database fixture provide only required range/cursor support.

Slice 4B is functionally complete. With the preceding slices, Phase 5 notification/reminder functional deliverables are implemented. **Physical Expo/APNs delivery remains explicitly unverified**; no deployed scheduling/index or physical delivery acceptance is claimed. Existing Slice 3 report records its historical native UI observation limits; this slice's UI confidence comes from focused state/interaction regressions and bundle exports, not invented manual observations. OPEN-010/011/014 remain unresolved, and no expiry/cancellation/undo/auctions/analytics/EAS redesign is included. No commit, push or deployment occurred.
