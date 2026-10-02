# ChoreX Repository Instructions for Codex

## Mission

Build ChoreX as a reliable family agreement product, not as a generic to-do app. Preserve the product lifecycle:

```text
Offer -> Negotiate -> Agree -> Contract -> Complete -> Review -> Reward -> Fulfillment
```

There are two separate mobile apps: **Parent** and **Child**. They share domain packages and one backend, but remain separate binaries and UX surfaces.

## Source of truth

Repository operational instructions live in this `AGENTS.md`, but product and architecture decisions are governed by the project documents below.

Use this authority order when documents conflict:

1. `docs/00_PROJECT_OVERVIEW.md`
2. `docs/01_TECHNICAL_ARCHITECTURE.md`
3. `docs/02_DOMAIN_MODEL.md`
4. `docs/03_STATE_MACHINES.md`
5. `docs/04_FIRESTORE_SCHEMA.md`
6. `docs/05_AUTH_AND_SECURITY.md`
7. `docs/06_PUSH_NOTIFICATIONS.md`
8. `docs/07_IMPLEMENTATION_ROADMAP.md`
9. `DECISIONS.md` for explicit later decisions

A lower-authority document must not silently reinterpret a higher-authority document. An Accepted ADR may override an earlier higher-level decision only when the ADR explicitly identifies the decision being changed or superseded. When that happens, update the affected project document in the same documentation-hardening change before implementation relies on it.

Before changing domain behavior, read at minimum:

```text
docs/00_PROJECT_OVERVIEW.md
docs/02_DOMAIN_MODEL.md
docs/03_STATE_MACHINES.md
docs/05_AUTH_AND_SECURITY.md
DECISIONS.md
```

If code and docs disagree on a core invariant, or if two active documents appear to conflict, do not silently choose one. Report the conflict and stop that part of implementation until the source of truth is clarified.

## Non-negotiable invariants

1. TypeScript strict mode stays enabled.
2. Do not duplicate domain enums/types in app folders; import them from `packages/domain`.
3. Client code never directly changes authoritative lifecycle fields.
4. Offers, contracts, reviews, rewards, auctions, membership, and task progress mutations use server commands/Cloud Functions unless a documented exception exists.
5. Every server command validates input with Zod.
6. Every server command validates authenticated actor, family membership, and role from server-side data.
7. Never trust client-provided role or ownership fields.
8. Accepted terms are immutable snapshots.
9. Contract approval and reward fulfillment are separate states.
10. Critical commands are idempotent.
11. Critical state transitions write an activity event.
12. Do not log tokens, pairing secrets, credentials, or unnecessary child content.
13. Do not add direct FCM/APNs integration while Expo Push Service satisfies the requirement.
14. Do not introduce a new state-management framework without a documented reason.
15. Do not add a global chore template/catalog until requested by product requirements.

## Repository boundaries

```text
apps/parent              Parent-only navigation/screens/composition
apps/child               Child-only navigation/screens/composition
packages/domain          Pure domain schemas/types/rules
packages/ui              Shared UI primitives
packages/firebase-client Firebase client adapters/read models
packages/notifications   Push registration + notification routing
functions                Server-authoritative commands/events
firebase                 Rules/indexes
```

Keep `packages/domain` free of React Native and Firebase UI dependencies.

## Firebase rules

Assume Firestore client writes to core domain collections are denied. Server Admin SDK bypasses Firestore Rules, so Cloud Function code must perform authorization itself.

When adding a query, verify that Firestore Security Rules and the query constraints are compatible. Rules are not post-query filters.

## Authentication

Parent:

- Firebase Auth normal provider(s), email/password first.

Child:

- no email required for MVP;
- parent creates child identity;
- child device pairs using a short-lived one-time pairing session;
- backend returns a Firebase custom token;
- app signs in using the child UID.

A local child PIN is an app lock only unless explicitly redesigned.

## Notifications

Use `expo-notifications` on clients and Expo Push Service from the backend.

Notifications are effects of committed domain events. Never send a success notification before the transaction that causes it succeeds.

Payloads must contain minimal non-sensitive routing data.

## Error handling

Use stable domain error codes, not UI strings. Examples:

```text
AUTH_REQUIRED
FORBIDDEN
FAMILY_MEMBERSHIP_REQUIRED
WRONG_ACTOR_ROLE
INVALID_STATE
STALE_REVISION
DEADLINE_PASSED
TASKS_INCOMPLETE
ALREADY_ACCEPTED
ALREADY_APPROVED
REWARD_ALREADY_FULFILLED
IDEMPOTENCY_CONFLICT
```

Apps map these to localized messages.

## Date/time rules

- persist timestamps in UTC/server time;
- use server timestamps for authoritative creation/update times;
- render in user locale/timezone;
- do not compare security-critical deadlines using only client clocks.

## Testing expectations

For every new domain command, add tests for:

- happy path;
- unauthenticated request;
- wrong family;
- wrong role;
- invalid state;
- duplicate/idempotent request where relevant;
- boundary condition specific to the command.

For state transitions, test illegal transitions explicitly.

## UI rules

- Parent and Child apps may have different visual tone, but shared primitives should remain accessible and consistent.
- Prefer composition over app-specific forks of shared components.
- Use NativeWind/design tokens; avoid arbitrary hard-coded style values repeated across screens.
- Do not request push permission on the first frame.
- The app must remain usable if push permission is denied.
- Avoid shame/punishment language in child-facing copy.

## Implementation workflow

Before coding a task:

1. identify the affected domain object and state machine;
2. identify actor and permission requirements;
3. define/update Zod input/output schema;
4. write or update tests;
5. implement server command if mutation is authoritative;
6. implement typed client adapter/hook;
7. implement UI;
8. run typecheck, lint, unit tests, and relevant emulator tests;
9. update docs if behavior or schema changed.

## Dependency discipline

Before adding a dependency:

- check whether Expo/React Native/Firebase already provides the capability;
- prefer maintained, typed packages;
- avoid overlapping libraries for the same responsibility;
- document native-config implications;
- ensure both app variants still build.

## Do not prematurely build

Unless a task explicitly requests it, do not add:

- payments/subscriptions;
- public social features;
- complex gamification currency;
- AI parenting features;
- location tracking;
- proof video pipeline;
- web dashboard;
- marketing website.

## Definition of done

A feature is not done because the screen looks correct. It is done when:

- domain invariants hold;
- authorization is enforced server-side;
- types/schema are shared;
- tests cover critical paths;
- errors are stable and handled;
- both app variants still build;
- docs remain consistent with implementation.
