# ChoreX Codex Starter Pack

This pack is the initial technical specification for **ChoreX**, a family chore-and-reward product with two mobile applications: a **Parent app** and a **Child app**.

The architecture intentionally optimizes for:

- React/TypeScript development assisted by Codex;
- separate iOS/Android app identities for parent and child experiences;
- a shared domain model and shared implementation packages;
- reliable push notifications;
- Firebase-backed realtime data and native offline persistence;
- strict server-authoritative state transitions;
- a clean path from MVP to auctions, repeated chores, proof media, and a marketing website.

## Recommended stack

| Area                 | Choice                                   |
| -------------------- | ---------------------------------------- |
| Mobile               | React Native + Expo                      |
| Language             | TypeScript, strict mode                  |
| Navigation           | Expo Router                              |
| UI                   | NativeWind + shared design tokens        |
| Local UI state       | Zustand                                  |
| Forms                | React Hook Form + Zod                    |
| Firebase mobile SDK  | React Native Firebase                    |
| Database             | Cloud Firestore                          |
| Authentication       | Firebase Authentication                  |
| Server logic         | Cloud Functions for Firebase, 2nd gen    |
| Push notifications   | `expo-notifications` + Expo Push Service |
| Native builds        | EAS Build / EAS Submit                   |
| Secure local values  | Expo SecureStore                         |
| Crash reporting      | Firebase Crashlytics                     |
| Unit/component tests | Jest + React Native Testing Library      |
| E2E later            | Deferred — OPEN-008                      |
| Package manager      | pnpm workspaces                          |
| Website later        | Next.js + Tailwind CSS                   |

### End-to-end testing

The E2E framework is intentionally not selected yet.

Do not install Maestro, Detox, or another E2E framework during Phase 0.
See `DECISIONS.md` → `OPEN-008`.

## Documents

1. `00_PROJECT_OVERVIEW.md` - product boundary and MVP principles.
2. `01_TECHNICAL_ARCHITECTURE.md` - system architecture, monorepo, environments, dependencies, and development rules.
3. `02_DOMAIN_MODEL.md` - core entities, invariants, TypeScript model sketches, and terminology.
4. `03_STATE_MACHINES.md` - offer negotiation, contract execution, auction, and reward state machines.
5. `04_FIRESTORE_SCHEMA.md` - collections, document shapes, indexes, transactions, and data ownership.
6. `05_AUTH_AND_SECURITY.md` - parent/child sign-in, pairing, Firestore/Storage security, App Check, privacy, and threat model.
7. `06_PUSH_NOTIFICATIONS.md` - token registration, event-to-notification mapping, routing, receipts, reminders, and deep links.
8. `07_IMPLEMENTATION_ROADMAP.md` - recommended Codex build sequence and acceptance gates.
9. `AGENTS.md` - repository-level instructions for Codex and other coding agents.

## Architectural rule of thumb

Clients render state and request actions. **Cloud Functions own business transitions.** A child or parent app must not directly set authoritative lifecycle fields such as contract status, winner, reward status, family role, or pairing state.

## Current external constraints verified against official documentation

- Expo push notifications require a development build rather than Expo Go for remote push capabilities.
- Expo supports React Native Firebase through development builds/config plugins; React Native Firebase cannot run inside Expo Go.
- Android/Apple Firestore native SDKs support offline persistence, enabled by default.
- Firebase callable functions automatically include available Firebase Authentication and App Check tokens and validate auth tokens.
- Firebase Admin/server SDKs bypass Firestore Security Rules, so authorization must also be enforced inside server code.

See the References section in `01_TECHNICAL_ARCHITECTURE.md`.

## Local Phase 0 bootstrap

Use Node `22.21.1` from `.nvmrc` and the pinned `pnpm@12.8.1`.
From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

All nine TypeScript workspaces inherit strict settings from
`@chorex/config/tsconfig.base.json`. Both apps typecheck an import of the empty
`@chorex/domain` public entry point and render `AppPlaceholder` from `@chorex/ui`.
Each app has a React Native Testing Library smoke test for that runtime boundary.
Existing package test scripts retain their explicit no-tests allowance; the shared
UI is exercised by the app tests. The only added automated check is the emulator
security verification.

