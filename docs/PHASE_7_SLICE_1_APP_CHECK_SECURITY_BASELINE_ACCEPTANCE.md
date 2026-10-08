# Phase 7 Slice 1 — App Check + security baseline

Date: 2026-10-08. Status: implementation and local security baseline complete; native verification recorded below. Production attestation and enforcement readiness remain PARTIAL until the manual prerequisites are verified. No deployment, Console enforcement change, commit or push is included.

## Stack and decision

Both separate Expo 57.0.26 / React Native 0.86.3 binaries use React Native Firebase App, Auth, Firestore, Functions and newly installed App Check **26.4.0**. Generated iOS builds resolve Firebase iOS SDK 12.19.2. Native configuration uses Expo plugins/prebuild and dynamic frameworks; the App Check plugin installs its native provider factory before Firebase configuration. Android already has package IDs and development Google Services configuration; its App Check plugin/provider is included, but Android native validation is deferred. Storage is unused and has no enforcement work.

**ADR-048** records the durable provider and staged rollout decision: Apple `appAttestWithDeviceCheckFallback`, Android `playIntegrity`, SDK `debug` provider only for development emulator builds. APIs were checked against installed 26.4.0 types/native plugin and the [official RN Firebase App Check documentation](https://rnfirebase.io/app-check/usage). No third-party provider is introduced.

## Integration and configuration

`packages/config/src/appCheck.ts` validates one explicit bootstrap policy. Both apps' `src/firebase.ts` pass statically referenced Expo public routing configuration and `__DEV__` to `packages/firebase-client.initializeFirebase`. This shared bootstrap checks the native Firebase project, calls modular `initializeAppCheck` before creating the existing Auth/Firestore/Functions services and connects emulator routing where appropriate. A global cached promise persists through renders and Fast Refresh, including failures; conflicting configuration requires a native restart. RN Firebase 26.4.0 returns an AppCheck instance synchronously while provider setup continues natively. Release bootstrap additionally awaits SDK `getToken`, retrying only transient `appCheck/provider-not-ready` up to 20 times at 100 ms intervals; attestation errors fail closed. The token is never stored or logged. Emulator bootstrap schedules provider setup without requiring a live token exchange. Both root layouts gate session providers/listeners on the shared bootstrap promise. Errors are stable generic codes with no SDK request/token details.

Development requires mode `emulator`, a development build and all existing validated host/port values, targeting `chorex-dev`. The debug provider remains initialized; auto-refresh is disabled in this deterministic emulator path. There is no App Check emulator or meaningful attestation enforcement proof in the current emulator suite.

Release requires mode `production`, a separate valid public Firebase project ID, **no emulator host/ports**, and a release JS build. A development JS build cannot select production configuration. The native project must match the configured project. Production provider selection is fixed in code; no debug token/provider override is read from environment. Production token refresh is enabled. Invalid configuration fails closed before Firebase session consumers mount.

Production app config requires explicit matching native file paths:

- Parent: `CHOREX_PARENT_GOOGLE_SERVICES_IOS`, `CHOREX_PARENT_GOOGLE_SERVICES_ANDROID`.
- Child: `CHOREX_CHILD_GOOGLE_SERVICES_IOS`, `CHOREX_CHILD_GOOGLE_SERVICES_ANDROID`.

Production config also supplies the iOS App Attest production entitlement. These are build-time paths, not public JS secrets. `EXPO_PUBLIC_FIREBASE_PROJECT_ID` is public project metadata. The current bundle/package IDs remain temporary development identities; real release identities, Firebase app registration and Apple/Play provisioning have **not** been completed by this slice. Never inherit the development `.env.local` emulator settings into a production build. No `.env.local` credentials were changed.

## Developer setup

1. Install workspace dependencies and rebuild **both** native development clients after adding App Check (`expo prebuild --platform ios`, then `expo run:ios` from each app). Expo Go and bundle export alone are insufficient.
2. Keep the existing `.env.example` emulator configuration in each app's `.env.local`; start the complete Auth/Firestore/Functions emulator suite and the app's Metro server. Restart Metro after changing env and restart the native client after changing bootstrap config.
3. The native SDK generates/retains its per-install debug credential. If testing against a Firebase development service that validates App Check, privately register that credential under the matching development app in Firebase Console → App Check → Manage debug tokens. Console registration was **not** performed or fabricated here. The current development policy permits emulator routing only: Console registration alone does not turn it into a live debug client. A live-debug development routing extension would need a separately reviewed non-production configuration policy; the current live-readiness checklist uses production-like release binaries.
4. Never commit the debug credential, put it in `EXPO_PUBLIC_*`, print it in ChoreX logs, or share native logs containing it. The upstream debug SDK may emit it in native debug diagnostics; handle those privately. ChoreX does not call `getToken` for diagnostic logging or add token listeners. Do not register development debug credentials for production.

## Firestore Rules and query audit

No concrete permission gap requiring Rules changes was identified. Rules and indexes remain unchanged. App Check does not loosen authorization.

| Surface                 | Existing production boundary                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Users                   | Owner profile get; no arbitrary list or client profile writes.                                                                |
| Families/members        | Active membership required for reads; role/status/membership mutations server-only.                                           |
| Offers/revisions        | Active family participant; Parent-only draft boundary; authoritative state/revision/Reward icon changes denied.               |
| Contracts/tasks/reviews | Active family participant through owning Contract; no client progress, review, accepted-term or lifecycle writes.             |
| Completions             | Server-only, including direct client create denial.                                                                           |
| Rewards                 | Active family owning Parent/Child; delivery, confirmation, status and frozen terms/icon writes denied.                        |
| Devices                 | Owner-only approved strict shape, immutable creation timestamp and server-time lastSeen; existing owner deletion supported.   |
| Reminder preferences    | Owner-only approved boolean; allowed field derives from authoritative Parent/Child profile.                                   |
| Activity events         | No client read surface in current MVP; direct writes and nested effects denied.                                               |
| Pairing/internal state  | Pairing sessions/rate buckets, idempotency, notification effects, push receipts and reminder jobs remain client-inaccessible. |

Rules are not post-query filters. Current collection adapters preserve the constraints below; dedicated collection screens use these same adapters. Existing checked-in indexes support these actual query shapes; no new index is justified. Emulator Rules acceptance does not prove indexes are deployed in production.

| Collection screen/read              | Query constraint                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Child Offers                        | `familyId`, `participantUids array-contains uid`, `AWAITING_CHILD`, `updatedAt desc`.                            |
| Parent Offers/negotiation           | `familyId`, owning `parentUid`, `participantUids array-contains uid`, `AWAITING_PARENT`, `updatedAt desc`.       |
| Parent Contracts / Child Agreements | `familyId`, participant UID, explicit status, `createdAt desc`.                                                  |
| Parent Rewards                      | `familyId`, owning `parentUid`, explicit fulfillment status, `earnedAt desc`.                                    |
| Child Rewards                       | `familyId`, owning `childUid`, `earnedAt desc`.                                                                  |
| Contract tasks/reviews              | Parent Contract-scoped subcollections; review filters use family/Contract/cycle, history orders cycle ascending. |
| Family overview                     | Active Child membership query inside the authenticated family.                                                   |

## Functions, pairing and authorization

All callable adapters use the existing native Functions instance and `httpsCallable`; SDK App Check attachment is automatic, with no custom headers or second client. Audited entry paths cover family/Child creation, pairing creation/redemption, draft/publish/accept/reject/counter Offer, task progress, submit/approve/request-changes, Reward delivery/receipt. Device registration and reminder preferences retain their documented narrow direct Firestore owner exceptions.

Functions use `firebase-functions` 7.4.0, Node 22 and v2 `onCall`. Current wrappers and representative server commands retain Zod validation, authenticated actors, authoritative roles/active membership, entity family/participant ownership and legal-state checks. `createFamily` retains its explicit authenticated membership-bootstrap exception. Admin SDK bypasses Rules; App Check is not authorization. No request-provided role becomes trusted. Shared domain/backend behavior was not changed.

`redeemPairingSession` remains the deliberately pre-auth callable. App Check can accompany that call after Child bootstrap and before Firebase custom-token sign-in. No enforcement was added. Pairing still validates input/token hashes, server-time expiry for active sessions, atomic one-time redemption with same-key retry semantics, source-window total/failure limits and safe custom-token minting. Logs do not include pairing secrets. Later enforcement must validate a fresh unpaired native Child instance as well as authenticated clients; do not require an Auth session for redemption. If rollout needs an endpoint-specific delay, explicitly document it rather than bypassing TTL or rate limiting.

OPEN-006/007/008/010/011/014 remain open. In particular, App Check does **not** resolve individual Child-device Auth revocation (OPEN-014).

## Focused tests and validation

New config tests exercise emulator debug selection, release providers, invalid/mixed routing and release/debug separation without mocking native SDK internals. Existing Parent/Child notification-routing tests now await async bootstrap; one focused failure-gate test per app proves session consumers do not mount before successful setup. Existing bootstrap tests are retained.

`firebase/verify-security-baseline.mjs` uses real checked-in Rules, explicit local project/endpoint guards and unique fixture IDs, cleaning only its own documents. It covers representative unrelated Parent/Child/anonymous isolation, sibling participant isolation, actual collection query constraints, revoked membership, approved owner device/preference writes, cross-user/extra-field denial, frozen icon/lifecycle writes and inaccessible internal collections. It does not clear the development dataset.

Validation evidence:

- Config policy tests: PASS (5 tests).
- Parent and Child notification-routing tests: PASS (5 each, including async failure gate).
- Existing Parent/Child bootstrap tests and Parent notification lifecycle: PASS.
- Focused security Rules baseline: PASS.
- Existing device-registration/lifecycle Rules regression: PASS.
- Existing task/review/Reward authorization unit regression: PASS.
- Existing pairing redemption emulator regression: PASS, including pre-auth redemption, replay/idempotency, expiry and rate limits.
- Workspace typecheck, lint, formatting, Functions build and both iOS exports: PASS (final reruns after temporary smoke-route removal).

The initial routing harness assumed synchronous mount; it was corrected to await bootstrap. Concurrent native builds encountered Xcode shared build-database locks. A later build hit local disk exhaustion; only redundant task-created build artifacts were removed. An unsigned Parent build launched but native Auth returned `auth/keychain-error`; final verification uses normal Xcode simulator signing. Final builds are sequential; shared cached dependencies are reused only after the preceding build exits. These initial failures are not counted as passing verification.

## Native verification

Both signed iOS development builds compiled successfully with App Check linked (Firebase iOS SDK 12.19.2). On iPhone 17 Pro / iOS 26.5 Simulator, both binaries launched with the corrected bootstrap and restored their existing authenticated sessions. Temporary credential-free smoke routes exercised cached bootstrap identity, authenticated family/profile reads, a server-backed reminder preference listener, and the existing `submitContractForReview` callable using a deliberately missing Contract. Both returned `CONTRACT_NOT_FOUND`, proving transport and stable server error mapping without a domain mutation. Evidence: [Parent](design/phase-7-slice-1/parent-app-check-smoke.png), [Child](design/phase-7-slice-1/child-app-check-smoke.png). Temporary routes were removed before final exports; no diagnostic screen or test credentials ship.

Fresh native pre-auth pairing was not performed; the existing pairing redemption emulator suite passed. The native checks establish SDK integration and emulator transport, not valid live App Check token exchange. Release token-readiness gating still requires the production-like live verification checklist below. Debug-provider simulator traffic does not prove Apple/Play production attestation. Android native builds and physical-device attestation are not claimed. Existing development records missing required ADR-047 `iconKey` remain strict-schema read errors; this slice does not migrate or reseed that data.

## Enforcement preparation and manual gates

**Enforcement is intentionally OFF in the rollout policy and unchanged callable code.** Live Console settings were not inspected. No Rules/Functions deployment or Console action occurred. For Firestore, register the matching native apps/providers, inspect App Check request metrics and later enable the Firestore service enforcement switch after legitimate traffic is observed. For v2 callable Functions, enforcement is a **per-function code option** `onCall({ enforceAppCheck: true }, handler)` followed by an approved deployment; a Console monitoring switch alone does not add this behavior. This slice leaves callable options unchanged. See [Firebase callable App Check enforcement](https://firebase.google.com/docs/app-check/cloud-functions). Storage is deferred until it is actually used.

Before rollout, configure correct Firebase production app IDs/native files, Apple App Attest capability/provisioning and DeviceCheck fallback, Android Play Integrity registration/signing/Play distribution requirements, and private development debug registration if needed. Build production-like release binaries with production providers and measure valid traffic for **both distinct apps**. Use Firebase-provided App Check service metrics; no analytics platform or unrelated crash-reporting decision is introduced.

### Pre-enforcement checklist

- [ ] Parent production-like native build sends valid App Check traffic.
- [ ] Child production-like native build sends valid App Check traffic.
- [ ] Parent fresh sign-in and family bootstrap verified against controlled live services.
- [ ] Fresh pre-auth Child pairing and custom-token sign-in verified with App Check.
- [ ] Firestore authenticated reads/listeners verified with valid App Check.
- [ ] Critical callable lifecycle flows verified with valid App Check.
- [ ] Push-device registration verified with valid App Check.
- [ ] Firebase App Check metrics show legitimate traffic for both apps.
- [x] Code policy rejects debug/emulator configuration in a release build (focused tests).
- [x] Focused Rules and relevant authorization/pairing regressions pass locally.
- [ ] No known legitimate-client rejection after controlled observation.

### Later explicitly approved rollout

- [ ] Enable Firestore and per-callable enforcement in a controlled environment.
- [ ] Smoke-test both apps, including fresh pre-auth pairing.
- [ ] Monitor valid/invalid/missing request metrics and rejection rates.
- [ ] Enable production enforcement only after successful observation and approval.

## Outstanding Phase 5/native boundaries

Phase 5 remains PARTIAL independently of the accepted Phase 5.5 visual audit. Still outstanding: first OS notification permission-dialog observation, successful online reminder preference save, successful native sign-out observation, physical Expo/APNs delivery and real-device observations. Production Scheduler/index deployment and existing open product decisions are not completed here. Current App Check work must not silently promote these gates to production readiness.

Recommended next Phase 7 slice: focused accessibility hardening on both real native app surfaces, including screen-reader navigation, larger text, keyboard/focus behavior and actionable contrast/target-size fixes. Continue tracking App Check live attestation and Phase 5 physical delivery as separate release gates.
