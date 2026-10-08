# Phase 5.5 — Design Fidelity Correction acceptance

Date: 2026-10-08. Scope: visual scale and Home presentation only.

## Reference and audit

The supplied `final1.png` is the canonical visual target. The request mentions a second current-native attachment, but only the canonical image was available. Before screenshots were therefore captured directly from the installed native apps before editing.

The largest mismatch was composition, not the palette: Home embedded full collection cards, separate counts, explanatory copy, large empty outcomes and individual bordered cards inside other bordered cards. Parent displayed three independent attention categories. Child summary also added a 24pt bottom margin on top of the dashboard's 20pt section gap. These costs pushed useful content out of the first viewport.

The existing wordmark/greeting font sizes were already near the requested range. Shrinking all typography, form fields or buttons would have damaged the completed form/detail layouts. The correction therefore changes shared Home primitives and preview composition, retaining general form/detail tokens.

## Shared primitives and scale

| Element                  | Before                                        | After                                                                               |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Wordmark                 | 30pt                                          | 28pt, 34pt line height                                                              |
| Greeting                 | 28pt; 12pt title/copy gap                     | 27pt; 4pt gap                                                                       |
| Supporting greeting copy | 16pt / 23pt                                   | 15pt / 20pt                                                                         |
| Section heading          | 21pt                                          | 20pt / 24pt                                                                         |
| Screen horizontal inset  | 20pt                                          | 18pt                                                                                |
| Header-to-greeting gap   | 16pt                                          | 20pt                                                                                |
| See-all heading control  | 44pt visible minimum                          | 24pt visible minimum plus 10pt vertical hit slop                                    |
| Quick Actions            | 12pt tile padding; long wrapping labels       | 92pt minimum height; 8pt vertical / 4pt horizontal padding; 28pt icons; 13pt labels |
| Home list row            | 16pt padding; 44pt icon circle; 16pt title    | 10pt padding; 36pt circle; 15pt / 20pt title; 56pt minimum height                   |
| Row metadata             | 12pt automatic line height                    | 12pt / 17pt                                                                         |
| Progress                 | bar, then separate completion line            | bar and completion count on one wrapping line                                       |
| Bottom navigation        | 12pt labels; 48pt item minimum; 8pt top inset | 11pt labels; 44pt item minimum; 6pt top inset                                       |

The warm ivory background, navy text, coral action accent, existing pastels and neutral borders remain. No new dependency, image asset or font was added. Home list radii are 18pt; grouped attention and family surfaces use the existing 20pt card radius. Header avatar remains 44pt and bell 26pt. Major dashboard gaps remain 20pt; heading/content gaps are 10–12pt.

Quick Actions use four equal tiles at normal iPhone and SE widths. The visible review label is shortened to “Review Work” so it remains two lines; its full accessibility label is still “Review Submissions” and its destination remains `/contracts`. At increased text size, or widths below 360pt, actions reflow into two columns. A native check caught `flex: 1` overriding the intended wider basis; explicit width and flex growth now make that reflow work.

Text continues to scale with the system font scale; rows and headings wrap rather than truncate. Bottom-tab labels retain their existing bounded scaling policy for five destinations. Touch controls retain 44pt minimum effective targets. Form/button heights and general status chips were audited and retained.

## Parent Home

Order: header → greeting → Quick Actions → unified attention → family overview → active Contracts → persistent navigation.

`HomeAttention` composes existing `subscribeToCurrentParentNegotiationInbox`, `useReadyForReviewContracts` and `usePendingRewards` reads. It creates presentation objects only: counteroffers, review-ready Contracts, then Rewards awaiting Parent delivery. There is no persisted attention entity, new query, authoritative mutation or new lifecycle state.

The heading counts all available items; the neutral list previews the first three with separators. More items remain in the existing Offers, Contracts and Rewards collections. Loading, partial failures and saved-data qualifiers remain visible; incomplete or cached reads do not claim that nothing currently needs attention. Retry remounts the existing reads and cleans up the subscription.

| Source                    | Existing destination      |
| ------------------------- | ------------------------- |
| Parent counteroffer inbox | `/offers`                 |
| Ready-for-review Contract | `/contracts/[contractId]` |
| Reward awaiting delivery  | `/rewards/[rewardId]`     |

Awaiting-child-confirmation Rewards remain in the dedicated Rewards collection; they are not Parent delivery actions. No unified attention route exists, so the mockup's attention “View all” was intentionally omitted rather than introducing a new route or an incomplete destination.

Family overview uses compact factual name/count rows: active Contracts and ready-for-review counts, including saved-data qualifiers. It does not invent “on track” semantics. Active work previews one compact Contract with inline progress; the collection remains complete behind See all.

## Child Home

The three summary cards preserve their existing read-model meanings and cache/deadline handling. The duplicate bottom margin is removed. Active agreements and Offers preview one item each, with collection links retaining access to all items. Outer collection cards and redundant descriptive/count lines are removed from Home previews. Rewards use a compact row while retaining delivered/receipt status distinctions and existing detail routes. Dedicated collections retain their fuller cards and outcomes.

The mockup's task-on-track metric and individual task checklist were not fabricated: the implementation displays supported contract counts, the supported deadline metric and authoritative completion progress. No literal mockup placeholder data was copied into the product.

