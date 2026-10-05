# Phase 4 — Child correction and resubmission acceptance

Verification date: 2026-10-05. Scope: ADR-044 and the existing submitContractForReview command's CHANGES_REQUESTED -> READY_FOR_REVIEW branch. No new callable/client mutation, undo, fulfillment or Phase 5 behavior.

## Decision and authority

ADR-044 — Requested Changes Use Contract-Level Remediation resolves OPEN-009. It explicitly aligns the Domain Model and State Machines: completed task progress and immutable TaskCompletion evidence remain valid; correction occurs outside the task-progress model. Individual tasks are never reopened/reset/replaced. recordTaskCompletion remains ACTIVE-only. ADR-043 remains authoritative: first submission preserves round 0; successful resubmission opens N + 1 exactly once. OPEN-010 undo and OPEN-011 expiry/cancellation remain independent and unresolved.

Numbered Domain Model, State Machines, Firestore Schema, Auth/Security, Push and roadmap documents are aligned. Historical ADR and acceptance evidence remains intact with subsequent-slice pointers. No separate Ready-for-Review acceptance report exists; that surface is documented in the existing approval report.

## Existing command and transaction

Input/output schemas and typed adapter remain unchanged: `{ contractId, idempotencyKey }` -> canonical `{ contract }` with READY_FOR_REVIEW. No client-provided identity/family/role/cycle/review decision is accepted.

The original ACTIVE branch still validates a nonempty scoped task collection, ownership and bounded counters, requires each completedCount == targetCount, and preserves reviewCycle. The same authenticated active Child membership/exact Contract participant policy applies to both branches.

CHANGES_REQUESTED additionally reads the deterministic current-cycle review using the existing contractReviewId convention. It validates native timestamp, schema, Contract/family/cycle, Parent reviewer, REQUEST_CHANGES decision and required feedback. Missing/malformed/mismatched reviews, unexpected next-cycle decisions or a pre-existing Reward fail INVALID_STATE. Structurally invalid task counters/empty tasks remain invalid; task ownership remains enforced. No new completion is required to prove remediation.

One transaction sets READY_FOR_REVIEW, increments cycle by one and updates authoritative updatedAt, creates one Child CONTRACT_SUBMITTED event identifying the newly opened cycle, and completes the existing actor/command/key receipt. It writes no task, completion, Review, Reward or frozen term. Previous review/history is unchanged. Failed writes roll back all effects. READY_FOR_REVIEW/APPROVED/CANCELLED/EXPIRED reject new actions.

Same-key retries revalidate current access and return the original committed receipt, including after later approval. Different Contract input under the key conflicts. Competing different-key resubmissions serialize on the Contract: one winner, one INVALID_STATE loser, final cycle N + 1 rather than N + 2. No second activity/notification intent is created.

## Child and Parent surfaces

CHANGES_REQUESTED displays authoritative current Parent feedback, unchanged task counts and copy explaining real-life correction without progress reset. Task completion controls remain absent. Once feedback is available, Resubmit for review opens an accessible confirmation that the requested changes were addressed, with Confirm resubmission / Keep checking.

Pending guards block duplicate taps. Backend errors leave visible state unchanged and retries reuse the key. Each correction round gets a fresh action instance/key; the same instance survives the transition into its new READY_FOR_REVIEW round to show “Sent back for review” only after a confirmed response. Realtime owns status/cycle, removes controls and clears the primary feedback callout. No remediation boolean, optimistic status, custom cache or offline queue is added.

The existing Parent READY_FOR_REVIEW listener naturally receives the Contract again, showing the newly opened round and existing Approve / Request changes actions. No manual refresh/history screen is introduced. Optional later approval produces the cycle-1 APPROVE review and exactly one pending Reward while preserving cycle-0 feedback.

## Notification and security boundaries

Inspection found that CONTRACT_SUBMITTED events already existed but their notification effect had not yet been wired. This slice adds initial submission/resubmission handling to the existing committed dispatcher, without new transport infrastructure. It validates the event against its immutable completed submission receipt, resolves active Parent membership and reuses device filtering, effect leases, bounded retries and Expo transport. Delayed processing remains valid after a later decision.

Generic copy: “Ready for review” / “An agreement is waiting for your review.” Routing includes only CONTRACT_SUBMITTED, CONTRACT, Contract ID and family ID. Parent taps open existing detail. Feedback/terms are absent. Same-key retry creates no additional event/effect; transport failure never rolls back committed state. Physical exactly-once delivery limitations remain; no real push or receipt polling is claimed.

