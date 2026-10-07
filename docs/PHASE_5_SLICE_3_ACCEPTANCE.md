# Phase 5 Slice 3 — Contextual permissions and installation registration

Implementation and automated verification: 2026-10-06. Phase 5 remains incomplete. No commit, push, deployment, EAS project creation or EAS configuration was performed.

## 1. Changed files and architecture

- `packages/domain/src/device.ts` and public export: strict shared auxiliary registration metadata, without timestamps or new domain state.
- `packages/firebase-client/src/index.ts`: authenticated own-installation transactional upsert/delete; preserve `createdAt`, server `lastSeenAt`, and recheck current UID before writes.
- `packages/notifications/src/core.ts`: permission-aware reconciliation and serialized registration/sign-out cleanup, with injected dependencies for deterministic verification.
- `packages/notifications/src/index.ts`: native Expo permission normalization, bounded Expo token acquisition, existing SecureStore installation identity, local education flag and firebase-client adapter composition.
- `packages/notifications/src/lifecycle.ts`: authenticated bootstrap, foreground and native-token reconciliation; contextual education hook.
- `packages/ui/src/NotificationPermissionCard.tsx` and export: shared accessible inline education/status/actions.
- Both session providers and both Home screens: separate app variants and contextual Home composition; existing Auth, pairing, navigation and domain commands are preserved.
- Existing app bootstrap, registration and Child adapter tests; focused lifecycle hook tests and shared registration dependency tests.
- `firebase/verify-device-registration.mjs`: existing owner-Rules suite extended with real shared lifecycle and deterministic OS/token dependencies.
- `firebase/verify-notification-registration-native.mjs`: development-only local-Metro verification helper for in-memory token dependencies; no production test switch, credential logging or real Expo calls.
- Notification package metadata/lock: existing React peer/types and firebase-client workspace dependency; no new external library or native plugin.
- Firestore schema, security, notification architecture, roadmap and this report.

ADR-018/019/020 already govern these changes. No new durable decision or ADR is necessary. No authoritative domain lifecycle, Rules permission, receipt processing or routing capability changes.

## 2. Existing lifecycle gaps

The old Home action registered only on manual Enable. Its successful state existed only in component memory. Auth restoration, foreground return, token changes and app version changes had no shared reconciliation. A denied permission could be requested again indiscriminately, and asynchronous token acquisition retained a captured UID without subsequent checks. Push writes lived in notifications instead of the firebase-client boundary. Existing random SecureStore identity, owner-only Rules, creation timestamp preservation and pre-Auth-sign-out cleanup were retained and hardened.

## 3–4. Parent and Child contextual triggers

Parent education becomes eligible only in an authenticated, successfully loaded family Home after family creation/onboarding. Child education becomes eligible only after pairing/Auth restoration and a successfully readable family Home. Loading, pairing, authentication and unreadable-family states never display education or ask OS permission.

A previously granted installation may reconcile after Auth restoration without presenting education. Registration is auxiliary and is never an onboarding prerequisite.

## 5. Education and permission behavior

The shared card explains each app's relevant transactional updates, says notifications are optional, and offers **Enable notifications** and **Not now**. Nothing automatically opens the OS prompt. Not now only dismisses education. The installation-local `chorex.notification-education.v1` SecureStore flag prevents repeated education across restarts; it is not permission truth or a persisted registration cache. Explicit Enable can reopen education before requesting permission.

| Native state                        | Behavior                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Undetermined                        | Contextual education; explicit Enable may request permission                           |
| Granted                             | Reconcile own installation; show enabled only after Firestore confirms                 |
| iOS provisional                     | Usable quiet authorization; quiet enabled copy after confirmation                      |
| iOS ephemeral                       | Usable authorization; no invented permanent grant                                      |
| Denied, can ask again               | Optional/off state; explicit Enable may request again where platform permits           |
| Permanently denied                  | Optional/off state and explicit **Open notification settings**; no repeated OS request |
| Token/configuration/network failure | Auxiliary error/retry; Auth and agreement flows remain usable                          |

System Settings opens only on the user's explicit action. Returning to foreground reads the current Expo permission result again. Header/button roles, existing shared Button loading/disabled states, Dynamic Type styles and polite status announcements are preserved. Android channel creation occurs before explicit prompting/token registration, without introducing direct FCM.

## 6. Installation identity

Each binary reuses its existing `chorex.installation-id.v1` opaque random UUID in SecureStore with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. No hardware identifier, account UID, push token or child content is used as the ID. Sign-out, permission changes and token rotation do not delete it. No ID is generated solely to delete a nonexistent registration. SecureStore is binary-scoped; a Parent binary and Child binary do not share one document namespace.

