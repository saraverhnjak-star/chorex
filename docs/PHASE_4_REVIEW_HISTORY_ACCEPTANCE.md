# Phase 4: Contract review history and final acceptance

Verified: 2026-10-06. **PASS — every documented Phase 4 deliverable is implemented and its acceptance gate is satisfied within the existing automated/emulator and iOS bundle verification scope.** This final slice adds reads and presentation only. No review mutation, cycle, Reward, notification or task-progress semantics changed. No commit, push or deployment was performed.

## Authority and scope

ADR-033 requires immutable Review history rather than reconstruction from status; ADR-043 defines zero-based rounds and at most one decision per Contract/cycle. ADR-044 preserves task/completion history across contract-level remediation; ADR-034 keeps approval/earning separate from fulfillment. All remain unchanged. Existing Ready-for-Review, approve, request changes, resubmit, Reward surfaces and fulfillment are covered by their earlier Phase 4 reports; the Ready-for-Review surface is documented in the approval report, not a separate report.

OPEN-009 and OPEN-012 remain resolved by ADR-044 and ADR-043. OPEN-010 (undo) and OPEN-011 (expiry/cancellation) remain unresolved. No new ADR or Phase 5 feature was added.

## Read API and validation

`observeContractReviews(contractScope, callback, onError)` lives in `packages/firebase-client` and reads `/contracts/{contractId}/reviews` with:

```text
where familyId == Contract.familyId
where contractId == Contract.id
orderBy cycle ascending
```

There is no limit, current-cycle or lifecycle-status filter. One concrete `reviews` COLLECTION composite index contains familyId, contractId and cycle ascending. The one-decision-per-cycle invariant makes cycle ordering unambiguous; duplicate cycles fail as malformed rather than being silently collapsed. The deserializer also sorts by cycle, preserves persisted values and never numbers from array indexes.

Canonical shared `ContractReview` fields are retained: ID, family/Contract IDs, cycle, reviewer UID, decision, optional note and createdAt. Native timestamps normalize to UTC ISO strings; family/Contract/Parent author and schema are validated. REQUEST_CHANGES requires its immutable nonempty feedback. APPROVE can omit note; none is fabricated. A shared internal parser is reused by existing current-feedback deserialization, whose current-cycle/status checks remain unchanged.

`useContractReviews(contract, authUid)` handles loading/error/ready/cache state and unsubscribes on scope/session/unmount changes. Stale callbacks cannot populate another Contract/account, and callbacks after an error are ignored. Scope includes Contract ID, family and participants, but not status or cycle: the same history listener continues through new rounds and final approval. Screens contain no raw query, polling, activity reconstruction or persisted store copy.

## Parent and Child presentation

Both existing Contract details include the shared accessible “Review history” section. Each entry shows friendly decision text, locale date and feedback when present. Persisted cycles 0, 1 and 2 display **Review 1**, **Review 2** and **Review 3**; the domain/read model remains zero-based.

Loading, empty (“No reviews yet”), read-error and saved-history states are explicit. Empty cached history says to reconnect rather than claiming there have never been reviews. Round/decision/date labels and readable feedback make chronology understandable without relying on color. A pending submission is not synthesized as a Review.

The existing CHANGES_REQUESTED feedback callout stays prominent and is labeled “Current request”. Its note also appears under the separately labeled historical round, making its current and historical context explicit. Existing Child resubmission and Parent review confirmations remain unchanged. The shared history section adds no edit, reply, delete, acknowledgement or Parent-only mutation controls.

## Rules and family isolation

Review get/list Rules now permit all committed cycles for the Contract's authenticated active named Parent/Child participants. Stored Review familyId/contractId must match the authoritative Contract/path. The old current-cycle and limit-2 read restriction is removed; the current-feedback query itself retains its cycle filter and bounded duplicate detection.

Actual emulator checks confirm:

- named active Parent and Child can query complete history and get all three known Review IDs;
- unrelated same-family Child, outside-family account, unauthenticated actor and non-member cannot query or get by known IDs;
- inactive/disabled membership and removed membership deny both query and document reads, for both participants;
- unscoped and mismatched-family queries fail;
- both participants' direct Review create/update/delete fail; all unrelated write Rules remain unchanged.

Reads grant no mutation authority and do not widen history to every Family member. Contracts/tasks/Rewards/activity events remain server-authoritative.

## Multi-round emulator evidence

Reproduce on a fresh local environment with:

```sh
pnpm emulators:verify:contract-review-history
```

This extends existing completion, submission, request-changes, resubmission and fulfillment verification instead of duplicating their fixtures. The invocation enables CHOREX_VERIFY_SUBMISSION, CHOREX_VERIFY_REQUEST_CHANGES, CHOREX_VERIFY_RESUBMISSION and CHOREX_VERIFY_REVIEW_HISTORY. Verification used temporary isolated ports Auth 19099, Firestore 18080, Functions 15001, hub 14400 and logging 14500, project alias `dev`, preserving the existing native/dev dataset. The Functions host override was 127.0.0.1:15001. Temporary configuration was removed afterward. The current repository Rules were also reloaded into the already-running local development emulator (HTTP 200), without clearing any native/dev records or deploying to Firebase.

