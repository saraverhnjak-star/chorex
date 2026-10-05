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

| Current          | Command        | Actor  | Result                     |
| ---------------- | -------------- | ------ | -------------------------- |
| DRAFT            | `publishOffer` | Parent | AWAITING_CHILD             |
| AWAITING_CHILD   | `counterOffer` | Child  | AWAITING_PARENT            |
| AWAITING_PARENT  | `counterOffer` | Parent | AWAITING_CHILD             |
| AWAITING_CHILD   | `acceptOffer`  | Child  | ACCEPTED + create Contract |
| AWAITING_PARENT  | `acceptOffer`  | Parent | ACCEPTED + create Contract |
| AWAITING_CHILD   | `rejectOffer`  | Child  | REJECTED                   |
| AWAITING_PARENT  | `rejectOffer`  | Parent | REJECTED                   |
| DRAFT/AWAITING_* | `cancelOffer`  | Parent | CANCELLED                  |
| AWAITING_*       | system expiry  | System | EXPIRED                    |

### Invariants

- `counterOffer` uses the exact current revision and active participant memberships. A Child supplies reward/note only; the server copies tasks/deadline. A Parent responding in `AWAITING_PARENT` to the active Child's proposal supplies complete tasks, deadline and reward (plus optional note), as permitted by ADR-029. Both paths create the next sequential immutable revision in one transaction, switch the waiting actor, record the proposer role in `OFFER_COUNTERED`, and complete idempotency state. Neither path creates a Contract or Reward.
- Parent proposed deadlines must be in the future according to server time. The existing source-deadline guard remains in both paths; this does not process Offer expiry.
- Concurrent counteroffers serialize on the Offer document; losing or stale actions cannot create a second current revision or branch history.
- `rejectOffer` also uses the exact current revision and its existing idempotency key. Parent rejection requires `AWAITING_PARENT`, the active Parent participant, and the active Child participant's current counterproposal. The shared transaction moves the Offer to exactly `REJECTED`, records one `OFFER_REJECTED` event with the authenticated actor's role, and completes idempotency state. It leaves every revision unchanged and creates no Contract or Reward. Concurrent accept/counter/reject commands serialize on the same Offer; only one transition wins. The Parent confirms that rejection ends this negotiation before submission, and realtime state removes the item after the backend commits.
- The actor may accept only a revision proposed by the other side.
- Acceptance references an exact revision ID.
- Acceptance is idempotent: retries must return the same resulting contract.
- Parent acceptance requires `AWAITING_PARENT`, the active Parent participant, and a current revision authored by the active Child participant. The accepted deadline must still be in the future according to server time.
- Both acceptance paths share one atomic Contract-creation transaction: `ACCEPTED` Offer, deterministic `ACTIVE` Contract and tasks, frozen reward/deadline/task terms, initial `reviewCycle: 0`, one activity event recording the accepting actor's role, and completed idempotency state. Acceptance creates no earned Reward. ADR-043 defines zero-based review rounds.
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
                   | child addresses feedback and explicitly re-submits
                   +------------------------> READY_FOR_REVIEW

Expiry and cancellation transitions are intentionally not fully specified yet (see `DECISIONS.md`, OPEN-011). Do not implement automatic expiry or general cancellation semantics until that policy is explicitly decided.
```

`recordTaskCompletion` is an authenticated, idempotent Child command valid only in `ACTIVE`. It records one immutable completion and increments the assigned task's counter by one, without changing Contract status or review cycle. Full tasks return `TASK_ALREADY_COMPLETE`; every other Contract state rejects new progress with `INVALID_STATE`. Committed retries return their original receipt after current membership/ownership checks. This command does not enforce a deadline cutoff or resolve OPEN-010/011; ADR-044 keeps CHANGES_REQUESTED progress read-only. Child progress displays update only from committed realtime task snapshots.

`submitContractForReview` requires the Contract's authenticated active Child participant and either `ACTIVE` or `CHANGES_REQUESTED` for a new action. The following completeness checks describe the unchanged ACTIVE branch. One transaction reads every persisted scoped ContractTask, validates family/Contract/assignee and bounded counters, requires a nonempty task collection with each `completedCount === targetCount`, and moves the Contract to `READY_FOR_REVIEW`. Incomplete tasks return `TASKS_INCOMPLETE`; invalid counters or zero tasks return `INVALID_STATE`. It updates only Contract status/updatedAt, creates one `CONTRACT_SUBMITTED` Child activity event, and completes idempotency state. Same-key retries return the original canonical receipt after current authorization checks; different-key competitors serialize on the Contract and the loser returns `INVALID_STATE`. Completion races are checked against transactional task reads.

Initial ACTIVE submission preserves frozen terms, task counts/history and `reviewCycle`, creates no Review or Reward, and imposes no deadline cutoff. OPEN-010/011 remain unresolved; ADR-043 defines review numbering and ADR-044 resolves correction semantics. The Child confirms submission deliberately, waits for backend confirmation and uses realtime Contract state. Parent detail receives that state without new review actions. Initial submission and resubmission use the existing committed-event dispatcher to notify the active Parent.

`approveContract` requires the authenticated active Parent participant and exactly `READY_FOR_REVIEW` for a new action. A single transaction creates the deterministic review for the Contract/current cycle, transitions to `APPROVED` with `approvedAt`/`updatedAt`, creates the deterministic pending Reward from frozen Contract terms, writes one Parent `CONTRACT_APPROVED` event and completes idempotency state. Approval preserves `reviewCycle` and task/completion history. Currently authorized same-key retries return the original receipt; different-key approval of an already approved Contract fails `INVALID_STATE`. A pre-existing decision for the round or Reward prevents another transition. Notification is a committed-event effect. The shared review-decision transaction also implements requestContractChanges below. Resubmission is implemented through submitContractForReview.

`requestContractChanges` requires the same authenticated active Parent participant and exactly READY_FOR_REVIEW. Its required trimmed feedback is stored only in the immutable REQUEST_CHANGES Review. The same deterministic Contract/cycle review slot used by approval prevents both decisions from committing for one round. The transaction moves only status to CHANGES_REQUESTED, updates updatedAt, writes one Parent CONTRACT_CHANGES_REQUESTED event and completes idempotency state; reviewCycle remains unchanged. Same-key retries return the original receipt; a different normalized note or Contract conflicts. No Reward, task-count change or completion invalidation is introduced. ADR-044 defines contract-level remediation.

For CHANGES_REQUESTED, submitContractForReview validates the deterministic current REQUEST_CHANGES review (family, Contract, cycle, Parent reviewer, required feedback), absent next-cycle review and absent Reward, and persisted task ownership/bounded counters. It preserves execution data rather than requiring new completions, atomically sets READY_FOR_REVIEW and reviewCycle + 1, writes one Child CONTRACT_SUBMITTED event and completes the existing idempotency receipt. Missing/inconsistent review state fails INVALID_STATE. No Review is created; retries return the original result, and competing keys permit one increment only.

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

ADR-043 defines `reviewCycle` as the zero-based current/most recently opened round. Creation initializes `0`; first submission opens round `0` unchanged. A successful resubmission from `CHANGES_REQUESTED` increments the counter atomically. At most one Parent decision exists per Contract/cycle. ADR-044 preserves task progress during contract-level remediation.

When a parent requests changes:

- write an immutable `ContractReview` with decision `REQUEST_CHANGES`;
- preserve every prior review; ADR-043 requires `ContractReview.cycle = Contract.reviewCycle`, without incrementing on a Parent decision;
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
