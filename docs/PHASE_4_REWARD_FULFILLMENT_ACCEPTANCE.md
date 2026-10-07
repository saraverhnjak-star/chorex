# Phase 4: Reward surfaces and Parent fulfillment acceptance

> Subsequent correction: ADR-046 replaces unilateral Reward fulfillment with Parent delivery followed by assigned Child receipt confirmation. Historical verification below is unchanged. See [bilateral fulfillment acceptance](REWARD_BILATERAL_FULFILLMENT_ACCEPTANCE.md) for the current commands, fields, events and reminder compatibility.

Verified: 2026-10-05. This slice completes the implemented MVP Reward lifecycle. **Phase 4 remains incomplete because participant-facing review history is still missing.** No commit, push or deployment was performed.

## Scope and changed files

- `packages/domain/src/review.ts`, `index.ts`, `notification.ts`: strict pending/fulfilled Reward schemas, fulfillment input/output/errors and minimal Reward notification routing.
- `functions/src/fulfillReward.ts`, `index.ts`, `negotiationNotifications.ts`: trusted transaction/callable and committed-event Child notification effect. Existing approval and execution commands remain unchanged.
- `packages/firebase-client/src/index.ts`, `rewardReadModel.ts`, `rewardHooks.ts`: typed callable, timestamp normalization, ownership-scoped realtime lists/detail and listener lifecycle.
- `packages/ui/src/RewardSummary.tsx`, `RewardList.tsx`, `RewardDetailBody.tsx`, `index.ts`: accessible frozen-term presentation. UI imports shared domain types through an internal workspace dependency; no external dependency was added.
- `apps/parent/src/rewards/*`, `app/(app)/rewards/[rewardId].tsx`, home composition: pending obligations, detail and confirmation action.
- `apps/child/src/rewards/*`, `app/rewards/[rewardId].tsx`, home composition: read-only earned Rewards and detail.
- `packages/notifications/src/core.ts`, `index.ts`: stable Reward detail routing.
- `firebase/firestore.rules`, `firestore.indexes.json`, `verify-reward-fulfillment.mjs`, existing execution/resubmission verification harnesses, root `package.json`: scoped Rules, two concrete indexes and reproducible integration entry point.
- Existing backend approval/execution and notification test suites, both app bootstrap tests, Child adapter tests and Parent notification tests were extended; focused Reward surface tests were added to both apps.
- Domain/state/schema/security/notification/roadmap documents and backend/client READMEs describe the implemented boundary.

## Reward schema and APIs

Input is strictly `{ rewardId, idempotencyKey }`; actor, family, Contract, ownership, timestamps and status are never client input. `fulfillReward` returns the canonical `{ reward }` fulfilled receipt. Pending records omit fulfillment fields. Fulfilled records require `fulfilledAt` and `fulfilledBy`, with the owning Parent as fulfiller and a timestamp no earlier than earning. The approval receipt still requires its original pending Reward and remains a historical receipt after fulfillment.

No persisted EARNED, LOCKED, DELIVERED or COMPLETED alias is introduced. CANCELLED remains a documented exceptional/admin state; this slice implements neither cancellation nor a cancellation read surface and rejects it for fulfillment.

| API                                           | Authoritative query/read                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `observePendingRewards` / `usePendingRewards` | Selected familyId, authenticated parentUid, PENDING_FULFILLMENT; earnedAt descending |
| `observeEarnedRewards` / `useEarnedRewards`   | Active familyId, authenticated childUid; earnedAt descending; pending and fulfilled  |
| `observeReward` / `useRewardDetail`           | Stable Reward document ID, strict normalized fields and named-owner validation       |

Equal timestamps follow Firestore's implicit document-ID ordering. Screens contain no raw Reward query or Offer reconstruction. Terms come from the frozen Reward. List/detail listeners include metadata changes, expose `fromCache`, stop on error and unsubscribe on identity/scope/unmount changes. Stale callbacks cannot repopulate another account's state. Native Firestore supplies cached reads; no Zustand copy, inbox projection, custom persisted cache or offline mutation queue was added.

