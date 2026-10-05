# ChoreX - Domain Model

## 1. Core terminology

Use these terms consistently in code, UX copy, Firestore, tests, and documentation.

| Term               | Meaning                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| Family             | Security and collaboration boundary containing guardians and children.                  |
| Parent             | Adult/guardian member who can create offers, review work, and fulfill rewards.          |
| Child              | Child member who can negotiate offers, perform tasks, submit work, and bid in auctions. |
| Offer              | A negotiable proposal containing tasks, deadline, and reward terms.                     |
| Offer Revision     | Immutable snapshot of one side's proposed terms.                                        |
| Contract           | Frozen accepted terms that are now being executed.                                      |
| Contract Task      | One task within a contract, including a target count and progress.                      |
| Task Completion    | One recorded completion event for a repeated task.                                      |
| Review             | Parent decision on a submitted contract: approve or request changes.                    |
| Reward             | What the child earns after contract approval.                                           |
| Reward Fulfillment | Parent delivery of an earned reward.                                                    |
| Auction            | Parent-posted reward opportunity open to multiple eligible children.                    |
| Bid                | A child's proposed work in exchange for the auction reward.                             |
| Activity Event     | Immutable audit record describing a meaningful domain event.                            |
| Device             | One registered installation capable of receiving push notifications.                    |

## 2. Global invariants

1. Every family-scoped domain object is associated with exactly one family.
2. A child can only access family data for a family in which they are an active member.
3. A contract is created from one accepted offer revision or one selected auction bid.
4. Contract terms are snapshots and do not change when an earlier offer is edited.
5. Only server code may create or change authoritative lifecycle state.
6. A reward is earned only after contract approval.
7. Reward fulfillment is separate from contract approval.
8. A repeated task may never exceed its target count unless the domain explicitly supports over-completion later.
9. Every critical command is idempotent or carries an idempotency key.
10. Important transitions create an activity event.

## 3. TypeScript sketches

These sketches describe intent, not final generated code.

```ts
export type UserRole = 'PARENT' | 'CHILD';
export type UtcIsoDateTime = string; // normalized UTC ISO-8601

export interface UserProfile {
  uid: string;
  displayName: string;
  avatarKey?: string;
  accountType: UserRole;
  createdAt: UtcIsoDateTime;
}

export interface Family {
  id: string;
  name: string;
  createdBy: string;
  createdAt: UtcIsoDateTime;
  updatedAt: UtcIsoDateTime;
}

export interface FamilyMember {
  uid: string;
  familyId: string;
  role: UserRole;
  displayName: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  joinedAt?: UtcIsoDateTime;
}
```

Canonical domain timestamps are normalized UTC ISO-8601 strings, for example `2026-10-03T12:34:56.789Z`. Firestore infrastructure adapters convert these values to and from native Firestore `Timestamp` values. Canonical domain schemas do not import Firebase timestamp types.

Optional domain fields are omitted by default. `null` is used only when a field documents an explicit persistence state. Firestore query and denormalization fields are persistence projections and do not automatically belong in these canonical domain sketches.

Initial family onboarding uses an authenticated, idempotent `createFamily` server command. It atomically creates the Parent user profile if absent, the Family, and the authenticated Parent's active membership. The server derives the UID from authentication and assigns the Parent role; the client does not provide authoritative ownership or role fields.

## 4. Tasks

A task is a contract-specific requirement. Avoid a global chore catalog in the first MVP; templates can be added later.

```ts
export interface TaskTerms {
  title: string;
  description?: string;
  targetCount: number; // >= 1
}

export interface ContractTask extends TaskTerms {
  id: string;
  familyId: string;
  contractId: string;
  assigneeUid: string;
  completedCount: number; // 0..targetCount
  lastCompletedAt?: UtcIsoDateTime;
  createdAt: UtcIsoDateTime;
  updatedAt: UtcIsoDateTime;
}
```

Examples:

```text
"Load the dishwasher"       targetCount = 1
"Take out the trash"        targetCount = 5
"Clean your room"           targetCount = 100
```

Do not represent `100x` as 100 duplicated task documents.

## 5. Reward terms vs earned reward

Terms are negotiated before the contract exists. An earned reward is created only after approval.

```ts
export type RewardType =
  'EXPERIENCE' | 'ITEM' | 'MONEY' | 'PRIVILEGE' | 'CUSTOM';

export interface RewardTerms {
  title: string;
  description?: string;
  type: RewardType;
}

export interface Reward {
  id: string;
  familyId: string;
  contractId: string;
  parentUid: string;
  childUid: string;
  terms: RewardTerms; // frozen snapshot
  status: 'PENDING_FULFILLMENT' | 'FULFILLED' | 'CANCELLED';
  earnedAt: UtcIsoDateTime;
  fulfilledAt?: UtcIsoDateTime;
  fulfilledBy?: string;
}
```

## 6. Offer and revision model

The offer document stores current negotiation metadata. Every proposal is an immutable revision.

