# Phase 5.5 Slice 4 — Reward fulfillment design acceptance

Date: 2026-10-07. Scope: visual refresh of existing earned Reward surfaces and bilateral fulfillment.

## Audit and scope

Read repository instructions, overview, architecture, domain/state/schema/security/notification documents, relevant decisions (ADR-034 with ADR-046 supersession, ADR-045/046), Phase 4/5 and bilateral fulfillment acceptance, and Slices 1–3 design evidence. Inspected current Parent/Child Reward screens, hooks/read models, shared UI, routing, assets and existing Reward tests.

Parent Home has two independently scoped current lists: pending delivery and awaiting Child confirmation. Parent has no fulfilled-history list/read hook. Child's existing earned query includes all three canonical states. Both apps have an existing `/rewards/[rewardId]` detail route. Neither Reward detail previously linked back to its Contract. No history query, new screen, related-agreement link, routing architecture or backend read was introduced.

Refreshed:

- Parent Home obligation/waiting lists, Reward detail and delivery confirmation.
- Child Home earned list, Reward detail and explicit receipt confirmation.
- Shared list/cards, summary, loading/empty/cache presentation and transition-control typography.

RewardTerms in Offers/Contracts were not changed or given fulfillment UI. This slice applies only to earned Reward entities.

## Shared design and primitives

Reused existing ivory/navy/coral/pastel tokens, Ionicons, SurfaceCard, TermsHeading, CountBadge, OfferOutcome, DesignText, Button, FormMessage and opt-in `Screen design` foundation. RewardSummary, RewardDetailBody, RewardList and RewardTransitionAction were refined in place.

Added only two reused Reward primitives in `RewardPresentation.tsx`:

- `RewardCard`: neutral compact row with small semantic icon, wrapping title, optional Child name, role-specific state/responsibility, one relevant localized date and existing detail affordance.
- `RewardFulfillmentProgress`: lightweight vertical earned/delivered/received context, shared by both real detail surfaces.

Small shared label/responsibility/tone helpers keep list and detail language consistent. No stepper library, generic entity-card abstraction, dependency, confetti, animation, large hero or fixed content-card height was added.

Audited the existing 24 Reward PNGs. They represent concrete rewards such as cinema, a plant or a book; persisted RewardTerms provides only a broad type and free-text title/description, with no supported artwork key. No concrete illustration is guessed from a title or a broad EXPERIENCE/ITEM type. Existing assets remain available and unchanged; generic gift/check/time Ionicons supply supported recognition. No domain catalog or new artwork-selection behavior was invented.

## Lifecycle and responsibility

| Authoritative state         | Parent                                           | Child                                                      | Semantic tone                           |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------- |
| PENDING_FULFILLMENT         | Ready to deliver; Child earned it; Parent's turn | Earned; waiting for Parent delivery                        | Parent coral attention / Child blue     |
| AWAITING_CHILD_CONFIRMATION | Delivered; waiting for named Child confirmation  | Delivered; Parent reported delivery; confirm when received | Parent lavender / Child coral attention |
| FULFILLED                   | Confirmed received; Child confirmed              | Received; you confirmed receipt                            | Mint success                            |

Text always supplements color and icons. Internal enum names are not visible user labels. Delivery is explicitly reported by Parent; receipt is explicitly confirmed by Child. Parent can never force final fulfillment, and Child gets no confirmation action while still pending. Terminal detail has no lifecycle action.

The existing Parent mark-delivered action stays coral primary, with its existing two-step confirmation. Copy now names the Child when existing metadata is available and explains that they will confirm actual receipt. Child still chooses Confirm received, reviews the existing receipt question and explicitly chooses Confirm receipt. Opening a route or notification never confirms anything.

All command input, authorization gates, pending locks, idempotency/retry keys, backend-response requirement and realtime read behavior remain unchanged. No optimistic final state or new command queue was added. A small presentation correction suppresses the old Parent waiting receipt after a later authoritative FULFILLED snapshot, so it cannot contradict the current success state. It does not change persisted state or command behavior.

