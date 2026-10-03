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
  "avatarKey": "avatar-03",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Do not store family role solely on the user document. Membership is family-specific and belongs in `/families/{familyId}/members/{uid}`.

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

The first family-onboarding mutation is the authenticated, idempotent `createFamily` callable. In one atomic operation it creates `/users/{uid}` if absent, creates `/families/{familyId}`, and creates `/families/{familyId}/members/{uid}` with an active Parent role. The server takes `uid` from Firebase Authentication and assigns ownership and role; those authoritative values are not accepted from the client.

## 6. Offers

`/offers/{offerId}`

```json
{
  "familyId": "familyId",
  "parentUid": "parentUid",
  "childUid": "childUid",
  "participantUids": ["parentUid", "childUid"],
  "status": "AWAITING_CHILD",
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

`recordTaskCompletion` should use a Firestore transaction to:

1. read contract and task;
2. verify actor and legal contract state;
3. verify `completedCount < targetCount`;
4. create the completion record;
5. increment `completedCount`;
6. update timestamps;
7. write activity event.

## 9. Reviews

`/contracts/{contractId}/reviews/{reviewId}`

```json
{
  "familyId": "familyId",
  "contractId": "contractId",
  "cycle": 1,
  "reviewerUid": "parentUid",
  "decision": "REQUEST_CHANGES",
  "note": "Please finish the last task.",
  "createdAt": "serverTimestamp"
}
```

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
  "codeHash": "hash",
  "expiresAt": "timestamp",
  "createdBy": "parentUid",
  "attemptCount": 0,
  "createdAt": "serverTimestamp"
}
```

Never store a reusable plaintext pairing code in Firestore.

## 14. Expected composite indexes

Exact indexes should be generated from real queries, but plan for:

```text
offers:    familyId + participantUids(array-contains) + status + updatedAt desc
contracts: familyId + childUid + status + updatedAt desc
contracts: familyId + parentUid + status + updatedAt desc
rewards:   familyId + parentUid + status + earnedAt desc
rewards:   familyId + childUid + earnedAt desc
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