## 7–8. Registration and token replacement

Authenticated bootstrap, background-to-foreground transition and native-token signals reconcile a single `/users/{uid}/devices/{installationId}`. Native-token events are only invalidation signals: the raw native token is never stored. The current Expo token, platform, app variant and version form a complete strict metadata write with `pushEnabled: true`. Existing `createdAt` is frozen; `lastSeenAt` uses Firestore server time on each effective reconciliation.

The hook coalesces overlapping work; a token change during in-flight work schedules one subsequent reconciliation. There is no render-driven registration, polling loop, custom token cache or offline mutation queue. Expo acquisition times out after 15 seconds and remains retryable. The same installation document receives replacement tokens, rather than accumulating registrations.

Auth UID is checked after asynchronous permission/token/identity work and inside the write transaction. Disposed hooks cannot publish stale UI state after an account change. The UI does not claim a registration until the transaction confirms.

## 9. DeviceNotRegistered recovery and Slice 1 boundary

The receipt worker still disables only a matching token fingerprint/registration generation. A legitimate later self-registration reactivates the same existing document with fresh server `lastSeenAt`; stale receipts cannot disable that newer registration. Receipt transport/classification/leases and device invalidation code were not changed. Existing receipt unit/integration coverage verifies rotated-token and same-token generation protection.

## 10. Permission revoke/restore

Reconciliation on foreground return removes the current user's installation registration when native permission is unusable. This uses existing owner-only deletion; clients do not forge the Admin-only `pushEnabled: false` update. Auth, pairing, membership, other installations and domain objects are untouched. Restoring usable permission registers the same stored installation identity again. Deletion and registration require backend-confirmed transactions.

## 11. Sign-out and account switching

Both existing sign-out flows await registration cleanup before Firebase Auth sign-out. The coordinator pauses the current UID, drains in-flight registration and prevents queued work from reactivating it. Failure to confirm deletion retains Auth for a safe retry; it does not silently enqueue cleanup or claim sign-out success. The next account resumes reconciliation with the same installation ID under its own UID after the prior registration has been removed. There is no anonymous registration or account-role field trusted from the client.

## 12. Security evidence

Owner Rules still deny another UID's get/list/create/update/delete, anonymous access, extra authority fields, changed `createdAt`, forged disabled writes and direct profile writes. The adapter rejects wrong-current-user and path-shaped installation IDs and validates strict shared metadata. The expanded emulator suite exercises same-document replacement, server timestamps, permission off/on and A-to-B cleanup under authenticated owner Rules. Existing family isolation and denied direct domain writes remain covered by Phase 2–4 emulator regressions.

## 13. Native procedure and evidence

Use the existing iOS 26.5 development binaries (`dev.chorex.bootstrap.parent` / `.child`) and existing local configuration: chorex-dev, Auth 9099, Firestore 8080, Functions 5001, Metro Parent 8081/Child 8082. No native build settings, EAS IDs or local environment files were changed.

An isolated iPhone 17 Pro simulator named **ChoreX Permission Verification** was created, and both existing binaries were installed. Disposable local Auth/family/Child fixtures were created through the existing trusted callable commands. Fixture credentials and pairing material remain in a private temporary file, never in this report or repository. The original simulator's persistent app data/session was preserved. It was temporarily stopped to reduce native first-boot resource contention and its booted state was restored afterward.

Reproduction sequence:

1. Fresh Parent launch: verify no permission dialog before Auth or while family is unreadable.
2. Sign in normally to disposable Parent A and load its family Home. Verify contextual education. Choose Not now, restart, and verify no automatic prompt/nag.
3. Explicitly choose Enable, review education and Enable again. Accept the real iOS dialog. With the deterministic token dependency installed, inspect one confirmed owner registration and the stored installation ID.
4. Terminate/relaunch the binary; inspect permission, education marker and identical SecureStore ID. Reinstall only the process-local token dependency after restart, then reconcile.
5. Rotate the fake Expo token and reconcile. Verify one document, preserved `createdAt`, updated generation/server `lastSeenAt`, and correct app variant/version.
6. Disable app notifications in iOS Settings, return to the app, and verify own registration removal with Auth retained. Restore permission and verify the same ID registers again.
7. Sign out through the UI; verify A's registration is removed before signed-out UI. Sign in normally as disposable B and verify only B's installation registration exists.
8. Fresh Child launch: verify the pairing screen does not request permission. Pair using the existing redeem/custom-token flow and load the readable family Home. Verify Child-specific education. Exercise Not now and explicit Enable; choose Don't Allow, verify normal app use and the explicit Settings action, then allow in Settings and reconcile.
9. Restore test permission/network state and sign out/clean only disposable registrations. Leave real fixture credentials, tokens and EAS IDs out of logs.

