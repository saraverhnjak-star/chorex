# Phase 5 Slice 2 — Notification response routing

Verified 2026-10-06 against the local `chorex-dev` environment. Slice 2 hardens client navigation only. Phase 5 remains incomplete. No commit, push, deployment, physical remote delivery claim or new ADR is part of this slice.

## 1. Changed files

- `packages/domain/src/notification.ts`: harden existing canonical semantic ID validation.
- `packages/notifications/src/responseRouting.ts`, `core.ts`, `index.ts`: pure response normalization, transient readiness coordinator and existing Expo adapter.
- `packages/notifications/tests/response-routing.test.cjs`, `package.json`: focused shared tests using the existing Node/TypeScript tools.
- Both app `_layout.tsx` files and `src/notifications/routing.ts`: startup registration/readiness and explicit app-owned destinations.
- Both app `__tests__/notification-routing.test.tsx` and the existing Parent notification suite: root sequencing, mapping and regression tests.
- `firebase/verify-notification-routing-native.mjs`: guarded local development verification helper; no domain writes or remote sends.
- `packages/notifications/README.md`, `docs/06_PUSH_NOTIFICATIONS.md`, `docs/07_IMPLEMENTATION_ROADMAP.md` and this report: API, architecture, limitations and evidence.

No backend command, receipt worker, Firestore Rule/index, native app identifier, dependency or domain state machine changed.

## 2. Existing architecture and concrete gaps

The original shared listener registered only after a signed-in user existed. It installed a live response listener and asynchronously retrieved the native last response; each subscription owned its own deduplication Set. It called Expo Router without a root-readiness guard. Thus initial/live callbacks could race, listener remounts could replay the same response, and startup could navigate before the navigator was mounted. Paths also lived in the shared package. OFFER_ACCEPTED incorrectly went home despite carrying the existing CONTRACT entity.

Both applications already suppress foreground banners/list/sound/badge and use Firestore realtime listeners. Their distinct schemes are `chorex-parent` and `chorex-child`, with existing bootstrap binaries. Contract and Reward detail routes exist in both apps. Individual Offer detail routes do not exist. No selected-family Zustand state is required by Contract/Reward direct reads; the existing home projection has its current single-family context. App-variant filtering remains in device registration/backend dispatch.

## 3. Canonical payload and routing intent

The existing strict Zod schema remains the authority: `type`, `entityType`, `entityId`, `familyId`. Event/entity compatibility is unchanged. OFFER_PUBLISHED/OFFER_COUNTERED carry OFFER; OFFER_ACCEPTED, CONTRACT_SUBMITTED, CONTRACT_CHANGES_REQUESTED and CONTRACT_APPROVED carry CONTRACT; REWARD_FULFILLED carries REWARD. Approval is not rewritten as a Reward payload.

The routing intent is that validated semantic type, without duplicated domain enums or arbitrary URL support. IDs must be one nonempty document ID of at most 128 characters; whitespace edges, dot segments, path/query/fragment separators and control characters are rejected. Extra fields, including `url`, tasks, feedback, reward terms or credentials, fail strict validation. The backend still sends semantic entities rather than app paths.

## 4–5. Parent and Child mappings

Each binary has its own resolver and Expo Router tree:

| Entity   | Parent destination                                        | Child destination                                                    |
| -------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| OFFER    | `/`, existing negotiation inbox                           | `/`, existing Offer inbox                                            |
| CONTRACT | `/contracts/{encodedId}`, existing Contract/review detail | `/contracts/{encodedId}`, existing execution/feedback/history detail |
| REWARD   | `/rewards/{encodedId}`, existing obligation detail        | `/rewards/{encodedId}`, existing earned/fulfilled detail             |

OFFER_ACCEPTED now opens Contract detail. CONTRACT_APPROVED continues opening the approved Contract and its reward-relevant current state. A Parent Reward mapping does not introduce a new business notification; the actual fulfilled effect continues targeting Child.

## 6–8. Startup, Auth and response consumption

The root registers explicit response handling while Auth is loading. The shared coordinator keeps at most one validated pending intent, in memory. It waits for the existing session status to become ready with a UID and for `useRootNavigationState().key` before delivering to the app resolver. A newer valid response replaces the pending intent; a newer malformed default-action tap discards it. Signed-out or failed restoration consumes/discards the intent and leaves the existing sign-in/pairing flow. A pending intent already bound to a UID cannot cross an account switch.