```ts
export interface Offer {
  id: string;
  familyId: string;
  parentUid: string;
  childUid: string;
  status:
    | 'DRAFT'
    | 'AWAITING_CHILD'
    | 'AWAITING_PARENT'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';
  currentRevisionId?: string;
  expiresAt?: UtcIsoDateTime;
  createdAt: UtcIsoDateTime;
  updatedAt: UtcIsoDateTime;
}

export interface OfferRevision {
  id: string;
  offerId: string;
  revisionNumber: number;
  proposedByUid: string;
  proposedByRole: UserRole;
  tasks: TaskTerms[];
  reward: RewardTerms;
  deadlineAt: UtcIsoDateTime;
  note?: string;
  createdAt: UtcIsoDateTime;
}
```

When accepted, the server creates a contract from exactly `currentRevisionId` inside a transaction.

## 7. Contract

```ts
export interface Contract {
  id: string;
  familyId: string;
  parentUid: string;
  childUid: string;
  source:
    | { type: 'OFFER'; offerId: string; revisionId: string }
    | { type: 'AUCTION'; auctionId: string; bidId: string };
  rewardTerms: RewardTerms;
  deadlineAt: UtcIsoDateTime;
  status:
    | 'ACTIVE'
    | 'READY_FOR_REVIEW'
    | 'CHANGES_REQUESTED'
    | 'APPROVED'
    | 'CANCELLED'
    | 'EXPIRED';
  reviewCycle: number;
  approvedAt?: UtcIsoDateTime;
  createdAt: UtcIsoDateTime;
  updatedAt: UtcIsoDateTime;
}
```

`APPROVED` means the child's obligation is complete. The associated reward may still be `PENDING_FULFILLMENT`.

## 8. Completion event

Repeated task progress should preserve individual actions for auditability.

```ts
export interface TaskCompletion {
  id: string;
  familyId: string;
  contractId: string;
  taskId: string;
  childUid: string;
  ordinal: number;
  note?: string;
  createdAt: UtcIsoDateTime;
}
```

For MVP, `recordTaskCompletion` creates an event and atomically increments the task's `completedCount`.

Undo semantics are intentionally unresolved (see `DECISIONS.md`, OPEN-010). Until that decision is made, do not implement completion deletion, reversal, or revocation behavior. Task Completion records remain immutable under the current model.

## 9. Review

ADR-043 defines zero-based review rounds. `Contract.reviewCycle` starts at `0`; first submission leaves it unchanged. A Parent review copies that value into `ContractReview.cycle` and does not increment it. Only a future successful resubmission increments it. One immutable Parent decision is allowed per Contract/cycle. OPEN-009 remains unresolved.

```ts
export interface ContractReview {
  id: string;
  familyId: string;
  contractId: string;
  cycle: number;
  reviewerUid: string;
  decision: 'APPROVE' | 'REQUEST_CHANGES';
  note?: string;
  createdAt: UtcIsoDateTime;
}
```

Approval should atomically:

1. create the review;
2. set contract `APPROVED`;
3. create the Reward if one does not already exist;
4. create activity events;
5. produce the notification event.

## 10. Auction and bid

```ts
export interface Auction {
  id: string;
  familyId: string;
  parentUid: string;
  reward: RewardTerms;
  eligibleChildUids: string[];
  status: 'DRAFT' | 'OPEN' | 'AWARDED' | 'CANCELLED' | 'EXPIRED';
  biddingEndsAt: UtcIsoDateTime;
  winningBidId?: string;
  createdAt: UtcIsoDateTime;
  updatedAt: UtcIsoDateTime;
}

export interface AuctionBid {
  id: string;
  familyId: string;
  auctionId: string;
  childUid: string;
  tasks: TaskTerms[];
  proposedDeadlineAt?: UtcIsoDateTime;
  note?: string;
  status: 'ACTIVE' | 'WITHDRAWN' | 'SELECTED' | 'NOT_SELECTED';
  createdAt: UtcIsoDateTime;
  updatedAt: UtcIsoDateTime;
}
```

Selecting a bid must be server-atomic: close the auction, mark the winning bid, mark losing bids, and create the contract once.

## 11. Activity event

```ts
export interface ActivityEvent {
  id: string;
  familyId: string;
  actorUid?: string; // absent for system action
  actorType: 'PARENT' | 'CHILD' | 'SYSTEM';
  type: string;
  entityType: 'OFFER' | 'CONTRACT' | 'TASK' | 'REWARD' | 'AUCTION' | 'FAMILY';
  entityId: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: UtcIsoDateTime;
}
```

Do not put secrets, pairing codes, auth tokens, or sensitive free-form payloads in activity metadata.

## Implemented approval boundary

`approveContract({ contractId, idempotencyKey })` is the active Parent participant's server command from exactly `READY_FOR_REVIEW`. It atomically creates an immutable APPROVE review at the existing zero-based cycle, marks the Contract APPROVED, and creates its single earned Reward in PENDING_FULFILLMENT. Terms come only from the frozen Contract. No approval note or fulfillment command is introduced. The current shared Reward output schema covers this pending earned boundary; other Reward lifecycle commands remain future work.

`requestContractChanges({ contractId, idempotencyKey, note })` shares the Parent review-decision transaction and round identity. Required feedback uses the existing trimmed, nonempty description convention (maximum 500 characters). It creates one immutable REQUEST_CHANGES Review at the unchanged cycle, transitions READY_FOR_REVIEW to CHANGES_REQUESTED, and creates no Reward. Current review feedback is read by the active Contract participants. No task/completion data is changed; this preservation is not a resolution of OPEN-009. Child correction/resubmission remains unimplemented.
