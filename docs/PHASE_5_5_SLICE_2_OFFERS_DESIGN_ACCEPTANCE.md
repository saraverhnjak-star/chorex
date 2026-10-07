# Phase 5.5 Slice 2 — Offer and negotiation design acceptance

Date: 2026-10-07. Scope: visual refresh of implemented Parent and Child Offer surfaces.

## Audit and preserved boundaries

The current flow lives inside Home, with section anchors rather than separate Offer list/detail routes:

| Surface                  | Existing behavior preserved                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent composer          | Select an active child, enter tasks/counts, RewardTerms and a local deadline, save a draft, then explicitly publish. No initial note field exists.                                |
| Child inbox              | Reads only AWAITING_CHILD Offers and their exact current revision. Accept, confirm rejection, or counter reward/note. Tasks and deadline remain unchanged in Child counteroffers. |
| Parent negotiation inbox | Reads only AWAITING_PARENT Offers and their exact current revision. Accept with confirmation, confirm rejection, or edit/review/send complete counteroffer terms.                 |
| Command receipts         | Existing local success messages after publish, counter, accept or reject; these are not persistent terminal-state lists.                                                          |

There is no implemented standalone Offer detail, revision-history reader/UI, waiting-side Offer list, or accepted/rejected/cancelled/expired Offer list. The current reads do not provide a previous revision for reliable change comparison. These gaps were reported before implementation. No fake history, computed diffs, chevrons leading to missing routes, new queries, or View contract routes were introduced. Immutable revision persistence remains intact.

DRAFT, AWAITING_CHILD, AWAITING_PARENT, ACCEPTED, REJECTED, CANCELLED and EXPIRED semantics are unchanged. Domain schemas, commands, accepted snapshots, authorization, Firestore structure/rules, notification behavior and route architecture were not edited. Offer notifications still open the existing Home inbox. No ADR, dependency or native configuration change was needed.

## Visual implementation

Refreshed files:

- Parent `OfferDraftComposer`, including saved/published draft receipt.
- Parent `ParentNegotiationInbox` and `ParentCounterofferForm`, including review preview and confirmations.
- Child `OfferInbox`, including reward counteroffer, rejection confirmation and command receipts.

Reused Slice 1 Home frame/anchors, CountBadge, tokens, Ionicons, Button, TextField, FormMessage and dynamic typography. Shared additions are deliberately small:

- `ProposalTerms`: current proposal identity/revision, tasks, RewardTerms, localized deadline and optional note; used by both inboxes, draft receipt and Parent counteroffer review.
- `TermsHeading`: icon-led form/read-only section labels.
- `ChoiceChip`: wrapping child/reward choices with explicit selected/disabled accessibility state; used by both apps.
- `OfferOutcome`: compact semantic success, waiting, declined and empty receipts; used by both inboxes.
- `SurfaceCard`: token-based neutral surface for composer and Parent counteroffer form.
- `DesignText`: exports the existing Home text scaling implementation for shared Offer content; Home rendering itself retains the same implementation.

Button gained outline and danger variants while preserving existing loading/disabled/focus behavior. TextField adopts ivory/navy/coral tokens only inside Home; existing non-Home styling remains scoped as before.

The inbox remains an inline decision surface: status first, identifying reward-based proposal summary, proposer, explicitly labeled current revision, tasks, reward, deadline, optional note, then existing actions. Agreement terms wrap without fixed heights. Task and reward sections use restrained fallback icons because current terms have no authoritative category mapping to the existing generated artwork. Titles are not guessed into categories. RewardTerms are never presented as earned Reward entities or fulfillment states.

## Actor, actions and counteroffers

- Child-turn and Parent-turn inbox entries say **Your turn**, with explanatory text.
- Parent entries name the proposing child from existing family metadata, with the existing unavailable-profile fallback. Child entries identify the Parent role; no Parent display-name read was added.
- Published draft receipts say **Waiting for [child name]** when the existing membership data is available, with a generic fallback.
- Child counteroffer receipts say **Waiting for parent**. Their offer is removed from the actionable inbox through the existing flow.
- Both counteroffer forms explain that changes become a new proposal. Child copy states that tasks/deadline stay the same. Parent retains edit → review → send and separate read-only proposed terms.
- Accept remains coral primary; counter/edit/cancel actions are outlined; reject and its confirmation use the existing semantic danger token, not brand coral.
- Existing rejection and Parent acceptance confirmations remain intact. Child copy explains that acceptance creates an agreement without introducing another confirmation.
- Existing successful acceptance renders **Agreement reached** in mint. Rejection renders calm **Declined** copy. The acted-on proposal loses its negotiation actions through existing removal logic.
- CANCELLED/EXPIRED presentation and persistent terminal navigation are not claimed: those surfaces do not currently exist.

## Native verification

Verified on iOS 26.5, iPhone 17 Pro and iPhone SE (3rd generation), 375 × 667 points.

Live development app smoke checks used existing local data: Child Home and actionable inbox; Parent Home, empty negotiation inbox, Create Offer Quick Action and composer with two actual child choices. The live Child fixture had a past deadline, so it was not accepted or mutated for visual testing.

For missing states and long-content coverage, a **temporary local preview** rendered copies of the actual refreshed components and the shared UI primitives. Only the Firebase adapter imports/dependency locations were replaced for that preview. Its commands were in-memory stubs: no Firebase writes, notifications or actual Contract creation. This is native layout/interaction evidence, not a backend end-to-end verification. Preview routes, copied components and adapters were removed before final typecheck/lint/exports.