Firestore Rules and indexes are unchanged. Current-round feedback reads remain scoped to active Contract participants; old reviews remain stored immutably without adding history browsing. Direct status/cycle/review/task/completion/activity/Reward writes remain denied. Emulator checks exercise those boundaries and family isolation.

## Verification and reproducibility

Run `pnpm emulators:verify:resubmit-contract-for-review`. It extends the existing accepted -> completed -> submitted -> request-changes harness using CHOREX_VERIFY_SUBMISSION, CHOREX_VERIFY_REQUEST_CHANGES and CHOREX_VERIFY_RESUBMISSION. The combined harness permits 180 seconds for existing review races plus the added resubmission races.

- Workspace tests: 237 PASS (backend 131, Child 57, Parent 49). Focused additions extend the existing submission/review/notification/UI suites. Existing ACTIVE completeness/cycle, request-changes, approval, Review schemas, Phase 2 and Phase 3 tests pass.
- Backend resubmission: cycles 0 -> 1 and 2 -> 3, unchanged complete task/TaskCompletion terms/counts/ordinals/timestamps/history and frozen Contract terms/source/deadline, immutable prior review and no next-round review/Reward; all current-review mismatch/missing/invalid cases and authorization failures are atomic.
- Same-key and different-key unit races return canonical receipts or one INVALID_STATE loser; conflict/revoked access/illegal-state regressions pass. Staged abort leaves every document unchanged.
- Child tests verify feedback/progress, no completion controls, cancellable accessible confirmation, pending duplicate protection, response-versus-listener ordering, offline/error retry identity and fresh keys for later rounds. Parent tests verify queue re-entry and existing review actions. Typed adapter and notification routing regressions pass.
- Full emulator correction loop PASS: accepted -> completed -> initial READY_FOR_REVIEW cycle 0 -> REQUEST_CHANGES review cycle 0 -> CHANGES_REQUESTED -> resubmitted READY_FOR_REVIEW cycle 1 -> bilateral listeners and Parent queue. Task/completion snapshots and prior review are identical; no Review for cycle 1 or Reward exists before the optional approval. Exactly one resubmission event/Parent effect exists despite retry. Later approval creates cycle-1 APPROVE review and exactly one Reward.
- Four real Firestore different-key resubmission races PASS: one successful transition each, final cycle 3 from cycle 2, one event and unchanged review. A real transaction abort commits no status/event; injected transport failure preserves committed READY_FOR_REVIEW, retry completes the same effect, completed-effect redelivery sends nothing twice, and feedback is absent from payloads.
- Existing 12 real mixed Parent-decision races PASS (4 approval / 8 request-changes winners in this run); one review/event and matching Reward boundary in every case. Existing initial submission, completion/100-count/final-capacity races, current-review Rules/cache/reconnect and write-denial checks pass.
- Strict workspace typecheck, lint with no warnings, formatting and whitespace checks PASS. Parent and Child iOS bundle exports PASS.
- Existing Child/Parent acceptOffer, rejectOffer and counterOffer emulator regressions PASS. The complete Phase 2 realtime/notification/retry/isolation gate PASS. Phase 3 Contract-read discovery/cache/reconnect/family-isolation/direct-write regressions PASS in a separate fresh session.

Local validation uses isolated ports (Auth 19099, Firestore 18080, Functions 15001), preserving the native/dev dataset. The first combined run and bundles were interrupted by ENOSPC. Disposable Metro caches were cleared and checks rerun; no user records or native persistence were cleared. Temporary emulator configuration is removed after validation.

Native dependencies/configuration are unchanged. Both existing iOS bundle checks are run; no new native process-restart or physical-device push verification is claimed. Prior native persistence evidence remains applicable to the unchanged Contract/task read boundary.

## Changed files and next work

- Decision/docs: DECISIONS.md, numbered documents 02–07, Phase 3/4 historical follow-up pointers, this report and backend/client README.
- Backend: submitContractForReview.ts extends the existing transaction; negotiationNotifications.ts adds the missing submission effect.
- Child: ContractDetail.tsx and SubmitForReviewAction.tsx reuse confirmation and listener state.
- Shared notification routing: domain notification schema and notifications/core.ts.
- Focused existing backend/Child/Parent/notification suites plus verify-contract-resubmission.mjs, existing emulator harness hooks and root runner.
- No changes to Parent production UI, Firestore Rules/indexes, task-completion command or dependencies.

The complete request-changes -> correction -> resubmission -> review loop is now functional within the automated/emulator and bundle-verification scope. Reward surfaces and fulfillReward are the next Phase 4 work; the overall Phase 4 fulfillment gate remains incomplete. OPEN-010 and OPEN-011 stay unresolved. No commit, push or deployment.