## Lists, detail and timeline

Parent keeps pending obligations first and awaiting confirmations separate. A confirmed empty awaiting list becomes a short neutral message instead of an empty large card; loading/error/cached-empty states retain explicit context. There is no overdue delivery styling or 48-hour warning on awaiting items. Parent terminal detail remains supported through its existing stable-ID reader, without adding a history feed.

Child groups the existing read result locally: Confirm receipt first, Waiting for Parent next, Received last. Grouping preserves read order inside each group and every stable Reward ID. Total/group count badges use existing actual counts; no authoritative state is copied into another store or queried anew.

Details show status/responsibility first, earned reward title, available participant initial/name, full description and readable type, then Reward journey and the current action. Substantive descriptions wrap; lists use compact context with full descriptions available in detail.

The journey shows:

1. Earned — Contract approved, authoritative earnedAt.
2. Delivered — waiting for Parent or reported by Parent, deliveredAt when present.
3. Received — confirmation follows delivery / waiting for Child / confirmed by Child, confirmedAt when present.

Completed steps have check icons; future steps have outline icons and explicit pending context. This is not an occurrence/event-history reconstruction. Dates use existing locale/timezone formatting; no timestamp is fabricated from a client interaction. The confirmedAt display preserves its canonical equivalence to fulfilledAt without using ambiguous fulfilledBy language.

## Home, reminders, notifications and offline

Home structure, Quick Action ordering, section anchors, bottom navigation and existing list-to-detail routes remain unchanged. Shared Reward lists update the existing Home surfaces automatically. Parent Manage Rewards still lands on the delivery area. Child metrics still count the existing earned entities; no second Home redesign was done.

ADR-045 remains unchanged: Parent optional 48-hour pending-delivery reminders apply only to PENDING_FULFILLMENT and stop after delivery. Settings/preferences, scheduling, eligibility, deduplication and OS permission UX were untouched. No Child confirmation reminder or preference was added.

ADR-046 remains unchanged: committed delivery notifies Child; committed receipt confirmation notifies Parent. Notification payloads, app-owned mappings and current-state readers were untouched. Stale taps therefore continue to show current Reward state rather than recreating historical delivery UI.

Existing loading, unavailable/missing, cached-read qualifiers and command failure/retry messaging remain. Real native cached Home/detail reads were observed, visibly labeled as saved data. No actual Reward mutation was sent during this visual verification. Network failure/ambiguous retry behavior remains covered by the existing targeted tests; a new backend/offline end-to-end run is not claimed.

## Native and text-size verification

Verified iOS 26.5 on iPhone SE (3rd generation), 375 × 667 points, at default `large` and increased `accessibility-medium` sizes; restored `large` afterward. Also verified the existing real Parent development app on iPhone 17 Pro: Manage Rewards jump, cached Reward list, original parameterized detail route and return navigation.

Temporary local preview copies rendered actual refreshed app components and shared UI. Only their Firebase imports were substituted. In-memory synthetic data supplied long title, description, Child name, all three states and twelve Child cards (four per state); Parent lists showed four pending and four awaiting cards. Fixture commands changed only the local object and never called Firebase or dispatched notifications. The preview route, component copies and adapters were removed before final checks/exports. These are native layout/interaction checks, not backend lifecycle acceptance.

Observed Parent pending detail, deliberate delivery confirmation, waiting detail without another delivery/finalization control, terminal confirmed-received detail and separate populated lists. Observed Child pending without confirmation, delivered detail, deliberate receipt confirmation, terminal received state and all three list groups. Local final clicks exercised both confirmation interactions; server behavior is covered separately by existing tests/prior bilateral acceptance.

