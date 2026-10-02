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
Skeleton packages and Functions explicitly permit no tests while they have no
behavior; the shared UI is exercised by the app tests.

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

This slice establishes independent routes, development-client configuration,
canonical workspace skeletons, minimal shared UI/NativeWind, and local checks.
JavaScript export and Metro startup are separate checks from native build/launch.
The current machine has Command Line Tools but no `simctl` or `adb`, so native
launch remains unverified.

Phase 0 is not complete: Firebase dev-project wiring, emulator setup, CI checks,
and verified native development-build launches remain. No Firebase SDKs,
credentials, deployment configuration, domain behavior, or E2E framework are added.
OPEN-008 through OPEN-014 remain unresolved and must not be inferred from skeletons.
