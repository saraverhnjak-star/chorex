# Phase 4 — Parent approval acceptance

Verification date: 2026-10-05. Scope: first Parent review mutation and its minimum Ready-for-Review entry surface. No earlier Phase 4 Slice 1 acceptance report was present in this checkout.

## Decision and API

ADR-043 — Review Cycles Identify Zero-Based Review Rounds resolves OPEN-012. Domain Model, State Machines and Firestore Schema now align with it. New Contracts and first submission remain at round 0; Parent decisions copy the existing round and never increment it. Only a future successful correction resubmission opens the next round. OPEN-009/010/011 remain unresolved.

`approveContract({ contractId, idempotencyKey })` is a trusted callable returning canonical `{ contract, review, reward }` with UTC ISO timestamps. Strict shared Zod schemas reject client-selected identity, family, role, cycle, status, Reward ID and approval notes. The output validates matching Contract/family/participants, review cycle, frozen reward terms and approval timestamps. The shared `contractReviewSchema` models immutable Parent decisions; `rewardSchema` models this slice's pending earned Reward boundary only, not fulfillment/cancellation commands.

The command requires authenticated active Parent membership in the Contract family and the exact Parent participant named by the Contract. Another Parent, Child, outsider, inactive/nonmember or unlisted participant cannot approve. New approvals require READY_FOR_REVIEW; ACTIVE, CHANGES_REQUESTED, APPROVED, CANCELLED and EXPIRED return INVALID_STATE. No deadline cutoff or correction policy is invented.

## Atomic persistence and uniqueness

One Firestore transaction reads Contract, actor/command/key-scoped idempotency state, authoritative membership and the deterministic review/Reward slots, then commits:

- one immutable APPROVE review at `/contracts/{id}/reviews/review_{sha256(contractId + ":" + reviewCycle)}`;
- Contract status APPROVED plus native approvedAt/updatedAt timestamps;
- one `/rewards/reward_{sha256(contractId)}` with family/Contract/Parent/Child IDs, frozen Contract rewardTerms as terms, PENDING_FULFILLMENT and native earnedAt;
- one authenticated Parent CONTRACT_APPROVED event linking Contract/review/Reward;
- completed idempotency state storing the original canonical receipt.

The review identity is independent of command name and retry key and is shared by either future Parent decision type. A pre-existing round decision or Contract Reward blocks approval without overwriting anything. Transaction create preconditions plus the Contract read/write prevent competing decisions from committing for the same pending round. Review cycle, accepted terms and all task/completion/prior-review history are preserved. There is no separate redundant Reward-earning activity event or fulfillment metadata.

Same-key retries recheck current access and return the original receipt, even after later Reward state changes. Conflicting input returns IDEMPOTENCY_CONFLICT. Different-key concurrent approvals have one legal winner; the loser returns INVALID_STATE without partial effects.

## Parent and Child surfaces

Parent home now includes a minimum Ready-for-Review list because the requested full-path entry surface did not yet exist. It reuses the existing family/participant/status/createdAt Contract query, composite index, native metadata-aware listeners and list rendering. Cached results retain the saved-data marker; session/scope changes clean up subscriptions. Submitted Contracts appear from realtime, open the existing stable-ID detail and disappear from the queue after approval.

The Parent detail exposes Approve only to its Parent participant in READY_FOR_REVIEW. An accessible confirmation explains agreement acceptance and Reward earning, with Confirm approval / Keep reviewing. Pending state and a synchronous guard prevent duplicate taps. Backend failures preserve displayed status and retries retain the key; success copy appears only after a confirmed response. Contract status remains listener-owned, with a waiting message if the receipt precedes realtime. APPROVED removes approval controls and explains that the earned Reward still needs fulfillment.

Child detail receives APPROVED through its existing listener and explains that the Parent approved the agreement and the earned Reward awaits fulfillment. No execution/submission action appears. No separate earned-rewards screen, Reward management surface or review history screen is added.

## Committed notification effect

The existing activity-event dispatcher additionally handles CONTRACT_APPROVED. It verifies the approved Contract, deterministic APPROVE review at the unchanged round and matching earned Reward, then resolves the active Child participant. Existing Expo device filtering, token deduplication, effect lease and bounded retries remain in use.