Local helper (isolated simulator target and development/emulator guards):

```sh
node firebase/verify-notification-registration-native.mjs 8081 install-double
node firebase/verify-notification-registration-native.mjs 8081 status
node firebase/verify-notification-registration-native.mjs 8081 rotate
node firebase/verify-notification-registration-native.mjs 8081 reconcile
# Use 8082 for Child. Real dialogs/Settings/actions are controlled in the native UI.
```

The helper replaces only in-memory token/provider dependencies, retains actual native permission/SecureStore/Auth and actual firebase-client Firestore transactions, and never invokes getExpoPushTokenAsync or configures EAS. Its provider sentinel is test dependency data, not an EAS project ID. Optional local fixture sign-in/pair operations use existing client adapters with private temporary fixture material.

**Native observation in progress:** first boot stalled in CoreLocation migration, then system-app startup. The Simulator UI became unavailable (`cgWindowNotFound`) despite boot-status and installed-binary checks. Simulator and CoreSimulator service were restarted without erasing app data, but repeated UI binding still returned `cgWindowNotFound`. Manual assistance to open the isolated device was requested. This is a separate **native verification infrastructure blocker**, not a lifecycle implementation failure and not an EAS-dependent deferred check. Native permission/restart/sign-out observations must be recorded after an accessible native window is available; automated evidence is not substituted for these observations. Slice 3 native acceptance is therefore not claimed complete.

## 14–15. Automated checks and regressions

- Shared notifications: **50 passing tests** (15 registration lifecycle plus existing 35 response-routing tests).
- Functions: **175 passing tests**, including unchanged receipt-worker and committed-event notification coverage.
- Parent: **67 passing tests** across 10 suites, including focused lifecycle hooks and extended contextual Home/Not now coverage.
- Child: **76 passing tests** across 10 suites, including pairing timing, contextual Home/Not now, own adapter transactions and existing domain/read/routing surfaces.
- **368 passing tests total**, no failed or skipped tests in the final sequential run.
- Whole-workspace typecheck/lint, Functions build and both iOS bundle exports passed. Repository formatting and all changed documentation formatting passed after final edits. A broader optional check of every existing docs file finds pre-existing formatting in `01_TECHNICAL_ARCHITECTURE.md`, `PHASE_0_ACCEPTANCE.md` and `PHASE_1_ACCEPTANCE.md`; these unrelated files were not rewritten.
- Isolated Auth/Firestore receipt integration and owner-device Rules passed with deterministic Expo transport and no competing Functions trigger.
- Isolated Child/Parent accept, reject, counteroffer, bilateral Phase 2 notifications and Contract read/cache/reconnect regressions passed.
- Full completion/submission/changes/resubmission/multi-round history/approval/fulfillment regression **passed** separately on clean isolated data with explicit Functions port routing, including real mixed-decision/fulfillment races and committed notification effects.

Use sequential workspace tests where native first-boot resource contention is high:

```sh
pnpm --workspace-concurrency=1 -r --if-present test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm functions:build
pnpm emulators:verify:device-registration
pnpm emulators:verify:push-receipts
pnpm emulators:verify:phase2
CHOREX_VERIFY_SUBMISSION=1 CHOREX_VERIFY_REQUEST_CHANGES=1 CHOREX_VERIFY_RESUBMISSION=1 CHOREX_VERIFY_REVIEW_HISTORY=1 CHOREX_VERIFY_FULFILLMENT=1 pnpm emulators:verify:record-task-completion
pnpm --filter @chorex/parent exec expo export --platform ios --output-dir /tmp/chorex-permission-parent-export
pnpm --filter @chorex/child exec expo export --platform ios --output-dir /tmp/chorex-permission-child-export
```

Existing live emulator data was preserved. Isolated automated configuration uses Auth 19099, Firestore 18080, Functions 15001, hub 14400/logging 14500/UI disabled. Its Functions source must be relative to the temporary configuration directory. Set `FUNCTIONS_EMULATOR_HOST=127.0.0.1:15001` explicitly for harnesses whose normal default is 5001. An initial mismatch produced CHILD_MEMBERSHIP_REQUIRED because membership and callable were routed to different local databases; no domain-code fix was made. Receipt-only verification excludes Functions triggers to avoid competition for deterministic fixture event leases.

## Initial deferred real Expo verification — original environment boundary

At the original Slice 3 verification, `EXPO_PUBLIC_PARENT_EAS_PROJECT_ID` and `EXPO_PUBLIC_CHILD_EAS_PROJECT_ID` were intentionally unavailable. The later user-authorized native configuration verification is recorded below. Per the user's explicit instruction, no Expo/EAS project was created/configured, no ID was fabricated and no environment variable was changed.

