# Phase 5.5 Slice 5 — Navigation IA and dedicated collections

Date: 2026-10-07. Scope: route-level composition and navigation within the existing Expo Router architecture.

## Result and verification boundary

Home is now a dashboard with bounded previews. Offers, Contracts/My chores, Rewards and More are dedicated destinations in both binaries. The existing custom bottom navigation now navigates routes and derives selection from `usePathname`; it no longer owns scroll-position state. No domain/backend/query/Rules changes, dependency, new navigation framework, commit, push or deployment were introduced.

Automated validation and both iOS exports pass. Native collection/detail/back, small-screen/larger-text and one actual cold-start notification tap were verified. **The native checklist is partial for Parent Quick Actions:** their destination mappings are tested, but the final manual pass of every shortcut could not be completed after computer-use lost the Simulator window (`cgWindowNotFound`; subsequent recovery timed out). This limitation is not reported as a successful manual observation.

## Previous route audit

| Area                 | Parent before                                                                                                    | Child before                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Root                 | `app/_layout.tsx`: session provider, notification coordinator, protected Stack with sign-in/register and `(app)` | `app/_layout.tsx`: session provider, notification coordinator and Stack; pairing inside `/` |
| Authenticated layout | `(app)/_layout.tsx`: Stack, no Tabs                                                                              | Root Stack, no Tabs                                                                         |
| Home                 | `(app)/index.tsx` → `/`                                                                                          | `index.tsx` → `/`                                                                           |
| Offers               | Inline Parent negotiation inbox and draft/save/publish composer on Home                                          | Inline actionable inbox and counteroffer/rejection flow on Home                             |
| Contracts            | `/contracts/[contractId]`; Home ACTIVE and Ready for Review lists                                                | `/contracts/[contractId]`; Home ACTIVE list                                                 |
| Review/history       | Existing Contract detail; no separate review route                                                               | Existing Contract detail; no separate history route                                         |
| Rewards              | `/rewards/[rewardId]`; Home pending and awaiting lists                                                           | `/rewards/[rewardId]`; Home all-earned list                                                 |
| More/Settings/Family | Home child creation/pairing, preferences, permission controls and sign-out; no dedicated route                   | Home preferences, permission controls and sign-out; no dedicated route                      |
| Notifications        | OFFER → `/`; CONTRACT/REWARD → existing stable-ID details                                                        | Same semantic mapping in the separate Child router                                          |

The shared `HomeScreenFrame` had a ScrollView ref, registered section nodes, `measureLayout`/`scrollTo`, and local `selected` state. Bottom items called `jump(home/offers/contracts/rewards/more)`. Parent Quick Actions called `jump(create/review/rewards/family)`. Header notification settings called `jump(more)`; the avatar called `jump(family)` for Parent or `jump(more)` for Child. Contract “View all” expanded Home inline.

All node registration, scroll anchors, `jump`, inline expansion and scroll-derived selection were removed. `HomeSection` is now only visual composition. No competing anchor-navigation path remains.

## Resulting architecture

Both apps retain their existing Stack navigators and entity paths. App-specific `AppNavigation` composes the shared visual `NavigationFrame` around the authenticated Stack; no Expo Tabs navigator existed to preserve or replace. Top-level presses use `router.navigate`, so an existing destination can be revisited without blindly pushing another identical collection. Entity rows still use the existing `router.push` with stable IDs.

| Binary | Displayed item | Collection route | Preserved detail/action route                               |
| ------ | -------------- | ---------------- | ----------------------------------------------------------- |
| Parent | Home           | `/`              | Useful specific Home rows still open entity details         |
| Parent | Offers         | `/offers`        | Existing inline negotiation; composer now `/offers/create`  |
| Parent | Contracts      | `/contracts`     | `/contracts/[contractId]`, including current review/history |
| Parent | Rewards        | `/rewards`       | `/rewards/[rewardId]`                                       |
| Parent | More           | `/more`          | Existing family controls composed at `/family`              |
| Child  | Home           | `/`              | Useful specific Home rows still open entity details         |
| Child  | My chores      | `/contracts`     | `/contracts/[contractId]`, task execution/review/history    |
| Child  | Offers         | `/offers`        | Existing inline inbox/counteroffer/rejection flow           |
| Child  | Rewards        | `/rewards`       | `/rewards/[rewardId]`                                       |
| Child  | More           | `/more`          | Existing preferences, permission controls and sign-out      |

Parent route files remain under `(app)`; Child collection files remain in its root route tree. Child signed-out collection entries redirect to the existing pairing Home after session readiness. Parent's existing root protection remains intact. No authentication or pairing redesign was made.

Selection comes from the top-level path segment: Contract/review details select Contracts/My chores, Reward details select Rewards, Offer composer selects Offers, and Parent Family selects More. No Zustand navigation state or per-tab independent stack infrastructure was added.