The live listener is installed before synchronous Expo last-response retrieval. A response key is request identifier plus default action identifier. Other actions and malformed responses fail safely. Matching native last responses are cleared using the synchronous Expo API, avoiding an asynchronous clear of a newer tap. Consumed identifiers stay in the JS-process singleton across rerenders/listener/root remounts. Only keys are retained, never entity snapshots or permanent navigation history. The pending intent is removed before invoking navigation; exceptions do not create a retry loop. Repeated callbacks, including replay after 100 distinct responses, navigate once per response.

Receiving a notification is not a response and does not navigate. Explicit taps do. Response handling neither asks permission nor modifies registration, receipt state or domain data.

## 9–10. Current state, authorization and offline reads

Entity detail screens use their ordinary Firebase-client readers and authenticated Firestore Rules. Notification IDs and familyId grant no access and never provide display content. A stale submission/changes notification opens the Contract's current state; a historical fulfilled notification cannot force a pending Reward to look fulfilled. Other-family, wrong participant, inactive/nonmember and signed-out reads remain denied. Unknown/inaccessible IDs use the existing safe unavailable UX without revealing another family's contents.

Native Firestore persistence remains the read cache under ADR-020. Cached documents/tasks may render while offline. An uncached target does not fabricate a document or success and remains subject to the existing listener/error/loading behavior. Reconnection converges through those listeners. No custom cache, offline mutation queue or domain command behavior was added. Rules regressions exercise participant/family/membership access and server-only writes; receipt documents remain server-only.

## 11. Reproducible native procedure

Use the existing iPhone 17 Pro / iOS 26.5 simulator and development builds, Parent Metro 8081 and Child Metro 8082, with local Auth 9099, Firestore 8080 and Functions 5001. Existing paired/signed-in sessions and real local entities were reused. Domain data was not reset. The user explicitly approved OS notification permission and test local notifications for both apps. Permission was granted solely for verification; production permission UX is unchanged.

The helper connects only to the matching local Metro Hermes target and requires `__DEV__`. It calls the loaded Expo Notifications SDK through the development runtime. `schedule` validates the actual shared schema, uses a unique `routing-verify-*` request ID, generic title/body and a 30-second TIME_INTERVAL trigger. It does not use a fake router callback, modify Auth, send to Expo/APNs, or write a domain entity. OS taps therefore exercise actual Expo response delivery and the app's production handler.

```sh
pnpm --filter @chorex/domain build
node firebase/verify-notification-routing-native.mjs 8082 permission
# Only after explicit approval, if permission is undetermined:
node firebase/verify-notification-routing-native.mjs 8082 request
node firebase/verify-notification-routing-native.mjs 8082 schedule '{"type":"CONTRACT_CHANGES_REQUESTED","entityType":"CONTRACT","entityId":"<readable-contract-id>","familyId":"<family-id>"}'
```

For foreground arrival, stay on home beyond the 30-second delivery time and verify it does not navigate. For background, immediately send the app home, wait for delivery, open iOS Notification Center/lock-screen notifications and tap the test entry. For cold launch, schedule first and confirm the returned request ID, then run `xcrun simctl terminate booted dev.chorex.bootstrap.child` before delivery; tap the delivered entry and observe session restoration followed by detail. Repeat on port 8081 and `dev.chorex.bootstrap.parent`. Allow Metro to finish bundling and inspect the final screen, rather than treating the transient session spinner as the outcome. Avoid editing imported routing modules midway through a native test; use a fresh process after development hot refresh.

Repeat with REWARD_FULFILLED/REWARD and an actual readable Reward ID, or OFFER_COUNTERED/OFFER for the existing inbox fallback. For controlled offline checks, `offline`/`online` call the existing native Firestore SDK's disableNetwork/enableNetwork. Schedule while the native JS runtime is foregrounded, then background/tap normally. Inspect a previously read target and a fresh unknown ID; reconnect without navigating again. Finish with `cleanup` on each foreground app to remove only this helper's scheduled/presented test notifications. No user's other notifications are cleared.

Observed on the installed native builds:

| Check                                           | Observed result                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent foreground arrival                       | Home remained visible beyond delivery; no automatic navigation.                                                                                                                 |
| Child foreground arrival                        | Home remained visible; no banner or forced navigation.                                                                                                                          |
| Parent background explicit OS tap               | Existing Parent Contract detail opened and displayed current APPROVED state, tasks and Review history.                                                                          |
| Child background explicit OS tap                | Existing Child Contract detail opened; a changes-requested payload displayed current APPROVED state.                                                                            |
| Child terminated/Auth-restored launch           | OS tap launched the terminated binary, the restored Child UID was confirmed read-only, and the Contract detail appeared after initialization.                                   |
| Parent terminated/Auth-restored launch          | OS tap launched the terminated binary, waited through Metro bundling/session restoration, then displayed the Parent Contract detail.                                            |
| Child Reward explicit OS tap                    | REWARD_FULFILLED routing opened Reward detail; the actual local Reward was PENDING_FULFILLMENT and correctly showed “Earned — waiting for Parent.” The test did not fulfill it. |
| Cached Child Contract tap offline               | APPROVED Contract, 1/1 and 2/2 tasks and approved Review remained visible with “Showing saved data. Updates may be pending” and saved-history warning.                          |
| Uncached unknown Contract tap offline           | “No cached Contract is available yet. Connect to the internet to load it.” No terms, tasks or success were invented.                                                            |
| Restore connectivity on the same uncached route | Existing listener changed to “This Contract could not be loaded or is unavailable to your account.” No renavigation/retry loop or other-family disclosure.                      |

