# Phase 7 Slice 3 — Crashlytics and client error observability

Acceptance date: 2026-10-09. Implementation and automated validation: **PASS**. Native SDK initialization and controlled non-fatal invocation: **PASS for both apps**. Console receipt of the controlled iOS non-fatal: **PASS for both apps**. Fatal delivery and production symbolication: **PARTIAL / UNVERIFIED before release**.

ADR-049 adopts Firebase Crashlytics in both mobile apps. OPEN-007 is resolved **only for crash reporting**; product analytics/vendor/event taxonomy remain OPEN / DEFERRED. No Analytics dependency, screen-view/tap events, behavioral tracking, session replay or performance monitoring was added.

## Integration and collection policy

`@react-native-firebase/crashlytics` **26.4.0** matches the installed App/Auth/Firestore/Functions/App Check modules. Its installed modular API, JS handlers, native initialization and Expo plugin were inspected. The shared adapter lives in `packages/firebase-client`, with a pure policy/reporter core and lazy fail-soft SDK load. Each app's canonical `configureFirebase` starts observability once, without awaiting it or obtaining an App Check token. The process registry prevents repeated SDK setup through renders/Fast Refresh. Missing SDK/configuration produces only a stable diagnostic warning and does not prevent normal startup.

Both app configs include the official Crashlytics Expo plugin and the shared policy plugin. Prebuild generates an ignored app-root `firebase.json` consumed by RN Firebase native build scripts; the repository-root Firebase CLI configuration is separate. The generated files contain booleans, not credentials. The plugin verifies iOS BUNDLE_ID or Android package registration against the app variant and checks the native Firebase project ID. Development/validation must use chorex-dev; production must match the configured production project and rejects chorex-dev. ADR-048 runtime guards remain in place. Both app configs expose matching non-sensitive policy metadata for runtime; a metadata mismatch requests SDK collection OFF, skips reporter attachment, clears unsent reports and emits a stable warning. In this installed iOS SDK, the setter persists RNFB preferences; native Firebase collection is configured on cold startup. A runtime request alone is not an immediate native collection kill switch, so correct native flags and a cold restart/rebuild are required.

| Build/environment                  | Collection                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Local/emulator/development/preview | OFF by default, including local release JS exports                                                             |
| Automated tests                    | OFF; focused production-path tests use a mocked SDK                                                            |
| Dedicated development validation   | Explicit `EXPO_PUBLIC_CRASHLYTICS_VALIDATION=true`; native rebuild required, development Firebase project only |
| Production Firebase mode           | ON in release; ADR-048 requires separate project/native files and rejects development JS/emulator endpoints    |

A production EAS profile rejects missing/non-production Firebase mode. Production rejects validation opt-in. There are no checked-in EAS build profiles or production native identities in this repository; release operators must supply the existing per-app native Firebase file paths and expected production project ID. Do not inherit `.env.local` into release builds. Native flags set JS error generation ON and exception-handler chaining OFF to avoid duplicate fatal reports. Collection decisions happen natively before React mounts and are mirrored at runtime. Rebuild after changing policy; SDK overrides can persist across installs, so remove validation opt-in and reinstall a normal development binary after a validation session. Production/native metadata and sticky-setting behavior still require real release verification. The adapter returns enabled/disabled/unavailable for validation. An enabled policy with a persisted native OFF override is treated as unavailable until a cold restart, because the SDK’s global JS handler captures the native collection state during construction.

## Privacy and reporting rules

No application-level user ID is set: no Firebase/Child/Parent UID, family ID, email, hash or pseudonym. SDK installation/session identifiers remain SDK-managed. There is no new consent flow or user-facing toggle; privacy/store disclosures and any later legal collection requirements remain a release gate, with one central policy available for adjustment.

Allowed custom attributes are appVariant, appVersion, buildVersion, platform, environment, authenticated boolean and routeCategory. Operations and report codes come from fixed allowlists. Context reconstruction rejects additional keys. Route categories carry no path or entity identifier; auth context is a boolean, not a UID. Breadcrumbs are sparse fixed bootstrap/auth-state transitions, not tap or screen-view tracking.