Child retains the established **My chores** navigation label instead of inventing My Work. Its active preview uses existing agreement wording; domain objects remain Contract/Task. Parent retains Contracts and Ready for Review.

## Home, See all and Quick Actions

Home keeps its approved header, greeting, colors, compact cards, and Parent Quick Actions immediately below the greeting. Composer, full collections, account controls and pairing controls no longer lengthen the dashboard.

- Contract previews show the first two records from their existing ordered read. See all opens `/contracts`; Parent review See all also opens that collection, with Ready for Review first.
- Offer previews show at most two compact proposal rows. See all and proposal rows open `/offers`, where the original complete terms/actions remain. There is still no individual Offer detail route or selected-offer architecture to fabricate.
- Reward previews show at most two compact cards with total read counts. Parent combines the existing pending/awaiting reads for its preview, pending delivery first; Child prioritizes awaiting confirmation. Full Child grouping remains on the collection. See all opens `/rewards`; individual cards retain their stable-ID detail route.
- Family overview shows at most two children on Home and links to `/family`, where the full existing overview, Add a child and Pair device controls are available.

| Parent shortcut    | Destination                                        |
| ------------------ | -------------------------------------------------- |
| Create Offer       | `/offers/create`, existing composer                |
| Review Submissions | `/contracts`, existing review queue first          |
| Manage Rewards     | `/rewards`, existing pending/awaiting collection   |
| Family Overview    | `/family`, composition of existing family surfaces |

The header bell opens More. Parent avatar opens Family; Child avatar opens More. More retains the existing notification education/Enable/Not now/Settings actions, role-specific reminder preference and sign-out behavior. Parent More links to Family. No Family feature, notification inbox or Settings visual redesign was added.

## Collections and read ownership

Collection screens reuse Slice 2 inboxes, Slice 3 Contract rows and Slice 4 Reward lists/cards/grouping. Safe-area-aware frames, wrapping titles, loading, compact empty outcomes, error/retry and saved-data qualifiers remain. Contract/Reward retry remounts only the existing observer composition; it does not add Firestore access or a manual refresh requirement. Existing Offer retries are preserved.

| Collection       | Existing read coverage, now rendered in full                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Parent Offers    | All current AWAITING_PARENT counteroffers and their exact current revisions, according to the existing inbox query |
| Child Offers     | All current AWAITING_CHILD offers and exact current revisions                                                      |
| Parent Contracts | Full existing ACTIVE list plus full READY_FOR_REVIEW queue                                                         |
| Child My chores  | Full existing ACTIVE Contract list                                                                                 |
| Parent Rewards   | Full PENDING_FULFILLMENT list and separate AWAITING_CHILD_CONFIRMATION list                                        |
| Child Rewards    | Full existing earned read, grouped awaiting confirmation / pending delivery / received                             |

The inspected collection observers do not impose a first-two database limit or use pagination. Home's limit is presentation-only; collection routes remove it. The unrelated `limit(2)` validates uniqueness of a current-cycle Review and is unchanged. No pagination/search/filter/sort infrastructure or inefficient new query was added.

Family discovery now has one app-owned, UID-keyed React context using the existing `readCurrentParentFamily` / `readCurrentChildFamily` adapter. It is shared across top-level routes, clears on identity change, ignores stale callbacks and retains explicit retry. Existing Parent create-family/create-child receipts update that same context. This avoids re-reading family setup on every navigation or Back action; it is not a domain entity cache or a new state framework.

Focused collection composition unmounts on blur through Expo Router's `useFocusEffect`, disposing its existing observers. Entering it again mounts the current authoritative realtime read. Detail screens remain independent of collection/family initialization. Existing Home metric/overview reads remain scoped through the existing hooks; no query logic moved into routes.

### Existing visibility limitations preserved

There was no persistent accepted/rejected/waiting-side Offer list, approved/changes-requested Contract collection, or Parent fulfilled-Reward history list in the inspected app. This slice does not pretend those data are supplied by the existing collection hooks. Current-state Contract/Reward details and immutable review history remain available through existing stable-ID routes and notifications, including terminal states. Child received Rewards remain visible in its existing read. No previously exposed historical list was hidden, no archive/delete behavior was introduced, and no broader Firestore read scope was added.

## Detail, Back and notifications

Detail remains separate from collection. Its Back action now uses the real stack when available; without a predecessor it replaces with the corresponding collection. Thus collection → detail → Back returns to collection, and a direct Home preview can return to Home. A cold entity entry has a safe collection fallback. Composer has the same Back/fallback pattern for Offers.

Notification entity paths, payload validation, Auth/router readiness, default-action gating, response deduplication and backend semantics remain unchanged. The only client mapping change is **OFFER → `/offers`** in both binaries, because the existing inbox now lives there. CONTRACT and REWARD retain their encoded stable-ID details. Current routing documentation was aligned with Offers/More; no ADR was needed.

