# Phase 4 — Parent requests changes acceptance

Verification date: 2026-10-05. Scope: the immutable Parent REQUEST_CHANGES decision and READY_FOR_REVIEW → CHANGES_REQUESTED transition, required feedback, current-round feedback reads and committed Child notification. Approval remains covered by [approval acceptance evidence](PHASE_4_APPROVAL_ACCEPTANCE.md). No separate Phase 4 Slice 1 acceptance report exists in this checkout.

## Command and shared invariant

`requestContractChanges({ contractId, idempotencyKey, note })` returns canonical `{ contract, review }` with UTC ISO timestamps. Strict shared Zod input rejects client-selected identity, family, role, cycle and state. Feedback reuses the existing task-description convention: trim, nonempty, maximum 500 characters. Empty/whitespace/missing/over-limit input fails INVALID_INPUT. Output validates matching family/Contract/Parent/current cycle and authoritative creation/update timestamps.

`parentReviewDecision.ts` contains one transactional implementation for approval and request changes. The existing approval command remains a typed wrapper with its original API, error class, payload hash, deterministic identities, success receipt and Reward boundary. Request changes has its own typed wrapper/error class, not an independent approval-like transaction.

Both commands require authenticated active Parent membership in the authoritative Contract family, exact parentUid ownership and participant inclusion. New decisions require READY_FOR_REVIEW. ACTIVE, CHANGES_REQUESTED, APPROVED, CANCELLED and EXPIRED fail INVALID_STATE. Wrong role/Parent/family, inactive/nonmember and missing Contract failures commit nothing.

Both decisions reserve the same `review_{sha256(contractId + ":" + reviewCycle)}` identity. The transaction reads this slot and the deterministic Contract Reward slot before writing. A prior round decision or unexpected earned Reward blocks another decision. Creation preconditions plus the shared authoritative Contract read/write serialize conflicting decisions; distinct command/key namespaces cannot produce two reviews for the round.

## Atomic writes and cycle semantics

One transaction:

- creates one immutable REQUEST_CHANGES Review with authoritative family/Contract/current cycle/reviewer, trimmed feedback and native createdAt;
- updates only Contract status CHANGES_REQUESTED and native updatedAt;
- writes one Parent CONTRACT_CHANGES_REQUESTED event with Contract/review IDs, authenticated actorUid and actorType PARENT;
- completes actor/command/key-scoped idempotency state with the original canonical receipt.

ADR-043 is unchanged: rounds 0 and 2 produce Review cycles 0 and 2 respectively, and Contract reviewCycle is unchanged. No Reward is created; the frozen promise stays on the Contract. No task definition/count, completion record, prior review, source, deadline, rewardTerms or Offer/revision history is changed. Injected failures after staged writes roll back every record in unit tests and a real Firestore transaction.

Idempotency hashes normalized Contract ID and note. Same-key retries return the original receipt after current access checks. Equivalent surrounding whitespace normalizes to the same note. A different normalized note or Contract under the same key returns IDEMPOTENCY_CONFLICT rather than editing history. Different-key competing actions have one legal winner and no partial writes. Historical receipts do not replace current realtime state.

## Parent and Child UI

The existing Parent READY_FOR_REVIEW detail now exposes Approve and Request changes. Approval confirmation/copy/API behavior is preserved. Request changes opens an accessible confirmation with required multiline Feedback, Confirm request changes and Keep reviewing. Invalid feedback cannot submit. React Hook Form/Zod normalize and validate the note; shared pending/in-flight guards prevent duplicate taps or switching decisions during a pending request. Feedback is noneditable while pending.

Displayed lifecycle state is never optimistic. After backend confirmation the short “Changes requested” confirmation appears; if the receipt precedes realtime the existing waiting message remains until the listener changes state. A backend error leaves READY_FOR_REVIEW visible. Explicit retries of unchanged normalized feedback retain their key; changing feedback starts a distinct action. CHANGES_REQUESTED removes both decisions.

Parent and Child detail read the authoritative current-round Review and display its note under “Parent feedback,” with loading/missing/error/cache states. CHANGES_REQUESTED clearly says the reward has not been earned. Child has no progress/remediation/resubmission control in this state. No full review-history screen or alternate feedback storage is introduced.

## Minimum feedback read and Rules

`observeCurrentContractReview` / `useCurrentContractReview` observe only the Contract's current cycle. The query is:

```text
/contracts/{contractId}/reviews
where familyId == authoritative Contract.familyId
where contractId == Contract.id
where cycle == Contract.reviewCycle
limit 2
```

The bound permits detecting duplicate/corrupt current decisions, not history browsing. The adapter converts native timestamps, validates family/Contract/cycle/reviewer/decision/required feedback and fails duplicate records. Listener state includes native cache metadata, clears on scope/session/round changes and ignores callbacks after cleanup. Query failures cannot invent feedback or change Contract state.

Rules permit current-round get/bounded list only to authenticated active family members named as Contract participants, with matching stored family/Contract/cycle. Unauthenticated users, sibling/other-family/nonparticipating accounts, inactive membership, older-cycle get and unbounded/history queries are denied. All client Review/status/task-progress/activity/Reward writes remain denied. The exact scoped query and denials pass against the emulator; no new index is required for this equality-only subcollection query.

## Activity and notification

Exactly one Parent CONTRACT_CHANGES_REQUESTED event exists per committed action. Feedback content stays in immutable Review data and the server-only canonical retry receipt; it is absent from event metadata, lock-screen copy, routing data and delivery bookkeeping.

