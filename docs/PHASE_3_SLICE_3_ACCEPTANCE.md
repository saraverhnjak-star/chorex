# Phase 3 Slice 3 — Child submits a completed Contract

## Implemented boundary

`submitContractForReview` completes `ACTIVE → READY_FOR_REVIEW`. It is a server-authoritative callable, a strict shared Zod API and a typed Firebase client adapter. Input is only `{ contractId, idempotencyKey }`; output is the canonical original `{ contract }` receipt with status exactly `READY_FOR_REVIEW` and UTC ISO timestamps.

The transaction reads Contract, actor/command/key-scoped idempotency state, active family membership and the entire scoped tasks collection. The authenticated actor must have role `CHILD`, match the Contract's Child UID and be listed as a participant. Each task must match family/Contract/assignee and pass the same bounded task parser used by completion. Every persisted `completedCount` must equal `targetCount`. Incomplete tasks return `TASKS_INCOMPLETE`; zero tasks and invalid counters return `INVALID_STATE`. The client supplies no completeness or ownership assertion.

New submissions require exactly `ACTIVE`. The transaction updates only status and authoritative `updatedAt`, creates one deterministic immutable `CONTRACT_SUBMITTED` event with Child UID, `actorType: CHILD`, Contract entity/ID and server timestamp, and creates completed idempotency state. No free-form task/reward content is added to the event. Failed requests commit nothing.

Same-key retries revalidate current membership/ownership and return the stored original receipt, including after later status changes. Conflicting Contract input returns `IDEMPOTENCY_CONFLICT`. Different-key competitors serialize on the Contract and the loser returns `INVALID_STATE`; the whole task collection is read transactionally so a racing final completion either commits before successful validation or submission fails cleanly with `TASKS_INCOMPLETE`. No task count, task/completion history, accepted revision, frozen reward/deadline or review cycle is changed.

## App behavior

Child Contract detail explains incomplete requirements and exposes submission only for a nonempty fully completed owned ACTIVE Contract. “Submit for review” opens an accessible inline confirmation explaining Parent review; “Confirm submission” invokes the callable and “Keep checking” returns to detail. A synchronous ref guards rapid duplicate taps and buttons expose pending/disabled state. There is no optimistic status replacement.

Only a confirmed callable result shows “Sent for review”; Contract status remains sourced from the existing listener. When the listener reports `READY_FOR_REVIEW`, submission and task-completion controls disappear and the screen explains that the Parent needs to review. If the callable confirms before the listener, it shows a short waiting message. Backend/connectivity failures leave displayed status unchanged and explicit retries retain their original key. No offline command queue is added.

Parent production code is unchanged: its existing detail listener shows `READY_FOR_REVIEW` without refresh. No Ready-for-Review queue, approval or request-changes controls are introduced. The ACTIVE-only home list naturally removes submitted Contracts; review-entry navigation belongs to Phase 4.

## Verification

Local automated checks on 2026-10-05:

- Workspace strict TypeScript typecheck, lint, formatting and whitespace checks: PASS.
- All 146 tests PASS: backend 61, Child 47, Parent 38. This includes command/notification tests, shared schema and native callable adapter tests, Child submission/progress tests, Parent realtime/read tests and existing Offer negotiation tests.
- Focused actual callable emulator flow: real Offer acceptance → one-time/repeated/concurrent task completion → complete authoritative task counters → submission → both participant Contract listeners observe `READY_FOR_REVIEW`. Incomplete and partially repeated submissions fail, unrelated callers fail, active membership is enforced, same-key concurrent retries converge, and a later different key cannot submit again.
- Emulator submission races: different-key submissions produce one event/transition; final completion versus submission permits success only after committed progress, otherwise `TASKS_INCOMPLETE` followed by an explicit retry. Counts/history remain unchanged by submission; one original receipt/event exists; no Review, Reward or notification effect exists.
- Existing Slice 2 emulator verification retains 100-count bounds, immutable completion audit, same-key receipts, concurrent final/open-capacity increments and bilateral task listeners. Slice 1 verification covers read authorization, frozen snapshots, cache/reconnect and family isolation.
- Existing Child/Parent accept, reject and counteroffer emulator suites plus the Phase 2 negotiation/notification gate.
- Rules remain unchanged: both participants are denied direct Contract status/timestamp writes, forged activity events, reviews and Rewards. Submission also leaves completion writes server-authoritative.
- Parent and Child iOS JavaScript bundle exports: PASS.

Run `pnpm emulators:verify:submit-contract-for-review`. It extends the existing Slice 2 harness through `CHOREX_VERIFY_SUBMISSION=1`, with the submission checks in `firebase/verify-contract-submission.mjs`; it does not duplicate acceptance/completion setup. Local verification uses isolated localhost ports, preserving developer services.

## Phase 3 gate and Phase 4 readiness

The automated functional gate covers safe 100-count progress, isolation from another Child's Contract, submission only after all requirements, cache/reconnect reads and explicit network-required command feedback. Phase 3 functionality is implemented through `READY_FOR_REVIEW`.

The remaining native persistence item was verified on 2026-10-05 using the installed Parent and Child iOS development builds on the iPhone 17 Pro simulator (iOS 26.5), with full native process termination, unavailable local Firebase services, restored authentication, persisted Contract/task reads and reconnect convergence. See the [reproducible native acceptance evidence](PHASE_3_NATIVE_PERSISTENCE_ACCEPTANCE.md), including offline command failure and submitted-state cache checks. Together with the automated evidence above, the complete documented Phase 3 acceptance gate is satisfied for the existing iOS development-build workflow. Phase 4 can begin with the Parent Ready-for-Review queue and review actions; none are implemented by this verification.

OPEN-009 correction semantics, OPEN-010 undo, OPEN-011 expiry/cancellation and OPEN-012 review numbering remain unresolved. Submission has no deadline cutoff, preserves even an existing nonzero review cycle and creates no Review or Reward. No new ADR or document conflict was encountered. Contract submission notification wiring stays with Phase 4 because the current committed-event dispatcher exposes only Offer negotiation paths. No commit, push or deployment was performed.

## Files changed in this slice

- Domain: `packages/domain/src/completion.ts`, `packages/domain/src/index.ts`.
- Backend: `functions/src/submitContractForReview.ts`, `functions/src/index.ts`, `functions/src/recordTaskCompletion.ts` (export/reuse the existing task parser only).
- Backend tests: `functions/tests/record-task-completion.test.mjs`, `functions/tests/negotiation-notifications.test.mjs` (submission remains unsupported by negotiation push).
- Client: `packages/firebase-client/src/index.ts` (submission adapter and shared unchanged error translation), `packages/firebase-client/README.md`.
- Child: `apps/child/src/contracts/ContractDetail.tsx`, `SubmitForReviewAction.tsx`, `messages.ts`; `apps/child/__tests__/contract-surface.test.tsx`, `contract-adapter.test.tsx`.
- Parent tests: `apps/parent/__tests__/contract-surface.test.tsx`; Parent production surfaces remain unchanged.
- Emulator checks: `firebase/verify-record-task-completion.mjs`, `firebase/verify-contract-submission.mjs`; root `package.json` adds the focused runner.
- Documentation: `docs/03_STATE_MACHINES.md`, `docs/04_FIRESTORE_SCHEMA.md`, `docs/07_IMPLEMENTATION_ROADMAP.md`, `docs/PHASE_3_SLICE_2_ACCEPTANCE.md`, this note and `functions/README.md`.

Pre-existing uncommitted Slice 1/2 changes are retained. No dependency, Firestore Rules, index or existing Offer-command behavior changes are introduced by this slice.
