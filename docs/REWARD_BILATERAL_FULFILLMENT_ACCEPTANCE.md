# Reward bilateral fulfillment acceptance

Verified 2026-10-07. ADR-046 partially supersedes ADR-034: Parent delivery is no longer terminal fulfillment. One Reward per approved Contract, frozen promises and atomic approval/earning remain unchanged. ADR-045 reminder preferences remain valid. No commit, push, deployment or external data migration was performed.

## Decision and canonical model

Old: PENDING_FULFILLMENT → FULFILLED by Parent.

Current: PENDING_FULFILLMENT → AWAITING_CHILD_CONFIRMATION by Parent delivery → FULFILLED by assigned Child receipt confirmation. CANCELLED remains exceptional/admin-only, without an implemented command or participant read surface.

| State                       | Required metadata                                          | Meaning                                      |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| PENDING_FULFILLMENT         | earnedAt                                                   | Earned; Parent still owes delivery           |
| AWAITING_CHILD_CONFIRMATION | earnedAt, deliveredAt, deliveredBy                         | Parent reports delivery; receipt unconfirmed |
| FULFILLED                   | all delivery fields, confirmedAt, confirmedBy, fulfilledAt | Assigned Child confirmed receipt             |

Delivery and confirmation actors must match parentUid/childUid. Native server timestamps satisfy earnedAt ≤ deliveredAt ≤ confirmedAt and fulfilledAt equals confirmedAt. `fulfilledBy` is removed, without changing its meaning or preserving an ambiguous alias. Strict shared schemas reject missing/incorrect actors, chronological inconsistencies and forbidden status-specific fields.

## Commands and authorization

The legacy fulfillReward callable, adapter, source implementation and application call sites are replaced. `markRewardDelivered` and `confirmRewardReceived` both accept only `{ rewardId, idempotencyKey }`, use one shared server transaction and existing typed client/error conventions. No client role, family, ownership, status or timestamp is trusted.

Parent delivery requires authenticated active PARENT membership, exact Reward parentUid and PENDING_FULFILLMENT. It writes only AWAITING_CHILD_CONFIRMATION, deliveredAt/deliveredBy, one Parent REWARD_DELIVERED event and the canonical receipt. It writes no confirmation metadata and cannot produce FULFILLED.

Child confirmation requires authenticated active CHILD membership, exact Reward childUid and AWAITING_CHILD_CONFIRMATION with valid native Parent delivery metadata. It writes only FULFILLED, confirmedAt/confirmedBy, fulfilledAt equal to confirmedAt, one Child REWARD_RECEIVED_CONFIRMED event and its receipt. Confirmation before delivery, another sibling, unrelated Child, Parent, inactive membership and cross-family actors fail.

Both transactions validate deterministic Reward identity and the matching APPROVED Contract, family/participants, native approvedAt equal to earnedAt and identical parsed frozen terms. Terms, earning timestamp, Contract state and all tasks/completions/reviews/Offer revisions remain unchanged. Existing Rules deny every direct client Reward and activity write; no Rules exception was added.

## Idempotency, concurrency and effects

Existing actor/command/key hashing and payload conflict detection remain. Same-key retries recheck current access and return the original receipt without new events or timestamps. Parent's receipt remains AWAITING_CHILD_CONFIRMATION even after Child confirmation; Child's remains FULFILLED. New delivery keys after delivery fail REWARD_ALREADY_DELIVERED; new confirmation keys after confirmation fail REWARD_ALREADY_FULFILLED.

Real Firestore races cover four Parent same/different-key pairs and two Child same/different-key pairs: one logical transition per step and one event per step. An aborted transaction commits no writes. Notification transport failure leaves committed Reward state intact; the existing completed effect deduplicates redelivery.

REWARD_DELIVERED targets the active Child with “Your parent marked your reward as delivered. Confirm when you receive it.” REWARD_RECEIVED_CONFIRMED targets the active Parent with “The reward was confirmed as received.” Both reuse existing Expo transport, device filters, leases, retries, tickets and receipts, with only type/entityType REWARD/entityId/familyId routing data. They have no new optional preference. Existing app-owned Reward detail routing reads current state on stale taps; opening or tapping never confirms receipt.

## App behavior

Parent chooses **Mark as delivered**, reviews the explicit delivery question, then **Confirm delivery**. Backend-confirmed success says **Waiting for child confirmation**. Realtime removes the Reward from **Rewards to deliver** and exposes it in the separate **Waiting for child confirmation** section, using the existing parent/status/earnedAt composite index. There is no Parent force-fulfillment action.

Child pending copy remains earned/waiting for Parent. Awaiting detail explains that Parent reported delivery and offers **Confirm received**, followed by an explicit **Confirm receipt** step. Success says **Reward received**; realtime shows fulfilled/receipt confirmed and removes the action. Shared accessible controls preserve the same idempotency key after an ambiguous failure, block repeated submissions and never report success before the callable response. Dates render in the user's locale. Native cached reads remain available under existing persistence; no offline queue or competing cache was introduced.