Copy is generic: “Reward earned” / “You earned your promised reward. Delivery is still pending.” Data contains only type, entityType CONTRACT, Contract ID and family ID. Approval taps open the existing Contract detail; Offer routes stay unchanged. No task/review/reward-title content, credentials or tokens enter delivery bookkeeping. Notification transport failure cannot roll back authoritative approval. One committed event owns one logical effect; the existing limitation on physical exactly-once Expo delivery still applies. No receipt polling is added and emulator verification sends no real push.

## Verification

- Workspace tests: 177 PASS (backend 84, Parent 43, Child 50). Focused additions extend existing Contract and notification suites, rather than duplicating Child execution/Phase 2 suites.
- Review rounds 0 and 2 produce identical Review cycle / unchanged Contract cycle. Strict Review/Reward/command schemas and linked receipt validation pass.
- Authorization, all disallowed states, prior-review/task preservation, frozen Contract reward terms, absent fulfillment fields, canonical retries, conflicting keys and revoked access pass.
- Same/different-key concurrency creates one Review, one Reward and one approval event. A pre-existing REQUEST_CHANGES round slot blocks approval.
- Staged transaction failure leaves all documents unchanged in unit tests and a real Firestore emulator transaction.
- Parent tests verify deliberate/cancellable confirmation, pending rapid taps, receipt versus listener ordering, stable retry keys, errors, participant visibility and realtime queue removal. Child tests verify APPROVED/earned/pending copy and no execution actions.
- Full emulator path: real Offer acceptance → one-time/repeated completion → Child submission → Parent queue → Parent approval → current-round Review + pending Reward → bilateral APPROVED listeners + queue removal → Child notification effect. Direct client approval/Review/Reward/event writes remain denied.
- Injected Expo transport tests verify missing/aborted events produce no send, transport failure retains APPROVED/Review/Reward, and event redelivery sends no duplicate after a completed effect. Current cycle 2 and same-key concurrent retries are also tested against real Firestore transactions.
- Phase 2 accept/reject/counteroffer and notification gate regressions PASS. Phase 3 Contract reads/cache/reconnect/family isolation, task completion and submission regressions PASS.
- Typecheck, lint, formatting/whitespace checks and Parent/Child iOS bundle exports PASS.

Reproduce with `pnpm emulators:verify:approve-contract`. It extends the existing completion/submission harness via CHOREX_VERIFY_SUBMISSION=1 and CHOREX_VERIFY_APPROVAL=1, preserving prior checks. Local verification used isolated emulator ports (Auth 19099, Firestore 18080, Functions 15001) to preserve existing dev data. The temporary port configuration was removed. Production index deployment and real Expo delivery are not claimed.

Native persistence configuration, initialization and detail listener lifecycle are unchanged. Existing native restart acceptance evidence remains applicable; cache/reconnect regressions and bundles passed here. A new physical-device/native restart run was not performed in this approval task.

## Completion and next boundary

Approval is complete within this slice's automated/emulator scope. The complete Phase 4 gate is not complete: request changes, remediation/resubmission and fulfillment remain unimplemented. The next safe slice is a bounded requestContractChanges decision/transition using the same round identity, preserving task progress/history; it must not implement remediation or resubmission until OPEN-009 is resolved.

No request-changes command, approval notes, Review history UI, fulfillment/cancellation, task undo/invalidation, expiry/reminders, receipt polling, custom cache or offline mutation queue is added. OPEN-009, OPEN-010, OPEN-011 and the other unrelated open decisions remain unresolved. No commit, push or deployment was performed.

## Changed boundaries

- Decision/docs: DECISIONS.md, Domain Model, State Machines, Firestore Schema, Push Notifications, roadmap, historical Phase 3 decision follow-up notes, backend/client README and this report.
- Domain: new `packages/domain/src/review.ts`, exports and minimal approval notification routing schema.
- Backend: new `functions/src/approveContract.ts`, callable/error wiring and extension of the existing committed-event dispatcher.
- Client: typed approval adapter and shared scoped Contract list observer/hook for READY_FOR_REVIEW.
- Apps: Parent queue/detail/confirmation composition, Child approved-state copy and notification routing to existing detail.
- Tests: existing backend Contract/notification and Parent/Child UI/adapter suites; new `firebase/verify-contract-approval.mjs` hooked into existing submission verification; root focused emulator script.
- Firestore Rules and indexes: unchanged.