**Prohibited custom data:** Child/Parent/family names, emails, Offer/task/Reward titles or descriptions, review notes, free text, Auth/App Check/push tokens, pairing codes/tokens/session IDs, request payloads, credentials, proof-media URLs, raw Firestore documents, family/offer/contract/reward/user IDs. The adapter is not a general log sink.

Expected domain/business/auth/permission/offline/stale-state/cancellation outcomes stay in normal UX. Examples include STALE_REVISION, ALREADY_ACCEPTED, wrong role, incomplete tasks, invalid credentials, normal pairing rejection, denied push permission and stale entity navigation. Only allowlisted unexpected normalized failures or malformed/invariant data qualify. Raw SDK messages/backend responses are never appended. Non-fatal reports use a categorical Error; only safe function names/frame coordinates are retained with a neutral `app.js` filename, stripping original messages, file paths/URLs and arbitrary properties. A zero-coordinate fallback frame is used when no safe original frame exists. This deliberately limits diagnostic detail. Reports are deduplicated by error identity and operation/code category, with a maximum of 32 categories per JS process; repeated listener storms are suppressed.

Automatic SDK native/uncaught JS crash reports still contain SDK-generated messages/stacks and SDK-managed data. This policy minimizes application-supplied diagnostics; it is not a claim that every automatic SDK field is sanitized. Application errors must never embed user content or tokens, and representative received reports need privacy inspection before release.

## Error boundaries and integration points

Both Expo Router roots export a boundary using the shared ClientErrorFallback. It hides raw error text, reports the caught render exception once and preserves Try again recovery. Caught boundary errors are **non-fatal**, not mislabeled native fatal crashes. ChoreX installs no additional ErrorUtils/global/native handler; RN Firebase owns uncaught JS/native crash capture. SDK unhandled-rejection behavior remains SDK-owned.

Non-fatal hooks are at shared service boundaries:

- Unexpected Firebase/App Check bootstrap failure, sanitized to FIREBASE_BOOTSTRAP_FAILED.
- Unknown auth/session initialization and sign-in infrastructure failures; normal auth outcomes retain their existing mappings.
- Family/profile schema failures, malformed Offer inbox data and unexpected Contract/Reward read failures.
- Unknown callable/output-schema/invariant failures with allowlisted operation names, including pre-auth pairing redemption; no input/token/response content.
- Unexpected push-registration infrastructure errors before normal UX normalization, excluding handled permission/config/auth cases and known offline provider codes.
- Unexpected notification navigation exceptions; stale/missing entities and unsupported external payloads remain normal routing handling, without payload logging.

Existing user-visible stable codes and server/domain behavior are unchanged. No instrumentation was added to every screen/catch. The touched client logging audit found only the existing bounded emulator-routing info message; new warnings/breadcrumbs are fixed strings. No token/user-content logging was added. No backend changes or App Check enforcement changes were made.

## Validation evidence

| Check                                                       | Result                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Focused shared adapter + both canonical app bootstrap paths | PASS — 8 tests                                                                           |
| Parent full UI/adapter suite                                | PASS — 14 suites, 90 tests                                                               |
| Child full UI/adapter suite                                 | PASS — 10 suites, 80 tests                                                               |
| Existing config policy suite                                | PASS — 5 tests                                                                           |
| Notifications package                                       | PASS — 53 tests                                                                          |
| Workspace typecheck/lint/format                             | PASS                                                                                     |
| Both iOS bundle exports                                     | PASS — final exports include source maps; native delivery is a separate gate             |
| Both local iOS prebuilds/pod integration                    | PASS — linked Crashlytics; both native builds and controlled non-fatal attempts observed |

