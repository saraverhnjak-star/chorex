# Reward Icon Selection acceptance

Date: 2026-10-08. Scope: negotiated icon choice across the existing Offer → Contract → Reward lifecycle.

## Decision and canonical model

Accepted ADR-047 extends ADR-034 RewardTerms, preserving ADR-029 immutable revisions, ADR-036 serialization and ADR-046 bilateral fulfillment. Domain Model and Firestore examples were updated before implementation.

`rewardIconKeys` in packages/domain/src/rewardIcons.ts is the canonical tuple, from which the Zod enum and RewardIconKey union derive:

`gift`, `trip`, `cinema`, `book`, `money`, `screen-time`, `plant`, `pizza`, `ice-cream`, `game-night`.

RewardTerms requires `iconKey` alongside title, optional description and type. All existing OfferRevision, command, Contract and earned Reward schemas reuse RewardTerms; there is no separate earned-Reward icon field or new type/state. The domain imports no React Native/Firebase/assets.

| RewardType | Default iconKey |
| ---------- | --------------- |
| EXPERIENCE | cinema          |
| ITEM       | gift            |
| MONEY      | money           |
| PRIVILEGE  | screen-time     |
| CUSTOM     | gift            |

One domain mapping supplies every editable form and presentation fallback. Titles/descriptions never determine icons. No AI, network lookup or random choice is used.

## Editing and immutable preservation

Parent composer starts with EXPERIENCE/cinema. The preview and Change icon control open a ten-item scrolling modal grid with meaningful labels, selected accessibility state, a visible checkmark/Selected label, and minimum 116pt item height. Done dismisses without a change; choosing a tile updates the form and closes the modal. Safe-area padding keeps the title below status bars. Labels scale and wrap; preview art remains 44pt, grid art 52pt. Picking is optional.

Both existing counteroffer forms initialize from the current revision key. Unrelated title, task, deadline, description and note edits preserve it. An explicit change to a different RewardType always resets to that type's default, even after manual choice. Tapping the already-selected type preserves the icon. Parent still edits complete terms; Child still edits only reward/note. Busy forms disable icon/type controls.

Create/counter commands validate the required closed enum, persist the plain string, and include it in normalized request identity. Counteroffer changes create a new immutable complete revision without mutating the old one. Acceptance already copies revision.reward exactly into Contract.rewardTerms; approval already copies Contract.rewardTerms exactly into earned Reward.terms. Those operations remain unchanged and are verified with deliberately non-default keys. No icon editor exists after acceptance/earning.

Shared RewardIcon uses a single typed local-asset registry. ProposalTerms, ContractSummary/promised terms, Parent/Child Contract rows, Reward cards/details, pending/awaiting/received views and relevant Home previews use the same frozen choice. Section, navigation and lifecycle-status glyphs remain semantic UI controls.

## Compatibility and fallback

Repository RewardTerms fixtures/test builders in both apps, Functions and emulator scripts now include canonical keys. No production migration framework, external migration or automatic writes were introduced. Canonical parsers and server inputs remain strict: old local documents without iconKey are malformed until explicitly reseeded through an authorized development workflow. Presentation fallback is intentionally separate from canonical parsing; it does not make an invalid persisted document valid.

At the presentation boundary a valid key wins even when it differs from the type default. A missing/unknown/unavailable registry key uses the valid RewardType default; invalid/unavailable type uses gift. No title matching or historical writes occur. All mapped assets exist and both native bundle exports resolve them.

## Existing artwork inventory

All 24 PNGs under packages/ui/assets/rewards were visually inspected. No previous asset registry or hard-coded filename mapping existed in app/UI sources; actual rewards previously used generic glyphs. No artwork was generated, edited or removed. SHA-256 comparison found no exact duplicate files.

| Filename              | Visual concept                    | Picker/key or exclusion                                       |
| --------------------- | --------------------------------- | ------------------------------------------------------------- |
| surprise-gift.png     | Coral gift box, mint ribbon/stars | gift                                                          |
| family-trip.png       | Suitcase, mountains               | trip                                                          |
| cinema.png            | Popcorn and cinema tickets        | cinema                                                        |
| new-book.png          | Book, star, ribbon                | book                                                          |
| pocket-money.png      | Coin purse and coins              | money                                                         |
| extra-screen-time.png | Tablet/controller                 | screen-time                                                   |
| new-plant.png         | Potted plant                      | plant                                                         |
| pizza-night.png       | Pizza on plate                    | pizza                                                         |
| ice-cream.png         | Ice cream cone                    | ice-cream                                                     |
| game-night.png        | Board game and dice               | game-night                                                    |
| later-bedtime.png     | Sleeping moon and pillow          | Suitable, deferred to keep picker small                       |
| sleepover.png         | Bedroll, pillow and moon          | Suitable, overlaps bedtime concept; deferred                  |
| amusement-park.png    | Ferris wheel                      | Suitable, deferred outing variant                             |
| baking-together.png   | Mixing bowl, whisk/cookies        | Suitable, deferred food/activity variant                      |
| bowling.png           | Ball and pins                     | Suitable, deferred outing variant                             |
| choose-dinner.png     | Chef hat, plate/fork              | Suitable, overlaps food choices; deferred                     |
| concert-music.png     | Microphone and notes              | Suitable, deferred outing variant                             |
| football-match.png    | Ball and flag                     | Suitable, deferred outing variant                             |
| mini-golf.png         | Club and putting green            | Suitable, deferred outing variant                             |
| museum.png            | Museum building                   | Suitable, deferred outing variant                             |
| new-toy.png           | Friendly robot                    | Suitable, deferred item variant                               |
| shopping-treat.png    | Shopping bag                      | Suitable, overlaps gift/item concept; deferred                |
| swimming.png          | Life ring and goggles             | Suitable, deferred outing variant                             |
| zoo.png               | Giraffe ticket                    | Excluded: visibly rough/dirty background transparency patches |

