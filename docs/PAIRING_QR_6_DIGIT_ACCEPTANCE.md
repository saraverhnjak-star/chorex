# Pairing UX Hardening — QR + 6-Digit Fallback

Date: 2026-10-12. Status: implemented; native device verification pending.

## Scope and authority

ADR-052 supersedes ADR-039/040 credential presentation and retry/throttling details. Security Model section 10 and Firestore Schema section 13 are updated in the same change. Parent-created Child identity, membership authorization, Firebase custom-token sign-in, deletion fences and App Check bootstrap/staged enforcement are preserved. OPEN-014 is unchanged. No commit, push or deployment was performed.

## Delivered behavior

Parent Pair device presents a local QR prominently, a grouped six-digit fallback (`482 731`), existing locale expiry, and the existing regenerate action. The QR contains only the random 128-bit base64url token. Credentials remain component memory only and are returned once; creation replay returns session/expiry without secrets. Regeneration invalidates prior active sessions for that Child.

Child pairing offers Scan QR code first and Enter code manually second. Camera permission is requested only on explicit scan. Denial, permanent denial, camera initialization error and permission API failure retain usable manual input; permanent denial also offers Open Settings. Manual input strips non-digits, preserves leading zeros and displays six digits grouped in threes. Scanner accepts only the opaque-token schema, with no URL/name/family parsing. In-flight callbacks are guarded; failures retain the original credential/idempotency key for safe retry. All new screen strings have English, Slovenian, Croatian and German coverage.

## Security and storage

Both credentials address one session and one atomic consumption/event. QR hashes use SHA-256; numeric hashes use domain-separated HMAC-SHA-256 with the existing server secret. No plaintext token/code is stored in session, creation idempotency, rate-limit or activity records. Neither credential is logged. Numeric hashes are checked for collisions before creation and fail closed. The secret is now bound to creation as well as redemption; deployment configuration must provide it, without embedding it in client settings.

Expiry is exactly ten minutes. Same-key retry is allowed only with the original credential and before expiry. Redeeming the alternate credential, including with the original key, fails immediately after consumption. Concurrent QR/numeric attempts serialize; one succeeds. QR limits remain 20 requests / 10 failures per source per ten-minute fixed window; matched-session failures are also capped at ten. Numeric/manual-looking input additionally has five requests / three failures per source per ten minutes, three matched-session failures and a global rolling minute capped at 30 requests / five failures. Global cooldown addresses distributed guessing, with an explicit availability tradeoff; it does not block QR traffic. Server source keys remain HMAC-derived, not raw IPs. Firestore client permissions and App Check enforcement settings are unchanged.

## Dependencies and native implications

Child adds Expo-compatible `expo-camera` 57.0.6, with QR-only scanning, camera usage copy, disabled microphone permission and disabled Android audio recording. Parent adds local `react-native-qrcode-svg` 6.3.26 and `react-native-svg` 15.15.5. No remote QR service receives secrets. Rebuild/reinstall both native clients (Child camera and Parent SVG); bundle export is not native runtime proof. Camera usage-description localization at OS level should be checked during store/native localization review.

## Verification

- Functions build/typecheck and full unit suite executed: 195 passed, one emulator-only test skipped; new emulator test is skipped by the ordinary suite unless an emulator is present.
- Dedicated `functions/tests/pairing-qr.test.mjs` runs against an isolated local Firestore emulator: QR and numeric happy paths, credential/key retry binding, mutual invalidation, replay, expiry, regeneration, creation replay without credentials, wrong-role/wrong-family denial, hashed storage, leading-zero schema, per-source failure cap, global cooldown reset, session cap and concurrent redemption.
- Child `pairing-entry.test.tsx`: explicit permission, denied manual fallback, grouped code, opaque QR validation and duplicate callback guard.
- Parent `bootstrap.test.tsx`: creation/pairing UI and fallback display (nine tests).
- Child bootstrap pairing/auth flow exercised but its full test still fails later on the pre-existing expectation of an inline “Make a counteroffer” heading after navigation to the separate counteroffer screen. This is unrelated to pairing and is not reported as passed.
- Functions, Parent, Child and shared UI typecheck/lint executed. Existing Parent duplicate-import lint warnings predate this milestone; no lint errors.
- Parent and Child iOS exports succeeded to `/tmp/chorex-pairing-parent-export` and `/tmp/chorex-pairing-child-export`.
- Changed files formatted with Prettier; final Prettier check passed for all changed source/docs/config files. The generated pnpm lockfile retains package-manager formatting.

The existing create/redeem emulator verifier scripts were extended for code absence/presence and numeric limiter records; the dedicated isolated transaction test is the executed milestone emulator evidence. Existing server-only Rules and authenticated creation boundaries were not relaxed.

## Remaining native verification

On rebuilt binaries verify Parent QR -> Child scan -> authenticated family; regenerate then manual code -> authenticated family; old code/QR denial; expired code; camera denial and Settings recovery; leading-zero entry; large text/VoiceOver; real App Check pre-auth token exchange under the existing policy. Physical scanning, camera permission behavior and release attestation are not claimed from exports or mocked tests. Overall release readiness remains partial under the latest Phase 7 acceptance docs.

## Physical-device emulator transport follow-up (2026-10-14)

A Parent device returned `unauthenticated` before its pairing callable reached the
local emulator, even after sign-in and a successful token refresh. The installed
Firebase iOS SDK 12.19.2 rejects Auth/App Check token attachment over HTTP to a
non-loopback LAN host. The shared Expo native plugin now opts into the SDK's
Debug-only physical-device testing option after Firebase configuration, guarded
by native emulator mode and the `chorex-dev` project. The same configuration is
applied to Child. Release builds omit this code; App Check and server-side
membership, pairing TTL, hashing, replay and rate limits remain unchanged.

Configuration policy tests cover emulator opt-in, production/unknown mode
fail-closed behavior, Debug/project guards and repeated native generation.
Physical QR/manual pairing must be rechecked after installing rebuilt clients.

Validation for this follow-up: all 8 config policy tests passed; Parent, Child
and Firebase client typechecks passed; config/plugin lint passed and Firebase
client lint retained two existing duplicate-import warnings. Both native Debug
iOS builds succeeded using `xcodebuild` with `CODE_SIGNING_ALLOWED=NO` and a
generic iOS destination. These builds were not signed or installed on a device.

## Manual code input follow-up (2026-10-14)

Child manual pairing now uses six digit fields with forward focus on entry,
backward focus on deletion, selected-digit replacement and full-code paste
support, including leading zeroes. Connect remains an explicit action and is
unavailable until all six digits are present. All fields are disabled during
redemption. Individual accessible digit labels are localized in English,
Slovenian, German and Croatian. Pairing credentials and retry keys retain their
existing in-memory lifetime; no authentication or server policy changes.

Parent Pair device now opens a dedicated `/family/pair-device` route from the
selected Child's family card. Only the Child identifier is passed for navigation;
QR and numeric credentials stay in screen memory. The screen starts one initial
session, shows expiry, supports explicit regeneration and provides Back to the
family screen. The family list no longer renders credentials inline.