Native cold-start observation: scheduled a generic local notification carrying a valid CONTRACT_CHANGES_REQUESTED payload for an existing readable Contract, terminated the Child process before delivery, then tapped the actual iOS lock-screen notification. Auth restored and the production response handler opened the current **ACTIVE** Contract, visibly cached, with My chores selected. The stale notification did not manufacture CHANGES_REQUESTED or mutate progress. No collection had to be initialized first. This used an existing granted OS permission, not a new prompt, backend write or remote Expo/APNs send. Only temporary `routing-verify-*` notifications were removed afterward.

## Native layout and evidence

Observed real Parent and Child development apps on iPhone 17 Pro / iOS 26.5 using existing authenticated sessions and local cached data. Parent Offers/Contracts and Contract detail/Back were verified. Child Home See all → full four-record work collection → third Contract detail → Back, Offers navigation, Rewards detail/Back and contextual active selection were verified. Real Parent Home still shows greeting followed immediately by Quick Actions and concise sections.

Small-screen checks used iPhone SE (3rd generation), 375 × 667 points, at original `large` and increased `accessibility-medium` text size. Original text size was restored. Temporary namespaced Expo routes rendered shared production navigation/frame primitives and copies of actual collection components with only local adapters/route namespaces substituted. Fixtures supplied twelve records, long titles/names and full Child Reward grouping. No commands or Firebase writes were sent. All fixture routes, copies, adapters and temporary runtime helper were removed before final checks/exports.

Observed both role footers, route switching, full lists, double-digit badges, long cards and larger-text headers. Content wraps and grows vertically. Bottom items remain tappable and do not overlap or scroll horizontally. Their label scaling is capped at 1.3 to keep five destinations usable; full accessible labels remain intact. Decorative avatar initials remain at their original size. This is a targeted layout check, not a Phase 7 accessibility audit, release/Android build or physical push verification.

| Evidence                                     | Screenshot                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Real Parent dashboard/Quick Action placement | [Parent Home](design/phase-5-5-slice-5/parent-home-pro.png)                           |
| Real Child Rewards collection                | [Child Rewards](design/phase-5-5-slice-5/child-rewards-pro.png)                       |
| Actual cold notification → current Contract  | [Child cold start](design/phase-5-5-slice-5/child-cold-notification-contract-pro.png) |
| Child small collection/count 12              | [SE Rewards](design/phase-5-5-slice-5/child-rewards-se.png)                           |
| Parent small collection/long name            | [SE Rewards](design/phase-5-5-slice-5/parent-rewards-se.png)                          |
| Child larger text and work footer            | [SE My chores](design/phase-5-5-slice-5/child-work-larger-text-se.png)                |
| Parent larger text and Contracts footer      | [SE Contracts](design/phase-5-5-slice-5/parent-contracts-larger-text-se.png)          |

Developer gear and iOS return-to-app labels in images are development UI. SE images are synthetic layout evidence, not authenticated backend end-to-end runs. The remaining direct Parent Quick Action/manual checklist limitation is recorded at the start of this report.

## Tests and validation

Updated existing tests; **no new test cases**:

- Both bootstrap cases exercise parameterized top-level/See-all route mappings, route-derived selection and relocated existing controls. Parent also verifies one family discovery read across switches; Child preserves pairing/restart and negotiation assertions.
- Existing Child compact-preview case now verifies specific-item routing, See all navigation and full collection access to the third record instead of inline expand/collapse.
- Existing Contract route cases verify real Back plus cold-entry collection fallback.
- Existing notification coordinator/mapping cases verify cold readiness, current entity routes and new Offers destination.
- Existing Offer/Reward suites retain command wiring, scope/realtime cleanup, confirmations, retry/idempotency, grouping, authorization gates and terminal behavior. Mocks were updated for the added router APIs; no color/icon/spacing assertions were added.

| Check                                     | Result                                      |
| ----------------------------------------- | ------------------------------------------- |
| Parent full app test suite                | PASS: 11 suites, 70 tests                   |
| Child full app test suite                 | PASS: 10 suites, 79 tests                   |
| Workspace typecheck                       | PASS                                        |
| Workspace lint                            | PASS, no warnings                           |
| Workspace formatting and changed Markdown | PASS                                        |
| git diff --check                          | PASS                                        |
| Parent iOS export                         | PASS: `/tmp/chorex-slice5-final-parent-ios` |
| Child iOS export                          | PASS: `/tmp/chorex-slice5-final-child-ios`  |

Backend/domain, Firestore adapters/queries/Rules/schema and notification/reminder lifecycle behavior are untouched. ADR-046 remains bilateral and server-authoritative. Functions build and backend/emulator suites were not required or run. No commit, push or deployment was performed.

## Recommended next slice

Refresh More/Settings, notification permission status/education and role-specific reminder preferences visually, preserving existing explicit permission actions, registration lifecycle, ADR-045 preferences and server behavior. Complete the remaining direct native Parent shortcut checklist alongside that pass. Keep auth, family onboarding and Child pairing redesign separately scoped.
