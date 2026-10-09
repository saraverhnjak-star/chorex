# Server commands and notification effects

The Node 22 TypeScript workspace contains server-authoritative onboarding, pairing, Offer and Contract execution commands. Run `pnpm functions:build` from the root; compiled output is ignored. `pnpm --filter @chorex/functions test` builds and runs focused task-completion transaction/schema tests and deterministic notification tests with a fake Expo transport.

`notifyOfferNegotiation` listens for committed `/activityEvents/{eventId}` documents. It resolves recipients from Offer participants and active Family membership, and sends the documented publish/counter/accept matrix via Expo Push Service. Rejection has no push effect. Commands remain independent of delivery.

The event owns one server-only `notificationEffects/expo` record, with a transactional lease and at most three attempts. Completed or permanently skipped work is not repeated. Delivery errors use Cloud Functions event retry/backoff; an exhausted send records `FAILED`. Expo tickets are recorded and immediately unregistered tokens are disabled with a token-rotation check. A successful ticket means Expo accepted the message, not that a physical device displayed it. Receipt polling/cleanup is deferred beyond this Phase 2 slice.

The Functions emulator uses deterministic fake tickets and never calls Expo. Run `pnpm emulators:verify:phase2` to verify the bilateral lifecycle, event effects and failure isolation. Do not deploy as part of local verification.

## Task completion

`recordTaskCompletion` requires an authenticated active Child who owns the Contract/task, and `ACTIVE` Contract state for new occurrences. One transaction creates an immutable completion, increments the bounded task counter, writes a Child activity event and completes the established actor/command/key-scoped idempotency record. A completed retry returns its original canonical receipt after current authorization checks. Counter updates never imply Contract submission, approval or Reward creation.

Run `pnpm emulators:verify:record-task-completion` for actual-callable authorization, 1x/100x counters, same-key retries, final/open concurrency, bilateral realtime updates and denied direct writes. Task events are excluded from the existing Offer notification matrix. Deadlines, corrections and undo remain unresolved; see [Slice 2 evidence](../docs/PHASE_3_SLICE_2_ACCEPTANCE.md).

## Contract submission (Phase 3 Slice 3)

`submitContractForReview` accepts `{ contractId, idempotencyKey }` and requires the active authenticated Child participant. Its ACTIVE transaction validates a nonempty collection of scoped tasks with exact completed/target equality, then updates Contract status/updatedAt, creates one Child `CONTRACT_SUBMITTED` event and completes idempotency state. Same-key retries return the original `{ contract }` receipt; conflicting input returns `IDEMPOTENCY_CONFLICT`, incomplete tasks `TASKS_INCOMPLETE`, and states outside ACTIVE/CHANGES_REQUESTED `INVALID_STATE`. The unchanged ACTIVE branch preserves reviewCycle. ADR-044 adds contract-level resubmission from CHANGES_REQUESTED: verify the deterministic current REQUEST_CHANGES review/required feedback, absent next review/Reward and structurally valid scoped tasks; atomically set READY_FOR_REVIEW and cycle + 1. Missing/inconsistent review state fails INVALID_STATE. Both branches preserve task/completion history and frozen terms, create no Review/Reward, and use the existing CONTRACT_SUBMITTED event/receipt. The committed-event dispatcher validates the completed receipt and notifies the active Parent without feedback or terms. No deadline cutoff is introduced.

Run `pnpm emulators:verify:submit-contract-for-review` for the real callable acceptance/completion/submission flow, bilateral listeners, direct-write denials and concurrency checks. It extends the Slice 2 verification harness. See `docs/PHASE_3_SLICE_3_ACCEPTANCE.md`.