## Parent and Child UX

Parent home shows “Rewards to fulfill” with multiple obligations, Child display context, title, optional description, type, earned date and pending status. Empty state is “No rewards waiting to be fulfilled”. Selecting an item opens stable Reward detail.

The Parent chooses “Mark as fulfilled”, reviews “Record this reward as delivered?”, and confirms delivery. Pending requests block duplicate taps. Only the successful callable response produces “Reward fulfilled”; the displayed Reward and removal from the pending list remain realtime-owned. If the response precedes the listener, detail says it is waiting for updated Reward status. Network/unknown failures show retry feedback without claiming success; an ambiguous retry retains the same key. Fulfilled detail exposes no further fulfillment action. Contract remains APPROVED.

Child home and detail distinguish “Earned — waiting for Parent” from “Fulfilled — delivered”, show the persisted fulfillment timestamp, and update through listeners without refresh. No Parent mutation control or Child delivery-confirmation capability exists.

## Authorization and transaction

The transaction validates authenticated active family membership, authoritative PARENT role and exact Reward parentUid. Missing authentication, Child, wrong Parent/family, inactive/disabled/non-member, missing Reward and malformed input/state fail without writes.

For a new action, the Reward must be PENDING_FULFILLMENT. Its deterministic ID must match its Contract ID; the Contract must be APPROVED with matching family/Parent/Child and participant list. Native approvedAt must equal earnedAt; parsed frozen terms must match. Inconsistent persisted state fails safely rather than being repaired. Canonical parsed terms are compared so Firestore map-key ordering cannot change the result.

One transaction updates only Reward status, fulfilledAt and fulfilledBy, creates one immutable Parent REWARD_FULFILLED event with entityType REWARD, and completes actor/command/key-scoped idempotency state. It neither creates another Reward nor writes Contract, Review, task, completion or Offer history. Server-generated native timestamps are used.

Same-key retries revalidate current access and return the original canonical receipt, preserving timestamp, fulfiller and event. Changed Reward ID under the same key fails IDEMPOTENCY_CONFLICT. New different-key fulfillment fails REWARD_ALREADY_FULFILLED. Concurrent actions serialize on the Reward; exactly one transition/event commits. An aborted transaction leaves no partial effects.

## Activity and notification

The event identifies the Reward and authenticated Parent, without Reward terms or private feedback. The existing committed-event dispatcher validates fulfilled Reward/approved Contract identity, resolves its active Child, and reuses device filtering, effect leases, bounded retries and completed-effect deduplication.

Copy is “Reward delivered” / “Your reward was marked as delivered.” Payload contains only type, entityType, entityId and familyId, routing to `/rewards/[rewardId]`. Transport failure does not roll back fulfillment. Tests verify retry/redelivery deduplication and absence of private terms in payloads. This is dispatcher/effect verification, not a claim of physical-device lock-screen delivery. No new transport, receipt polling, reminder scheduling or preference UI was added.

## Emulator evidence and reproduction

Run on a fresh local emulator environment:

```sh
pnpm emulators:verify:fulfill-reward
```

For this verification, isolated ports avoided disturbing the existing development emulators: Auth 19099, Firestore 18080, Functions 15001, hub 14400 and logging 14500, project alias `dev`, UI disabled. A temporary config was used and removed after verification. The equivalent invocation was:

```sh
pnpm functions:build
pnpm exec firebase emulators:exec --config <isolated-config.json> --project dev --only auth,firestore,functions "CHOREX_VERIFY_SUBMISSION=1 CHOREX_VERIFY_REQUEST_CHANGES=1 CHOREX_VERIFY_RESUBMISSION=1 CHOREX_VERIFY_FULFILLMENT=1 FUNCTIONS_EMULATOR_HOST=127.0.0.1:15001 node firebase/verify-record-task-completion.mjs"
```

