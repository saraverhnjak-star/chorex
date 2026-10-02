# ChoreX — Architectural and Product Decisions

This document records foundational decisions for ChoreX.

Its purpose is to prevent important product and architecture choices from being silently re-opened, reinterpreted, or changed during implementation.

These decisions apply unless a later explicit decision supersedes them.

When a decision changes, do not edit history silently. Add a new ADR entry that references and supersedes the earlier one.

## Repository documentation authority

The numbered project documents remain the primary source of truth in this order:

1. `docs/00_PROJECT_OVERVIEW.md`
2. `docs/01_TECHNICAL_ARCHITECTURE.md`
3. `docs/02_DOMAIN_MODEL.md`
4. `docs/03_STATE_MACHINES.md`
5. `docs/04_FIRESTORE_SCHEMA.md`
6. `docs/05_AUTH_AND_SECURITY.md`
7. `docs/06_PUSH_NOTIFICATIONS.md`
8. `docs/07_IMPLEMENTATION_ROADMAP.md`
9. this `DECISIONS.md` for explicit later decisions

A later Accepted ADR overrides a higher-level document only when it explicitly identifies the earlier decision being changed or superseded. The affected numbered document should then be aligned before implementation depends on the change. Otherwise, the higher-authority document wins.

---

## Decision Statuses

- **Accepted** — active and authoritative.
- **Provisional** — selected for now, but expected to be revisited before a defined milestone.
- **Deferred** — intentionally postponed.
- **Superseded** — replaced by a later decision.
- **Rejected** — considered and explicitly not selected.

---

# ADR-001 — ChoreX Uses Two Separate Mobile Applications

**Status:** Accepted

## Decision

ChoreX will ship as two separate mobile applications:

1. **Parent App**
2. **Child App**

They will have separate app bundles, navigation, branding surfaces, permissions, and release lifecycles.

They will share the same backend, domain model, validation rules, reusable UI primitives, notification infrastructure, and shared packages.

## Rationale

The Parent and Child experiences have materially different responsibilities, permissions, mental models, and user flows.

Keeping them as separate applications provides:

- clearer UX;
- simpler role-specific navigation;
- safer permission boundaries;
- less conditional UI;
- independent release flexibility;
- room for a more playful Child App and a more operational Parent App.

## Consequences

The repository must support two Expo applications.

Shared logic must live in reusable packages rather than being copied between apps.

Role-specific behavior must not be implemented by hiding controls inside a single shared app.

## Revisit Only If

A strong product reason emerges to merge both experiences into one application, supported by clear UX and security benefits.

---

# ADR-002 — React Native + Expo Is the Mobile Platform

**Status:** Accepted

## Decision

Both mobile applications will use:

- React Native
- Expo
- Expo Router
- TypeScript

Expo Development Builds will be used rather than relying on Expo Go for production-relevant development.

## Rationale

This stack provides:

- one TypeScript ecosystem across both apps;
- strong Codex compatibility;
- fast iteration;
- native iOS and Android support;
- access to push notifications, camera, storage, haptics, deep links, and other native capabilities;
- a straightforward EAS build and release path.

## Consequences

Native requirements must be compatible with Expo Development Builds and EAS.

Packages that require native configuration must use supported config plugins or documented native setup.

## Revisit Only If

A required product capability proves impractical or unstable under the Expo-managed development model.

---

# ADR-003 — TypeScript Is the Default Language

**Status:** Accepted

## Decision

TypeScript will be used throughout:

- Parent App;
- Child App;
- shared packages;
- Firebase Cloud Functions;
- validation;
- domain logic;
- test code where practical.

Strict typing should be enabled.

## Rationale

The project has a non-trivial domain lifecycle and multiple clients sharing the same concepts.

TypeScript improves:

- refactor safety;
- shared contracts;
- Codex reliability;
- discoverability;
- validation consistency;
- maintainability.

## Consequences

Do not bypass type errors with broad `any` usage.

Shared domain types should have a canonical source.

## Revisit Only If

A specific external system requires another language for a clearly isolated component.

---

# ADR-004 — ChoreX Uses a pnpm Monorepo

**Status:** Superseded by ADR-035

## Decision

ChoreX will use a single repository with `pnpm` workspaces.

Initial structure:

```text
chorex/
├── apps/
│   ├── parent/
│   └── child/
├── packages/
│   ├── domain/
│   ├── validation/
│   ├── firebase/
│   ├── notifications/
│   ├── ui/
│   └── config/
├── functions/
├── docs/
├── AGENTS.md
├── DECISIONS.md
├── package.json
└── pnpm-workspace.yaml
```

No Nx or Turborepo will be added initially.

## Rationale

The codebase needs shared types, schemas, business rules, and infrastructure, but does not initially require a heavy monorepo orchestration layer.