## Native comparison and evidence

[Side-by-side comparison artifact](design/phase-5-5-fidelity/comparison.html) places canonical screen crops, actual before/after screenshots and populated QA screenshots at equal displayed width. Cropping is CSS-only; original screenshots are retained. The local HTML was not browser-previewed because browser tooling blocks file URLs. Native screenshots and the supplied reference were visually inspected directly.

| Evidence                                                                                                                                           | Purpose                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [Parent before](design/phase-5-5-fidelity/parent-before.png), [after](design/phase-5-5-fidelity/parent-after.png)                                  | Actual installed Parent app and existing cached data      |
| [Child before](design/phase-5-5-fidelity/child-before.png), [after](design/phase-5-5-fidelity/child-after.png)                                     | Actual installed Child app and existing cached data       |
| [Populated Parent, Pro](design/phase-5-5-fidelity/parent-populated-pro.png)                                                                        | Three attention sources and two family rows               |
| [Empty Parent, Pro](design/phase-5-5-fidelity/parent-empty-pro.png)                                                                                | One compact neutral empty state                           |
| [Populated Child, Pro](design/phase-5-5-fidelity/child-populated-pro.png)                                                                          | Metrics, active work, Offer and Reward                    |
| [Parent, SE](design/phase-5-5-fidelity/parent-populated-se.png), [empty, SE](design/phase-5-5-fidelity/parent-empty-se.png)                        | 375 × 667pt layout and compact empty state                |
| [Child, SE](design/phase-5-5-fidelity/child-populated-se.png)                                                                                      | Narrow screen, three metrics and reward-section beginning |
| [Parent larger text](design/phase-5-5-fidelity/parent-large-text-pro.png), [Child larger text](design/phase-5-5-fidelity/child-large-text-pro.png) | System `accessibility-medium`; wrapping and action reflow |

Verification used iPhone 17 Pro and iPhone SE simulators on iOS 26.5. Normal system category was `large`; larger-text checks used `accessibility-medium` and restored `large` afterward.

Populated/empty QA captures used temporary local routes with synthetic Jo/Sam data and production UI primitives, including the pure attention and family views. They performed no server commands or Firestore writes. Parent QA ran inside the Parent binary; populated Child Pro ran inside Child. The signed-out SE Child presentation was exercised through the temporary Parent QA route with Child navigation items and shared Child presentation primitives. This verifies layout, not a paired SE Child session. Both temporary routes were removed before final checks and exports.

### Comparison result

- Parent before: nested counteroffer and review cards consume the first viewport; family and active work are pushed far below it. Parent after with actual data exposes the attention item, both family rows and the active section/first card beginning. The three-source QA state exposes all three attention rows, both family rows and the beginning of the active heading at the bottom edge; the active card still requires a small scroll.
- Child before: a nested active-work collection dominates the visible content and Offers/Rewards are pushed down. Child after exposes metrics, active work, an Offer and the Reward row at normal Pro size. On SE the Reward heading and card beginning are visible; further content scrolls.
- Relative typography, tile proportions, neutral row containers, spacing and compact navigation now follow the canonical hierarchy materially more closely. Parent with three attention rows remains somewhat taller than the reference; it meets the approximate beginning-of-active-section target, not a pixel-perfect full-card fit.
- Larger text intentionally increases vertical length. Labels wrap, Quick Actions use two columns and navigation stays available. First-viewport density targets apply to normal text.

Intentional differences: platform safe areas/aspect ratios; real names, long titles, absolute localized dates and cached-data notices; factual contract metrics; aggregate completion counts rather than invented task status; no unread bell badge without supported data; no relative-age text invented from unrelated timestamps. Existing domain terms contain no supported artwork/category mapping, so neutral Ionicons are used instead of guessing popcorn/plant imagery from reward titles. The Expo development gear and return-to-app status link in screenshots are development chrome.

## Other redesigned surfaces

Native read-only inspection covered Parent offer creation, Contracts, Rewards and Settings, plus signed-out Parent auth on SE. Shared header/heading/navigation scale applies consistently. Contract collection rows inherit the compact shared Home row primitive; form inputs, full Reward cards, review details, auth/onboarding composition and Settings controls retain their established scale. Source inspection confirmed preview-only changes preserve dedicated collection behavior. No broad redesign was performed.

## Validation and boundaries

- Parent UI/navigation suites: **75 passed** across 11 suites; Child: **79 passed** across 10 suites.
- One focused attention test proves all three actionable sources combine, the total count is correct and each press retains its existing route. No dimension/color tests were added.
- Workspace typecheck, lint and formatting checks: passed. Typecheck initially caught optional `TextStyle.fontSize`; the final preview scaling uses a typed fallback and passed on rerun.
- Both iOS bundle exports: passed, to temporary output directories outside the repository.
- `git diff --check`: passed.
- Native normal-width, SE, larger-text, populated Parent, empty attention and populated Child presentation checks: performed with limitations stated above.

No backend, domain schema, Firestore rules, commands, state machines, notification behavior, navigation architecture or environment files changed. No backend/emulator suite was run for this visual-only correction. Existing Phase 5 partial acceptance and OPEN-014 remain unchanged. No commit, push or deployment was performed.
