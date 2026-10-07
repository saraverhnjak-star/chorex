# Phase 5.5 Slice 1 — Home design foundation

Date: 2026-10-07

## Scope and direction

Parent and authenticated Child Home now use the supplied Home reference as design direction: warm ivory, navy type, coral actions, pastel summary/action surfaces, neutral rounded content cards, thin warm borders, and vector icons. No hero, family illustration, generated image, custom navigation PNG, font, animation framework, domain ADR, or route was added.

The existing foundation was `packages/ui/theme.cjs` (Amber Aurora), a shared NativeWind preset, `Screen`, `Button`, form/notification primitives, and manual dynamic-type styles. Apps used stack navigation and a single Home containing inline offer, negotiation, composer, family, and notification flows; they did **not** have separate Offers/Contracts/Rewards/More tab routes. There was no generic vector-icon dependency or category-to-artwork mapping.

## Tokens and shared UI

`homeTokens` lives beside the existing theme in `theme.cjs`, with typed declarations and TypeScript exports. NativeWind `home-*` aliases use the same values. Both Tailwind content lists now include app `src` components (previously omitted). Existing Amber Aurora tokens remain available for other screens.

| Role                                      | Value                                         |
| ----------------------------------------- | --------------------------------------------- |
| App background                            | `#FFF9F4`                                     |
| Neutral surface                           | `#FFFDFA`                                     |
| Primary text                              | `#211A3B`                                     |
| Secondary text                            | `#668096`                                     |
| Coral action                              | `#E95240` (slightly darker for text contrast) |
| Coral / mint / blue / lavender highlights | `#FFEAE4` / `#E7F5EE` / `#E8F1FF` / `#F0EAFA` |
| Subtle border                             | `#F0E5DD`                                     |
| Progress success                          | `#299D7E`                                     |

Home uses system fonts, 28pt greeting, 21pt section heading, 16pt row title/body, 12pt secondary labels, rounded 20pt rows, pill badges, and a compact spacing scale. Borders provide surface separation without heavy shadows. Existing danger styling remains distinct from coral.

Shared additions in `Home.tsx`: safe-area-aware scrolling frame, section anchors, wordmark/header with initial avatar, greeting, section heading, Quick Actions, summary metric, count badge, and tappable list row with optional factual progress. `Button` adopts Home colors through the frame context; its disabled/loading/focus behavior remains intact. Press feedback uses NativeWind active opacity because callback styles did not render correctly under the current interop runtime. `RewardList` now uses compact icon rows; detail screens still use the existing full `RewardSummary`.

Typography in the new Home primitives follows the project's manual font-scale approach, scaling line height together with font size. Native testing caught clipping from implicit text scaling; the corrected version lays out enlarged text. Quick Actions switch to two columns below 360pt or above 1.3 font scale. Rows have flexible text columns and no fixed English text heights.

## Icons and assets

Added the first generic icon library: pinned `@expo/vector-icons` 15.1.1, using Ionicons only. Expo's font support is already present in the installed Expo runtime; no new native configuration/plugin or second icon set is needed. Shared UI declares the existing safe-area-context version as a peer/development dependency. Icons supplement labels and are hidden from accessibility where decorative.

Audited 24 chore and 24 reward PNGs in `packages/ui/assets`. No referenced asset is missing. No category images are selected from free-text titles: current terms contain reward type/title and task title, not an authoritative artwork/category key. Those existing assets remain available and unchanged; Home uses generic contract/gift icons until a supported mapping exists. No raster artwork was generated or added to runtime bundles. Screenshots below are documentation evidence only.

## Child hierarchy and data

1. ChoreX header, notification-settings bell, initial avatar.
2. `Hi, {name}!` and supportive copy.
3. Three metrics: active Contracts, next deadline, all earned rewards (including confirmed rewards). Active count replaces an unsupported “on track” claim. Unavailable metrics show a dash; cached counts/deadlines are identified. Deadline display uses the local clock for presentation only and refreshes every minute.
4. Active Contracts: reward title, localized deadline, repetition completion totals and progress bar from the existing Contract detail/task read hook. Loading/error progress is never fabricated. Two rows initially; View all expands the same list and keeps every existing detail route reachable.
5. Existing Offer inbox and accept/reject/counter flow, with factual count badge.
6. Earned rewards and existing reward detail navigation.
7. Existing reminder/notification controls and sign-out remain reachable.