`pnpm` workspaces provide sufficient structure with low complexity.

## Consequences

Packages must expose clear public APIs.

Cross-package imports should not bypass package boundaries through fragile relative paths.

## Revisit Only If

Build orchestration, caching, dependency graph management, or CI performance becomes a real bottleneck.

---

# ADR-005 — Firebase Is the Initial Backend Platform

**Status:** Accepted

## Decision

The initial backend will use Firebase services:

- Firebase Authentication;
- Cloud Firestore;
- Firebase Cloud Functions, 2nd generation;
- Firebase Storage;
- Firebase App Check where appropriate;
- Firebase Emulator Suite for local development.

## Rationale

ChoreX is event-driven and benefits from:

- realtime updates;
- mobile-oriented authentication;
- serverless backend logic;
- notification-triggering events;
- simple deployment;
- low operational overhead;
- strong support for a small product team.

## Consequences

The domain must not become unnecessarily coupled to Firestore document shapes.

Firebase-specific code should remain behind dedicated infrastructure modules where practical.

## Revisit Only If

Scale, cost, query requirements, compliance requirements, or backend complexity materially outgrow Firebase.

---

# ADR-006 — Native Firebase Capabilities May Use React Native Firebase

**Status:** Accepted

## Decision

Where native Firebase SDK capabilities are needed, the mobile apps may use `@react-native-firebase/*` modules.

The project will not assume Expo Go compatibility.

## Rationale

Native Firebase integration provides stronger support for capabilities such as:

- native Firestore behavior;
- authentication;
- crash reporting;
- storage;
- offline support where applicable.

This is compatible with the decision to use Expo Development Builds.

## Consequences

Native modules must be tested in actual development builds.

Firebase integration must be centralized rather than scattered through UI components.

## Revisit Only If

Expo-native or Firebase JS SDK support becomes sufficient for all required capabilities and materially simplifies the project.

---

# ADR-007 — Domain Logic Is Shared; Screens Do Not Own Business Rules

**Status:** Accepted

## Decision

Business rules must live in shared domain modules or trusted backend logic.

Screens and UI components may orchestrate user interactions, but they must not become the canonical place for:

- contract transitions;
- reward eligibility;
- offer acceptance rules;
- family membership rules;
- authorization;
- completion rules.

## Rationale

Both apps and the backend operate on the same domain.

Duplicating rules across screens would create inconsistent behavior and make AI-assisted development less reliable.

## Consequences

Shared domain packages must remain framework-light.

UI code should depend on domain logic, not the reverse.

## Revisit Only If

Never by convenience alone. A new decision is required if this architecture is intentionally changed.

---

# ADR-008 — Zod Is the Canonical Runtime Validation Layer

**Status:** Accepted

## Decision

Zod will be used for runtime validation of shared data contracts where validation is required.

Shared schemas should be used across:

- mobile input validation;
- backend function inputs;
- persisted data boundaries where practical;
- serialized domain data.

## Rationale

TypeScript types disappear at runtime.

Zod provides one declarative source for runtime validation and inferred TypeScript types.

## Consequences

Avoid maintaining separate manual interfaces and schemas for the same data shape unless technically necessary.

## Revisit Only If

A later validation solution provides a clear, project-wide improvement.

---

# ADR-009 — Zustand Is Used Only for Local and UI State

**Status:** Accepted

## Decision

Zustand will be used for lightweight local application state such as:

- onboarding state;
- temporary UI preferences;
- selected context;
- local drafts where appropriate.

Remote domain data from Firestore must not be duplicated into a large global client store without a concrete reason.

## Rationale

Firestore is already the remote source of truth.

Duplicating all remote state into Zustand would create unnecessary synchronization complexity.

## Consequences

A clear distinction must be maintained:

```text
Firestore → remote/domain state
Zustand   → local/UI state
```

## Revisit Only If

A real state coordination problem emerges that Firestore subscriptions and local stores cannot handle cleanly.

---

# ADR-010 — React Hook Form + Zod Are the Standard Form Stack

**Status:** Accepted

## Decision

Forms will use:

- React Hook Form;
- Zod-backed validation.

## Rationale

This provides a lightweight, type-safe, well-supported form architecture that works well with shared schemas.

## Consequences

Do not introduce parallel form libraries without a concrete technical need.

---

# ADR-011 — NativeWind Is the Initial Styling Approach

**Status:** Accepted

## Decision

The mobile apps will use NativeWind for utility-based styling, backed by shared design tokens and reusable UI primitives.

## Rationale

NativeWind offers:

- fast iteration;
- familiar Tailwind-style semantics;
- good Codex generation quality;
- easy consistency across two apps.

## Consequences

Do not allow arbitrary utility duplication to replace a design system.