## Reminder and preference compatibility

The existing hourly, bounded 48-hour Parent worker continues to query exactly PENDING_FULFILLMENT. AWAITING_CHILD_CONFIRMATION, FULFILLED and CANCELLED are excluded. Transactional rechecks suppress reminders when delivery wins the race. An already-created reminder event/deduplication identity is retained after delivery; no reset or deletion occurs.

Default-on account-scoped Parent pending-Reward and Child deadline preferences, OS permission separation, deadline eligibility, routing and receipt behavior are unchanged. No Child confirmation reminder or preference was added. A physical push already claimed before delivery can still arrive later; its tap reads current state, as in the existing pipeline.

## Validation and reproduction

- Modified existing Reward command/schema/approval-retry, notification, reminder, adapter, Parent interaction and routing cases instead of retaining a parallel unilateral suite.
- Added only two focused Child backend scenarios (bilateral authorization/retries and competing confirmations), one Child confirmation interaction and one semantic routing table case.
- Complete `pnpm test` run once: **390 passing** (Functions 189, notifications 53, Parent 70, Child 78), zero failures. Existing Phase 2/3/review/registration/reminder regressions are included. A subsequent native-timestamp guard was validated by the focused execution/review/Reward file, without rerunning the whole suite.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, Functions build and `git diff --check`: pass.
- Both `expo export --platform ios` checks pass, with outputs `/tmp/chorex-bilateral-parent-export` and `/tmp/chorex-bilateral-child-export`. These are bundle checks, not a claim of newly installed native builds.

On fresh emulators, run:

```sh
pnpm emulators:verify:reward-fulfillment
pnpm exec firebase emulators:exec --project dev --only auth,firestore "node firebase/verify-contract-deadline-reminders.mjs"
```

This verification used isolated Auth 19099, Firestore 18080, Functions 15001, hub 14400, logging 14500 and websocket 19150 with UI disabled and explicit project chorex-dev. An equivalent temporary config must reference this repository's Functions source, Rules and indexes. The actual full-flow command was:

```sh
FUNCTIONS_EMULATOR_HOST=127.0.0.1:15001 pnpm exec firebase emulators:exec --config /tmp/chorex-permission-firebase.json --project chorex-dev --only auth,firestore,functions "CHOREX_VERIFY_SUBMISSION=1 CHOREX_VERIFY_REQUEST_CHANGES=1 CHOREX_VERIFY_RESUBMISSION=1 CHOREX_VERIFY_FULFILLMENT=1 node firebase/verify-record-task-completion.mjs"
```

Observed real authenticated callable path: accepted Contract → completed tasks → submission/correction/resubmission → approval/one pending Reward → Parent delivery/awaiting → assigned Child confirmation/fulfilled. Rules deny unauthenticated, unrelated, sibling, inactive/disabled/non-member reads or writes as applicable. Both callable actor roles and active membership, canonical retries, payload conflicts, immutable history and opposite-direction committed notification effects pass. Parent pending removal, separate awaiting query/removal, Parent terminal detail and Child earned/detail realtime state converge. Child cached terminal reads survive SDK network disable and converge after reconnect; native restart persistence was not rerun.

The separate reminder emulator run passes owner/role preference Rules, default/OFF/ON behavior, all excluded Reward states, retained reminder event after actual delivery, delivery-vs-generation race, Parent routing and unchanged Contract state. No real Expo requests were made in isolated fixtures; enabled-device transport uses deterministic fakes.

## Development data and limits

Repository tests/emulator fixtures now represent delivery and confirmation metadata; old terminal fixtures have explicit Parent delivery and Child confirmation actors. The approval retry fixture reaches terminal state through both real commands rather than directly assigning FULFILLED. Stale generated legacy callable artifacts were removed locally.

Read-only audit of the existing local development emulator at 127.0.0.1:8080 found **one PENDING_FULFILLMENT Reward, zero legacy records**, with no additional page. No existing development document was modified. Legacy pre-production fulfilled records lacking Child confirmation metadata are incompatible with the clean schema and must be explicitly reset/recreated as development fixtures; they cannot be silently treated as confirmed. No non-development persisted environment was accessed or migrated.

Physical Expo/APNs delivery remains **unverified**; prior native registration evidence does not prove delivery for these new events. No dispute, rejection, undo, timeout, automatic confirmation or recurring confirmation reminder exists. An unconfirmed delivered Reward remains awaiting indefinitely. OPEN-010, OPEN-011 and OPEN-014 remain unresolved.

Phase 4/5 implementation is internally consistent with ADR-046's bilateral model. Deployment and physical delivery verification remain outside this task.