Only **real native `getExpoPushTokenAsync({ projectId })` → real Expo token → physical Expo/APNs delivery** is deferred until the existing real project IDs/configuration are supplied. This is not a functional failure of the implemented permission/installation/device lifecycle. Deterministic test dependencies cover the complete lifecycle and token replacement independently. No physical delivery or live Expo acquisition is claimed. Native provisional/ephemeral branches and Android behavior are covered by deterministic permission dependencies; no physical Android verification is claimed. SDK permission semantics follow the existing [Expo Notifications documentation](https://docs.expo.dev/versions/latest/sdk/notifications/).

## 16–18. OPEN-014 and remaining Phase 5 work

OPEN-014 remains unresolved. Push-registration removal or receipt disable does not revoke a Child Auth session or invalidate Firebase refresh tokens. OPEN-010 and OPEN-011 are unchanged. No device management, reminder category, reminder scheduler, auction, analytics, custom persistence or generic offline queue was added.

Phase 5 is not complete. The remaining implementation deliverables are deadline reminders, pending-Reward reminders and their minimal preference/opt-in controls. After completing the remaining native Slice 3 validation, the **next safe implementation slice is those reminders and minimal preference controls**, reusing committed events, existing dispatcher/receipt protection and validated routing. Production physical-delivery verification remains separately deferred as described above. Native Slice 3 acceptance observations remain in progress until the simulator verification can be completed.

## Follow-up: native notification configuration and registration (2026-10-06)

The user supplied existing real EAS project IDs in each app's local environment and explicitly authorized continuing with those IDs and native rebuilds. No project was created, no ID was fabricated, and no commit, push or deployment was performed. Both app configs read their own environment variable; IDs are not hardcoded.

Three concrete causes were traced:

1. The installed native builds exposed neither `Constants.easConfig.projectId` nor `Constants.expoConfig.extra.eas.projectId`. Restarting Metro alone did not update the embedded native configuration. Rebuilding refreshed both values.
2. The existing generated iOS entitlements were empty. Actual `getDevicePushTokenAsync()` failed with `ERR_UNEXPECTED`: `no valid “aps-environment” entitlement string found for application`. Running the existing Expo Notifications config plugin through prebuild generated `aps-environment: development`; rebuilding then allowed real native token acquisition.
3. iOS token acquisition emits the native token listener even for an unchanged token. The registration hook treated every such event as a replacement and repeatedly restarted registration. The smallest shared fix compares consecutive token events only in process memory. Identical events are ignored; changed tokens and foreground reconciliation still work. No token is logged or persisted by this comparison.

Reproducible procedure with existing local environment files and Metro on Parent 8081 / Child 8082:

```sh
pnpm --filter @chorex/parent exec expo prebuild --platform ios --no-install
pnpm --filter @chorex/child exec expo prebuild --platform ios --no-install
pnpm --filter @chorex/parent exec expo run:ios --device <simulator-uuid> --no-bundler
pnpm --filter @chorex/child exec expo run:ios --device <simulator-uuid> --no-bundler
xcrun simctl openurl <simulator-uuid> 'chorex-child://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082'
```

Run native builds sequentially: concurrent builds initially conflicted in the shared Expo Modules JSI derived-data directory. The final sequential builds both succeeded. Child must be explicitly connected to its own Metro port because `run:ios --no-bundler` defaults to 8081.

Observed on the existing iPhone 17 Pro iOS simulator with preserved authenticated sessions and already-granted permission: both native SDK token acquisitions succeeded; both runtimes exposed their existing EAS project configuration; both actual registration hooks settled to `registered` with `errorCode: null`. This status is published only after real Expo token acquisition and the authenticated Firestore device write resolve. Diagnostic output contained only configuration/token-presence booleans and lifecycle status, never token values. No deterministic token double was used for this follow-up.

Follow-up validation: **369 passing tests** (Functions 175, shared notifications 50, Child 76, Parent 68), whole-workspace typecheck and lint passed. The new focused hook regression proves repeated identical acquisition events stop, while a changed token still registers. Both native iOS builds passed; formatting checks were rerun after documentation changes. Earlier isolated emulator regressions above remain applicable; this follow-up changed no Rules or domain command semantics.

Real native acquisition and successful device registration are now verified. **Physical Expo/APNs delivery remains unverified.** The earlier native UI permission/dialog/Settings acceptance observations remain incomplete because computer-use infrastructure could not bind the Simulator window; runtime inspection does not substitute for those UI observations. Full Slice 3 native acceptance and Phase 5 completion are therefore still not claimed.