The compatible dependency baseline is Expo `57.0.26`, Expo Router `57.0.24`,
React `19.2.3`, React Native `0.86.3`, NativeWind `4.2.7`, and TypeScript `6.0.3`.
Native modules follow Expo's bundled dependency map. NativeWind uses its documented
Babel/Metro integration and Tailwind CSS 3; the generated JSX runtime is explicitly
declared in each consuming workspace. React and React Native are peers of shared UI.
See the [Expo compatibility table](https://docs.expo.dev/versions/latest/),
[Expo monorepo guide](https://docs.expo.dev/guides/monorepos/), and
[NativeWind installation guide](https://www.nativewind.dev/docs/getting-started/installation).
The narrowly scoped `unrs-resolver` build-script permission supports the lint
resolver under pnpm 12; workspace globs are unchanged.

Start the apps in separate terminals:

```sh
pnpm start:parent
pnpm start:child
```

Alternatively, run `pnpm exec expo start --dev-client --port 8081` in
`apps/parent` and the same command with `--port 8082` in `apps/child`.
Metro requires an installed native development client to open the app.
Expo Go is not the development workflow. A local native build requires a suitable
Xcode/iOS Simulator toolchain or Android SDK/device/emulator; once available,
`pnpm exec expo run:ios` or `pnpm exec expo run:android` in each app builds its
configured development client. Generated `ios/`, `android/`, `.expo/`, and `dist/`
outputs are excluded from Git.

For real Expo push registration, set the existing project IDs in each app's
`.env.local`: `EXPO_PUBLIC_PARENT_EAS_PROJECT_ID` for Parent and
`EXPO_PUBLIC_CHILD_EAS_PROJECT_ID` for Child. Both `app.config.ts` files read
these values into `extra.eas.projectId`. After adding/changing native notification
configuration, run `pnpm exec expo prebuild --platform ios` and
`pnpm exec expo run:ios` from each app directory, **one app at a time**. Restarting
Metro alone does not refresh an installed binary's embedded Expo configuration.
The existing `expo-notifications` plugin adds the development `aps-environment`
entitlement during prebuild; its absence causes native APNs token acquisition to
fail. With existing Metro servers, use `--no-bundler` for the build and open
Child against port 8082 afterward (the CLI's no-bundler launch defaults to 8081).

Temporary local-development identities (not production identifiers):

| App    | Name          | Slug / scheme | iOS bundle ID / Android package |
| ------ | ------------- | ------------- | ------------------------------- |
| Parent | ChoreX Parent | chorex-parent | dev.chorex.bootstrap.parent     |
| Child  | ChoreX Child  | chorex-child  | dev.chorex.bootstrap.child      |

For each app, compatibility and bundle checks run from its own directory:

```sh
pnpm exec expo install --check
pnpm dlx expo-doctor
pnpm exec expo config --type public
pnpm exec expo export --platform ios --output-dir dist/ios
pnpm exec expo export --platform android --output-dir dist/android
```

## Firebase development infrastructure

Both native clients include React Native Firebase App, Auth, Firestore, and Functions `26.4.0`. The dev-only Firebase client files live in each app's `firebase/dev/` directory and identify `chorex-dev`; they are client configuration, not Admin credentials. Original reference files remain untouched. App identities remain as listed above.

Copy `.env.example` to `apps/parent/.env.local` and `apps/child/.env.local`. All five values are required. iOS Simulator uses `127.0.0.1`; Android Emulator uses `10.0.2.2`. Physical devices require your machine's private LAN IPv4 address and deliberate LAN emulator bindings as described in `firebase/README.md`. Restart Metro after environment changes and restart the native client after emulator configuration changes. Missing/invalid configuration fails closed.

Install Java 21+ and select it through `JAVA_HOME`. Then:

```sh
pnpm functions:build
pnpm emulators:start
# In another terminal, after stopping the interactive suite:
pnpm emulators:verify
```

Ports: Auth 9099, Firestore 8080, Functions 5001, UI 4000, hub 4400, logging 4500.

The emulator UI is at `http://127.0.0.1:4000`. All checked-in bindings are loopback. The verification command starts/stops its own suite and checks denial of authenticated and unauthenticated reads/writes. No deploy or Firebase provisioning is performed.

Native Firebase requires rebuilding both development clients. From each app directory, run `pnpm exec expo prebuild --platform ios` then `pnpm exec expo run:ios`. Firebase 26 uses Swift Package Manager with dynamic frameworks through `expo-build-properties`; see the [React Native Firebase Expo setup](https://rnfirebase.io/). Firestore and Functions need no additional config plugins. Android native build remains separate from Android JavaScript export.

The app root initializes emulator routing before rendering. Fast Refresh reuses initialized services; a changed configuration or partial setup failure requires a full client restart. Placeholder screens still exercise shared UI only. No product authentication, reads, mutations, Storage, notifications, analytics, or production configuration is added. Functions compiles an empty entry point and Firestore denies all client access.

The scoped pnpm policy permits `unrs-resolver` and disables `@firebase/util` and `protobufjs` install scripts, which are unnecessary for this explicit emulator configuration. Workspace globs are unchanged.

Phase 0 is not complete. The first successful CI run and final foundation acceptance review remain necessary. OPEN-008 through OPEN-014 remain unresolved.

Manual native checklist for this infrastructure boundary:

- Start the full emulator suite, then launch each rebuilt client with explicit simulator settings; confirm the setup-ready log and unchanged placeholder.
- Trigger Fast Refresh; confirm setup remains usable without duplicate emulator-setup errors.
- Restart with a missing mode, non-emulator mode, invalid host, or invalid port; confirm a configuration error before services are returned. Restore `.env.local` and restart.
- Emulator unavailability must not switch to live services. This initialization configures routing; it does not perform application requests or assert server readiness.
- Android Emulator (`10.0.2.2`) and physical-device LAN routing require their own native device checks; JavaScript export alone does not verify them.

Validation on this machine for this slice:

- Node 22.21.1 / pnpm 12.8.1; normal and frozen installs, formatting, lint, strict typechecks, existing tests, Functions compilation, and peer checks passed.
- Both apps passed Expo compatibility checks and Doctor (21/21), public config checks, and iOS/Android JavaScript exports.
- Both native iOS builds launched with the four Firebase modules, logged emulator routing for `chorex-dev`, and rendered their unchanged placeholders. Child also survived Fast Refresh/module re-evaluation and rejected a temporary missing-mode input; all temporary source probes were restored.
- Auth, Functions, and UI readiness passed on loopback. Functions discovered zero exports intentionally. Native clients launched while these emulators were running, with Firestore routing configured but its server unavailable.
- Full-suite startup and `emulators:verify` failed at the prerequisite check: only Java 20 and Java 8 are installed, while this CLI requires Java 21+. Firestore readiness and the deny-all check remain unverified until Java 21+ is selected through `JAVA_HOME`.
- Android native and physical-device host routing remain unverified (`adb` is unavailable). Native builds emitted upstream build-script/optional RNFirebase config warnings; both builds succeeded without generated-source patches.
- Task-owned servers were stopped; a pre-existing Child Metro server was preserved. No cloud deployment or provisioning was performed.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. One Ubuntu 24.04 job uses Node from `.nvmrc`, pnpm from `package.json`'s `packageManager`, and Temurin Java 21. It caches only the pnpm dependency store using `pnpm-lock.yaml`, installs with `--frozen-lockfile`, and runs formatting, lint, strict typechecks, existing tests, and `pnpm emulators:verify` (including the Functions build). Failures fail the job; superseded runs are cancelled and the job has a 20-minute timeout.

CI uses read-only repository permission and requires no Firebase credentials or custom secrets. The existing emulator verification command owns startup/shutdown and retains its project/endpoint guards. CI does not deploy, provision cloud resources, or build native binaries.

Workflow prepared and locally validated; first GitHub Actions run pending push. Phase 0 still requires that successful remote run and the final acceptance review.