Shared colors, spacing, typography, radius, and reusable primitives should live in shared packages.

## Revisit Only If

NativeWind creates measurable limitations for design, performance, or native behavior.

---

# ADR-012 — Offer Negotiation and Contract Execution Are Separate Lifecycles

**Status:** Accepted

## Decision

An **Offer** and a **Contract** are separate domain concepts.

The negotiation lifecycle belongs to the Offer.

The execution lifecycle belongs to the Contract.

A Contract is created only after the parties reach agreement.

## Rationale

Negotiation and execution represent different states and responsibilities.

Combining them into one large status enum would create ambiguity around:

- counteroffers;
- acceptance;
- deadlines;
- active work;
- review;
- completion.

## Consequences

An Offer must not be treated as an active Contract.

Historical negotiation data should remain available independently of contract progress.

## Revisit Only If

A new domain model demonstrates a simpler representation without losing lifecycle clarity.

---

# ADR-013 — Contract State Transitions Are Explicit

**Status:** Superseded by ADR-033

## Decision

Contract transitions will be modeled explicitly.

The initial conceptual lifecycle is:

```text
ACTIVE
  ↓
READY_FOR_REVIEW
  ↓
COMPLETED
```

Additional terminal or corrective states may include:

```text
CHANGES_REQUESTED
CANCELLED
EXPIRED
```

Exact state names may be refined before implementation, but transitions must remain explicit and constrained.

## Rationale

Contracts represent mutual obligations.

Implicit state derived from scattered booleans would be difficult to secure, debug, and evolve.

## Consequences

Do not model lifecycle state using unrelated flags such as:

```text
isDone
isApproved
isSubmitted
```

when a state machine is the authoritative concept.

## Revisit Only If

The state machine is intentionally redesigned and documented.

---

# ADR-014 — Reward Fulfillment Is Separate From Contract Completion

**Status:** Superseded by ADR-034

## Decision

Completing a Contract causes a Reward to become earned.

It does not mean the parent has already fulfilled the Reward.

Reward fulfillment has its own lifecycle.

Conceptually:

```text
LOCKED
→ EARNED
→ FULFILLED
```

Optional additional states may be added later.

## Rationale

The parent's obligation is part of the product.

If a child completes the chores and earns cinema tickets, the parent still has to deliver the promised reward.

## Consequences

The Parent App must surface earned-but-unfulfilled rewards as actionable obligations.

The Child App must distinguish earned rewards from fulfilled rewards.

## Revisit Only If

The product intentionally removes tracking of the parent's side of the agreement.

---

# ADR-015 — Critical Domain Transitions Are Server-Authoritative

**Status:** Accepted

## Decision

Sensitive domain transitions must be validated by trusted backend logic.

Examples include:

- accepting an offer;
- creating a Contract from an accepted agreement;
- submitting a Contract for review;
- approving completion;
- earning a Reward;
- changing family membership;
- issuing child authentication credentials.

Clients may request these operations but must not arbitrarily write authoritative state.

## Rationale

Both mobile applications are untrusted clients.

Security must not depend on hidden buttons or UI rules.

## Consequences

Callable Cloud Functions or equivalent trusted backend paths should own critical transitions.

Firestore Security Rules must prevent unauthorized direct writes.

## Revisit Only If

A specific transition can be safely expressed and enforced entirely through Security Rules without reducing clarity or security.

---

# ADR-016 — Child Authentication Does Not Require a Child Email Address

**Status:** Accepted

## Decision

A child should not need an email address to use the Child App.

The initial model will use a parent-controlled child identity and pairing flow.

Conceptually:

```text
Parent creates child profile
→ pairing credential/code is issued
→ Child App pairs with the profile
→ trusted backend issues child authentication
→ child receives a constrained authenticated session
```

Firebase custom authentication tokens may be used for this flow.

## Rationale

Requiring email accounts would create unnecessary friction, especially for younger children.

Parent-controlled pairing better matches the family domain.

## Consequences

Pairing credentials must:

- be short-lived;
- be single-use where practical;
- avoid containing sensitive information;
- be invalidated after successful pairing.

Child authorization must remain enforced independently of the pairing UX.

## Revisit Only If

Product research shows a materially better account model for children.

---

# ADR-017 — Family Membership Is an Explicit Authorization Boundary

**Status:** Accepted

## Decision

Access to ChoreX domain data is scoped by Family membership.

A user may only access family resources for which that user has valid membership and an appropriate role.

## Rationale

Family membership is the core tenant boundary of the product.

## Consequences

Every protected Firestore path and backend operation must enforce family membership and role permissions.

Do not infer access merely because a document ID is known.

## Revisit Only If

ChoreX later introduces cross-family features with an explicitly designed authorization model.

---