`approveContract` accepts `{ contractId, idempotencyKey }` from the active Parent participant of a READY_FOR_REVIEW Contract. One transaction writes an immutable APPROVE review at the unchanged current zero-based cycle, APPROVED Contract timestamps, one deterministic PENDING_FULFILLMENT Reward copied from frozen terms, one Parent approval event and the original canonical receipt. Same-key retries reuse the receipt after current access checks; new invalid-state or conflicting-key actions fail. The existing committed-event dispatcher sends the approval effect to the active Child. Approval remains separate from request changes, resubmission and Reward fulfillment.

`requestContractChanges` accepts `{ contractId, idempotencyKey, note }` and reuses `parentReviewDecision.ts` with approval: identical active Parent authorization, READY_FOR_REVIEW state guard, unchanged cycle and deterministic round slot. Required feedback is trimmed with the established 1–500-character description schema; changing it under the same key conflicts. Atomic writes create REQUEST_CHANGES Review, CHANGES_REQUESTED status/updatedAt, one Parent event and canonical receipt. No Reward or execution-history mutation occurs. Committed-event dispatch sends generic changes-requested copy to the active Child without feedback. ADR-044 resolves OPEN-009; the existing submitContractForReview handles resubmission without another command. OPEN-010/011 remain unresolved.

## Reward fulfillment

`markRewardDelivered({ rewardId, idempotencyKey })` returns the original awaiting `{ reward }` receipt; `confirmRewardReceived` returns the original fulfilled receipt. Both validate shared schemas, use authenticated server commands and translate stable errors. Parent reports delivery; only assigned Child confirms receipt. UI retains the key across ambiguous failures and waits for backend confirmation; realtime listeners own current state. Cached reads never imply command success or enqueue mutations.

Run `pnpm emulators:verify:reward-fulfillment` from the repository root for the full accepted/completed/correction/resubmission/approval/fulfillment integration path, scoped Rules/read listeners, transaction races and notification failure/redelivery checks. See the focused Phase 4 Reward fulfillment acceptance report.

## Expo receipt worker (Phase 5 Slice 1)

`processExpoPushReceipts` runs every 15 minutes UTC, using Expo `getReceipts` after accepted tickets from the existing dispatcher. Each invocation claims at most 100 due tickets with two-minute transactional leases. First lookup waits 15 minutes; missing/transient work retries with 15/30/60/120-minute delays, at most five attempts within 24 hours. Terminal work retains evidence for seven days; at most 100 expired terminal records are removed per invocation. The receipt worker never resends a notification.

Only `DeviceNotRegistered` disables an exact current registration; token fingerprints plus captured lastSeenAt protect later refresh/registration. Device cleanup changes only pushEnabled, leaving Auth and family membership unchanged. Message/provider errors terminate without disabling valid devices. Receipt documents are server-only, contain no raw tokens or notification copy, and need the two checked-in composite indexes.

Run `pnpm emulators:verify:push-receipts` for injected fake-Expo send→ticket→receipt→next-send verification and Rules checks. It uses Auth/Firestore only to avoid background trigger competition. The scheduled callback intentionally makes no live Expo calls in emulators. Existing Phase 2–4 verification continues to exercise the committed-event function trigger with emulator send tickets. No deployment is performed by these checks.

## Administrative account deletion (ADR-050)

`deleteParentAccount` accepts a recently password-reauthenticated Parent and atomically reserves a fenced deletion scope. `accountDeletionWorker` runs every minute, drains bounded external-effect leases, checkpoints recursive cleanup and removes Parent Auth last. Accepted work survives client disconnect and membership/Auth removal; terminal operation/fence metadata expires after seven days. Unsupported shared/malformed or oversized scopes fail closed before destructive writes. No domain cancellation/fulfillment transition is emitted.

Operation/fence/effect collections are server-owned. Do not remove a fence to recover a failed job: inspect its durable phase and retry through the trusted worker. Repeated failures emit `CLEANUP_RETRY_REQUIRED` without account/content diagnostics. Deploying the callable, scheduled worker and updated Rules together requires a separate authorized deployment; this slice does not deploy them.
