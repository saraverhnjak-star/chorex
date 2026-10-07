# Phase 4 + Phase 5 acceptance audit after ADR-046

Audited 2026-10-07 against commit `2a8c4f4` (`feat(rewards): require child confirmation after parent delivery`). The working tree was clean at the start. This is a source/coverage/documentation audit, not a new native or production verification run. No product code, tests, dependencies, Firebase data or configuration were changed; no commit, push or deployment was performed.

## Verdicts

| Area                               | Verdict     | Concrete reason                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 4 documented acceptance gate | **PASS**    | Atomic/idempotent approval, one deterministic Reward per Contract, immutable review history, preserved correction history and fulfillment separate from approval are implemented and covered. ADR-046 bilateral fulfillment replaces the historical unilateral behavior. |
| Phase 5 application-level gates    | **PASS**    | Validated app-owned routing, generation-safe invalid-token cleanup, unique logical reminder intents/completed-effect deduplication, permission/token lifecycle, preferences and both reminder workers have existing passing coverage.                                    |
| Phase 5 complete native acceptance | **PARTIAL** | Slice 3 still explicitly lacks direct native permission/dialog/Settings UX observations. Real native token acquisition/registration succeeded in its follow-up, but does not close those UI observations. No implementation regression was found.                        |
| ADR-046 cross-phase consistency    | **PASS**    | One active bilateral lifecycle, no legacy callable/adapter, only assigned Child can finalize, and pending-only reminders stop after Parent delivery.                                                                                                                     |

The overall Phase 5 verdict is **PARTIAL**, with functional gates satisfied. This is not a failure caused solely by unobserved physical APNs delivery. That provider/device verification is a separate deferred item. Complete native sign-off must not be inferred from automated doubles or successful token registration.

## Authority and inspected evidence

Read AGENTS.md, all eight authoritative project documents, DECISIONS.md, all Phase 4/5 acceptance reports and the [bilateral Reward acceptance](REWARD_BILATERAL_FULFILLMENT_ACCEPTANCE.md). Current accepted decisions are:

- ADR-043 resolves OPEN-012: zero-based review rounds; initial submission and Parent decisions preserve the cycle, resubmission opens the next round once.
- ADR-044 resolves OPEN-009: Contract-level correction preserves task counters/completions; explicit Child resubmission preserves prior Reviews.
- ADR-045: default-on, account-scoped optional reminders; transactional notifications and OS permission are separate.
- ADR-046 partially supersedes ADR-034's fulfillment semantics only. Exactly one frozen promise/earned Reward, atomic approval and Parent delivery obligation remain. ADR-031's unilateral wording is already historical under its Superseded status and the ADR-034/046 chain; it is not an active exception.

No new durable decision or ADR is needed. Old OPEN-009/012/013 references in historical ADRs/reports do not make them open again.

The latest implementation evidence is the bilateral report: **390 passing full-regression tests** (Functions 189, shared notifications 53, Parent 70, Child 78), followed by **147 passing focused tests** after the native delivery-timestamp guard. Existing logs confirm those counts and successful final callable/Rules/realtime/race and reminder emulator runs. Both iOS bundle exports, Functions build, typecheck, lint and formatting passed in that implementation task. These are reused results, not checks rerun by this audit.

Earlier [Phase 4 history evidence](PHASE_4_REVIEW_HISTORY_ACCEPTANCE.md) proves participant-scoped multi-round history and immutable prior decisions. [Slice 1](PHASE_5_SLICE_1_ACCEPTANCE.md) proves receipt/device cleanup; [Slice 2](PHASE_5_SLICE_2_ACCEPTANCE.md) records actual local-notification OS taps on native builds; [Slice 3](PHASE_5_SLICE_3_ACCEPTANCE.md) records deterministic lifecycle coverage and later real native token registration, together with its remaining UI observation limits. [Slice 4A](PHASE_5_SLICE_4A_ACCEPTANCE.md) and [Slice 4B](PHASE_5_SLICE_4B_ACCEPTANCE.md) provide reminder/preference evidence.

