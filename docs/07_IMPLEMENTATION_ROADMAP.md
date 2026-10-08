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

The first review mutation is Parent approval with a minimal Ready-for-Review list. ADR-043 resolves OPEN-012 using zero-based review rounds; approval preserves the cycle and atomically creates one pending earned Reward. See [approval acceptance evidence](PHASE_4_APPROVAL_ACCEPTANCE.md). Request changes is implemented as a bounded immutable decision/transition with current-round feedback reads; see [request-changes acceptance evidence](PHASE_4_REQUEST_CHANGES_ACCEPTANCE.md). ADR-044 resolves OPEN-009; contract-level correction and Child resubmission are implemented through submitContractForReview. See [resubmission acceptance evidence](PHASE_4_RESUBMISSION_ACCEPTANCE.md). ADR-046 replaces unilateral fulfillment with Parent markRewardDelivered and assigned Child confirmRewardReceived. Parent pending obligations and a separate awaiting-confirmation list, Child earned/awaiting/confirmed reads, and both committed-event notifications are implemented; see [bilateral Reward acceptance evidence](REWARD_BILATERAL_FULFILLMENT_ACCEPTANCE.md). OPEN-010 and OPEN-011 remain unresolved.

**Phase 4 acceptance gate is satisfied.** Both Contract details now expose complete immutable Review history, with participant-scoped reads/Rules, chronological zero-based cycles displayed as Review 1, 2, 3, and verified multi-round continuity through Reward fulfillment. See [Review history and final Phase 4 acceptance evidence](PHASE_4_REVIEW_HISTORY_ACCEPTANCE.md). Phase 5 functional implementation is now present; the [post-ADR-046 audit](PHASE_4_5_ACCEPTANCE_AUDIT.md) distinguishes its application-level gates from outstanding native UX observations and physical delivery verification. Phase 7 product hardening may begin before optional auctions. Reward cancellation, task undo and expiry/cancellation decisions remain out of scope.

Build:

- Ready for Review Parent queue;
- approve;
- request changes with note;
- review history;
- reward creation on approval;
- Child earned rewards screen;
- Parent reward to-do screen;
- Parent reports Reward delivery;
- assigned Child explicitly confirms Reward receipt;
- push notifications.

Acceptance gate:

```text
Approval is atomic and idempotent.
Exactly one reward is created per contract.
Requested changes preserve prior reviews.
Reward fulfillment is separate from contract approval.
```

## Phase 5 - Push hardening and reminders

**Slices 1–3 implemented:** ticket/receipt hardening, validated response routing, contextual permission onboarding and device-registration lifecycle. Existing EAS IDs and approved rebuilds subsequently verified real native registration in both apps; physical delivery remains unverified. See [Slice 1](PHASE_5_SLICE_1_ACCEPTANCE.md), [Slice 2](PHASE_5_SLICE_2_ACCEPTANCE.md) and [Slice 3 including native follow-up](PHASE_5_SLICE_3_ACCEPTANCE.md). **Slices 4A–4B implemented and locally verified:** deadline and pending-Reward reminders with ADR-045 account preferences. Functional Phase 5 implementation and application-level gates are satisfied. Overall native acceptance remains PARTIAL: Slice 3 still lacks direct observations of permission/dialog/Settings interactions. This evidence gap is separate from deferred physical Expo/APNs delivery; production Scheduler/index deployment is also not claimed. See the [acceptance audit](PHASE_4_5_ACCEPTANCE_AUDIT.md). OPEN-010, OPEN-011 and OPEN-014 remain unresolved.

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
Retries/concurrent workers do not create duplicate logical reminder intents; completed effects do not resend.
Ambiguous external sends may repeat a physical push; exactly-once provider delivery is not promised.
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

Phase 5.5 design acceptance is **PASS** following the [final Design & UX consistency audit](PHASE_5_5_FINAL_DESIGN_UX_AUDIT.md), including representative small-screen/larger-text observations and ADR-046/047 presentation checks. Phase 7 may begin. Phase 5 native/push acceptance remains **PARTIAL** with its outstanding observations tracked separately; this design verdict does not certify production release readiness.

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

Phase 7 Slice 1 integrates App Check in both native apps and establishes the focused security baseline under ADR-048. Enforcement remains OFF; production-like valid attestation/Console monitoring and physical-device gates remain pending. See the [Slice 1 acceptance and enforcement checklist](PHASE_7_SLICE_1_APP_CHECK_SECURITY_BASELINE_ACCEPTANCE.md). Existing Phase 5 native/push gaps remain independent.

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

### Phase 5 Slice 4A

Contract deadline reminder infrastructure is implemented with hourly server eligibility checks, deterministic committed intents, transactional race protection and the existing Expo dispatcher/receipts/Child detail routing. See [Slice 4A acceptance](PHASE_5_SLICE_4A_ACCEPTANCE.md). The temporary Slice 4A gate was superseded by approved ADR-045 / Slice 4B account preferences. Existing EAS IDs now permit verified native registration in both apps (Slice 3 follow-up); physical delivery is still unverified. The earlier missing preference controls and pending-Reward reminders were completed by Slice 4B; Slice 3 native UX observations remain outstanding. OPEN-010/011/014 remain unresolved.

## Approved reminder policy — ADR-045 / Phase 5 Slice 4B

Optional reminders are account-scoped and default enabled when no preference is stored. `users/{uid}/preferences/reminders` contains exactly `deadlineRemindersEnabled: boolean` for a Child or `pendingRewardRemindersEnabled: boolean` for a Parent. Only that authenticated owner may read/write; Rules derive allowed fields from the server-owned profile accountType. No tokens, device data, role field or domain state is stored here.

Child deadline reminders retain the future 24-hour ACTIVE window. Parent pending-Reward reminders are eligible once earnedAt is at least 48 hours old and status is exactly PENDING_FULFILLMENT, with matching approved Contract and active owning Parent. Each has one deterministic logical identity, transactional preference/state validation and the existing Expo delivery/receipt model. No recurring reminders or transactional-notification toggles exist. OS permission remains separate; enabled preference alone does not claim deliverability. ADR-045 resolves Slice 4A's activation-policy boundary; its hourly schedule is now active under preferences. No deployment is part of implementation. OPEN-010/011/014 remain unresolved.

### Phase 5 Slice 4B

ADR-045 records the approved default-enabled user preference policy and one pending-Reward reminder after 48 hours. Both apps expose only their role's optional reminder setting alongside existing Home notification controls; no dedicated Settings/Profile screen previously existed. Deadline generation is activated with Child preferences; pending-Reward generation and dispatch validate Parent preferences/state/source/membership. See [Slice 4B acceptance](PHASE_5_SLICE_4B_ACCEPTANCE.md). Functional implementation of Phase 5 notification/reminder deliverables is complete, subject to the verification evidence and explicitly deferred physical Expo/APNs delivery. No expiry/cancellation or OPEN-010/011/014 decision is included.

## Bilateral Reward correction — ADR-046

Phase 4/5 Reward behavior now follows PENDING_FULFILLMENT → AWAITING_CHILD_CONFIRMATION → FULFILLED. Parent delivery and Child receipt confirmation use trusted commands, explicit two-step UX and existing transactional notification routes. Parent 48-hour reminders continue to apply only to pending delivery; awaiting Rewards are excluded and deduplication evidence is retained. ADR-045 preferences are unchanged. See [acceptance evidence](REWARD_BILATERAL_FULFILLMENT_ACCEPTANCE.md). No dispute or automatic confirmation exists.
