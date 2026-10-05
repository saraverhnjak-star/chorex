# Phase 3 Slice 2 — Child records task completion

This slice adds `recordTaskCompletion` while preserving the Slice 1 Contract reads and Phase 2 negotiation. Submission was outside this slice and is subsequently implemented in [Slice 3](PHASE_3_SLICE_3_ACCEPTANCE.md).

## Command and persistence

The shared strict input schema accepts only `contractId`, `taskId`, and `idempotencyKey`. The domain adds canonical `TaskCompletion` and linked `{ completion, task }` output schemas plus stable Contract command errors. Client ownership, counters, ordinals, roles, target counts, status and notes are rejected.

The callable uses the existing Functions error mapper and server transaction conventions. One transaction reads the Contract, actor-scoped idempotency state, active membership and scoped task. It requires role `CHILD`, Contract Child/participant ownership, matching task family/Contract/assignee, `ACTIVE` for new progress and `completedCount < targetCount`.

The transaction creates one immutable record at `/contracts/{contractId}/tasks/{taskId}/completions/{completionId}`, increments the task by one, sets `lastCompletedAt`/`updatedAt`, creates one `TASK_COMPLETED` activity event and completes idempotency state. Occurrence/creation use the same trusted server timestamp. Event metadata contains only Contract/task/completion IDs and ordinal, with authenticated actor UID and `actorType: CHILD`.

Completion/activity IDs and idempotency identity are deterministic hashes of command, actor UID and key. Same-key retries return the stored original canonical receipt, even after later progress or Contract status changes, while current membership/ownership still apply. Conflicting inputs return `IDEMPOTENCY_CONFLICT`. Different keys serialize on the transactional task projection. Failed requests write none of these records. Contract terms/status/review cycle, accepted revisions and prior completions remain unchanged.

The ordinary UI continues reading `ContractTask.completedCount`; it never reconstructs progress by downloading audit history. Stored retry receipts are response history, not another current progress model.

## App behavior

The Child detail uses the existing shared task row plus an accessible “Mark done” or “Mark one done” action for an incomplete owned task in `ACTIVE`. A ref prevents same-frame rapid taps, the button announces pending/disabled state, and confirmed actions wait for the authoritative realtime count. Fully completed tasks show the count and “Complete” text without another action. Non-ACTIVE states expose no completion controls.

On ambiguous network failure, displayed progress is unchanged and an explicit retry reuses the same key. Session, authorization, state, fully completed, missing resource and idempotency errors map to readable messages without exposing backend exceptions. Cached read data may remain visible; no local fake event or offline command queue exists.

Parent code remains read-only. The existing task listener renders Child progress without manual refresh. No review, Reward, expiry, cancellation, undo, media or push capability is added.

## Verification

Local automated verification on 2026-10-05:

- Workspace typecheck, lint, formatting and `git diff --check` pass.
- All 107 tests pass: backend 32, Parent 37, Child 38. Focused command tests cover strict input/output, one-time and 100-occurrence tasks, sequential history, authorization, counter corruption/bounds, all non-ACTIVE states, original receipts after later actions, idempotency conflicts and failed-action atomicity. Extended Child tests cover accessible actions, pending taps, realtime-only progress, same-key offline retry and stable error UX; existing Parent read tests verify realtime counts and no mutation controls.
- Actual callable emulator verification (`verify-record-task-completion.mjs`) passes: 1x/100x tasks; concurrent same-key deduplication; different-key final occurrence race with exactly one winner; three concurrent open-capacity increments with sequential ordinals; immutable completion/event history; no failed-action writes; correct actor metadata; both participant task subscriptions; membership/role/family/ownership rejection; denied direct task/completion/activity/lifecycle writes; and no review, Reward or push effect.
- Slice 1 `verify-contract-reads.mjs` passes, including frozen terms, cache/reconnect and family isolation.
- Existing `verify-accept-offer`, `verify-reject-offer`, `verify-counter-offer` and `verify-phase2` pass, including Child/Parent branches, deterministic acceptance and notification regressions.
- Both Parent and Child iOS bundle exports pass.

Run `pnpm emulators:verify:record-task-completion` for the focused emulator check. Verification used isolated localhost ports and stopped those emulators afterward; developer Metro/emulator processes were preserved. Native offline persistence across process restart was subsequently verified in both iOS development builds; see [native verification](PHASE_3_NATIVE_PERSISTENCE_ACCEPTANCE.md). No commit, push or deployment was performed.

## Deliberately unresolved

OPEN-009 correction semantics, OPEN-010 undo, and OPEN-011 expiry/cancellation remain unresolved. New progress accepts only `ACTIVE`; it does not reject solely because a frozen displayed deadline has passed. Unit fixtures cover a passed deadline without inventing expiry behavior. No new ADR or deadline/review policy was introduced, and no architecture conflict was found.

This slice establishes the execution foundation. [Slice 3](PHASE_3_SLICE_3_ACCEPTANCE.md) subsequently implements submission authorization, transactional completeness validation, lifecycle/activity handling and idempotency. [Native verification](PHASE_3_NATIVE_PERSISTENCE_ACCEPTANCE.md) closes the remaining restart-persistence acceptance item.

## Files changed in this slice

- `packages/domain/src/completion.ts`, `packages/domain/src/index.ts`
- `functions/src/recordTaskCompletion.ts`, `functions/src/index.ts`
- `functions/tests/record-task-completion.test.mjs`, `functions/tests/negotiation-notifications.test.mjs`
- `packages/firebase-client/src/index.ts`
- `apps/child/src/contracts/ContractDetail.tsx`, `TaskCompletionAction.tsx`, `messages.ts`
- `apps/child/__tests__/contract-surface.test.tsx`, `contract-adapter.test.tsx`
- `firebase/verify-record-task-completion.mjs`, root `package.json`
- `docs/03_STATE_MACHINES.md`, `docs/04_FIRESTORE_SCHEMA.md`, `docs/07_IMPLEMENTATION_ROADMAP.md`, `docs/PHASE_3_SLICE_1_ACCEPTANCE.md`, this acceptance note
- `functions/README.md`, `packages/firebase-client/README.md`

Pre-existing uncommitted Slice 1 files remain in the workspace; they are listed in its acceptance note. Firestore Rules, Parent production code, dependencies and Offer command implementations are unchanged by Slice 2.
