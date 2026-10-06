# Native Firebase client boundary

Provides typed development initialization for native App, Auth, Firestore, and Functions modules, authentication, family/profile reads, Offer commands, and realtime Offer inbox adapters. Configuration is validated before service access, the native project must be `chorex-dev`, and services are routed to emulators. Invalid configuration throws; there is no production fallback.

A process-global registry preserves setup across Fast Refresh. Changing configuration or a partial setup failure requires restarting the development client.

## Contract reads

- `observeContract(contractId, callback, onError)` observes one Contract by stable document ID.
- `observeTasks(contractId, callback, onError)` observes only that Contract's task subcollection.
- `observeActiveContracts(familyId, callback, onError)` queries `ACTIVE` Contracts with both the family constraint and the authenticated participant's UID. Results are ordered by creation time descending; Firestore resolves ties by document ID.

Callbacks receive `ReadSnapshot<T>`, containing parsed domain `data` and `fromCache`. Every observer returns an unsubscribe function. Timestamps become UTC ISO strings through the canonical domain schemas. Tasks are sorted by document ID, matching the persisted representation's deterministic IDs; no task-position field exists, so this does not reconstruct Offer revision ordering.

`useContractDetail(contractId, authUid)` combines the two detail subscriptions, checks task family/assignee scope against the Contract, and exposes loading, missing, error, or ready state. `useActiveContracts(familyId, authUid)` supplies the list state. Changing authentication/IDs hides previous state immediately and cleans up listeners; unmounted callbacks are ignored. These hooks keep transient React state rather than copying datasets into Zustand.

`ContractReadError.code` provides stable read errors. Rules remain authoritative: only active named participants can read; knowing an ID grants no access. Missing/inaccessible documents may produce permission errors, which apps present without exposing existence.

All Contract terms come from the frozen Contract and persisted tasks. These APIs do not read Offer revisions, Rewards, or completion events and perform no writes. Native Firestore supplies cached reads. `fromCache` means saved data may be awaiting synchronization; it does not prove the device is offline or that a command succeeded.

See [Phase 3 Slice 1 verification](../../docs/PHASE_3_SLICE_1_ACCEPTANCE.md) for emulator evidence and the native persistence verification limit.

## Contract completion command

`recordTaskCompletion({ contractId, taskId, idempotencyKey })` calls the existing named backend command, validates strict input/output schemas and translates stable domain errors to `ContractClientError`. It performs no direct Firestore writes. The returned task is the original committed receipt, not a replacement for the realtime task projection.

Child task actions reuse the key after ambiguous errors, block rapid taps/pending reads, and leave displayed counts to the existing listeners. Each confirmed subsequent occurrence gets a new key. Completion requires backend access; cached data remains readable but no local completion or offline queue is created. Parent task surfaces remain read-only.

### Submit a completed Contract

`submitContractForReview({ contractId, idempotencyKey })` invokes the trusted callable and parses the shared canonical `{ contract }` receipt with `READY_FOR_REVIEW`, checking its Contract identity. It shares stable Contract command error translation with `recordTaskCompletion`, including `TASKS_INCOMPLETE` and connectivity failures. Keep the same key after ambiguous failure. The caller must use `observeContract`/`useContractDetail` for displayed status; the adapter never writes or optimistically replaces lifecycle state.

`approveContract({ contractId, idempotencyKey })` validates the shared linked `{ contract, review, reward }` approval receipt and Contract identity. It shares stable error translation and requires backend confirmation. Parent UI keeps its key after an ambiguous failure; displayed lifecycle state comes from realtime listeners. `observeReadyForReviewContracts` / `useReadyForReviewContracts` reuse the metadata-aware scoped Contract list path with READY_FOR_REVIEW. No custom cache, offline queue or Review/Reward client writes are added by approval. Reward reads are supplied separately below.

`requestContractChanges({ contractId, idempotencyKey, note })` validates normalized required feedback and the linked canonical `{ contract, review }` receipt. Displayed Contract state remains realtime-owned. `observeCurrentContractReview` / `useCurrentContractReview` query only the authoritative current round with family/Contract equality constraints and limit 2, validate scope/author/decision and duplicate corruption, expose native cache metadata, and clean up on scope/session/round changes. Current-round feedback reads are available only to active named Contract participants. No history browsing, write access, alternate note storage or offline queue is introduced.

ADR-044 correction/resubmission reuses submitContractForReview unchanged at the client boundary. Authoritative CHANGES_REQUESTED -> READY_FOR_REVIEW increments reviewCycle once; the existing receipt parser accepts that canonical result. Child confirmation uses a new key for each newly opened review round, retains the same key on ambiguous retry and waits for backend confirmation. Feedback and tasks remain listener-owned; no custom cache or mutation queue is added.

## Reward reads and fulfillment

- `observePendingRewards` / `usePendingRewards`: familyId + authenticated parentUid + PENDING_FULFILLMENT, earnedAt descending.
- `observeEarnedRewards` / `useEarnedRewards`: familyId + authenticated childUid, earnedAt descending; pending and fulfilled Rewards.
- `observeReward` / `useRewardDetail`: stable Reward ID with native timestamp normalization, strict canonical status/field validation and owner checks.

All listeners include metadata changes, expose native fromCache, clear stale scope/session state and reject malformed records. Equal timestamps follow Firestore document-ID ordering. Screens use these adapters rather than raw queries or a persisted store.

`fulfillReward({ rewardId, idempotencyKey })` validates input and the linked fulfilled `{ reward }` receipt and translates stable domain/network errors. Parent UI retains the same key across ambiguous failures, waits for backend confirmation and lets realtime state remove pending obligations. Child surfaces are read-only. Native cached reads may remain available; they never establish callable success or enqueue a mutation.
