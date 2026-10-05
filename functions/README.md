# Server commands and notification effects

The Node 22 TypeScript workspace contains server-authoritative onboarding, pairing, Offer and Contract execution commands. Run `pnpm functions:build` from the root; compiled output is ignored. `pnpm --filter @chorex/functions test` builds and runs focused task-completion transaction/schema tests and deterministic notification tests with a fake Expo transport.

`notifyOfferNegotiation` listens for committed `/activityEvents/{eventId}` documents. It resolves recipients from Offer participants and active Family membership, and sends the documented publish/counter/accept matrix via Expo Push Service. Rejection has no push effect. Commands remain independent of delivery.

The event owns one server-only `notificationEffects/expo` record, with a transactional lease and at most three attempts. Completed or permanently skipped work is not repeated. Delivery errors use Cloud Functions event retry/backoff; an exhausted send records `FAILED`. Expo tickets are recorded and immediately unregistered tokens are disabled with a token-rotation check. A successful ticket means Expo accepted the message, not that a physical device displayed it. Receipt polling/cleanup is deferred beyond this Phase 2 slice.

The Functions emulator uses deterministic fake tickets and never calls Expo. Run `pnpm emulators:verify:phase2` to verify the bilateral lifecycle, event effects and failure isolation. Do not deploy as part of local verification.

## Task completion

`recordTaskCompletion` requires an authenticated active Child who owns the Contract/task, and `ACTIVE` Contract state for new occurrences. One transaction creates an immutable completion, increments the bounded task counter, writes a Child activity event and completes the established actor/command/key-scoped idempotency record. A completed retry returns its original canonical receipt after current authorization checks. Counter updates never imply Contract submission, approval or Reward creation.

Run `pnpm emulators:verify:record-task-completion` for actual-callable authorization, 1x/100x counters, same-key retries, final/open concurrency, bilateral realtime updates and denied direct writes. Task events are excluded from the existing Offer notification matrix. Deadlines, corrections and undo remain unresolved; see [Slice 2 evidence](../docs/PHASE_3_SLICE_2_ACCEPTANCE.md).

## Contract submission (Phase 3 Slice 3)

`submitContractForReview` accepts `{ contractId, idempotencyKey }` and requires the active authenticated Child participant. Its transaction validates a nonempty collection of scoped tasks with exact completed/target equality, then updates Contract status/updatedAt, creates one Child `CONTRACT_SUBMITTED` event and completes idempotency state. Same-key retries return the original `{ contract }` receipt; conflicting input returns `IDEMPOTENCY_CONFLICT`, incomplete tasks `TASKS_INCOMPLETE`, and new non-ACTIVE submissions `INVALID_STATE`. No tasks/history/terms/review cycle are changed; no Review, Reward, deadline cutoff or push effect is introduced.

Run `pnpm emulators:verify:submit-contract-for-review` for the real callable acceptance/completion/submission flow, bilateral listeners, direct-write denials and concurrency checks. It extends the Slice 2 verification harness. See `docs/PHASE_3_SLICE_3_ACCEPTANCE.md`.
