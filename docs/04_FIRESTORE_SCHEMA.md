# ChoreX - Firestore Schema

## 1. Modeling strategy

Use a small number of top-level domain collections plus scoped subcollections for naturally nested records.

Goals:

- easy family-scoped queries;
- strong security boundaries;
- immutable revision/review/event history;
- minimal denormalization;
- server-authoritative writes;
- predictable indexes.

### Serialization contract

ADR-036 defines the Firestore serialization boundary:

- canonical domain timestamps are normalized UTC ISO-8601 strings;
- Firestore stores native `Timestamp` values, converted by infrastructure adapters at the domain boundary;
- optional fields are omitted by default;
- `null` is used only for an explicit persistence state documented for that field; and
- query, index, authorization lookup, and denormalization fields remain persistence projections unless the Domain Model independently defines them.

The JSON-like examples below use `"serverTimestamp"` to mean a server timestamp write that resolves to a native Firestore `Timestamp`, and `"timestamp"` to mean an already stored native Firestore `Timestamp`. These labels are documentation notation, not persisted strings.

## 2. Proposed collections

```text
/users/{uid}
/users/{uid}/devices/{deviceId}

/families/{familyId}
/families/{familyId}/members/{uid}

/offers/{offerId}
/offers/{offerId}/revisions/{revisionId}

/contracts/{contractId}
/contracts/{contractId}/tasks/{taskId}
/contracts/{contractId}/tasks/{taskId}/completions/{completionId}
/contracts/{contractId}/reviews/{reviewId}

/rewards/{rewardId}

/auctions/{auctionId}
/auctions/{auctionId}/bids/{bidId}

/activityEvents/{eventId}

/pairingSessions/{pairingSessionId}  # server-only reads/writes
/idempotency/{key}                   # server-only implementation detail
```

## 3. Users

`/users/{uid}`