The existing dispatcher verifies the committed immutable REQUEST_CHANGES Review and deterministic round identity, resolves the active Child participant, and uses existing Expo device filtering/effect leasing/bounded retries. Immutable review validation supports delayed event processing after a future round advances without inventing a resubmission command.

Copy: “Changes requested” / “A change was requested before approval.” Data contains only CONTRACT_CHANGES_REQUESTED, CONTRACT, Contract ID and family ID. Notification responses open the existing stable Contract detail. Failed transactions create no event/effect. Same-key retries and completed-effect redelivery do not duplicate logical work. Injected transport failure preserves CHANGES_REQUESTED/Review/no-Reward state; retry completes the same effect. No real Expo push, receipt polling or transport infrastructure is added. Existing physical exactly-once delivery limitations remain.

## Verification and reproducibility

- Workspace tests: 208 PASS (backend 107, Parent 47, Child 54), extending existing Contract/notification/UI/adapter suites.
- Backend coverage: rounds 0/2, required/normalized feedback, strict input/output, all authorization/state failures, canonical/conflicting retries, execution/negotiation preservation, no Reward, immutable prior reviews, transaction rollback and both mixed-decision orderings.
- Parent coverage: both decisions visible, accessible/cancellable feedback confirmation, invalid feedback disabled, pending controls/duplicate taps, backend error/same-key retry, response-versus-realtime timing, current feedback/error state and unchanged approval path.
- Child/client coverage: realtime CHANGES_REQUESTED, authoritative cached feedback, listener failure/cleanup/stale callback isolation, no earned Reward or new execution actions, scoped bounded query/deserialization, duplicate/malformed data and typed callable receipt/error handling.
- Full emulator request-changes flow: real Offer acceptance → task completion → submission → Parent queue → feedback decision → one immutable current-round Review → bilateral CHANGES_REQUESTED/queue removal → Child notification effect. Reward count remains zero; task/completion/Offer/revision snapshots are identical before/after. Completion and resubmission commands remain invalid in CHANGES_REQUESTED.
- Real Firestore races: 12 repetitions, comprising 3 different-key request/request races and 9 approve/request races with simultaneous and both biased start orders. Observed 6 APPROVE and 6 REQUEST_CHANGES winners overall. Every case left exactly one matching Review and event, unchanged cycle, and either APPROVED + one Reward or CHANGES_REQUESTED + zero Rewards; no mixed state.
- Current-review get/query Rules and client write denials pass; populated feedback cache and listener reconnect converge using the SDK.
- Phase 2 accept/reject/counteroffer/notification regressions PASS. Phase 3 read/cache/reconnect/isolation, completion/submission and Phase 4 approval/Reward/queue/notification regressions PASS.
- Typecheck, lint without warnings, formatting/whitespace checks and both Parent/Child iOS bundle exports PASS.

Run `pnpm emulators:verify:request-contract-changes` for the extended completion/submission harness with CHOREX_VERIFY_SUBMISSION=1 and CHOREX_VERIFY_REQUEST_CHANGES=1. Approval remains independently reproducible with `pnpm emulators:verify:approve-contract`.

Local verification used isolated ports (Auth 19099, Firestore 18080, Functions 15001), preserving the existing native/dev dataset. The approval regression and request-changes full-path verification used separate fresh emulator sessions: the completion harness intentionally expects no pre-existing Rewards, so it must not reuse a dataset containing the prior approval test's earned Reward. Temporary configuration was removed and isolated emulators shut down. No production Rules/index deployment is claimed.

Native SDK initialization/persistence configuration is unchanged; metadata-aware feedback reads extend the established read boundary. Prior native restart evidence remains applicable to unchanged Contract/task reads, and cache/reconnect regressions pass here. No new native process-restart or physical-device push test was performed in this slice.

## OPEN-009 boundary and completion

RequestContractChanges is complete within this slice's automated/emulator scope. OPEN-009 is the next blocking decision before Child correction/resubmission. Preserving counts/events during the Parent transition does not choose contract-level-only remediation. No completion is invalidated, counter reduced, task reopened, replacement/remediation task created, correction checkbox added or resubmission enabled. `recordTaskCompletion` retains its ACTIVE-only rules.

ADR-043 remains authoritative; no new ADR is needed. OPEN-009, OPEN-010, OPEN-011 and unrelated open decisions remain unresolved. No Reward fulfillment, history browsing, expiry/cancellation, reminders or receipt polling is implemented. No commit, push or deployment was performed.

## Files and boundaries changed

- Backend: new `functions/src/parentReviewDecision.ts` and `requestContractChanges.ts`; existing approval wrapper, callable wiring and committed dispatcher.
- Domain: required feedback/request input/output schemas, exports and minimal notification type.
- Client: typed request adapter, current-review deserializer/observer/hook.
- UI: existing Parent review action composition, Parent/Child feedback detail and shared pure `ReviewFeedback` primitive; notification detail routing.
- Security: bounded current-round Review read Rules; writes stay denied.
- Verification: existing backend/UI/adapter/notification tests, new `firebase/verify-contract-changes.mjs`, existing submission harness hook and focused root runner.
- Documentation: Domain Model, State Machines, Firestore Schema, Auth/Security, Push, roadmap, backend/client README, approval follow-up and this report. DECISIONS.md is unchanged.