# ADR-018 — Expo Notifications Is the Initial Push Notification Client Layer

**Status:** Accepted

## Decision

The mobile apps will use `expo-notifications`.

The initial push transport will use the Expo Push Service.

Backend notification events will originate from trusted server logic.

## Rationale

This provides one notification interface across iOS and Android while allowing ChoreX to move to direct APNs/FCM delivery later if needed.

## Consequences

The backend should store device registration information cleanly enough to support future transport changes.

Notification payloads must use stable event types and identifiers.

## Revisit Only If

Delivery requirements, scale, cost, or advanced notification capabilities justify direct APNs/FCM integration.

---

# ADR-019 — Notifications Are Events, Not Business Logic

**Status:** Accepted

## Decision

Push notifications inform users about already-authoritative domain events.

A notification must never be the source of truth for a state change.

Example:

```text
Contract becomes READY_FOR_REVIEW
→ backend commits state
→ notification event is emitted
→ parent receives push
```

Not:

```text
push notification
→ state implicitly assumed to have changed
```

## Rationale

Push delivery is inherently unreliable and may be delayed or disabled.

## Consequences

Opening an app from a push must always load authoritative data from the backend.

---

# ADR-020 — Offline Support Must Not Fake Server Success

**Status:** Accepted

## Decision

The apps may support Firestore offline reads and local persistence where available.

However, server-authoritative actions must not appear successfully completed if the backend has not confirmed them.

## Rationale

Operations such as approval, contract submission, or offer acceptance may require trusted backend validation.

Optimistically claiming success offline could create contradictory states.

## Consequences

For authoritative operations while offline, the UI should initially show a clear connectivity requirement or a pending state only if a properly designed command queue exists.

A generic offline mutation queue will not be implemented in the first MVP unless explicitly prioritized.

## Revisit Only If

Offline-first behavior becomes a product requirement.

---

# ADR-021 — The MVP Is a Single End-to-End Family Agreement Flow

**Status:** Accepted

## Decision

The first product milestone is one complete vertical flow:

```text
Parent signs up / signs in
→ creates a Family
→ creates a Child
→ pairs the Child App
→ creates an Offer
→ Child receives the Offer
→ Child accepts or counteroffers
→ agreement becomes a Contract
→ Child completes required tasks
→ Child submits for review
→ Parent approves or requests changes
→ Reward becomes earned
→ Parent fulfills the Reward
```

## Rationale

A complete narrow workflow proves the product more effectively than many disconnected screens or partial features.

## Consequences

Work that does not directly support this flow must be challenged before entering the MVP.

---

# ADR-022 — Auctions Are Not Part of the Initial MVP

**Status:** Accepted

## Decision

The multi-child auction/bidding feature is deferred until the core Offer → Contract → Reward lifecycle is stable.

## Rationale

Auctions introduce additional complexity:

- multiple children;
- bidding;
- bid editing;
- deadlines;
- selection;
- losing bids;
- notification fan-out;
- fairness and cancellation rules.

These should not block validation of the core product.

## Consequences

The domain should avoid architectural choices that make auctions impossible later, but no auction code should be implemented in the first MVP.

## Revisit Only If

The core lifecycle is stable and the auction feature becomes the next explicitly prioritized product milestone.

---

# ADR-023 — Advanced Gamification Is Deferred

**Status:** Deferred

## Decision

The initial MVP will not include complex:

- XP systems;
- levels;
- streaks;
- leaderboards;
- badges;
- virtual currencies;
- public social features.

Simple progress visualization is allowed.

## Rationale

The core product value is agreement, responsibility, and reward fulfillment.

Gamification should not obscure whether the core loop works.

---

# ADR-024 — The Marketing Website Is a Later Phase

**Status:** Deferred

## Decision

The presentation/marketing website will not be part of the initial mobile product implementation.

When implemented, the preferred stack is:

- Next.js;
- TypeScript;
- Tailwind CSS.

It may live in the same monorepo as `apps/web`.

## Rationale

The website does not validate the core product loop.

---

# ADR-025 — Git and Repository History Are Part of the Development Discipline

**Status:** Accepted

## Decision

Implementation should proceed through small, meaningful commits aligned with milestones and vertical slices.

Examples:

```text
chore: bootstrap ChoreX monorepo
feat: add parent authentication
feat: add family creation
feat: add child pairing
feat: implement offer creation
```

Avoid enormous generated commits that mix unrelated architecture, UI, backend, and refactoring work.

## Rationale

Small commits improve:

- review;
- rollback;
- debugging;
- AI-agent supervision;
- architecture traceability.

---

# ADR-026 — Codex Receives Scoped Tasks, Not Whole-Product Prompts

**Status:** Accepted

## Decision

Codex must not be instructed with vague prompts such as:

> Build ChoreX.

Tasks should define:

- goal;
- relevant source documents;
- scope;
- constraints;
- acceptance criteria;
- validation/tests;
- explicit exclusions.

## Rationale

AI agents make better implementation decisions when the domain and scope are constrained.

## Consequences

The Implementation Roadmap should be converted into small Codex-ready tasks.

Architecture decisions must remain in documentation, not be silently invented during implementation.

---

# ADR-027 — Important New Decisions Must Be Recorded

**Status:** Accepted

## Decision

A new ADR must be added when implementation requires a durable decision that affects:

- product behavior;
- domain modeling;
- authentication;
- authorization;
- data architecture;
- app boundaries;
- infrastructure;
- state ownership;
- notification architecture;
- offline behavior;
- release architecture.

Minor local implementation choices do not require ADRs.

## Rationale

The goal of this document is not bureaucracy.

The goal is to preserve the reasoning behind decisions that future developers or AI agents might otherwise re-open accidentally.

---

# ADR-028 — Parent Authentication Starts With Email and Password

**Status:** Accepted

## Decision

The MVP Parent App will initially support Firebase Authentication with:

- email address;
- password.

Apple and Google sign-in are intentionally deferred until the core product lifecycle is working end-to-end.

Password reset and email verification should be supported before production release.

## Rationale

Email/password is the smallest reliable authentication surface for the first vertical slice.

Adding federated providers immediately would increase:

- native configuration;
- provider-specific setup;
- test cases;
- account-linking complexity;
- App Store authentication requirements.

The MVP first needs to validate the ChoreX domain flow rather than optimize sign-in conversion.

## Consequences

The authentication layer must not be designed in a way that prevents additional Firebase providers later.

User identity must be based on Firebase `uid`, never on the email address itself.

No domain document should use email as an authorization key.

## Revisit When

The first end-to-end MVP flow is stable or production onboarding is being prepared.

At that point, Apple and Google sign-in may be added deliberately.

---

# ADR-029 — Offer Negotiation Uses Immutable Sequential Revisions

**Status:** Accepted

## Decision

An Offer is a negotiation container with a sequence of immutable term revisions.

Only one revision is current at a time.

Conceptually:

```text
Offer
├── revision 1 — parent proposal
├── revision 2 — child counterproposal
├── revision 3 — parent counterproposal
└── accepted revision
```

Every revision stores a complete snapshot of the negotiable terms required to understand the proposal at that moment.

A revision records at minimum:

- revision number;
- author;
- creation timestamp;
- task terms;
- deadline;
- reward terms.

The current revision may be:

- accepted;
- rejected;
- countered.

Acceptance always applies to the current revision only.

After acceptance, no further Offer revision is allowed. The accepted terms are used to create the Contract.

## MVP Negotiation Permissions

For the first MVP:

**Parent may:**

- create the initial Offer;
- change task terms before agreement;
- change the deadline before agreement;
- change the proposed reward before agreement;
- accept a child's reward counterproposal;
- counter again;
- withdraw an unaccepted Offer.

**Child may:**

- accept the current Offer;
- reject the current Offer;
- counter the reward;
- add an optional counterproposal note.

The Child App will not initially allow the child to directly edit task definitions or the deadline.

If the parent changes tasks or the deadline after a child counterproposal, the result is a new revision that the child must explicitly accept.

## Concurrency Rule

Negotiation is linear, not branching.

A counterproposal is valid only against the current revision.

If another revision has become current first, the stale action must fail and the client must reload the latest Offer state.

## Rationale

Immutable revisions provide:

- a clear negotiation history;
- deterministic agreement terms;
- protection against silent term changes;
- simpler audit and debugging;
- safe concurrent behavior.

Restricting the child to reward counteroffers preserves the original ChoreX MVP idea while avoiding an unnecessarily complex contract editor for the Child App.

## Consequences

Do not mutate previously proposed terms in place.

The Contract must contain or reference an immutable snapshot of the accepted revision.

The UI may present negotiation conversationally, but persistence must retain revision history.

## Revisit When

User testing shows that children should also negotiate tasks, quantities, or deadlines.

---

# ADR-030 — Contract Lifecycle Uses Five Authoritative States

**Status:** Superseded by ADR-033

## Decision

The MVP Contract lifecycle uses the following authoritative states:

```text
ACTIVE
SUBMITTED_FOR_REVIEW
COMPLETED
EXPIRED
CANCELLED
```

Primary lifecycle:

```text
ACTIVE
   │
   │ child submits
   ▼
SUBMITTED_FOR_REVIEW
   │
   ├── parent approves ──────────────► COMPLETED
   │
   └── parent requests changes ─────► ACTIVE
```

Terminal transitions:

```text
ACTIVE ─────────────► EXPIRED
ACTIVE ─────────────► CANCELLED

SUBMITTED_FOR_REVIEW ─► CANCELLED
```

`COMPLETED`, `EXPIRED`, and `CANCELLED` are terminal for the MVP.

## Review Changes

`CHANGES_REQUESTED` is not a persistent Contract state in the MVP.

When a parent requests changes:

1. a review event/comment is recorded;
2. the Contract transitions from `SUBMITTED_FOR_REVIEW` back to `ACTIVE`;
3. the child may continue work and submit again.

This keeps the state machine compact while retaining review history.

## Deadline Semantics

The Contract deadline means:

> the child must submit the Contract for review by this time.

A Contract may automatically become `EXPIRED` only when:

- its deadline has passed; and
- its current state is `ACTIVE`.

A Contract already in `SUBMITTED_FOR_REVIEW` does not expire merely because the parent reviews it after the deadline.

## Completion Rule

Only trusted backend logic may transition:

```text
SUBMITTED_FOR_REVIEW → COMPLETED
```

That transition occurs after parent approval.

## Cancellation

Cancellation exists as an exceptional terminal state and requires:

- an actor;
- a timestamp;
- a reason.

The detailed product UX for cancellation can remain minimal in the first MVP.

## Rationale

Five explicit states are sufficient to represent the core lifecycle without creating status explosion.

Returning to `ACTIVE` after requested changes is simpler than introducing a separate long-lived review-correction state.

## Consequences

Do not use booleans such as `isDone`, `isApproved`, or `isSubmitted` as competing sources of truth.

Review attempts must be stored separately from Contract state so review history is not lost when the Contract returns to `ACTIVE`.

---

# ADR-031 — One Contract Has One Immutable Reward Promise in the MVP

**Status:** Superseded by ADR-034

## Decision

Each MVP Contract has exactly one Reward promise.

The Reward is snapshotted from the accepted Offer terms when the Contract is created.

Reward terms cannot be edited after Contract activation.

The MVP Reward contains:

- title;
- optional description;
- category;
- status;
- earned timestamp;
- fulfilled timestamp.

Initial categories:

```text
EXPERIENCE
ITEM
PRIVILEGE
MONEY
CUSTOM
```

For `MONEY`, optional structured amount and ISO currency may be stored.

For all categories, the human-readable title remains authoritative for presentation.

## Reward Lifecycle

```text
LOCKED
  ↓ Contract completed
EARNED
  ↓ Parent fulfills promise
FULFILLED
```

Only trusted backend logic may create the `EARNED` transition from Contract completion.

The parent explicitly marks an earned reward as fulfilled.

The child does not need to confirm fulfillment in the first MVP.

## No Partial Fulfillment

Partial reward fulfillment is not supported in the MVP.

A reward is either:

- not yet earned;
- earned but pending;
- fulfilled.

## Rationale

One reward per Contract closely matches the original ChoreX mental model:

> complete this agreement and earn this reward.

It avoids premature complexity around reward bundles, installments, partial fulfillment, and multi-party claims.

## Consequences

If parents want to describe a compound reward, they may express it as one human-readable reward in the MVP.

Changing the promised reward after agreement requires a future renegotiation/change mechanism rather than mutating the active Contract.

## Revisit When

Real product usage requires multiple independent rewards or partial fulfillment.

---

# ADR-032 — Repeated Task Progress Uses Completion Events Plus a Derived Counter

**Status:** Accepted

## Decision

Repeated chores must not be represented only by a mutable numeric counter.

Every completion creates an immutable Task Completion Event.

Conceptually:

```text
Task
targetCount: 100
completedCount: 37   ← derived/cached value

TaskCompletionEvents
01
02
03
...
37
```

A completion event records at minimum:

- event ID;
- family ID;
- contract ID;
- task ID;
- child ID;
- completion timestamp;
- creation timestamp;
- optional note;
- optional proof reference when proof support is added.

`completedCount` may be stored on the Task as a denormalized value for fast UI reads, but completion events are the audit source for how that count was reached.

## Progress Rule

For a task with:

```text
targetCount = N
```

the task is complete when the number of valid completion events reaches `N`.

For a one-time task:

```text
targetCount = 1
```

the same model is used.

## Write Integrity

Creating a completion event and updating any cached progress value must happen through a trusted or transactionally safe path so duplicate or conflicting increments do not corrupt progress.

A client-generated idempotency key should be considered for completion commands to protect against duplicate taps/retries.

## Review Model

The parent does not approve every individual repetition in the MVP.

The child records progress during Contract execution.

The parent reviews the Contract as a whole when it is submitted.