## Canonical Reward model and API audit

```text
PENDING_FULFILLMENT
  -- active owning Parent: markRewardDelivered -->
AWAITING_CHILD_CONFIRMATION
  -- active assigned Child: confirmRewardReceived -->
FULFILLED
```

CANCELLED remains exceptional/admin-only with no implemented command or participant read projection. No cancellation semantics were inferred.

| Boundary                 | Inspected implementation and result                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared types/Zod         | `packages/domain/src/review.ts`: strict status-specific schemas, explicit deliveredAt/deliveredBy and confirmedAt/confirmedBy, chronological checks and fulfilledAt equal to confirmedAt. The status enum also retains CANCELLED.         |
| Firestore conversion     | `packages/firebase-client/src/rewardReadModel.ts`: native timestamps normalize to ISO strings and the shared schema validates all three participant states. Legacy fulfilled records without confirmation cannot masquerade as confirmed. |
| Trusted commands         | `functions/src/markRewardDelivered.ts`: one shared transactional implementation. Parent requires pending, Child requires awaiting plus valid native delivery metadata. Only the Child branch writes FULFILLED.                            |
| Callable/client boundary | `functions/src/index.ts` and `packages/firebase-client/src/index.ts`: only markRewardDelivered and confirmRewardReceived; strict identity/key inputs and canonical role-specific responses.                                               |
| Parent reads             | Existing pending query is exact PENDING_FULFILLMENT; separate awaiting query reuses the parent/status/earnedAt index.                                                                                                                     |
| Child reads              | Owner-scoped earned query includes pending, awaiting and fulfilled; details read current persisted state.                                                                                                                                 |
| Events/effects           | Parent REWARD_DELIVERED and Child REWARD_RECEIVED_CONFIRMED; existing dispatcher resolves the opposite active participant.                                                                                                                |
| Reminders                | `eligiblePendingReward` and the candidate query require exact PENDING_FULFILLMENT; delivery is not terminal confirmation and ends delivery-reminder eligibility.                                                                          |

Searches covered app/package/backend source, callable exports, adapters/hooks/screens, tests/fixtures, emulator utilities and documentation. **No active fulfillReward/FulfillReward API, fulfilledBy field or REWARD_FULFILLED payload remains.** No compatibility API needed removal. Remaining mentions describe removed APIs or historical evidence; supersession notes distinguish them from current instructions. The generic test helper name `fulfill` invokes executeMarkRewardDelivered and does not retain the old semantic contract.

## Phase 4, security and concurrency

`parentReviewDecision.ts` creates the deterministic current-cycle Review, approved Contract, deterministic pending Reward, activity event and receipt in one transaction. Existing Review or Reward prevents a second approval; canonical retries preserve the original receipt even after bilateral fulfillment. Request changes shares the decision slot, preserves prior immutable Reviews and never creates a Reward. Resubmission increments the cycle once and retains execution/history. Both Contract details expose complete participant-scoped Review history.

Reward authorization is derived from persisted family membership and exact participant UID. Existing Parent command cases cover unauthenticated, wrong role, wrong Parent/family and inactive/disabled/non-member actors. The focused bilateral case covers confirmation before delivery, Parent/sibling rejection, assigned Child success, invalid native delivery metadata and canonical retries after confirmation. The actual callable emulator also covers Child inactivity and outside-family attempts. Generic membership checks are shared rather than duplicated in another suite.

`firebase/firestore.rules` denies every Reward write (`allow write: if false`) and activity write, including status and all delivery/confirmation fields. Ownership/active-family read checks and scoped list queries remain intact. Existing emulator assertions prove direct-write denial and family isolation; separate field-by-field tests would not strengthen that blanket denial.