The eight tests cover disabled defaults/test cleanup, release/validation configuration guards, mismatched native policy and sticky native OFF handling, Parent/Child categorical context without user ID, init caching/non-blocking bootstrap, expected versus unknown failures, privacy sanitization/deduplication, fail-soft transport and boundary retry without exposing private messages. Existing tests were reused rather than adding a large telemetry suite. Functions code did not change; no Functions test/build run was required.

### Native and Console status

Parent iOS Debug build succeeded on iPhone 17 Pro / iOS 26.5 simulator. A temporary route confirmed native SDK initialization, collection ON in dedicated validation mode and invocation of a fixed-content non-fatal through the shared adapter. Evidence: `docs/design/phase-7-slice-3/parent-crashlytics-validation.png`. Child iOS Debug build also succeeded on the same simulator; its temporary route confirmed SDK initialization, collection ON and the controlled adapter non-fatal invocation. Evidence: `docs/design/phase-7-slice-3/child-crashlytics-validation.png`. Neither SDK invocation proves Console receipt. Both routes and bootstrap overrides were removed, dedicated Metro validation sessions stopped, and ordinary development OFF policy restored. Final Parent and Child OFF builds succeeded and were reinstalled. Each built Info.plist has FirebaseCrashlyticsCollectionEnabled=false and embedded auto_collection/debug flags false; both apps persisted collection=false after normal startup and a cold restart. Build the generated xcworkspace with Pods/SPM dependencies: a standalone Child app-target build compiled but failed default Firebase registration and was discarded; the complete workspace build restored normal startup. No fatal native or uncaught JS crash was triggered; these remain release validation gates. No ordinary development workflow was intentionally crashed. No permanent crash/test button or validation route ships.

The initial automatic approval-review block was resolved by the user's explicit authorization to view chorex-dev. On 2026-10-09 the Firebase Console was inspected read-only for the correct iOS app registrations, with the default Crashes-only filter removed. Both dashboards showed the controlled `bootstrap:FIREBASE_BOOTSTRAP_FAILED` issue as **one non-fatal event** in app version **0.0.0 (1)**:

| App                                            | Console event timestamp (Europe/Ljubljana) | Controlled non-fatal receipt |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------- |
| Parent iOS Dev (`dev.chorex.bootstrap.parent`) | 2026-10-09 08:36:34                        | PASS                         |
| Child iOS Dev (`dev.chorex.bootstrap.child`)   | 2026-10-09 08:40:57                        | PASS                         |

Both inspected events had custom keys appVariant=PARENT/CHILD, appVersion=0.0.0, authenticated=true, buildVersion=unknown, environment=validation, platform=ios and routeCategory=HOME. No prohibited application identifiers/content appeared in these custom keys. The native event build number was 1; verify populated custom buildVersion metadata in the production build. This inspection does not certify every automatic SDK field or every future report. Parent's displayed stack retained neutral app.js coordinates and an <unknown> issue heading; delivery is verified, full frame reconstruction/symbolication is not.

Each iOS dashboard also listed one categorical pushRegistration:PUSH_REGISTRATION_FAILED non-fatal; its underlying cause was not investigated in this read-only receipt check. No issue state, project configuration, alert channel or collection setting was changed. Android delivery was not validated. Fatal native/JS receipt remains UNVERIFIED because no fatal test was triggered.

The reused DerivedData contained a stale SPM FBLPromises framework with a duplicate bundle identifier; that obsolete generated wrapper was removed from the shared PackageFrameworks cache and app bundles to permit installation. No SDK or application source workaround was required.

## Source maps, symbols and release checklist

The shared plugin supplies the root-level GoogleService-Info.plist required by the installed SPM uploader and generates app dSYMs in Debug and Release. The installed RN Firebase CocoaPods integration adds its Crashlytics configuration/upload phase; for SPM Firebase dependencies its script locates `firebase-ios-sdk/Crashlytics/upload-symbols`. EAS/Xcode release archives must produce dSYMs, preserve them per variant/version/build, and run the upload phase against that app's GoogleService-Info.plist. Verify upload logs and clear Missing dSYM warnings; check Xcode script input requirements if sandboxing is enabled. The automatic upload stalled in the local network phase. Debug now uses the official uploader’s `--validate` mode for local symbol/configuration checks without remote upload; Release retains the SDK’s original upload script. Debug dSYMs therefore still need manual upload before symbolication validation. No production archive or symbols were uploaded in this task. [Firebase iOS symbol guidance](https://firebase.google.com/docs/crashlytics/ios/get-deobfuscated-reports).

