# Phase 3 Slice 1 — Read-only Contract surfaces

This slice implements the read path after acceptance. It does not complete the full Phase 3 execution gate. The read-only scope and verification below describe Slice 1; [Slice 2](PHASE_3_SLICE_2_ACCEPTANCE.md) subsequently adds Child completion actions while preserving these reads and the Parent read-only surface.

## Implemented flow

Both home screens subscribe to active Contracts for the current family and authenticated participant. Acceptance creates an `ACTIVE` Contract and the existing Offer inbox listener removes the accepted Offer; the independent Contract listener exposes the new agreement without restarting or refreshing. Multiple Contracts are supported.

Each app opens `/contracts/[contractId]` by stable Contract ID. Detail displays authoritative status, frozen task titles/descriptions, persisted `completedCount / targetCount`, promised reward terms, and the frozen deadline in the user's locale/timezone. Parent names come from the existing authorized family read and are matched by the Contract's Child UID, never from a route-supplied display name. Names are supplementary when that read is unavailable.

The shared `TaskProgress` primitive exposes readable task/count context and derives not-started/in-progress/complete text without persisting another state. Screens provide accessible headings, home navigation, loading, empty, missing and failure states. No progress, review, reward, cancellation or expiry mutation is exposed.

## Canonical reads and authorization

`packages/firebase-client` owns `observeContract`, `observeTasks`, and `observeActiveContracts`, domain-schema deserialization, and their transient React read hooks. Detail never fetches Offer terms, Rewards, or TaskCompletion events. The accepted source identity, reward promise, deadline, status and review cycle remain the stored Contract values.

Active queries constrain `familyId`, authenticated `participantUids` and `status: ACTIVE`, ordered by `createdAt` descending. A corresponding Contract composite index is checked in. Task ordering is stable document-ID ordering: persisted deterministic task IDs have no explicit position field, so the read path does not reconstruct the original Offer task array order.

Firestore Rules are unchanged. Reads require an active membership and a UID named in the Contract's participants. Other family Parents/Children, outsiders, unauthenticated users, inactive participants and participants without membership cannot read the Contract/tasks. Client Contract lifecycle and task progress writes remain denied.

## Realtime and cache behavior

Observers include metadata changes and expose `fromCache`. Usable cached terms show “Showing saved data. Updates may be pending.” Missing cached data asks the user to connect; initial errors do not claim success or retain previously displayed terms. IDs/authentication changes invalidate old state, unsubscribe listeners, and ignore callbacks after cleanup.

The emulator's Firestore client verifies populated cached Contract/tasks during `disableNetwork`, then server synchronization after `enableNetwork`. Component/adapter tests verify cache metadata and UI state. Native Firestore remains responsible for offline persistence. At Slice 1 sign-off, native persistence across process restart had not been verified. The subsequent [native iOS development-build verification](PHASE_3_NATIVE_PERSISTENCE_ACCEPTANCE.md) closes that item using actual process termination and offline relaunch in both apps. Cache metadata is not a definitive connectivity indicator.

## Verification

Local checks on 2026-10-05:

- Workspace TypeScript strict typecheck, lint, formatting and all 69 tests pass (Parent 37, Child 25, backend 7).
- Focused canonical deserialization/adapter, Parent and Child component/route tests: snapshots, task scope/order, malformed data, cache/missing/error states, cleanup, multiple Contracts and stable-ID navigation.
- `firebase/verify-contract-reads.mjs`: real acceptance, bilateral realtime discovery and waiting Offer removal, identical frozen snapshots, second accepted Contract, immutable revision inspection, unrelated subsequent Offer terms, cache/reconnect, participant/membership read denials, denied writes and absence of Reward documents.
- Existing emulator `verify-accept-offer`, `verify-reject-offer`, `verify-counter-offer`, and `verify-phase2` pass, including both actor paths and negotiation/notification regressions.
- Both Parent and Child iOS production bundle exports succeed.

Run the focused emulator check with `pnpm emulators:verify:contract-reads` using the repository's development emulator configuration. Local verification used isolated ports so existing developer emulators were untouched. The emulator does not enforce production composite index deployment; the new index is checked in and has not been deployed.

No architecture conflict or OPEN decision was resolved. This establishes the client read foundation for `recordTaskCompletion`; that future command still needs its own server authorization, idempotency, transactional progress/event handling and verification. Review corrections, Reward creation, expiry and other later behavior remain outside this slice.

## Changed files

Client boundary and presentation:

- `packages/firebase-client/src/index.ts`
- `packages/firebase-client/src/contractReadModel.ts`
- `packages/firebase-client/src/contractHooks.ts`
- `packages/firebase-client/package.json` (existing React type definitions)
- `packages/ui/src/TaskProgress.tsx`
- `packages/ui/src/index.ts`

Parent:

- `apps/parent/app/(app)/index.tsx`
- `apps/parent/app/(app)/contracts/[contractId].tsx`
- `apps/parent/src/contracts/ActiveContracts.tsx`
- `apps/parent/src/contracts/ContractDetail.tsx`
- `apps/parent/__tests__/contract-surface.test.tsx`
- `apps/parent/__tests__/bootstrap.test.tsx` (new navigation/read mocks)

Child:

- `apps/child/app/index.tsx`
- `apps/child/app/contracts/[contractId].tsx`
- `apps/child/src/contracts/ActiveContracts.tsx`
- `apps/child/src/contracts/ContractDetail.tsx`
- `apps/child/__tests__/contract-surface.test.tsx`
- `apps/child/__tests__/contract-read-model.test.tsx`
- `apps/child/__tests__/contract-adapter.test.tsx`
- `apps/child/__tests__/bootstrap.test.tsx` (new navigation/read mocks)

Verification, configuration and documentation:

- `firebase/verify-contract-reads.mjs`
- `firebase/firestore.indexes.json`
- `package.json` (focused emulator script)
- `pnpm-lock.yaml`
- `packages/firebase-client/README.md`
- `docs/07_IMPLEMENTATION_ROADMAP.md`
- `docs/PHASE_3_SLICE_1_ACCEPTANCE.md`