```json
{
  "displayName": "Alex",
  "accountType": "PARENT",
  "familyIds": ["familyId"],
  "avatarKey": "avatar-03",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Do not store family role solely on the user document. Membership is family-specific and belongs in `/families/{familyId}/members/{uid}`.

`familyIds` is a server-managed persistence projection for Parent and Child family discovery, as defined by ADR-037 and extended by ADR-041. It does not belong in the canonical `UserProfile` schema and does not replace membership authorization. During the single-family MVP, clients read the Family referenced by the sole valid ID. A Parent with zero IDs has incomplete onboarding; a Child with zero or malformed IDs has incomplete setup. Either app returns `MULTIPLE_FAMILIES_UNSUPPORTED` if more than one ID is present.

## 4. Device registrations

`/users/{uid}/devices/{deviceId}`

```json
{
  "platform": "ios",
  "appVariant": "CHILD",
  "expoPushToken": "ExponentPushToken[...]",
  "pushEnabled": true,
  "appVersion": "1.0.0",
  "lastSeenAt": "serverTimestamp",
  "createdAt": "serverTimestamp"
}
```

`deviceId` should be an app-generated installation identifier stored in SecureStore, not a hardware identifier.

## 5. Family and membership

`/families/{familyId}`

```json
{
  "name": "Smith Family",
  "createdBy": "parentUid",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

`/families/{familyId}/members/{uid}`

```json
{
  "role": "CHILD",
  "displayName": "Mia",
  "status": "ACTIVE",
  "joinedAt": "serverTimestamp"
}
```

The first family-onboarding mutation is the authenticated, idempotent `createFamily` callable. In one atomic operation it creates `/users/{uid}` if absent, adds the new Family ID to the profile's `familyIds` projection, creates `/families/{familyId}`, and creates `/families/{familyId}/members/{uid}` with an active Parent role. The server takes `uid` from Firebase Authentication and assigns ownership and role; those authoritative values are not accepted from the client.

The authenticated, idempotent `createChild` callable requires the actor's active Parent membership. It accepts only `familyId`, `displayName`, and an idempotency key; the server derives the Child UID and role. Following ADR-038 and ADR-041, it reserves the deterministic UID before Auth creation, then atomically creates the Child profile with its `familyIds` projection, active Child membership, `CHILD_CREATED` activity event, and completed idempotency state. This permits a retry to finish after an Auth/Firestore partial failure without creating another child; a matching completed retry safely backfills a missing projection without adding a duplicate.

## 6. Offers

`/offers/{offerId}`

```json
{
  "familyId": "familyId",
  "parentUid": "parentUid",
  "childUid": "childUid",
  "participantUids": ["parentUid", "childUid"],
  "status": "DRAFT",
  "currentRevisionId": "revisionId",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Revision:

`/offers/{offerId}/revisions/{revisionId}`

```json
{
  "revisionNumber": 1,
  "proposedByUid": "parentUid",
  "proposedByRole": "PARENT",
  "tasks": [
    { "title": "Load the dishwasher", "targetCount": 1 },
    { "title": "Take out the trash", "targetCount": 3 }
  ],
  "reward": {
    "title": "Cinema",
    "description": "Choose a movie this weekend",
    "type": "EXPERIENCE"
  },
  "deadlineAt": "timestamp",
  "createdAt": "serverTimestamp"
}
```

The revision array of tasks is acceptable because a revision is a small immutable snapshot, not a high-write object.

The authenticated, idempotent `createOfferDraft` command creates the `DRAFT` Offer, immutable complete revision 1, and completed server-only idempotency record atomically with deterministic Offer and revision IDs. The selected Parent and Child must both have active memberships in the supplied Family. Optional task and reward descriptions are omitted when absent.

The Child branch of the authenticated, idempotent `counterOffer` command requires the Offer's active Child participant, the exact current Parent-proposed revision, `AWAITING_CHILD`, and a future deadline according to server time. It creates the next deterministic immutable revision, derives the Child author fields server-side, copies tasks and deadline exactly, stores only the new reward terms and optional note from the client, moves the Offer to `AWAITING_PARENT`, writes one `OFFER_COUNTERED` activity event, and completes server-only idempotency state in one transaction.

The Parent branch extends that same `counterOffer` command. It requires the active Parent participant, `AWAITING_PARENT`, and the exact current revision authored by the active Child participant. Its strict request includes complete task terms, a UTC deadline and reward terms, plus an optional note; authoritative proposer identity and role are never client input. The transaction creates the next deterministic sequential revision with `proposedByRole: PARENT`, updates the Offer to `AWAITING_CHILD` with the new `currentRevisionId`, writes one `OFFER_COUNTERED` event with `actorType: PARENT`, and completes idempotency state. Both the source deadline and proposed deadline must be in the future according to server time. Previous revisions remain unchanged, and counteroffering creates no Contract or Reward.

The Child inbox subscribes to `AWAITING_CHILD` Offers by `familyId`, the signed-in Child in `participantUids`, and descending `updatedAt`. The Parent negotiation inbox subscribes to `AWAITING_PARENT` Offers by `familyId`, the signed-in creating `parentUid`, that same UID in `participantUids`, and descending `updatedAt`. Each client snapshot loads only the revision named by `currentRevisionId`; missing or malformed current revisions fail the whole snapshot instead of retaining stale terms. Clients discard revision loads completed for an older Offer snapshot.

## 7. Contracts

`/contracts/{contractId}`

```json
{
  "familyId": "familyId",
  "parentUid": "parentUid",
  "childUid": "childUid",
  "participantUids": ["parentUid", "childUid"],
  "source": {
    "type": "OFFER",
    "offerId": "offerId",
    "revisionId": "revisionId"
  },
  "rewardTerms": {
    "title": "Cinema",
    "description": "Choose a movie this weekend",
    "type": "EXPERIENCE"
  },
  "deadlineAt": "timestamp",
  "status": "ACTIVE",
  "reviewCycle": 0,
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Tasks are copied from accepted terms into:

`/contracts/{contractId}/tasks/{taskId}`

```json
{
  "familyId": "familyId",
  "contractId": "contractId",
  "assigneeUid": "childUid",
  "title": "Clean your room",
  "targetCount": 100,
  "completedCount": 37,
  "lastCompletedAt": "timestamp",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

The authenticated, idempotent `acceptOffer` command requires the Offer's active Child participant, the exact current Parent-proposed revision, `AWAITING_CHILD`, and a future revision deadline according to server time. In one transaction it moves the Offer to `ACCEPTED`, creates one deterministic `ACTIVE` Contract, copies the immutable reward terms and deadline, creates deterministic Contract tasks at `completedCount: 0`, initializes `reviewCycle: 0`, writes one `OFFER_ACCEPTED` activity event, and completes the server-only idempotency record. No Reward entity exists until Contract approval. ADR-043 defines zero-based review rounds; first submission and Parent decisions preserve this value.

The authenticated, idempotent `rejectOffer` command retains its Child branch: the Offer's active Child participant rejects the exact current Parent-proposed revision in `AWAITING_CHILD`. Its Parent branch requires `AWAITING_PARENT`, the Offer's active Parent participant, and the exact current revision proposed by the Offer's active Child participant. Both paths use the existing `currentRevisionId` and idempotency key, atomically move the Offer to `REJECTED`, write one `OFFER_REJECTED` event with the authenticated actor UID and role, and complete server-only idempotency state. Same-key retries return the canonical rejected Offer without duplicate events. No revision is rewritten or deleted, and no Contract, Contract task, or Reward is created.

### Submission persistence

`submitContractForReview` accepts only `{ contractId, idempotencyKey }`. The active authenticated Child participant's transaction reads Contract, membership, idempotency and the entire `/contracts/{contractId}/tasks` collection. For initial ACTIVE submission, every task must match family/Contract/assignee, have valid bounded counters, and meet its target exactly. Empty or invalid task state fails; incomplete tasks return `TASKS_INCOMPLETE`.

The ACTIVE transaction updates only `status: READY_FOR_REVIEW` and native server `updatedAt`, creates deterministic `/activityEvents/activity_{sha256(command:actor:key)}` with `type: CONTRACT_SUBMITTED`, `entityType: CONTRACT`, Contract ID, authenticated Child UID and `actorType: CHILD`, and creates completed `/idempotency/{sha256}` state. That state stores command/actor/family/Contract IDs, payload hash, activity ID, completedAt and the canonical original `{ contract }` response (UTC ISO timestamps). Conflicting input reuse returns `IDEMPOTENCY_CONFLICT`; currently authorized same-key retries return the original response after later state changes.

Accepted terms and task projections/completions remain unchanged. Initial submission preserves reviewCycle; ADR-044 resubmission below increments it once. Both modes create no Review or Reward; the committed submission event now owns a Parent notification effect through the existing dispatcher. Client writes remain denied. See [Slice 3 verification](PHASE_3_SLICE_3_ACCEPTANCE.md) and [resubmission verification](PHASE_4_RESUBMISSION_ACCEPTANCE.md).

## 8. Task completions

`/contracts/{contractId}/tasks/{taskId}/completions/{completionId}`

```json
{
  "familyId": "familyId",
  "contractId": "contractId",
  "taskId": "taskId",
  "childUid": "childUid",
  "ordinal": 37,
  "createdAt": "serverTimestamp"
}
```

`recordTaskCompletion` uses one Firestore transaction to:

1. read contract and task;
2. verify actor and legal contract state;
3. verify `completedCount < targetCount`;
4. create the completion record;
5. increment `completedCount`;
6. update timestamps;
7. write one `TASK_COMPLETED` activity event with `actorType: CHILD` and authenticated actor UID;
8. complete actor/command/key-scoped `/idempotency/{sha256}` state.

Its strict input is `{ contractId, taskId, idempotencyKey }`. Membership and family/Child/assignee identity, `ACTIVE` state, target count and next ordinal come from persisted state. IDs are single document IDs; clients cannot provide counters, ordinals, ownership, notes or Contract state. Existing optional domain notes remain unused by this command.

The completion document ID and activity ID derive deterministically from command, actor UID and key. `createdAt` is the server-command occurrence timestamp; the same timestamp becomes the task's `lastCompletedAt` and `updatedAt`. Creation of the completion/activity/idempotency records uses transaction `create`, and the task counter increments by exactly one in that same transaction. Task requirements, Contract terms/status/review cycle and accepted Offer revisions are unchanged.

Completed idempotency state stores the canonical original `{ completion, task }` response as a receipt, including its original counter/timestamps. A same-key retry revalidates membership/ownership and returns that receipt even after later progress; this is not the current task read projection. Conflicting key reuse returns `IDEMPOTENCY_CONFLICT`. Different keys serialize on the task read/write; at the final occurrence only one transaction can commit. Failed actions create no completion/activity/idempotency record. No Reward, review or notification effect is created.

See [Phase 3 Slice 2 verification](PHASE_3_SLICE_2_ACCEPTANCE.md).

## 9. Reviews

`/contracts/{contractId}/reviews/{reviewId}`

```json
{
  "familyId": "familyId",
  "contractId": "contractId",
  "cycle": 0,
  "reviewerUid": "parentUid",
  "decision": "REQUEST_CHANGES",
  "note": "Please finish the last task.",
  "createdAt": "serverTimestamp"
}
```

ADR-043 requires zero-based round numbering. Approval records use deterministic `review_{sha256(contractId + ":" + reviewCycle)}` IDs, shared by either Parent decision type, preventing duplicate decisions for one round. Prior records are immutable.

## 10. Rewards

`/rewards/{rewardId}`

```json
{
  "familyId": "familyId",
  "contractId": "contractId",
  "parentUid": "parentUid",
  "childUid": "childUid",
  "terms": {
    "title": "Cinema",
    "type": "EXPERIENCE",
    "description": "Choose a movie this weekend"
  },
  "status": "PENDING_FULFILLMENT",
  "earnedAt": "serverTimestamp"
}
```

Useful Parent app query:

```text
where familyId == selectedFamilyId
where parentUid == currentUid
where status == PENDING_FULFILLMENT
orderBy earnedAt desc
```

### Approval persistence

`approveContract` accepts only `{ contractId, idempotencyKey }`. The transaction loads authoritative Contract and active Parent membership; it requires the actor to equal `parentUid` and be a participant. New approval requires READY_FOR_REVIEW and absent round-review/Contract-Reward records.

Atomically it creates `/contracts/{contractId}/reviews/review_{sha256(contractId + ":" + reviewCycle)}` with APPROVE/current cycle/reviewer/server timestamp; updates only Contract status, approvedAt and updatedAt; creates `/rewards/reward_{sha256(contractId)}` with the shape above and frozen Contract rewardTerms; creates one Parent CONTRACT_APPROVED activity event with Contract, review and Reward IDs; and completes actor/command/key-scoped idempotency state storing the canonical `{ contract, review, reward }` receipt. No fulfillment fields are present. Same-key receipts are historical responses, including after later Reward changes, and do not replace realtime state.

Direct client writes remain denied. Approval itself reads only Contract/task state. The request-changes feedback read is scoped to the current review round below; Reward reads use the separate ownership-scoped surfaces described next. The Ready-for-Review list reuses the existing family/participant/status/createdAt index and native metadata-aware listeners.

### Fulfillment persistence and Reward reads

`fulfillReward` accepts only `{ rewardId, idempotencyKey }`. Active Parent membership and exact Reward parentUid are required. Transaction reads validate PENDING_FULFILLMENT, deterministic Reward identity, an APPROVED Contract with matching family/participants, identical frozen terms and native approvedAt equal to earnedAt. No client-supplied ownership or lifecycle fields are accepted.

One atomic transaction updates only Reward status to FULFILLED, native fulfilledAt and fulfilledBy (authenticated Parent UID), creates one REWARD_FULFILLED event with actorType PARENT/entityType REWARD, and completes the established actor/command/key-scoped idempotency record. The Reward is retained. Original earning timestamp, terms and references stay unchanged; no Contract, Review, task, completion or revision is written. Same-key retries return the original canonical `{ reward }` receipt without rewriting timestamps/events. Conflicting input fails IDEMPOTENCY_CONFLICT; new different-key fulfillment fails REWARD_ALREADY_FULFILLED.

Parent pending queries constrain familyId, authenticated parentUid and PENDING_FULFILLMENT, ordered earnedAt descending. Child earned queries constrain familyId and authenticated childUid, ordered earnedAt descending, including both pending and fulfilled records. Equal timestamps use Firestore's implicit document-ID ordering. The two concrete composite indexes below support these queries. Detail reads address the stable Reward ID. Rules permit reads only to active family members named as Reward Parent/Child, and deny all client writes. Native metadata-aware listeners expose cache state, clean up on scope/session changes and converge after reconnect; no custom persistence or offline command queue is added.

### Request-changes persistence and feedback reads

`requestContractChanges({ contractId, idempotencyKey, note })` shares the approval transaction, active Parent authorization and `review_{sha256(contractId + ":" + reviewCycle)}` slot. Note uses the existing required trimmed description validation (1–500 characters); normalized Contract ID/note form the idempotency payload hash. Conflicting note reuse cannot edit a prior Review.

It atomically creates the current-cycle REQUEST_CHANGES review with feedback/native createdAt, updates only Contract status CHANGES_REQUESTED and updatedAt, writes one Parent CONTRACT_CHANGES_REQUESTED event with Contract/review IDs (no feedback content), and completes idempotency state with canonical `{ contract, review }`. It creates no Reward and preserves execution/negotiation history and frozen terms. Approval versus request changes has one transactional winner.

The minimum client feedback query is the Contract's reviews subcollection constrained by familyId, contractId and authoritative current cycle, limited to 2 to detect corrupt duplicate decisions. Rules permit get/list across all committed rounds only to active members who are named Contract participants, with matching stored family/Contract. Every client write remains denied. The current-feedback adapter retains its cycle filter/limit 2 and rejects malformed/mismatched or duplicate current reviews. Complete history uses the same familyId/contractId constraints and orderBy cycle ascending, without a limit or status filter; its adapter validates shared Review fields, Parent author, required REQUEST_CHANGES note and duplicate cycles. One concrete reviews COLLECTION index (familyId, contractId, cycle ascending) supports that query. Listeners include native cache metadata and clean up on identity/scope changes; the history listener survives lifecycle/round changes. Both Contract details expose read-only Review history. No alternate note storage or custom cache is introduced.

## 11. Auctions

`/auctions/{auctionId}`

```json
{
  "familyId": "familyId",
  "parentUid": "parentUid",
  "reward": { "title": "Cinema", "type": "EXPERIENCE" },
  "eligibleChildUids": ["childA", "childB"],
  "status": "OPEN",
  "biddingEndsAt": "timestamp",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Bid:

`/auctions/{auctionId}/bids/{bidId}`

```json
{
  "familyId": "familyId",
  "auctionId": "auctionId",
  "childUid": "childA",
  "tasks": [
    { "title": "Wash the car", "targetCount": 1 },
    { "title": "Clean the kitchen", "targetCount": 1 }
  ],
  "status": "ACTIVE",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

## 12. Activity events

Top-level collection simplifies a family activity feed.

`/activityEvents/{eventId}`

```json
{
  "familyId": "familyId",
  "actorUid": "childUid",
  "actorType": "CHILD",
  "type": "CONTRACT_SUBMITTED",
  "entityType": "CONTRACT",
  "entityId": "contractId",
  "createdAt": "serverTimestamp"
}
```

Keep event metadata small and structured.

## 13. Pairing sessions

Pairing data is server-only and short-lived.

`/pairingSessions/{id}` might contain:

```json
{
  "familyId": "familyId",
  "childUid": "childUid",
  "tokenHash": "sha256Hash",
  "expiresAt": "timestamp",
  "createdBy": "parentUid",
  "attemptCount": 0,
  "status": "ACTIVE",
  "createdAt": "serverTimestamp"
}
```

Per ADR-039, `createPairingSession` issues a random 128-bit base64url token that expires exactly 10 minutes after creation. Firestore stores only its SHA-256 hash. The creating invocation receives the plaintext token once; an idempotent replay returns the same session ID and expiry with the token omitted. Creating a new session for the same Child atomically changes prior active sessions to `INVALIDATED`. Pairing sessions remain inaccessible to Firestore clients.

Per ADR-040, successful redemption changes `status` to `REDEEMED` and adds native `Timestamp` `redeemedAt` plus `redemptionIdempotencyKeyHash`. The same token and idempotency key may retry custom-token minting for the same Child; every other replay fails. One `PAIRING_SESSION_REDEEMED` activity event is written by the successful transaction.

`/pairingRateLimits/{sourceHmac_windowStart}` is also server-only. Each record stores the HMAC-derived `sourceKey`, native `Timestamp` values `windowStartedAt` and `expiresAt`, plus `totalCount` and `failedCount`. The raw source IP and HMAC secret are never persisted.

## 14. Expected composite indexes

Exact indexes should be generated from real queries, but plan for:

```text
offers:    familyId + participantUids(array-contains) + status + updatedAt desc
offers:    familyId + parentUid + participantUids(array-contains) + status + updatedAt desc
contracts: familyId + childUid + status + updatedAt desc
contracts: familyId + parentUid + status + updatedAt desc
rewards:   familyId + parentUid + status + earnedAt desc
rewards:   familyId + childUid + earnedAt desc
reviews:   familyId + contractId + cycle asc
auctions:  familyId + eligibleChildUids(array-contains) + status + biddingEndsAt
activity:  familyId + createdAt desc
```

Do not create speculative indexes before queries exist.

## 15. Query ownership

Prefer queries that are inherently family- and user-scoped. Firestore Security Rules are not filters; queries must be compatible with the rule constraints.

## 16. Denormalization policy

Accept deliberate duplication for:

- `familyId` on top-level queryable domain documents;
- participant IDs for query convenience;
- frozen reward/task terms in contracts;
- `completedCount` as a transactional projection of completion events.

Avoid copying full user profiles into every document. If a historical display name is required later, add explicit snapshots for that purpose.

## Phase 2 notification effect persistence

Each committed negotiation activity event may own `/activityEvents/{eventId}/notificationEffects/expo`. The dispatcher alone writes its delivery lease, attempt count, terminal/retry status, recipient UID, minimal routing metadata, device count and Expo ticket IDs. Clients cannot read or write these records under the existing deny-by-default Rules. Rejection events have no notification effect. This record stores delivery bookkeeping and does not duplicate authoritative Offer/Contract state; see `docs/06_PUSH_NOTIFICATIONS.md` for dispatch and retry semantics.

## Correction and resubmission persistence (ADR-044)

The existing submitContractForReview command additionally accepts CHANGES_REQUESTED. It reads the deterministic current-cycle REQUEST_CHANGES review, validates identity/required feedback and absence of a next-cycle decision/Reward, and reads structurally valid scoped tasks without modifying them. One transaction updates status READY_FOR_REVIEW, reviewCycle + 1 and updatedAt, creates the canonical Child CONTRACT_SUBMITTED event (reviewCycle identifies the opened round), and completes the existing idempotency receipt. Initial ACTIVE submission preserves its cycle. No new Review, TaskCompletion or Reward exists on resubmission. Immutable previous reviews and all execution/frozen terms remain unchanged; direct writes remain denied.

## Server-only push receipt work (Phase 5 Slice 1)

`pushReceipts/{workId}` contains minimal operational data: `eventId`, `ticketId`, `registrations[]` (`devicePath`, SHA-256 `tokenHash`, captured native `lastSeenAt` when available), `complete`, `status`, `attempts`, native `createdAt`, `expiresAt`, `nextAttemptAt`; processing adds `leaseId`, `category`, `updatedAt`, `completedAt`, `deleteAfter` as applicable. The work ID deterministically hashes event/ticket/message index. States are PENDING, PROCESSING, SUCCEEDED, DEVICE_INVALID, MESSAGE_ERROR, PROVIDER_ERROR and EXHAUSTED. These are infrastructure states, not domain lifecycle enums.

Records contain no raw token, message body, credential or domain terms. Existing client catch-all denial protects reads and writes. Pending and retention queries use `(complete, nextAttemptAt)` and `(complete, deleteAfter)` indexes. Terminal data is retained seven days; bounded worker deletion requires no separate TTL service. Device cleanup changes only canonical `pushEnabled`; existing device registration schema is unchanged.