Long titles, descriptions, names and status copy wrap without substantive ellipsis or horizontal scrolling. Cards grow vertically. At increased text size the status, journey labels/dates and confirmation buttons remain readable and reachable; long content naturally needs more scrolling. The visible 12-count badge fits. Developer gear/preview selectors and iOS return labels in evidence are not production UI. Android, release builds, physical push delivery and the full Phase 7 accessibility audit are not claimed.

| Evidence                               | Screenshot                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Child pending long title/description   | [SE pending](design/phase-5-5-slice-4/child-pending-se.png)                       |
| Child received / completed journey     | [SE received](design/phase-5-5-slice-4/child-received-timeline-se.png)            |
| Child grouped list / count 12          | [SE list](design/phase-5-5-slice-4/child-grouped-list-se.png)                     |
| Parent delivery obligations            | [SE list](design/phase-5-5-slice-4/parent-delivery-list-se.png)                   |
| Parent pending / long Child name       | [SE pending](design/phase-5-5-slice-4/parent-pending-se.png)                      |
| Parent delivery confirmation           | [SE confirmation](design/phase-5-5-slice-4/parent-delivery-confirmation-se.png)   |
| Parent awaiting confirmation           | [SE waiting](design/phase-5-5-slice-4/parent-awaiting-se.png)                     |
| Parent terminal / increased text       | [SE received](design/phase-5-5-slice-4/parent-received-larger-text-se.png)        |
| Child journey / increased text         | [SE delivered](design/phase-5-5-slice-4/child-awaiting-larger-text-se.png)        |
| Child confirmation / increased text    | [SE confirmation](design/phase-5-5-slice-4/child-confirmation-larger-text-se.png) |
| Real Parent Quick Action / cached list | [Pro Home](design/phase-5-5-slice-4/parent-home-rewards-cache-pro.png)            |
| Real Parent cached detail              | [Pro detail](design/phase-5-5-slice-4/parent-detail-cache-pro.png)                |

## Tests and validation

Updated existing Reward surface assertions for role-specific labels. Extended the existing Child list case to cover priority grouping and navigation to the correct stable ID. Extended the existing Parent transition case through terminal confirmation, verifying no further buttons or stale waiting receipt. No new test cases, static-color/icon tests or automated layout tests were added.

Existing suites retain explicit command wiring/confirmations, duplicate-tap locks, response/read waiting, failed-offline retry keys, ownership gates, scoped listener cleanup, pending Child no-action and terminal no-action checks. Bootstrap and notification-routing suites also pass. Shared UI has no standalone component test suite; Reward primitives are exercised by both app suites.

| Check                                                    | Result                                |
| -------------------------------------------------------- | ------------------------------------- |
| Child reward-surface / bootstrap / notification-routing  | PASS: 3 suites, 9 tests               |
| Parent reward-surface / bootstrap / notification-routing | PASS: 3 suites, 10 tests              |
| Workspace typecheck                                      | PASS                                  |
| Workspace lint                                           | PASS                                  |
| Workspace formatting                                     | PASS                                  |
| git diff --check                                         | PASS                                  |
| Child iOS bundle export                                  | PASS: `/tmp/chorex-slice4-child-ios`  |
| Parent iOS bundle export                                 | PASS: `/tmp/chorex-slice4-parent-ios` |

Backend/domain, Firestore, authorization, reminder and notification behavior remained unchanged. Functions/emulator regression was not required or run for this visual slice. No commit, push or deploy was performed.

## Recommended next design slice

Refresh existing account/settings and notification/reminder preference surfaces, with the same shared tokens and accessible controls. Keep that separate from product/security policy changes and preserve existing permission education, explicit OS permission actions and role-specific preferences. Auth, pairing and family onboarding can follow as an explicitly scoped later slice.

## Later consistency update — 2026-10-08

ADR-047 adds a negotiated RewardTerms.iconKey and a compact picker in existing editable Offer forms. Offer, Contract and earned Reward surfaces now use the frozen selected artwork. See [Reward icon selection acceptance](REWARD_ICON_SELECTION_ACCEPTANCE.md). The historical slice results above remain unchanged.