The selected ten cover generic/item, money, privilege, outing and food concepts while keeping MVP choice compact. Screen-time and game-night remain distinct tablet versus board-game images; trip and cinema remain distinct outing concepts. No pixel tests were added.

## Test impact and validation

Existing fixtures were updated rather than adding parallel suites. Existing schema validation assertions now reject missing/unknown keys and accept a manual plant choice. The existing composer publish test checks default, selected accessibility state, manual choice, type reset and submitted key. Existing Parent/Child counteroffer tests check current choice, unrelated edits and type reset; Parent submission retains a manually selected plant. Existing emulator revisions/snapshot comparisons now use non-default plant/book keys, and the counteroffer retry check additionally changes only iconKey to assert IDEMPOTENCY_CONFLICT. Existing approval/fulfillment snapshot tests retain plant through frozen terms.

Only one new test was added: representative registry/schema consistency and valid/manual/missing/unknown presentation fallback without input mutation. No exhaustive per-icon or image-pixel tests.

Final results:

- Parent: 76/76 tests, 11 suites; Child: 79/79 tests, 10 suites. Shared schema/UI changes justify running both existing app suites.
- Functions: 189/189 existing tests; shared domain and Functions TypeScript builds pass. Approval-output validation also rejects an icon-only mismatch against frozen Contract terms.
- Isolated Auth/Firestore/Functions emulator: createOfferDraft, counterOffer, acceptOffer and accepted/completed/submitted/approved execution checks pass, including existing authorization, immutable history, idempotency and denied client writes. Only ports changed in temporary copies of the existing verification scripts; the clean emulator used 8180/9199/5101, leaving the existing local Firestore dataset intact. Temporary files were removed.
- Workspace typecheck, lint (no warnings), format:check and git diff --check pass. Changed documentation and Functions .mjs tests were additionally formatted explicitly.
- Parent and Child iOS Expo exports pass; ten existing local PNGs resolve in both bundles.

The initial attempt to start all emulators on existing ports was blocked by the occupied Firestore port. A subsequent shared-emulator counter test encountered its existing empty-database assumption; the successful acceptance run therefore used an isolated clean emulator. These are environment conditions, not reported as passing runs.

## Native verification and evidence

Production components were mounted in a temporary local QA route with explicit synthetic terms and no command writes. The route/config/temporary port-adapted verification scripts were removed before delivery. This verifies presentation, not a live native server round trip; server preservation is covered separately by emulator tests.

- iPhone 17 Pro, normal text: production composer default cinema, ten-item modal, manual plant selection, money type reset to money verified via native accessibility state. Counteroffer opened with plant, changing task count to 3 preserved plant in the review. Offer, Contract and Parent awaiting-confirmation Reward showed the same plant artwork.
- iPhone SE 375×667, normal text: Offer terms/plant artwork fit and wrapped correctly, inspected from a native screenshot.
- iPhone SE, accessibility-medium text: shared Child awaiting-confirmation Reward preserved plant, wrapped title and responsibility text without horizontal clipping, inspected from a native screenshot. This was Child presentation in the Parent QA harness, not a paired Child session. System text size was restored afterward.
- Remaining limitation: interactive picker/composer/counteroffer checks on SE and at larger text could not be completed after computer-use lost Simulator window access (`cgWindowNotFound`) despite reconnect/reset attempts. Do not interpret the two SE layout captures as completing that interactive matrix.

Evidence: [iPhone picker](design/reward-icon-selection/iphone-picker.png), [counteroffer](design/reward-icon-selection/iphone-counteroffer.png), [Offer](design/reward-icon-selection/iphone-offer.png), [Contract](design/reward-icon-selection/iphone-contract.png), [Parent Reward](design/reward-icon-selection/iphone-reward.png), [SE Offer](design/reward-icon-selection/se-offer.png), [SE larger-text Child Reward](design/reward-icon-selection/se-large-child-reward.png). The floating developer gear is Expo development UI.

## Preserved boundaries

No unrelated lifecycle, authorization, Firestore rules/indexes, notification behavior, domain command capability, app routing, dependency or native config was changed. Approval remains separate from delivery and Child receipt confirmation. No commit, push or deployment.
