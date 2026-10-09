# ChoreX - Technical Architecture

## 1. Architecture decision

Use a **TypeScript monorepo** with two Expo React Native applications and a Firebase backend.

```text
                         +----------------------+
                         |     Parent App       |
                         | React Native / Expo  |
                         +----------+-----------+
                                    |
                                    | Firebase client SDKs
                                    |
+---------------------+             v              +----------------------+
|     Child App       |      +-------------+       | Expo Push Service    |
| React Native / Expo +----->|  Firebase   |------>| -> APNs / FCM        |
+---------------------+      |             |       +----------------------+
                             | Auth        |
                             | Firestore   |
                             | Functions   |
                             | Storage(*)  |
                             | App Check   |
                             +------+------+
                                    |
                                    v
                             server-authoritative
                               business rules

(*) Storage is optional until proof media is introduced.
```

## 2. Why React Native + Expo

ChoreX is mobile-first and needs native capabilities such as push notifications, secure local storage, badges, deep links, haptics, and potentially camera/media later. Expo provides a strong React Native development and release workflow while still allowing custom native modules through development builds and config plugins.

Use a **development build from the start**. Do not make Expo Go a required part of the team's workflow because remote push notifications and React Native Firebase require native configuration.

## 3. Why React Native Firebase

Use React Native Firebase for native Firebase services in the mobile apps:

```text
@react-native-firebase/app
@react-native-firebase/auth
@react-native-firebase/firestore
@react-native-firebase/functions
@react-native-firebase/app-check
@react-native-firebase/crashlytics
```

Add Storage only when proof media becomes part of the product.

Benefits:

- native Firebase SDK behavior on iOS and Android;
- Firestore native offline persistence;
- Crashlytics;
- one Firebase project shared by both app variants per environment;
- compatible with Expo development builds.

Do **not** add `@react-native-firebase/messaging` initially. ChoreX can use `expo-notifications` for token handling and notification responses while the backend sends through Expo Push Service. Direct FCM/APNs can be introduced later without replacing the client notification API.

## 4. Monorepo structure

Recommended initial layout:

```text
chorex/
├─ apps/
│  ├─ parent/
│  │  ├─ app/                    # Expo Router routes
│  │  ├─ src/
│  │  ├─ app.config.ts
│  │  └─ package.json
│  └─ child/
│     ├─ app/
│     ├─ src/
│     ├─ app.config.ts
│     └─ package.json
│
├─ packages/
│  ├─ domain/                    # entities, enums, pure rules, Zod schemas
│  ├─ ui/                        # shared primitives/design system
│  ├─ firebase-client/           # typed client adapters
│  ├─ notifications/             # token registration + notification routing
│  ├─ config/                    # shared config/env typing
│  └─ test-utils/
│
├─ functions/
│  ├─ src/
│  │  ├─ callable/
│  │  ├─ events/
│  │  ├─ notifications/
│  │  ├─ auth/
│  │  ├─ domain/
│  │  └─ index.ts
│  └─ package.json
│
├─ firebase/
│  ├─ firestore.rules
│  ├─ firestore.indexes.json
│  └─ storage.rules
│
├─ docs/
│  ├─ 00_PROJECT_OVERVIEW.md
│  ├─ 01_TECHNICAL_ARCHITECTURE.md
│  ├─ 02_DOMAIN_MODEL.md
│  ├─ 03_STATE_MACHINES.md
│  ├─ 04_FIRESTORE_SCHEMA.md
│  ├─ 05_AUTH_AND_SECURITY.md
│  ├─ 06_PUSH_NOTIFICATIONS.md
│  └─ 07_IMPLEMENTATION_ROADMAP.md
│
├─ AGENTS.md
├─ pnpm-workspace.yaml
└─ package.json
```

## 5. App identity

The Parent and Child apps are separate binaries and should have separate application identifiers.

Example placeholders:

```text
Parent iOS:     com.chorex.parent
Parent Android: com.chorex.parent
Child iOS:      com.chorex.child
Child Android:  com.chorex.child
```

Use distinct icons, names, splash screens, notification categories/channels, and deep-link schemes.

Do not hard-code final identifiers until the final product/company domain is chosen.

## 6. Shared packages

### `packages/domain`

The most important package. It contains no React Native or Firebase UI code.

Owns:

- domain types;
- Zod schemas;
- enums;
- state transition input/output types;
- pure validation helpers;
- normalized error codes;
- reward/task/offer/contract terminology.

### `packages/firebase-client`

Wrap React Native Firebase APIs rather than importing Firebase everywhere in UI code.

Example API boundary:

```ts
export interface ContractRepository {
  observeContract(
    contractId: string,
    cb: (contract: Contract) => void,
  ): Unsubscribe;
  observeTasks(
    contractId: string,
    cb: (tasks: ContractTask[]) => void,
  ): Unsubscribe;
}
```

Mutating authoritative domain state should call Cloud Functions rather than performing direct Firestore writes.

### `packages/ui`

Contains shared primitives only:

- Button
- Card
- Avatar
- Badge
- ProgressBar
- Screen
- EmptyState
- Modal primitives
- typography and spacing tokens

Parent and Child apps may compose these differently and can each have app-specific components.

### `packages/notifications`

