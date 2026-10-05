# ChoreX - Codex Implementation Roadmap

The order below is designed to minimize rework. Codex should not build auctions, proof media, or marketing pages before the basic agreement loop is working end-to-end.

## Phase 0 - Repository foundation

Deliverables:

- pnpm workspace;
- Parent Expo app;
- Child Expo app;
- shared packages;
- TypeScript strict mode;
- Expo development builds configured;
- Firebase dev project wired to both apps;
- lint/typecheck/test scripts;
- Firebase emulator setup;
- `AGENTS.md` at repository root.

Acceptance gate:

```text
Both apps launch in development builds.
Shared domain package imports correctly.
CI typecheck/lint/tests pass.
No production Firebase credentials/config are used locally.
```

## Phase 1 - Authentication, family, child pairing

Build:

- parent email/password auth;
- authenticated, idempotent `createFamily` callable that atomically creates the Parent profile if absent, the Family, and the Parent membership;
- child profile creation;
- child Auth UID creation server-side;
- one-time pairing session;
- child custom-token sign-in;
- device registration;
- family/member read security;
- basic Parent and Child home screens.

Acceptance gate:

```text
A parent can create a family and child.
A fresh Child app installation can pair securely.
The child can read only the correct family data.
Another account cannot access that family.
```

## Phase 2 - Offer negotiation

Build:

- Parent offer composer;
- offer revision model;
- publish offer;
- Child inbox;
- accept/reject;
- child counteroffer;
- parent counteroffer;
- immutable revision history;
- push notifications for negotiation events.

Acceptance gate:

```text
Both sides see the same current revision.
Stale revision acceptance is rejected.
Acceptance creates exactly one contract.
Repeated accept requests do not create duplicates.
```

## Phase 3 - Contract execution and repeated chores

Slice 1 establishes read-only Contract/task detail and realtime active Contract navigation in both apps. See [Slice 1 implementation and verification](PHASE_3_SLICE_1_ACCEPTANCE.md). Slice 2 adds authenticated, transactional Child task completion; see [Slice 2 verification](PHASE_3_SLICE_2_ACCEPTANCE.md). Slice 3 adds authoritative completed-Contract submission; see [Slice 3 verification and Phase 3 gate assessment](PHASE_3_SLICE_3_ACCEPTANCE.md). The final native restart-persistence item is verified in [native acceptance evidence](PHASE_3_NATIVE_PERSISTENCE_ACCEPTANCE.md); the documented Phase 3 gate is satisfied for the existing iOS development-build workflow.

Build:

- contract detail screen in both apps;
- contract task list;
- `recordTaskCompletion` callable;
- progress bars and `x / target` display;
- Firestore offline behavior validation;
- submit-for-review command;
- deadline display.

Acceptance gate:

```text
A task with targetCount=100 can progress safely.
The child cannot increment another child's contract.
The child cannot submit until all requirements are satisfied.
Offline-created native Firestore state behaves predictably for allowed read/listener paths; authoritative commands require network and give clear UX when offline.
```

Note: because authoritative progress writes are Cloud Functions, do not pretend callable mutations work offline. The app may show read cache offline, but command actions should queue only if a deliberately designed command queue is added later. MVP should clearly indicate connectivity for actions requiring server confirmation.

## Phase 4 - Review and reward fulfillment

The first review mutation is Parent approval with a minimal Ready-for-Review list. ADR-043 resolves OPEN-012 using zero-based review rounds; approval preserves the cycle and atomically creates one pending earned Reward. See [approval acceptance evidence](PHASE_4_APPROVAL_ACCEPTANCE.md). Request changes is implemented as a bounded immutable decision/transition with current-round feedback reads; see [request-changes acceptance evidence](PHASE_4_REQUEST_CHANGES_ACCEPTANCE.md). Correction/resubmission and fulfillment remain future slices; OPEN-009 is unresolved.

Build:

- Ready for Review Parent queue;
- approve;
- request changes with note;
- review history;
- reward creation on approval;
- Child earned rewards screen;
- Parent reward to-do screen;
- mark reward fulfilled;
- push notifications.

Acceptance gate:

```text
Approval is atomic and idempotent.
Exactly one reward is created per contract.
Requested changes preserve prior reviews.
Reward fulfillment is separate from contract approval.
```

## Phase 5 - Push hardening and reminders

Build:

- contextual permission onboarding;
- token refresh/update handling;
- push receipt processing;
- invalid-token cleanup;
- notification deep links;
- 24-hour deadline reminder;
- pending reward reminder;
- preference controls for optional reminders.

Acceptance gate:

```text
Notification tap opens the correct entity in the correct app.
Invalid tokens stop receiving send attempts.
Retries do not duplicate reminder notifications.
```

## Phase 6 - Auctions (optional post-MVP)

Build only after Phases 0-5 are stable **and only when auctions are explicitly selected as the next product milestone**. Phase numbering does not make auctions a prerequisite for production hardening or first release.

Build:

- Parent auction creation;
- eligible children selection;
- Child auction list;
- bid creation/update/withdrawal;
- Parent bid comparison;
- select winner;
- atomic conversion to contract;
- winner/non-winner notifications.

Acceptance gate:

```text
Only eligible children can bid.
Exactly one winner is possible.
Selecting the same winning bid twice creates one contract only.
```

## Phase 7 - Product hardening

This phase may be executed before optional Phase 6. It is required before a public production release even if auctions remain deferred.

Build:

- App Check enforcement;
- Crashlytics dashboards;
- accessibility pass;
- localization framework;
- deletion/account lifecycle;
- privacy settings;
- production security-rule tests;
- release builds;
- store metadata/privacy disclosures.

## Phase 8 - Optional proof media

Only if user testing proves it is needed.

Build:

- camera/photo picker;
- Firebase Storage rules;
- image compression;
- upload lifecycle;
- retention/deletion policy;
- optional review attachments.

## Phase 9 - Marketing website

Add `apps/web` with Next.js + Tailwind after the mobile product and visual identity stabilize.

## Codex task sizing

Give Codex tasks that are vertically testable, for example:

Good:

```text
Implement publishOffer callable + schema + emulator tests + Parent submit hook.
```

Bad:

```text
Build the backend.
```

Each task should include:

- files/packages in scope;
- relevant domain invariant;
- expected error codes;
- tests required;
- explicit non-goals;
- acceptance criteria.
