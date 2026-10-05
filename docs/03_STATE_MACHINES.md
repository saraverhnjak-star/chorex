# ChoreX - State Machines

Lifecycle state is server-authoritative. UI may optimistically display progress, but a server response determines whether a transition actually succeeded.

## 1. Offer negotiation

```text
                          child counteroffers
        +-----------------------------------------------+
        |                                               v
DRAFT -> AWAITING_CHILD ------------------------> AWAITING_PARENT
           |   |                                         |   |
           |   +--> REJECTED                             |   +--> REJECTED
           |                                             |
           +------------ accept -------------------------+----> ACCEPTED
           ^                                             |
           |                parent counteroffers          |
           +---------------------------------------------+

Either waiting state may also -> CANCELLED / EXPIRED
```

### Commands

| Current | Command | Actor | Result |
| --- | --- | --- | --- |
| DRAFT | `publishOffer` | Parent | AWAITING_CHILD |
| AWAITING_CHILD | `counterOffer` | Child | AWAITING_PARENT |
| AWAITING_PARENT | `counterOffer` | Parent | AWAITING_CHILD |
| AWAITING_CHILD | `acceptOffer` | Child | ACCEPTED + create Contract |
| AWAITING_PARENT | `acceptOffer` | Parent | ACCEPTED + create Contract |
| AWAITING_CHILD | `rejectOffer` | Child | REJECTED |
| AWAITING_PARENT | `rejectOffer` | Parent | REJECTED |
| DRAFT/AWAITING_* | `cancelOffer` | Parent | CANCELLED |
| AWAITING_* | system expiry | System | EXPIRED |

### Invariants

- `counterOffer` uses the exact current revision and active participant memberships. A Child supplies reward/note only; the server copies tasks/deadline. A Parent responding in `AWAITING_PARENT` to the active Child's proposal supplies complete tasks, deadline and reward (plus optional note), as permitted by ADR-029. Both paths create the next sequential immutable revision in one transaction, switch the waiting actor, record the proposer role in `OFFER_COUNTERED`, and complete idempotency state. Neither path creates a Contract or Reward.
- Parent proposed deadlines must be in the future according to server time. The existing source-deadline guard remains in both paths; this does not process Offer expiry.
- Concurrent counteroffers serialize on the Offer document; losing or stale actions cannot create a second current revision or branch history.
- The actor may accept only a revision proposed by the other side.
- Acceptance references an exact revision ID.
- Acceptance is idempotent: retries must return the same resulting contract.
- Parent acceptance requires `AWAITING_PARENT`, the active Parent participant, and a current revision authored by the active Child participant. The accepted deadline must still be in the future according to server time.
- Both acceptance paths share one atomic Contract-creation transaction: `ACCEPTED` Offer, deterministic `ACTIVE` Contract and tasks, frozen reward/deadline/task terms, initial `reviewCycle: 0`, one activity event recording the accepting actor's role, and completed idempotency state. Acceptance creates no earned Reward. Initial zero does not resolve later review-cycle numbering (OPEN-012).
- No accepted terms are mutated after contract creation.

## 2. Contract execution

```text
ACTIVE
  |
  | all task requirements satisfied + child submits
  v
READY_FOR_REVIEW
  |              \
  | approve       \ request changes
  v                v
APPROVED      CHANGES_REQUESTED
                   |
                   | child resumes / re-submits when requirements are satisfied
                   +------------------------> READY_FOR_REVIEW

Expiry and cancellation transitions are intentionally not fully specified yet (see `DECISIONS.md`, OPEN-011). Do not implement automatic expiry or general cancellation semantics until that policy is explicitly decided.
```

### Important semantic distinction

`APPROVED` does **not** mean the reward has been delivered. Approval earns the reward.

## 3. Reward fulfillment

```text
PENDING_FULFILLMENT -> FULFILLED
          |
          +---------> CANCELLED   # exceptional/admin path only
```

The Parent app should expose pending earned rewards as a parent obligation/to-do list.

## 4. Repeated tasks

Repeated tasks do not need their own lifecycle enum.

Derived state:

```text
completedCount == 0                  -> NOT_STARTED
0 < completedCount < targetCount     -> IN_PROGRESS
completedCount == targetCount        -> COMPLETE
```

The derived state should be computed, not stored, unless there is a proven query/performance reason.

## 5. Review cycles

When a parent requests changes:

- write an immutable `ContractReview` with decision `REQUEST_CHANGES`;
- preserve every prior review; exact `reviewCycle` numbering semantics remain OPEN-012 in `DECISIONS.md` and must not be invented during implementation;
- set the contract to `CHANGES_REQUESTED`;
- notify the child;
- allow the child to return to `READY_FOR_REVIEW` after addressing the issue.

Never overwrite the previous review.

## 6. Auction lifecycle

```text
DRAFT -> OPEN -> AWARDED
          |        |
          |        +-> Contract created from selected bid
          |
          +-> EXPIRED
          +-> CANCELLED
```

Bid lifecycle:

```text
ACTIVE -> SELECTED
   |
   +-> NOT_SELECTED
   +-> WITHDRAWN
```

### Auction invariants

- only eligible children may bid;
- a child may have at most one active bid per auction in MVP, updated through a server command;
- only an OPEN auction accepts bids;
- one and only one bid may be selected;
- awarding and contract creation happen atomically;
- the selected bid's task and reward terms are copied into the contract.

## 7. Illegal transitions

Every server command should return a stable error code for illegal transitions, for example:

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

The UI maps error codes to friendly localized messages. Do not couple UI to backend exception strings.