Reward copy preserves ADR-046: pending delivery says waiting for Parent delivery; reported delivery says waiting for child confirmation; fulfilled says receipt confirmed. No confirmation mutation was moved into Home.

## Parent hierarchy and actions

1. ChoreX header and `Hello, {name}!` contextual greeting.
2. **Quick Actions directly below the greeting**: Create Offer, Review Submissions, Manage Rewards, Family Overview.
3. Needs your attention: existing counteroffers, ready-for-review Contracts, rewards to deliver, and separately rewards awaiting Child confirmation. Empty subsections retain calm messages and no zero badge. Existing inline negotiation is preserved.
4. Family overview: initials, names, directly derived active/review Contract counts, including cache qualifiers.
5. Active Contracts with Child name, deadline and factual repetition progress; expandable compact preview.
6. Existing composer, child creation, pairing, preference/notification controls, and sign-out remain available farther down Home. Pairing controls moved below the overview without changing their behavior.

Quick Actions and bottom navigation scroll to the actual existing Home sections. Create jumps to the existing composer; Review to the existing review list; Rewards to the existing obligations; Family to the compact overview. Contract/reward rows still push the existing parameterized detail routes. No tabs, placeholder routes, notification inbox, unread count, new business notification, or fake Maybe action were invented. The bell links to notification settings because there is no inbox/read model for unread notifications.

## Functional integrity and testing

No domain, Firebase client command/query implementation, backend, Rules, schema, auth, membership, notification/reminder policy, or state machine changed. Additional Home reads use existing scoped/authorized hooks. Task progress listeners are mounted for visible Contract rows; expanding the list mounts additional existing detail observers. New counts are read-only summaries and never authoritative UI state.

Existing bootstrap tests were updated for greetings, the wordmark and compact family composition. Existing reward-list assertions were updated for compact rows and precise pending-delivery copy; full timestamps/descriptions remain in detail. Native safe-area and decorative icons are mocked in test setup. One behavior test was added: collapsed Contracts can expand, navigate the third/long-title Contract through the original route, then collapse again. No tests assert colors, spacing, shadows or decorative implementation.

Validation:

- Parent targeted bootstrap/contract/reward suites: 25 tests pass.
- Child targeted bootstrap/contract/reward suites: 41 tests pass (one added).
- Workspace typecheck, lint, formatting and `git diff --check`: pass.
- Parent and Child iOS bundle exports: pass; artifacts are under `/tmp/chorex-{parent,child}-slice1-export`.
- No backend/emulator regression suite or Functions build was required or run.

## Native evidence and remaining checks

Observed both authenticated Homes on iPhone 17 Pro / iOS 26.5 using existing development builds and existing emulator-backed data. Verified safe-area header/footer, native icon rendering, scrolling, the Child Offers section jump and its real actions, Parent Family Overview jump, factual progress rows, a long reward title wrapping, Parent empty counteroffer/review states, and populated contracts/reward state. Both Home large-text checks used `accessibility-medium`; Parent Quick Actions reflowed to two columns, Child metrics wrapped, and labels remained reachable. Restored the original `large` text-size setting afterward.

Screenshots:

- [Child Home](design/phase-5-5-slice-1/child-home.png)
- [Parent Home](design/phase-5-5-slice-1/parent-home.png)
- [Parent larger text](design/phase-5-5-slice-1/parent-home-large-text.png)
- [Child larger text](design/phase-5-5-slice-1/child-home-large-text.png)

The Expo developer-menu gear and iOS return-to-app label may appear in development screenshots; neither is ChoreX UI. Existing reminder preference read errors in the current emulator session remain surfaced through the unchanged controls.

Not claimed: a second smaller native phone, long profile-name native fixture, real unread badge (unsupported), count >=10 native fixture, Android/native release build, or a complete Phase 7 accessibility audit. Count badges use flexible pill widths and cap visible count at `99+`; zero badges are hidden. Loading/error/cache/empty behavior is covered by the existing targeted tests. No production data was edited to fabricate verification fixtures.

## Slice 2 recommendation

Apply this foundation to Offer list/detail/composer and negotiation surfaces, keeping their confirmations and authoritative commands intact. Confirm an explicit chore/reward artwork mapping before using category PNGs; do not guess from titles. Finish smaller-phone, long-name and larger-text checks for both apps before declaring full visual acceptance. Separate list routes/tab architecture should remain an explicit later scope decision rather than being smuggled into a Home restyle.
