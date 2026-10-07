# Phase 5.5 Slice 3 — Contract execution and review design acceptance

Date: 2026-10-07. Scope: visual refresh of implemented Contract execution and Parent review surfaces.

## Audit and boundaries

Both apps have Home Contract entry lists and an existing parameterized Contract detail route. Parent Home also has Ready for Review; its entries open the same detail, where approval and request-changes controls already live. There is no separate review route, submission/proof panel, completion-event history UI, or existing Contract-to-Reward link. None was invented.

Reviewed project overview, architecture, domain, state machines, schema, security, decisions including ADR-032/033/043/044/046, Phase 4/5 audit, Slices 1/2 acceptance, current screens/read hooks/actions/shared UI and Contract tests. The supplied mockup remains direction only. Existing reward title identifies the agreement; no independent Contract title or category-to-artwork mapping exists. Generic Ionicons are used rather than guessing artwork from free text.

No backend, domain, command adapter, query, Rules, schema, auth, notifications, dependency, or navigation architecture changed. Reward list/detail and fulfillment flows remain outside this slice. OPEN-010/011 remain unresolved; no undo, expiry, cancellation, task invalidation, scheduled occurrences, or proof attachment was added.

## Surfaces and shared design

Refreshed Child and Parent Contract detail routes, Home Contract rows/lists, Parent Ready for Review queue, Child task completion and submit/resubmit confirmations, Parent approve/request-changes controls, current feedback and review history.

Reused Slice 1/2 tokens, Ionicons, SurfaceCard, TermsHeading, HomeListRow, CountBadge, OfferOutcome, DesignText, Button, TextField and FormMessage. Added only:

- `ContractSummary`: shared status/responsibility, agreed reward-based title, optional existing participant name/initial, local deadline, approved timestamp when present and factual progress.
- `CompletionBar`: shared factual completion progress for summary and task rows, with progressbar accessibility values.
- `contractStatusLabel`: one role-aware label mapping for summary and entry rows.
- Opt-in `Screen design` / `DesignThemeProvider`: applies existing design tokens to Contract details and their controls without adding Home navigation or changing routes.

TaskProgress, ReviewFeedback and ReviewHistory were refined in place. Button accepts an optional accessible label so task buttons can display concise “Mark done” / “Mark one done” while retaining the full task identity for assistive technology. Home-themed form/button line heights scale with their existing manual font sizing; default non-design Screen behavior is retained.

Ivory background, navy type, coral primary actions, neutral rounded cards and restrained blue/lavender/amber/mint surfaces continue the approved foundation. No hero, generated image or fixed content-card height was added.

## Status, responsibility and progress

| Authoritative state | Child presentation                            | Parent presentation                             | Tone     |
| ------------------- | --------------------------------------------- | ----------------------------------------------- | -------- |
| ACTIVE              | In progress; Your turn                        | In progress; named Child is working             | Blue     |
| READY_FOR_REVIEW    | Waiting for review                            | Ready for review; Your review                   | Lavender |
| CHANGES_REQUESTED   | Changes requested; Your turn                  | Waiting for resubmission; waiting for Child     | Amber    |
| APPROVED            | Approved; reward earned, awaiting fulfillment | Approved; earned reward still needs fulfillment | Mint     |

Readable text and icons supplement color. Existing exceptional CANCELLED/EXPIRED values can be labeled only when supplied by authoritative data; this adds no transition behavior. Responsibility copy is suppressed for a viewer who is not the corresponding participant. Parent names are not newly queried; history identifies the Parent role.

Progress shows both complete tasks (`2 of 3 tasks complete`) and recorded repetitions (`13 / 16 completions recorded`). Task rows show title, optional description, exact completed/target values, explicit Not started/In progress/Complete text and a progress bar. No “on track,” streak, score or scheduling inference appears.

Submission eligibility stays in the existing action: initial submission requires nonempty tasks all at their targets; correction resubmission uses current feedback availability. Presentation components do not introduce a competing eligibility calculation.

## Child flow

ACTIVE shows completion controls only under the existing Contract/assignee/count gates. Each click still calls the existing recordTaskCompletion command with its retry/idempotency behavior and waits for authoritative reads. Incomplete work has an explanation instead of an unexplained disabled submit button. All complete work exposes coral Submit for review.

The existing confirmation explains that Parent can approve or request changes. READY_FOR_REVIEW keeps readable tasks, shows calm waiting copy and exposes neither completion nor another submit action.

CHANGES_REQUESTED puts the current amber feedback card directly after the summary, ahead of tasks/history. Copy explains real-life correction and preserved recorded progress. Existing resubmit confirmation, feedback availability gate, keys and reviewCycle behavior remain unchanged; no counter/history reset or task-level invalidation occurs.

APPROVED shows success, available approved date, final progress and immutable review history. It exposes no Contract mutation actions. Reward earning remains distinct from fulfillment.

## Parent flow and history

Ready for Review retains actual scoped reads, first-two preview/expand behavior and the existing detail route. Rows contain existing Child name, title, readable state, localized deadline, factual completion totals/bar and chevron. A submission timestamp is not invented: Contract has no submittedAt field, and updatedAt is not relabeled as submission time. Empty queue says Nothing waiting for review.

Detail hierarchy is summary, current feedback where applicable, read-only task progress, promised terms, review history, then current decision. Approve remains primary; Request changes is outlined secondary, not destructive danger styling. Existing approval confirmation explains reward earning and remaining Parent delivery.

The required-note form retains trimmed validation, 500-character limit, pending locks, command payload and stable retry keys. Its final CTA is Send feedback; empty feedback remains unavailable. ACTIVE, CHANGES_REQUESTED and APPROVED expose no new review decision.