**Supersession note:** ADR-033 supersedes the earlier review-state sentence in this ADR. A requested change moves the Contract to `CHANGES_REQUESTED`, not back to `ACTIVE`. This ADR continues to govern the completion-event model only. The effect of requested corrections on already-recorded completion events/counters remains OPEN-009 and must not be invented during implementation.

## Rationale

An event history provides capabilities a plain counter cannot:

- auditability;
- timestamps;
- future streak/calendar views;
- future proof attachments;
- debugging;
- duplicate detection;
- progress reconstruction.

It also supports both one-time and repeated tasks with one model.

## Consequences

Task progress UI may read the cached counter for performance.

Business logic must be able to validate or reconstruct progress from completion events.

Do not overwrite historical completion events merely to change the visible count.

## Revisit When

A future requirement introduces scheduled repetitions, per-occurrence parent approval, recurring calendar rules, or invalidation of individual completion events.

---

# ADR-033 — Canonical Contract Lifecycle Follows the State Machine Specification

**Status:** Accepted

## Decision

The canonical MVP Contract states are:

```text
ACTIVE
READY_FOR_REVIEW
CHANGES_REQUESTED
APPROVED
CANCELLED
EXPIRED
```

Primary flow:

```text
ACTIVE
  |
  | child submits after all requirements are satisfied
  v
READY_FOR_REVIEW
  |             \
  | approve      \ request changes
  v               v
APPROVED      CHANGES_REQUESTED
                  |
                  | child addresses feedback and re-submits
                  v
             READY_FOR_REVIEW
```

`APPROVED` means the child's contractual obligation has been accepted by the parent. It does not mean the reward has already been delivered.

`CANCELLED` and `EXPIRED` are exceptional/terminal states according to the documented transition policy.

Review history is stored as immutable `ContractReview` records and is never inferred only from the current Contract status.

## Rationale

This preserves the authoritative Domain Model and State Machines terminology and keeps important UX concepts explicit:

- `READY_FOR_REVIEW` means the child has actually submitted the work;
- `CHANGES_REQUESTED` is visible as a distinct corrective phase;
- `APPROVED` precisely describes the parent's review decision;
- reward fulfillment remains a separate lifecycle.

Using `COMPLETED` for parent approval would be semantically less precise because "completed" can also describe the child's view of task execution.

## Consequences

The following earlier ADR terminology is no longer canonical:

```text
SUBMITTED_FOR_REVIEW
COMPLETED
```

Do not introduce these as Contract status aliases.

All code, schemas, Firestore documents, functions, tests, and UI copy must use the canonical state machine terminology unless a future ADR explicitly supersedes this decision.

---

# ADR-034 — Reward Promise Lives in the Contract; Reward Entity Is Created on Approval

**Status:** Accepted

## Decision

Each MVP Contract contains exactly one immutable reward promise as frozen `RewardTerms`.

Before parent approval, this promise is part of the Contract terms and is **not** represented as an earned Reward entity.

When the Contract transitions to `APPROVED`, trusted backend logic atomically creates exactly one Reward entity.

The MVP Reward lifecycle is:

```text
PENDING_FULFILLMENT
        |
        | parent delivers the reward
        v
FULFILLED
```

An exceptional/admin `CANCELLED` state may exist as documented, but cancellation must not be used as a normal substitute for fulfillment.

The Reward entity stores the frozen reward terms copied from the Contract.

## Rationale

This matches the established Domain Model:

- negotiated reward terms exist before execution;
- a real earned Reward exists only after approval;
- parent fulfillment is a separate obligation after earning.

A separate pre-approval `LOCKED` Reward document is unnecessary and would duplicate the Contract's reward promise.

## Consequences

Contract creation snapshots `rewardTerms`.

Contract approval must be atomic and idempotent:

1. write the approval review;
2. transition the Contract to `APPROVED`;
3. create the Reward if it does not already exist;
4. write activity events;
5. trigger notification effects from committed state.

The Parent App treats `PENDING_FULFILLMENT` Rewards as obligations/to-do items.

The Child App presents them as earned but not yet fulfilled.

Money/allowance behavior remains outside the first MVP product flow even if a future-compatible reward type exists in shared schemas.

---

# ADR-035 — Canonical Monorepo Package Boundaries Follow Technical Architecture

**Status:** Accepted

## Decision

ChoreX remains a `pnpm` workspace monorepo.

The canonical initial repository structure is:

```text
chorex/
├─ apps/
│  ├─ parent/
│  └─ child/
│
├─ packages/
│  ├─ domain/
│  ├─ ui/
│  ├─ firebase-client/
│  ├─ notifications/
│  ├─ config/
│  └─ test-utils/
│
├─ functions/
├─ firebase/
├─ docs/
├─ AGENTS.md
├─ DECISIONS.md
├─ pnpm-workspace.yaml
└─ package.json
```