Observed passing real-callable lifecycle: Parent draft/publish → Child acceptance → ACTIVE Contract/tasks → Child completion → submission → Parent request changes → Child resubmission (round 0 to 1) → Parent approval → exactly one pending Reward for the Contract → Parent fulfillment → fulfilled Reward, unchanged APPROVED Contract and one Child notification effect.

The integration also establishes:

- Parent pending query displays two obligations for different Children; fulfillment removes only the target through realtime state.
- Child earned/detail listeners change pending to fulfilled and include the authoritative timestamp; sibling and unrelated-family Rewards cannot be read.
- Active owning Parent/Child reads pass. Unauthenticated, unrelated, unscoped, inactive/disabled/non-member reads fail. Both apps' direct Reward status/fulfillment/event writes fail.
- Same-key retry returns the identical receipt; different key fails; conflicting input fails. Exactly one target Reward and fulfillment event remain.
- Complete before/after snapshots preserve Reward terms/earnedAt, Contract source/terms/status, tasks/completions, immutable reviews and Offer/current revision.
- Four real Firestore same-key/different-key races produce one event and stable timestamp; aborted transaction commits nothing.
- Injected transport failure leaves Reward fulfilled; retry completes its existing effect; completed-effect redelivery sends nothing again.
- Child SDK cached fulfilled reads remain visible with network disabled and converge on reconnect. Native React Native Firebase restart persistence was not rerun in this slice; existing Phase 3 evidence and persistence configuration remain unchanged.

Separate fresh-emulator runs pass the existing Child/Parent accept, reject and counteroffer verifiers, the complete bilateral Phase 2 notification/realtime verifier, and Contract read/cache/Rules verifier. The existing direct-approval verifier also passes separately. Execution, initial submission, request changes, mixed review decisions and correction/resubmission regressions pass in the full lifecycle run.

## Automated validation

- Full `pnpm test`: **273 passing tests** — backend 156, Parent 54, Child 63. Includes schemas, authorization/state corruption, frozen snapshots, retries/concurrency, adapter scope/result parsing, listener cleanup, UI confirmation/error/realtime behavior and notification routing/effects.
- `pnpm typecheck`: passes across both apps, shared packages and Functions.
- `pnpm lint`: passes, including Firebase verification scripts.
- `pnpm format:check` and explicit changed numbered-document/report formatting checks: pass.
- Functions TypeScript build: passes.
- Both existing Expo iOS production bundle exports: pass; outputs `/tmp/chorex-reward-parent-bundle` and `/tmp/chorex-reward-child-bundle`. These are bundle checks, not newly installed native binaries.
- `git diff --check`: passes.

## Remaining Phase 4 gate

Review history is **not sufficient**: current feedback reads are bounded to the authoritative current round, Rules deny older-round browsing, and neither app provides the complete immutable review history. Preserving old reviews in storage does not satisfy the roadmap's user-facing review-history deliverable.

One small read-only review-history slice remains. It should expose participant-scoped immutable review rounds and adequate Parent/Child history presentation without new mutation semantics. Phase 4 must stay open until that is verified. The next milestone should be that history slice; Phase 5 notification hardening/reminders follows it.

OPEN-009 and OPEN-012 remain resolved by ADR-044 and ADR-043. OPEN-010 and OPEN-011 remain unresolved and unchanged. No additional ADR was needed. Cancellation, expiry, task undo, payment/redemption, partial fulfillment, proof, auctions and Phase 5 behavior were not implemented.

## Subsequent Phase 4 completion

The read-only [Review history slice](PHASE_4_REVIEW_HISTORY_ACCEPTANCE.md) completes the missing participant-facing immutable history deliverable. The historical scope/results above remain unchanged. The complete documented Phase 4 gate is now satisfied; Phase 5 notification hardening/reminders is next. OPEN-010 and OPEN-011 remain unresolved.