Existing unit and real Firestore races prove one delivery and one confirmation event, no duplicate Reward, stable original receipts and unchanged Contract/tasks/completions/reviews/Offer revisions. Same Parent key after Child confirmation returns the original awaiting receipt; new delivery keys cannot mutate terminal state. Aborted transactions and failed authorization commit no effects. No second path from pending directly to fulfilled was found.

## Parent/Child UX and notification audit

Parent pending Rewards are delivery obligations. The action is **Mark as delivered**, then explicit **Confirm delivery**; backend-confirmed success says **Waiting for child confirmation**. Realtime removes the item from pending obligations and exposes it separately as awaiting. There is no force-fulfill button.

Child pending Rewards remain earned/waiting for Parent. Awaiting detail offers **Confirm received**, then **Confirm receipt**. Terminal copy is receipt confirmed. `RewardTransitionAction` calls the server only from the explicit confirmation button, blocks duplicate in-flight requests, keeps its key after ambiguous failure and does not claim success on failure. Merely opening a detail or handling a notification response invokes no confirmation command. Existing Parent/Child interaction tests prove the changed actions.

REWARD_DELIVERED targets Child; REWARD_RECEIVED_CONFIRMED targets Parent. Both use minimal semantic REWARD payloads, separate app-owned `/rewards/{id}` routes and current authenticated realtime reads. The routing category table includes both events; startup/readiness/deduplication and app mapping tests cover the shared navigation path. Earlier native local-notification observations prove actual OS response routing, including a historical notification opening a still-pending Reward. They do not claim a new native tap run with ADR-046 payloads or remote delivery.

Commands commit events before the dispatcher runs. Notification transport/receipts/navigation are effects and cannot drive Reward business state. Existing leases, bounded retry, ticket/receipt processing, active app-variant device filtering and generation/fingerprint guarded DeviceNotRegistered invalidation are unchanged. Stale invalidation cannot disable a rotated or legitimately re-registered installation. Transactional Reward notifications do not consult optional-reminder preferences.

## Reminder audit and acceptance wording

The Parent worker requires earnedAt at least 48 hours old, exact PENDING_FULFILLMENT, matching approved Contract, active owning Parent and enabled/default preference. Awaiting, fulfilled and cancelled fixtures are excluded. Existing unit candidate-race cases and the emulator's real delivery injection prove that delivery committing first suppresses generation. A previously created reminder event remains unchanged after delivery; deduplication is not reset or deleted.

Child deadline work retains the future 24-hour ACTIVE window. Both workers and dispatch consult the existing role-specific preferences; missing preference is enabled and OS permission remains independent. Re-enablement does not create a second logical reminder. No Child confirmation reminder exists.

The old roadmap sentence “Retries do not duplicate reminder notifications” was broader than the documented Expo guarantees. It now explicitly means unique logical intents and completed-effect deduplication. Ambiguous external sends/crashes can repeat a physical push because Expo lacks an exactly-once send operation; existing receipt/dispatcher reports already document this. This wording correction changes no policy or implementation. A state change after a delivery claim can likewise produce a stale physical notification whose tap loads current state.

## Documentation corrections

Only documentation changed:

- Roadmap Phase 4 overview now names both bilateral commands/states and links current evidence; its obsolete “next milestone is Phase 5” guidance is replaced with Phase 7 readiness.
- Roadmap Phase 5 summary separates functional gates from incomplete Slice 3 native UX observations and unverified physical delivery. Its Slice 4A paragraph no longer says preferences/pending-Reward implementation is missing after Slice 4B.
- Roadmap reminder gate explicitly states logical deduplication and the existing physical-send limitation.
- Concise follow-up notes in Slice 1/2/3/4A reports identify the replacement verifier/API/payloads under ADR-046, completed ADR-045/4B scope and still-open native observations. Original results, payload examples and test counts remain historical.
- This audit supplies the current cross-phase sign-off. Existing ADR-046 notes in Phase 4 Reward/history and Slice 4B reports already suffice.

