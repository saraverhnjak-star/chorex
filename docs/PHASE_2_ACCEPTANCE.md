# Phase 2 acceptance review

Review date: 2026-10-05. Scope: Offer negotiation and the documented publish/counter/accept push matrix. No Phase 3 execution, Contract detail, review, Reward, expiry, withdrawal, rejection push, or preference behavior was added. No commit, push or deployment was performed.

## Documented acceptance gate

| Gate                                            | Result | Evidence                                                                                                                                                                                               |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Both participants see the same current revision | PASS   | `verify-phase2.mjs` reads Offer/current revision under each participant's Rules context and observes Child/Parent waiting queries through realtime subscriptions.                                      |
| Stale revision acceptance is rejected           | PASS   | Revision-1 Child acceptance after Parent revision 3 fails with `STALE_REVISION`; focused command suites retain stale/state/authorization coverage.                                                     |
| Acceptance creates exactly one Contract         | PASS   | Direct Child acceptance, Parent acceptance of a Child counteroffer, and revision-3 acceptance each produce one deterministic `ACTIVE` Contract with frozen tasks/reward/deadline and `reviewCycle: 0`. |
| Repeated acceptance does not create duplicates  | PASS   | Concurrent same-key acceptance returns the same canonical result; focused accept/reject/counter race suites verify one legal winner.                                                                   |

The documented Phase 2 acceptance gate is satisfied by local automated/emulator evidence. Physical push display and production deployment are not part of this verification claim.

## Notification paths

| Committed event        | Recipient                 | Routing                                                        |
| ---------------------- | ------------------------- | -------------------------------------------------------------- |
| Parent publishes Offer | Active Child participant  | `OFFER_PUBLISHED`, `OFFER`, Offer ID, Family ID                |
| Child counteroffers    | Active Parent participant | `OFFER_COUNTERED`, `OFFER`, Offer ID, Family ID                |
| Parent counteroffers   | Active Child participant  | `OFFER_COUNTERED`, `OFFER`, Offer ID, Family ID                |
| Child accepts          | Active Parent participant | `OFFER_ACCEPTED`, `CONTRACT`, committed Contract ID, Family ID |
| Parent accepts         | Active Child participant  | `OFFER_ACCEPTED`, `CONTRACT`, committed Contract ID, Family ID |

Each committed activity event owns one server-only delivery record. Same-key command retries retain one event/effect; duplicate trigger invocations serialize on the event's delivery lease. Payloads and generic copy exclude tasks, descriptions, notes, display names, credentials, push tokens and pairing data. Rejections retain state/activity behavior without a push effect.

## Verification

- Workspace TypeScript typecheck and lint: PASS.
- Unit/UI tests: 50 PASS (7 backend notification tests, 31 Parent tests, 12 Child tests).
- Focused emulator suites for Child/Parent acceptance, counteroffer and rejection, plus realtime inbox query/Rules behavior: PASS with the dispatcher running.
- Final `verify-phase2.mjs` gate: verifies direct acceptance; Child counteroffer/Parent acceptance; three-revision negotiation/Child acceptance; both rejection directions; immutable history; frozen snapshots; stale/wrong-family/wrong-role/arbitrary-recipient failures; acceptance versus Parent counteroffer/rejection; no preapproval Rewards; and notification effects only for committed transitions.
- Injected fake Expo transport: verifies no work before event commit or for an aborted transaction, event deduplication, missing/disabled registrations, immediate invalid-token deactivation, and transport failure without authoritative state rollback. Local Functions use fake tickets and never call Expo.
- Parent and Child iOS JavaScript bundle exports: PASS. Existing native notification modules/dependencies are reused.

## Remaining limits

No Phase 2 functional gap was found within the automated gate. Real Expo-to-device delivery requires a configured development build, push credentials, a physical device and a live delivery test; no real push was sent here. Notification routing opens the current home/inbox surface until Phase 3 adds Contract details. A successful Expo ticket is not proof of device delivery. Ambiguous network failures can repeat a physical push; the event still owns one logical effect. Receipt polling/cleanup and further transport hardening are deferred outside this slice.