The readable Contract fixture was `contract_12090e9f52199e3f5198f9fe39ca99d40af1ce6fd7a120da123ad0d219853530`; Reward was `reward_984a6625fad78934b34f6b200d07889d03b0c1fe16a5dda572c8f9dc4d639ba2`; family was `yP5m05a1WuHrDxMVNJUL`. The uncached target was `routing-verify-uncached-missing-20261006`, which was not created. These IDs identify existing local fixtures, not production entities. Other-family/inactive access was verified on isolated emulators rather than altering the paired native family's membership.

One Parent attempt while routing modules were being changed through development hot refresh remained on home; the finalized implementation was verified again in a fresh native process, with successful cold and subsequent background taps. Transient Metro bundling/session-loading frames were observed before final detail render. Native observations establish actual destinations and current-state reads; automated tests establish exact navigation-call counts and callback/remount deduplication. Firestore network access was restored and helper-created notifications were cleaned up; OS notification permission remains granted as explicitly approved for testing.

## 12–13. Automated verification and receipt regression

Whole workspace: **346 passing tests** — backend 175, Parent 62, Child 74, shared notification 35. Coverage includes all existing semantic event mappings; malformed/private/URL/path payloads; both root layouts; pending Auth and router readiness; signed-out/error/account switch; initial/live/remount deduplication; native retrieval/clear/navigation failure; foreground arrival versus explicit response; and preserving registration behavior.

Passed workspace typecheck/lint, formatting checks, Functions build and both iOS bundle exports. No native dependency/configuration changed.

Existing emulators were preserved. A temporary copy of firebase.json used Auth 19099, Firestore 18080, Functions 15001, hub 14400, logging 14500 and disabled UI. Receipt/device verification used auth/firestore only, with existing injected Expo transport. Separate clean isolated data was used for each Phase 2 suite to avoid cross-suite global no-Reward fixture contamination.

Passed existing receipt integration and device Rules verification; Child/Parent accept, reject and counteroffer; full bilateral Phase 2 notifications; Contract reads/cache/reconnect/authorization; completion, submission, changes, resubmission, multi-round review history, approval and fulfillment with actual transactions/Rules and injected Expo sends. Existing receipt tests verify ticket tracking, DeviceNotRegistered invalidation, token-generation refresh safety, bounded retry/backoff and event deduplication. No receipt pipeline implementation changed and client responses write no receipt state.

Reproduction commands:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm functions:build
pnpm emulators:verify:push-receipts
pnpm emulators:verify:device-registration
pnpm emulators:verify:accept-offer
pnpm emulators:verify:reject-offer
pnpm emulators:verify:counter-offer
pnpm emulators:verify:phase2
pnpm emulators:verify:contract-reads
CHOREX_VERIFY_SUBMISSION=1 CHOREX_VERIFY_REQUEST_CHANGES=1 CHOREX_VERIFY_RESUBMISSION=1 CHOREX_VERIFY_REVIEW_HISTORY=1 CHOREX_VERIFY_FULFILLMENT=1 pnpm emulators:verify:record-task-completion
CI=1 pnpm --filter @chorex/parent exec expo export --platform ios --output-dir /tmp/chorex-routing-parent-export
CI=1 pnpm --filter @chorex/child exec expo export --platform ios --output-dir /tmp/chorex-routing-child-export
```

## 14–16. Limits and remaining work

Individual Offer detail navigation remains unsupported because neither app has such a route. The safe existing home/inbox fallback is deliberate; no new screen tree or multi-family selector was created. This slice does not promise physical remote delivery or verify production push configuration.

Phase 5 remains open for contextual permission/token lifecycle UX, deadline and pending-Reward reminders, and optional preferences. OPEN-010, OPEN-011 and OPEN-014 remain unresolved. The **next safe slice is contextual notification permission onboarding and device-token lifecycle hardening**; it can reuse this validated routing and the completed receipt processor without changing domain semantics.