Other active domain/state/schema/security/notification wording was consistent. Historical unilateral ADR/report text was not rewritten. No stale production API, domain defect or uncovered invariant warranted a code or test change.

## Decisions still actually open

Only OPEN-006, OPEN-007, OPEN-008, OPEN-010, OPEN-011 and OPEN-014 remain open in DECISIONS.md. OPEN-009, OPEN-012 and OPEN-013 are resolved by ADR-044, ADR-043 and ADR-036 respectively.

| Open decision                                    | MVP usability                                               | Starting Phase 7                                                           | Public release / later boundary                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN-006 Proof of Completion                     | Does not block existing manual completion/review            | Does not block                                                             | Neither yet; blocks choosing proof capabilities if Phase 8 is selected                                                                                                                  |
| OPEN-007 Analytics and Crash Reporting           | Does not block                                              | Does not block starting; belongs in hardening                              | DECISIONS explicitly puts solution/taxonomy selection before production release; Crashlytics dashboards are a Phase 7 deliverable                                                       |
| OPEN-008 E2E strategy/framework                  | Does not block existing tested flows                        | Does not block; choose proportionate release verification during hardening | No particular Maestro/Detox framework is a documented release prerequisite; tool choice alone is neither yet                                                                            |
| OPEN-010 Task Completion Undo                    | Does not block current immutable, no-undo commands          | Does not block                                                             | Blocks adding undo; no explicit public-release gate currently requires it. Review and record intended MVP limitations before release                                                    |
| OPEN-011 Contract Expiry/Cancellation            | Does not block current display/reminder/execution semantics | Does not block                                                             | Blocks adding expiry/cancellation. No documented automatic processing release gate; review/communicate deadline behavior before release                                                 |
| OPEN-014 Individual Child-device Auth Revocation | Does not block pairing/current participation                | Does not block starting; needs security/account-lifecycle review           | Individual-device versus child-wide revocation is an unresolved release-security policy; assess/select adequate release scope during Phase 7. Push cleanup alone is not Auth revocation |

These classifications distinguish explicit repository requirements from audit recommendations; they do not resolve decisions or invent undo/expiry/device-management features. OPEN-014's release-priority assessment is a security hardening recommendation, not a newly accepted ADR. No remaining decision blocks beginning Phase 7; outstanding policies must be considered when selecting its account/security scope.

## Deferred verification and next milestone

Physical Expo/APNs delivery remains **unverified**, including both new Reward events and reminders. Real token acquisition/registration, deterministic send/receipt tests and local OS taps are distinct evidence and cannot substitute for remote lock-screen delivery. Production indexes, scheduled functions, App Check/release configuration and release builds are not deployed or verified by this audit.

Complete Slice 3's actual native permission/education/Not now/Settings-denial/revoke/restore and relevant restart/sign-out observations using its documented development-build workflow. Keep that evidence gap separate from the physical-provider test. Native Android behavior is not claimed by the existing iOS reports.

**Phase 7 can safely begin.** Recommended next milestone is scoped product hardening, starting with a reproducible native acceptance/release-verification plan and security/account lifecycle boundaries (including OPEN-014), then the roadmap's App Check, crash reporting, accessibility/localization, privacy/deletion and release-build work. Native observation and physical-push checks can be completed alongside that work. Optional Phase 6 auctions are not a prerequisite. This recommendation authorizes no implementation within this audit.

## Checks actually run in this audit

Repository-wide source/document searches and inspection of existing tests, Rules, queries, commands, UI, routing/receipt/reminder implementations and prior verification logs. Changed Markdown formatting and `git diff --check` pass; internal relative Markdown file links in changed documents were checked.

No tests were added, modified or rerun. No full regression, emulator session, typecheck, lint, Functions build, native rebuild or bundle export was repeated because changes are documentation only and the latest implementation evidence remains applicable. The outstanding native observations were not performed or silently marked complete.