The passing real-callable path is:

1. Parent Offer → Child acceptance → ACTIVE Contract with frozen terms/tasks.
2. Child completes one-time/repeated tasks and submits into READY_FOR_REVIEW cycle 0. Both participant history queries are empty before the first decision.
3. Parent requests changes with note A → immutable cycle-0 REQUEST_CHANGES review.
4. Child resubmits → READY_FOR_REVIEW cycle 1, still exactly one Review.
5. Parent requests changes with distinct note B → immutable cycle-1 REQUEST_CHANGES review, appearing in both listeners without refresh.
6. Child resubmits → READY_FOR_REVIEW cycle 2, still exactly two Reviews with unchanged notes/timestamps.
7. Parent approves → immutable cycle-2 APPROVE review without note; exactly one pending Reward for the Contract.
8. Parent fulfills → Reward FULFILLED, Contract remains APPROVED; both authenticated history queries still contain precisely cycles 0/A, 1/B and 2/APPROVE in ascending order.

The existing fulfillment integration additionally confirms stable retry timestamps, one logical fulfillment event/effect, transaction races, frozen terms/history, denied direct writes, Child realtime delivery state and transport-failure isolation. Existing resubmission and mixed Parent decision races remain in the same run.

Final before/after snapshots around history reads/cache/reconnect are identical for Contract, all Reviews, task progress/completion audit, Reward and family activity events. Merely viewing history writes nothing. Child SDK network disable serves the previously loaded three-round cache; reconnect converges to the identical authoritative history. No custom persistence or offline synchronization was added. This slice does not claim a new native process-restart test; prior native Contract/task persistence evidence is unchanged.

## Regression and build results

- Full `pnpm test`: **284 PASS** — backend 156, Parent 58, Child 70. Focused additions extend existing read-model, adapter and Contract surface tests. Existing execution/review/Reward/notification/queue and Offer tests pass.
- Read tests cover empty/single/multiple rounds, ordering, unchanged zero-based cycles and inputs, missing approval note, invalid scope/author/time/decision/feedback and duplicate cycles.
- Both app tests cover accessible loading/empty/error/cache states, friendly one-based labels, notes, realtime final approval, current versus historical feedback, unchanged listener across status/cycle changes, cleanup/stale callbacks and absence of new mutation controls.
- Full three-round lifecycle/Rules/cache/immutability emulator verification: PASS, including existing 100-count execution, submission, request-changes, resubmission, mixed-decision and fulfillment races and committed notification effects.
- Separate existing Child/Parent accept/reject/counteroffer, complete Phase 2 bilateral realtime/notification and Phase 3 Contract read/cache/isolation verifiers: PASS.
- Separate original direct-approval emulator path: PASS, preserving first-round behavior.
- Workspace typecheck, lint, formatting, explicit changed-document formatting, Functions build and `git diff --check`: PASS.
- Both existing Expo iOS bundle exports: PASS; `/tmp/chorex-history-parent-bundle` and `/tmp/chorex-history-child-bundle`. These are bundle checks, not newly installed native binaries or physical-device push verification.

## Changed files

- Read boundary: `packages/firebase-client/src/contractReadModel.ts`, `contractHooks.ts`, `index.ts`, and README.
- Shared UI: new `packages/ui/src/ReviewHistory.tsx` and index export.
- App composition: Parent and Child `src/contracts/ContractDetail.tsx`.
- Focused tests: existing Child `contract-read-model.test.tsx`, `contract-adapter.test.tsx` and both app `contract-surface.test.tsx`.
- Security/index: `firebase/firestore.rules`, `firestore.indexes.json`.
- Verification: new `firebase/verify-contract-review-history.mjs`, existing changes/resubmission/completion harness hooks, root runner; unused initial listener removed from the existing fulfillment verifier so lint remains clean.
- Documentation: Domain Model, Firestore Schema, Auth/Security, roadmap, Reward-fulfillment follow-up and this report.

No backend command, domain schema, notification dispatcher, native configuration or dependency was changed.

## Phase 4 gate and next milestone

The roadmap deliverables are implemented: Parent Ready-for-Review queue, approval, request changes with immutable feedback, complete review history, Reward creation on approval, Child earned Rewards, Parent obligations, fulfillment and documented committed-event notifications. Approval/fulfillment remain separate and atomic/idempotent; exactly one earned Reward exists per Contract; requested changes preserve every earlier Review.

**The complete documented Phase 4 acceptance gate is satisfied.** Phase 5 notification hardening/reminders is the next milestone, as separate future work. Undo/expiry/cancellation policies remain unresolved and are not prerequisites invented for this read-only completion slice. Review editing/deletion/replies, new decisions, cancellation, progress reversal, reminders, receipt polling, auctions and proof media were not implemented.
