# ChoreX - Project Overview

## 1. Product statement

ChoreX is a family agreement system that turns chores into explicit, trackable exchanges between parents and children.

The core loop is:

```text
Offer -> Negotiate -> Agree -> Contract -> Complete -> Review -> Reward -> Fulfill reward
```

The product is intentionally more than a chore checklist. A child can accept a parent's offer or counter-propose different terms. Once both sides agree, the terms become an active contract. The child completes the work, submits it for review, and the parent approves or requests changes. An approved contract earns a reward, which then becomes a concrete obligation for the parent to fulfill.

## 2. Product surfaces

### Parent mobile app

Primary responsibilities:

- create family and child profiles;
- pair child devices;
- create chore offers;
- define chores, repetitions, deadlines, and rewards;
- negotiate counteroffers;
- monitor progress;
- review submitted contracts;
- approve work or request changes;
- fulfill earned rewards;
- open auctions for multiple children;
- review child bids and select a winner.

### Child mobile app

Primary responsibilities:

- receive offers;
- accept, reject, or counter an offer;
- see active contracts;
- mark chore progress;
- see repeated-task progress such as `37 / 100`;
- submit completed contracts for review;
- respond to requested changes;
- see earned rewards;
- place bids in family auctions.

### Marketing website

The website is explicitly **not part of the initial MVP**. It should be added after the mobile product has a stable identity and validated workflows.

## 3. MVP scope

The first shippable version should support:

1. Parent account creation and sign-in.
2. Family creation.
3. Parent-created child profile.
4. Secure child-device pairing without requiring a child email address.
5. Parent creates an offer with one or more tasks, target counts, a deadline, and a reward.
6. Child accepts, rejects, or counteroffers.
7. Agreement creates a contract with a frozen snapshot of the accepted terms.
8. Child records progress.
9. Child submits the contract for review only when completion requirements are satisfied.
10. Parent approves or requests changes.
11. Approval creates an earned reward.
12. Parent marks the reward fulfilled when delivered.
13. Push notifications cover the major state changes.

## 4. Post-MVP scope

Add only after the basic contract loop is stable:

- family auctions and bidding;
- proof photos/videos;
- recurring schedules independent of contract target counts;
- reward catalog and wish lists;
- allowance/money rewards;
- streaks and gamification;
- family analytics;
- multiple guardians with richer permissions;
- web dashboard;
- public marketing website.

## 5. Product principles

### Mutual agreement

A contract is not active until both sides agree to the same revision of the terms.

### Parent accountability

An earned reward is not the same thing as a fulfilled reward. ChoreX tracks the parent's side of the agreement too.

### Child agency

Children can negotiate. The product should not present them only as recipients of commands.

### Clear ownership

A family may contain multiple parents/guardians and multiple children, but each action must record who performed it.

### Auditability

Important state changes should leave an immutable activity/audit event so that users can understand how a contract reached its current state.

### Minimal child data

Do not require unnecessary personally identifying data from children. A display name/avatar and family relationship are sufficient for the MVP.

## 6. Non-goals for the first release

Do not build these into the initial architecture unless needed for a current story:

- social network features;
- public child profiles;
- chat/messaging platform;
- marketplace of rewards;
- complex virtual currency;
- AI-generated parenting advice;
- location tracking;
- parental surveillance features.