`packages/domain` owns domain types, enums, Zod schemas, pure validation rules, state-transition input/output types, and normalized domain error codes.

There is no separate `packages/validation` package in the initial architecture.

`packages/firebase-client` is the client-side Firebase adapter boundary. Firebase calls should not be scattered throughout screens.

No Nx or Turborepo layer is introduced initially.

## Rationale

This is the package structure already defined by Technical Architecture and repository instructions.

Keeping validation in the domain package makes the shared domain contract the single source of truth instead of splitting tightly related types and schemas across packages.

A specifically named `firebase-client` package also makes the infrastructure boundary clearer than a generic `firebase` package, particularly because server Firebase code belongs under `functions/`.

## Consequences

Codex must bootstrap these exact high-level package boundaries unless a later explicit decision changes them.

Do not create empty speculative packages beyond this structure merely for architectural symmetry.

---

# Remaining Open Decisions Before or During Early Implementation

The following items remain intentionally unlocked and can be decided closer to their implementation.

## OPEN-006 — Proof of Completion

Potential future forms:

- child marks complete;
- text note;
- photo;
- parent-only verification;
- per-task proof requirements.

The MVP should default to the simplest usable model unless user research indicates otherwise.

---

## OPEN-007 — App-Level Analytics and Crash Reporting

Crashlytics is expected to be useful.

The analytics solution and exact event taxonomy should be chosen later, before production release rather than during initial bootstrap.

---

## OPEN-008 — Testing Strategy Beyond Unit and Integration Basics

The project should begin with:

- domain tests;
- schema tests;
- backend function tests where practical;
- React Native Testing Library for important UI logic.

The choice between Maestro, Detox, or another end-to-end framework can be deferred until the first vertical slice is stable.

---

## OPEN-009 — Correction Semantics After `CHANGES_REQUESTED`

The Contract state is already canonical: parent request for changes moves `READY_FOR_REVIEW -> CHANGES_REQUESTED`.

Still undecided is how requested corrections affect task progress that already reached its target count. Candidates include leaving completion events/counters unchanged and treating remediation as contract-level review work, or explicitly invalidating/replacing selected completion evidence.

Do not implement task-event invalidation or automatic counter reduction until this is explicitly decided.

---

## OPEN-010 — Task Completion Undo

The completion-event model is immutable by default, but user-facing undo behavior is not yet selected. Candidates include no undo in MVP or an explicit reversal/revocation event model.

Do not delete Task Completion records to implement undo until this decision is resolved.

---

## OPEN-011 — Contract Expiry and Cancellation Policy

Exact automatic expiry semantics, behavior around a deadline while under review/correction, who may cancel, allowed states for cancellation, and required cancellation metadata remain undecided.

Deadline display is in scope before this policy is finalized; automatic expiry/cancellation mutations are not.

---

## OPEN-012 — Review Cycle Numbering

Review records are immutable, but the exact meaning and increment timing of `reviewCycle` is not yet locked. Do not infer a numbering rule from examples alone.

---

## OPEN-013 — Firestore Serialization Contract

Before persisted domain schemas are treated as final, explicitly decide:

- omission versus `null` for optional fields;
- the shared timestamp boundary representation;
- which Firestore convenience fields are persistence-only projections;
- which fields belong in canonical domain schemas versus repository/read models.

The collection topology and conceptual domain meaning are already defined; this OPEN item concerns exact serialization.

---

## OPEN-014 — Individual Child Device Access Revocation

Push registration revocation is not the same as Firebase Auth session revocation. Decide whether MVP needs individual paired-device auth revocation or whether child-wide refresh-token revocation is sufficient for the first release.

---

# Decision Change Procedure

When an accepted decision needs to change:

1. Do not silently edit the original rationale.
2. Add a new ADR with a new number.
3. Set the previous ADR to **Superseded**.
4. Reference the replacement ADR.
5. Explain why the earlier assumption no longer holds.
6. Update affected architecture and implementation documentation.
7. Only then modify implementation.

---

# Current Foundation Summary

The active ChoreX foundation is:

```text
Two mobile apps
        │
        ├── Parent App
        └── Child App
        │
        ▼
React Native + Expo + TypeScript
        │
        ▼
Shared pnpm monorepo
        │
        ├── domain
        ├── ui
        ├── firebase-client
        ├── notifications
        ├── config
        └── test-utils
        │
        ▼
Firebase
        ├── Authentication
        ├── Firestore
        ├── Cloud Functions
        └── Storage
        │
        ▼
Server-authoritative lifecycle
        │
        ▼
Offer
→ Negotiation
→ Contract
→ Execution
→ Review
→ Reward earned
→ Reward fulfilled
```

The first implementation priority is to prove this lifecycle end-to-end before expanding product scope.