ReviewHistory keeps all records in the existing chronological read order. Compact icon/border entries show decision, Parent role, local date/time and full optional note. Existing human-friendly `cycle + 1` numbering remains unchanged. Current feedback is visually separate from historical records; prior reviews are not hidden or overwritten.

## Deadline, reads and failures

Deadlines and approved/review timestamps use existing locale/timezone rendering. A past deadline does not imply EXPIRED or disable an otherwise legal command. No approaching-deadline rule or client security cutoff was added.

Existing loading/missing/error text, cached Contract/progress/review qualifiers, confirmation receipts, pending-read messaging and network-command errors remain. Cached reads are not presented as confirmed server writes. No offline infrastructure or optimistic lifecycle mutation was added. Existing targeted tests cover these paths; a new offline native end-to-end run is not claimed.

## Native verification

Verified iOS 26.5 on iPhone SE (3rd generation), 375 × 667 points, at default `large` and increased `accessibility-medium` text sizes. Restored `large` afterward.

Temporary local preview copies used actual refreshed Contract/list/action components and shared primitives; only Firebase imports and Parent dependency locations were substituted. Synthetic fixtures supplied long title/name/task content, three tasks including target 12, long feedback up to 500 characters and multiple review records. Command stubs deliberately rejected locally and sent **no backend commands**. This verifies native layout/confirmation/form behavior, not backend lifecycle end-to-end transitions. Preview route, copies and adapters were removed before final checks and exports.

Observed Child ACTIVE incomplete, ACTIVE all complete and submit confirmation, READY_FOR_REVIEW, CHANGES_REQUESTED with resubmit, APPROVED; Parent ACTIVE read-only, populated review queue, READY_FOR_REVIEW approval confirmation and required feedback form, correction/history and APPROVED final review. Empty Parent queue and actual Home-to-Contract navigation were also observed in the real Parent development app on iPhone 17 Pro.

Long substantive content wraps without ellipsis or overlapping cards. Repetition counts remain readable. Shortened task buttons avoid duplicating long titles. Increased text preserves usable actions/status/progress and naturally requires more scrolling; review history remains fully available. The native multiline feedback editor retains internal scrolling at larger sizes. This is a scoped design check, not the Phase 7 accessibility audit or an Android/release-binary verification. Developer gear, preview selectors and iOS return labels in screenshots are not product UI.

| Evidence                         | Screenshot                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Child ACTIVE incomplete          | [SE summary](design/phase-5-5-slice-3/child-active-se.png)                                                                                        |
| Child all complete / submit area | [SE submit](design/phase-5-5-slice-3/child-complete-submit-se.png)                                                                                |
| Child waiting                    | [SE waiting](design/phase-5-5-slice-3/child-waiting-se.png)                                                                                       |
| Child current correction note    | [SE feedback](design/phase-5-5-slice-3/child-changes-feedback-se.png)                                                                             |
| Child approved                   | [SE approved](design/phase-5-5-slice-3/child-approved-se.png)                                                                                     |
| Parent ACTIVE read-only          | [SE summary](design/phase-5-5-slice-3/parent-active-se.png)                                                                                       |
| Parent queue                     | [SE queue](design/phase-5-5-slice-3/parent-queue-se.png)                                                                                          |
| Parent note form                 | [SE form](design/phase-5-5-slice-3/parent-feedback-form-se.png)                                                                                   |
| Parent final review              | [SE approved/history](design/phase-5-5-slice-3/parent-approved-history-se.png)                                                                    |
| Child increased text             | [Progress](design/phase-5-5-slice-3/child-progress-larger-text-se.png), [task and action](design/phase-5-5-slice-3/child-task-larger-text-se.png) |
| Parent increased text            | [Form](design/phase-5-5-slice-3/parent-feedback-larger-text-se.png), [history](design/phase-5-5-slice-3/parent-history-larger-text-se.png)        |
| Real Parent Contract route       | [Pro ACTIVE](design/phase-5-5-slice-3/parent-active-real-pro.png)                                                                                 |

## Validation and tests

Updated existing Child/Parent Contract tests for the accessible status label and Parent Send feedback CTA. No new test cases or decorative/layout assertions were added. Existing coverage retains command wiring, authorization gates, required feedback, retries/idempotency, correction/resubmission, review history, cache/error and terminal-action behavior. Shared UI has no existing component test suite; it is exercised through app tests.

| Check                                                     | Result                                |
| --------------------------------------------------------- | ------------------------------------- |
| Child: contract-surface, bootstrap, notification-routing  | PASS: 3 suites, 41 tests              |
| Parent: contract-surface, bootstrap, notification-routing | PASS: 3 suites, 25 tests              |
| Workspace typecheck                                       | PASS                                  |
| Workspace lint                                            | PASS                                  |
| Workspace formatting                                      | PASS                                  |
| git diff --check                                          | PASS                                  |
| Child iOS export                                          | PASS: `/tmp/chorex-slice3-child-ios`  |
| Parent iOS export                                         | PASS: `/tmp/chorex-slice3-parent-ios` |

Backend/domain code was untouched, so Functions/emulator regression suites were not run. No commit, push or deploy was performed.

## Recommended Slice 4

Refresh existing Reward list/detail, Parent delivery reporting and Child receipt confirmation with this shared foundation. Preserve ADR-046's separate earned, pending fulfillment, delivery reported and receipt-confirmed semantics, existing authoritative commands and routes. Continue small-screen and larger-text checks; do not add unsupported reward/domain behavior.