The Android Expo plugin adds the Crashlytics Gradle dependency/plugin. Release R8 mappings and any native/NDK symbols require their supported Gradle upload path and receipt checks; no Android build/symbol upload is claimed. Review nativeSymbolUploadEnabled and native-library inputs before Android release.

RN Firebase converts JS stacks to native exception frames. The repository has no verified automatic Hermes/Metro source-map upload/reconstruction path for Crashlytics. Preserve the exact release bundle, Hermes-compatible source map, app/build/version and commit together; use those artifacts for manual reconstruction and verify it against a known test frame. Sanitized non-fatal frames use neutral app.js coordinates; fatal frames remain SDK-owned. Native dSYM success is not proof of JS symbolication. OTA/EAS Update compatibility is not introduced here. [RN Firebase SDK integration](https://rnfirebase.io/crashlytics/usage).

Before release, for **each variant**:

1. Use a dedicated development validation build with explicit opt-in and matching non-production native Firebase registration. Do not point it at production data. Install/rebuild and verify context/collection.
2. Temporarily invoke one fixed-content non-fatal via the shared adapter. Record SDK attempt separately from Console receipt. Restart if required for upload, allow processing time, and inspect the correct Firebase app's Non-fatal issues and custom keys for prohibited content.
3. In that disposable validation workflow, temporarily trigger the SDK's controlled native crash without an attached debugger. Relaunch and verify a Fatal issue under the correct app, with readable native frames. Remove all validation code afterward.
4. Validate an uncaught JS failure and readable frame reconstruction in a release-like non-production binary where current bootstrap policy permits; an Expo dev-client overlay can intercept JS errors. ADR-048 currently rejects emulator mode in release JS, so a separate production-like project/build configuration is required rather than weakening its guard.
5. Restore collection OFF for ordinary development, rebuild/reinstall, and verify no validation UI or flag remains. Confirm production collection is ON with the intended project, bundle identity and native symbol setup.
6. Complete privacy/store-disclosure review and inspect actual SDK-generated reports before public release.

## Dashboard and alerts baseline

Use each app's Crashlytics dashboard with app/version/build/environment filters to triage fatal and non-fatal issues, new/regressed status, affected versions and crash-free users/sessions. No product analytics dashboard or third-party service was configured. No dashboard screenshot/receipt is claimed without an observed Console result.

Recommended minimum: select the new-fatal email channel and increasing-velocity Console alerts; review regressed/trending issues and decide whether new non-fatal email alerts would create noise. Firebase Console alerts support regressed and increasing-velocity issues, while email supports all default issue types. Regressed/trending alerts are default; new fatal/non-fatal and velocity alerts require channel selection. Operators must verify Settings → Alerts for their account/project. No Slack/PagerDuty/email integration or external message was configured. [Firebase alert options](https://firebase.google.com/docs/crashlytics/alerts).

## Carry-forward and next slice

Accessibility native acceptance remains PARTIAL: actual VoiceOver traversal is required and the Accessibility Inspector SwiftUI label warning remains unresolved/reviewable. Phase 5 remains PARTIAL: first OS permission dialog, successful online reminder-preference save, successful sign-out and physical Expo/APNs delivery remain outstanding. Crashlytics does not close any of these items. App Check production attestation/enforcement gates remain independent; enforcement stays OFF.

Recommended next Phase 7 work is privacy/account-lifecycle/store-disclosure planning, including crash-report disclosures and deletion requirements, before implementing a consent/privacy UI. OPEN-006/008/010/011/014 remain unchanged. No commit, push or deployment was performed.
