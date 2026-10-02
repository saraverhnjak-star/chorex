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
| E2E later            | Maestro                                  |
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