The small-phone pass exercised:

- Both Home header/greeting variants with a long name; Parent Quick Actions still directly below the greeting.
- Home row wrapping, persistent bottom navigation and double-digit CountBadge (12); inboxes initially contained 12 synthetic Offers.
- Long proposer/child labels, long task and reward titles, multiple tasks, target count 12, reward description, localized deadline and optional note.
- Child reward choice chips, counteroffer form, waiting-for-Parent receipt, rejection confirmation, declined and agreement-reached receipts.
- Parent current revision, counteroffer editor, review-before-send, acceptance confirmation and agreement-reached receipt.
- Composer long child choice, retained required-field validation, draft/save/publish sequence and named waiting-for-Child receipt.

Observed: meaningful read-only text wraps without clipping; chips grow vertically and wrap across rows; selected states remain explicit; form controls and actions can be brought into view; bottom navigation remains visible. Single-line editable title fields retain native horizontal editing behavior, while read-only terms wrap. Long terms naturally require scrolling. The targeted Home primitive checks close the three outstanding Slice 1 cases for this device/default text size; this is not a full responsive or accessibility audit. Full Home data combinations and long revision-history rendering remain outside this evidence (history UI does not exist).

Screenshots (files named `small-*` are synthetic preview evidence; preview controls are not product UI):

| Evidence                            | Screenshot                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Live Child inbox                    | [Child live inbox](design/phase-5-5-slice-2/child-live-inbox.png)                            |
| Live Parent composer                | [Parent live composer](design/phase-5-5-slice-2/parent-live-composer.png)                    |
| Child Home long name/count          | [Small Child Home](design/phase-5-5-slice-2/small-child-home-long-name.png)                  |
| Parent Home long name/Quick Actions | [Small Parent Home](design/phase-5-5-slice-2/small-parent-home-long-name.png)                |
| Child current proposal/count        | [Small Child proposal](design/phase-5-5-slice-2/small-child-proposal.png)                    |
| Parent current proposal/proposer    | [Small Parent proposal](design/phase-5-5-slice-2/small-parent-proposal.png)                  |
| Child counteroffer and long note    | [Child counteroffer](design/phase-5-5-slice-2/small-child-counteroffer.png)                  |
| Parent review preview               | [Parent counteroffer review](design/phase-5-5-slice-2/small-parent-counteroffer-review.png)  |
| Composer selection                  | [Small composer](design/phase-5-5-slice-2/small-parent-composer.png)                         |
| Parent waiting receipt              | [Waiting for Child](design/phase-5-5-slice-2/small-parent-waiting-child.png)                 |
| Child waiting receipt               | [Waiting for Parent](design/phase-5-5-slice-2/small-child-waiting-parent.png)                |
| Destructive confirmation            | [Child rejection confirmation](design/phase-5-5-slice-2/small-child-reject-confirmation.png) |
| Calm declined receipt               | [Child declined](design/phase-5-5-slice-2/small-child-declined.png)                          |
| Parent accepted receipt             | [Parent agreement reached](design/phase-5-5-slice-2/small-parent-agreement-reached.png)      |
| Child accepted receipt              | [Child agreement reached](design/phase-5-5-slice-2/small-child-agreement-reached.png)        |

## Validation and tests

Existing tests were updated rather than adding decorative tests:

- Parent bootstrap: new semantic turn label and exact child-name occurrence count, since proposer copy now includes the name.
- Parent realtime negotiation tests: new proposer label and grouped reward text, preserving realtime cleanup, stale scope/revision handling, confirmations and retry/idempotency assertions.
- Child bootstrap: Make a counteroffer heading; existing command, pairing, session restoration and Home assertions remain.

No new test cases were added. Existing Child realtime/schema and notification-routing tests were unchanged and passed. The shared UI package has no existing component test files; no purely visual tests were created.

| Check                                                              | Result                                     |
| ------------------------------------------------------------------ | ------------------------------------------ |
| Parent: `test -- bootstrap negotiation-inbox notification-routing` | PASS: 4 suites, 14 tests                   |
| Child: `test -- bootstrap offer-inbox notification-routing`        | PASS: 4 suites, 8 tests                    |
| `pnpm typecheck`                                                   | PASS, both apps and all workspace packages |
| `pnpm lint`                                                        | PASS, no warnings                          |
| `pnpm format:check`                                                | PASS                                       |
| `git diff --check`                                                 | PASS                                       |
| Parent iOS export                                                  | PASS: `/tmp/chorex-parent-slice2-export`   |
| Child iOS export                                                   | PASS: `/tmp/chorex-child-slice2-export`    |

No backend/domain source changed, so Functions/emulator suites were not run for this visual slice. No commit, push or deploy was performed.

## Remaining scope and recommended Slice 3

The existing inline Home composition can become lengthy with many Offers and long agreement terms. Separate details, compact expandable lists, history/change comparison and persistent waiting/terminal surfaces need an explicit product/read-model scope; they were not invented in this slice. Native evidence here uses default text size; broader accessibility/localization testing belongs to the planned later pass.

Recommended Slice 3: Contract/task progress and review visual refresh, using the same current-agreement hierarchy and shared terms primitives while preserving immutable accepted terms and server-authoritative progress/review commands.