Owns:

- permission requests;
- Expo push token registration;
- optional native token capture;
- notification response parsing;
- deep-link routing;
- app foreground handlers.

## 7. State management

Use three layers deliberately:

```text
Firestore listeners -> server/domain state
Zustand             -> local UI/session state
React Hook Form      -> temporary form state
```

Do not mirror large Firestore datasets into Zustand by default.

Good Zustand candidates:

- selected family;
- onboarding progress;
- transient filters;
- draft UI state that is not yet a server object;
- local appearance/accessibility preferences.

## 8. Forms and validation

Use React Hook Form + Zod.

All server-bound payloads should have a schema in `packages/domain` and be validated again in Cloud Functions.

Never assume that client-side validation provides security.

## 9. Backend command pattern

Business mutations are explicit commands.

Examples:

```text
createOffer
publishOffer
counterOffer
acceptOffer
rejectOffer
recordTaskCompletion
undoTaskCompletion
submitContractForReview
requestContractChanges
approveContract
markRewardDelivered
confirmRewardReceived
createAuction
placeAuctionBid
selectAuctionBid
registerPushDevice
revokePushDevice
```

Each callable function should:

1. validate input schema;
2. require authenticated identity where appropriate;
3. validate family membership and role;
4. load current authoritative state;
5. validate legal transition;
6. perform the write atomically where necessary;
7. write an activity event;
8. return the canonical resulting object or ID;
9. trigger notifications only from committed state.

## 10. Timestamps and IDs

- Store server timestamps in UTC.
- Display dates/times in the user's locale/timezone.
- Use Firestore document IDs for database identity.
- Never derive security from human-readable IDs.
- Store `createdAt`, `createdBy`, `updatedAt`, and where meaningful `updatedBy`.
- Accepted contract terms must be snapshots, not live references to an editable offer.

## 11. Environments

Preferred:

```text
dev
staging
production
```

At minimum during early development:

```text
dev
production
```

Each environment should use a separate Firebase project. Never point local development at production Firestore.

Use Expo/EAS environment configuration to select the correct Firebase native files and runtime configuration.

ADR-048 adds guarded production bootstrap and native App Check: shared bootstrap runs before session providers mount; release bootstrap also waits for SDK token acquisition because the 26.4.0 modular initializer schedules native setup asynchronously, iOS uses App Attest with DeviceCheck fallback and Android uses Play Integrity. Emulator development uses native debug providers only in development builds. Production requires separate environment-supplied native files and matching explicit project ID; no production configuration is checked in. Integration does not enable enforcement.

## 12. Testing strategy

### Pure domain tests

Highest priority. Test:

- legal/illegal state transitions;
- completion requirements;
- target counts;
- deadline behavior;
- auction winner conversion;
- permission helpers;
- notification event mapping.

### Component tests

Use Jest + React Native Testing Library for critical interaction components and screens.

### Firebase emulator tests

Before production, test:

- callable authorization;
- Firestore rules;
- family isolation;
- child vs parent permissions;
- idempotency of critical functions.

### E2E

The E2E framework is intentionally deferred until the first vertical slice is stable (see `DECISIONS.md`, OPEN-008). Do not install Maestro, Detox, or another E2E framework during Phase 0 unless a later explicit decision selects it.

Whichever framework is selected later, the first E2E coverage should include:

1. Parent creates offer -> child accepts -> contract appears.
2. Child completes -> submits -> parent approves -> reward appears.
3. Child counteroffers -> parent accepts -> contract reflects latest agreed revision.

## 13. Release tooling

Use:

- EAS Build for iOS/Android binaries;
- EAS Submit for store submissions;
- Crashlytics for native crash reporting;
- GitHub Actions for lint/typecheck/test and optional EAS triggers.

ADR-049 adopts Crashlytics 26.4.0 in both apps through the shared Firebase client observability adapter. Native prebuild and runtime use one collection policy: development/emulator OFF, dedicated development validation opt-in, production ON. Reports use bounded non-identifying categories, no application user ID and no Analytics. OPEN-007 remains open for product analytics. Console receipt and symbolication are release gates.

EAS Update may be introduced later for compatible JS/assets updates. Treat native dependency/config changes as requiring a new binary build.

## 14. Deferred technology choices

Do not decide these prematurely:

- analytics vendor;
- subscription/payments;
- AI features;
- photo/video proof storage strategy;
- web admin dashboard;
- complex scheduling engine;
- direct FCM/APNs server integration.

## 15. Official references

Verified against current official documentation during this architecture pass:

- Expo push notification setup: https://docs.expo.dev/push-notifications/push-notifications-setup/
- Expo push services: https://docs.expo.dev/guides/using-push-notifications-services/
- Expo + Firebase / React Native Firebase: https://docs.expo.dev/guides/using-firebase/
- Expo Push Service sending: https://docs.expo.dev/push-notifications/sending-notifications/
- Firebase callable functions: https://firebase.google.com/docs/functions/callable
- Firestore offline persistence: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firestore rules conditions: https://firebase.google.com/docs/firestore/security/rules-conditions
- Firebase custom authentication: https://firebase.google.com/docs/auth/admin/create-custom-tokens
- Firebase App Check: https://firebase.google.com/products/app-check
