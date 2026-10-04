# Phase 1 acceptance review

**Verdict: PASS**

Review date: 2026-10-03. Inspected commit: `78c0d636a3f2ee1d45aed673e39fe3c94ef921c6` (`feat: add authenticated device registration`). Local `HEAD`, `main`, and `origin/main` referenced this commit. The existing untracked acceptance report was the only working-tree item at rerun start.

Scope: Phase 1 deliverables and acceptance gate in `docs/07_IMPLEMENTATION_ROADMAP.md`, interpreted through `AGENTS.md`, the authoritative numbered documents, Accepted ADR-036 through ADR-041, and `docs/PHASE_0_ACCEPTANCE.md`.

## Acceptance evidence

| Criterion | Result | Evidence | Blocks completion? |
| --- | --- | --- | --- |
| Parent registration/sign-in and persisted session | PASS | A disposable Parent account was registered through the rebuilt iOS app against the task-owned Auth emulator. Firebase `observeAuthState` restored the authenticated session after a cold restart. | No |
| Family creation and restart recovery | PASS | The fresh Parent created `Acceptance Family`; after a cold restart the app restored the real Family, Parent name, and child list. `verify-create-family.mjs` also passed atomic persistence, idempotency, projection, and client-rule checks. | No |
| Child profile and Auth identity creation | PASS | The Parent created `Acceptance Child`; the callable created its deterministic server-managed Auth identity and Firestore records. `verify-create-child.mjs` passed projection recovery, record-shape, correct-family reads, wrong-family denial, and denied writes. | No |
| Pairing-session creation and secure redemption | PASS | The Parent created a one-time token and a freshly reinstalled Child app redeemed it successfully. `verify-create-pairing-session.mjs` passed authorization, hashing, exact expiry, retry, replacement invalidation, and secrecy checks. `verify-redeem-pairing-session.mjs` passed redemption, correct custom-token UID, safe retry, expiry/invalidation, replay protection, both IP rate limits, and log-secrecy checks on task-owned emulators with an emulator-only HMAC value. | No |
| Child custom-token sign-in and restart recovery | PASS | Redemption signed the Child app in and opened the real `Acceptance Family` / `Acceptance Child` home. Terminating and cold-launching the Child app restored the same protected home without another pairing operation. | No |
| Correct Parent and Child Family/member reads | PASS | Both homes displayed their persisted names. Rules permit own-profile reads and active-member Family/membership reads; family and child verifiers passed the allowed read paths. | No |
| Cross-family and cross-user denial | PASS | Base, family, child, pairing, and device verifiers passed another-user, another-Family, wrong-family, and server-only collection denial cases. Expected `PERMISSION_DENIED` output represented successful negative assertions. | No |
| Device registration, permission denial, and sign-out cleanup | PASS, with physical delivery unverified | Focused tests passed random installation-ID persistence/reuse, exact registration shape, denial without a write, and account-specific cleanup before Firebase sign-out. `verify-device-registration.mjs` passed owner-only read/write/delete, immutable `createdAt`, shape limits, and cross-user denial. The permission action appears only after Parent setup or Child pairing. | No |
| Core client writes remain denied | PASS | The only client-write exception is the documented, owner-only, shape-restricted device record. Profiles, Families, memberships, activity events, pairing sessions, idempotency records, rate-limit records, and other core documents remain client-write denied. | No |
| Sensitive-value handling | PASS | Pairing plaintext is returned only for the first successful session creation and is absent from Firestore and emulator logs; redemption stores hashes. Raw IPs are neither persisted nor logged; only an HMAC-derived source key is stored. No credential is committed or logged. Full Expo push tokens may be persisted only in owner-protected `/users/{uid}/devices/{installationId}` records, as required by the authoritative schema; static inspection found no push-token logging, error inclusion, or persistence to unrelated documents. | No |

## Phase 1 roadmap gate

| Documented gate | Result | Evidence |
| --- | --- | --- |
| A Parent can create a Family and Child | PASS | Completed in the rebuilt Parent iOS app on fresh task-owned emulator data; backend verifiers independently passed. |
| A fresh Child app installation can pair securely | PASS | The rebuilt Child app was reinstalled, paired through a new one-time token, signed in with the returned custom token, and restored the session after cold restart. |
| The Child can read only the correct Family data | PASS | The manual home showed the expected Child/Family; child and rules verifiers passed correct-family reads and wrong-family denial. |
| Another account cannot access that Family | PASS | Family, child, base, and device rules verifiers passed cross-account and cross-family denial. |

## Verification performed

- Clean Parent and Child iOS builds: PASS with zero Xcode errors. Build output confirmed `ExpoCrypto`, `ExpoNotifications`, and `ExpoSecureStore` were compiled, signed, and embedded in both app binaries.
- Parent and Child cold launch: PASS; neither app reproduced `Cannot find native module 'ExpoCrypto'`.
- Fresh iOS flow: PASS for Parent registration, Family creation, Child creation, pairing-session creation, Child redemption/custom-token sign-in, Child restart, and Parent restart.
- `pnpm format:check`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS (17 tests; no snapshots).
- `pnpm functions:build`: PASS.
- Task-owned Java 21 Auth/Firestore/Functions emulators: PASS. The HMAC value existed only in the emulator process environment; no secret file was created.
- `verify-emulators.mjs`: PASS.
- `verify-create-family.mjs`: PASS.
- `verify-create-child.mjs`: PASS.
- `verify-create-pairing-session.mjs`: PASS.
- `verify-redeem-pairing-session.mjs`: PASS.
- `verify-device-registration.mjs`: PASS.
- Expo Doctor: PASS, 21/21 checks for each app.
- Latest GitHub Actions run remains PASS for exact reviewed SHA `78c0d636a3f2ee1d45aed673e39fe3c94ef921c6`; run `37148868647`: <https://github.com/saraverhnjak-star/chorex/actions/runs/37148868647>.

## Remaining unverified items

- Android native launch, pairing, and restart flow; no Android device or `adb` was available. The Phase 1 gate requires the two app variants and does not separately require both mobile operating systems.
- Physical-device Expo push-token acquisition and delivery. Neither app has a local EAS project ID configured, and no physical-device evidence was available. Permission-denial behavior and device-record security are verified independently.
- Live Firebase connectivity and deployment, which remain outside this local/emulator Phase 1 acceptance review.

## Blockers

None. Every documented Phase 1 acceptance gate has supporting implementation, automated, emulator, and available iOS runtime evidence.

Phase 1 is complete for the reviewed commit. Only this acceptance report changed in tracked scope; generated native projects remained gitignored. No feature, test, dependency, source configuration, workflow, or authoritative documentation file was changed, and no commit, push, or deployment was performed.
