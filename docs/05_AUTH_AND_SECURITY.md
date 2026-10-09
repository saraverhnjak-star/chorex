# ChoreX - Authentication and Security Model

## 1. Security goals

ChoreX stores family and child-related information. The architecture should assume that client applications are untrusted and may be modified.

Primary goals:

- strict isolation between families;
- role-based authorization inside each family;
- no child email requirement for MVP;
- secure one-time child-device pairing;
- server-authoritative lifecycle transitions;
- minimal collection of child personal data;
- no secrets in logs or Firestore-readable documents;
- abuse protection through Firebase App Check and rate limiting.

## 2. Parent authentication

MVP recommendation:

```text
Email + password
```

Add later as needed:

```text
Sign in with Apple
Google sign-in
passwordless email link
```

A parent's Firebase Auth `uid` maps to `/users/{uid}`.

The first family-onboarding mutation is an authenticated, idempotent `createFamily` callable. It atomically creates the Parent user profile if absent, the Family, and the authenticated Parent's active membership. The backend derives `uid` from Firebase Authentication and assigns the Parent ownership/role through server policy. The client may provide only validated, non-authoritative onboarding data and cannot provide authoritative UID, ownership, or role values.

`createFamily` is a bootstrap command: it cannot require a pre-existing Family membership because it creates the first one. All subsequent family-scoped commands must load the active membership and role from server-side data.

## 3. Child authentication without email

Recommended flow:

```text
Parent app
  |
  | create child profile
  v
Backend creates child identity record
  |
  | create short-lived one-time pairing session/code
  v
Child app on new device
  |
  | enter/scan pairing code
  v
Backend validates pairing session
  |
  | mint Firebase custom token for child uid
  v
Child app signInWithCustomToken(...)
  |
  v
Authenticated child session
```

Implementation detail:

- the parent initiates pairing from an authenticated callable function;
- pairing code should be random, short-lived, one-time, and stored only as a secure hash server-side;
- the child pairing endpoint must be abuse-protected and rate-limited;
- after successful validation, the backend generates a Firebase custom token for the existing child UID;
- the child app signs in with the custom token;
- Firebase then maintains the normal authenticated session on that device.

A local child PIN may be added as an **app lock**, but it is not the primary server authentication credential.

## 4. Child identity creation

When a parent creates a child profile, server code should create the child Firebase Auth user/UID and family membership. Do not let the Parent app manufacture arbitrary child UIDs or role claims.

Per ADR-038, `createChild` derives a deterministic UID from the authenticated Parent, Family, and idempotency key. A server-only Firestore reservation binds that key to the request before Auth creation, allowing retries to reuse the same Auth identity and finish the atomic Firestore records after a partial cross-service failure.

Per ADR-041, the server also maintains `familyIds` on Child profiles as a discovery projection. An authenticated Child reads only its own profile, then its sole projected Family and its own active membership. The projection grants no access by itself; Firestore Rules continue to require the membership document for Family reads, and all client writes remain denied.

Push-device registration removal and authentication-session revocation are separate concerns. Deleting or disabling `/users/{uid}/devices/{deviceId}` stops that registration from receiving ChoreX pushes but does not, by itself, revoke the Firebase Auth session on that installation. Exact individual-device access revocation semantics remain OPEN-014 in `DECISIONS.md`; until resolved, do not claim that deleting a device registration signs that device out. Child-wide Firebase refresh-token revocation may be used only when child-wide session invalidation is intended.

## 5. Authorization source of truth

Use:

```text
/families/{familyId}/members/{uid}
```

as the authoritative family role/membership record.

Do not rely only on custom claims for family membership because family membership can change more frequently and a user may eventually belong to more than one family.

Custom claims can be used sparingly for coarse platform-wide roles if ever needed, but are not necessary for MVP.

## 6. Client write policy

Recommended default:

### Client can directly write only narrowly scoped user-owned data

Examples:

- own non-sensitive profile preferences;
- own device push registration, if rules validate ownership and shape;
- perhaps local UX settings synced to cloud.

### Client does not directly write authoritative domain state

Examples that must go through Cloud Functions:

- family membership/roles;
- offers/revisions;
- contract creation/status;
- task counters/completion records;
- reviews;
- rewards;
- auction state/bids;
- pairing sessions.

This yields intentionally restrictive Firestore Rules and concentrates business authorization in tested server commands.

## 7. Firestore Rules principles

Rules should enforce reads even when writes are server-only.

Pseudo-rule helpers:

```text
isSignedIn()
isActiveFamilyMember(familyId)
isParentInFamily(familyId)
isChildInFamily(familyId)
isSelf(uid)
```

Example policy intent:

```text
/users/{uid}
  read: self; possibly family-visible safe profile subset via separate projection
  write: self for allowlisted fields only, or server only

/users/{uid}/devices/{deviceId}
  read/write: self only, shape-restricted

/families/{familyId}
  read: active family members
  write: server only

/families/{familyId}/members/{uid}
  read: active members of same family
  write: server only

/offers and /offers/{offerId}/revisions
  get: the creating active Parent while DRAFT; later states only for active participants
  list: active participants may query AWAITING_CHILD; AWAITING_PARENT queries additionally require the active creating Parent and parentUid constraint
  write: server only

/contracts and /contracts/{contractId}/tasks
  read: only active Parent/Child participants named by the Contract
  write: server only

/contracts/{contractId}/reviews
  get/list across committed rounds: active Contract participants, matching family/Contract
  history query: familyId/contractId equality constraints; cycle ascending
  write: server only

/rewards, auctions, activityEvents
  read: only active family members for the referenced family
  write: server only

/pairingSessions, idempotency
  read/write: never from Firestore clients
```

Important: server/Admin SDKs bypass Firestore Rules, therefore every Cloud Function must validate authorization itself.

## 8. Cloud Function authorization template

Every domain command should follow the same structure:

```ts
requireAuthenticated(request);
const input = Schema.parse(request.data);

const membership = await requireActiveMembership({
  uid: request.auth.uid,
  familyId: input.familyId,
});

requireRole(membership, 'PARENT'); // or CHILD

const entity = await loadEntity(...);
requireEntityBelongsToFamily(entity, input.familyId);
requireLegalState(entity, ...);

await executeTransaction(...);
```

Never authorize from client-provided `role`, `parentUid`, or `childUid` alone.

The initial `createFamily` callable uses the same authentication and input-validation requirements, but replaces the pre-existing membership lookup with its documented atomic bootstrap checks. It assigns the initial Parent role server-side and must be safe to retry without creating duplicate records.

## 9. App Check

Enable Firebase App Check before public release.

Rollout pattern:

1. integrate App Check in both apps;
2. monitor metrics without enforcement;
3. fix legitimate failures;
4. enforce for Firestore, Functions, and Storage as appropriate.

App Check complements Auth and Security Rules; it does not replace either.

ADR-048 selects RN Firebase App Attest with DeviceCheck fallback for iOS releases and Play Integrity for Android releases. Shared bootstrap initializes App Check before client services are exposed. Debug providers are restricted to emulator development builds; production project/native-file validation fails closed. Firestore service enforcement and callable v2 `enforceAppCheck` remain OFF pending separately approved monitoring/native verification. Pre-auth pairing receives SDK App Check context independently of Child Auth and retains all existing TTL, replay and rate-limit rules.

## 10. Pairing security

Pairing sessions should have:

- a cryptographically random 128-bit base64url token, with no numeric fallback;
- an exact 10-minute TTL;
- single use;
- only a SHA-256 server-side hash; plaintext is returned only once and never persisted;
- capped failed attempts;
- cooldown/rate limit by app/device/IP signals where available;
- App Check where technically practical;
- activity event for successful pairing;
- no sensitive code/token in analytics or logs.

Per ADR-039, replaying the same creation idempotency key returns the same session ID and expiry without the plaintext token. Creating a new session for the same Child invalidates every previous active session. QR presentation remains deferred.

Per ADR-040, `redeemPairingSession` hashes the submitted token before lookup and atomically redeems only an active, unexpired session. The transaction binds a hash of the client-generated redemption idempotency key and writes one activity event before the backend mints a Firebase custom token for the existing Child UID. A retry with the same token and idempotency key may mint a fresh custom token; any different replay fails as already used.

Redemption has a fixed 10-minute window per platform-provided source IP, capped at 20 total requests and 10 failed requests. Invalid tokens count as failures. Rate-limit records are server-only, expire after the window, and use an HMAC-derived source key with an uncommitted server secret; the raw IP is never stored or logged. Exceeding either limit returns `PAIRING_RATE_LIMITED`. App Check enforcement for this endpoint remains deferred to Phase 7.

## 11. Secure local storage

Use Expo SecureStore for installation identifiers or app-lock secrets that truly require secure device storage.

Do not manually store Firebase refresh tokens; let the Firebase SDK manage its own authentication persistence.

## 12. Privacy by design

For child profiles, MVP should not require:

- exact date of birth;
- email address;
- phone number;
- location;
- school;
- public username.

Collect only what the product needs, e.g. display name and avatar selection.

Before commercial launch, perform a dedicated legal/privacy review for the jurisdictions in which ChoreX will be distributed, especially because the service is designed for families and children.

## 13. Logging

Never log:

- auth tokens;
- push tokens in full;
- pairing codes/tokens;
- child free-form content unnecessarily;
- proof media URLs if not needed;
- credentials or service-account data.

Use structured logs with IDs and stable error codes.

## 14. Storage/proof media later

When photos become part of the product:

- use Firebase Storage;
- store objects under family/contract/task-scoped paths;
- validate file type and size;
- prevent public URLs by default;
- protect reads by family membership;
- consider server-side moderation/retention only if product requirements justify it;
- add an explicit deletion/retention policy.

Do not add proof media to MVP unless it is necessary to validate the core concept.

## Child correction/resubmission authorization

ADR-044 extends submitContractForReview through its existing authenticated active Child membership and exact Contract participant checks. Status, review cycle and current REQUEST_CHANGES decision come only from transaction reads; input remains Contract ID/idempotency key. Direct status/cycle/review/task/completion/activity/Reward writes remain denied. Existing current-round feedback queries remain read-only and family/participant scoped. No offline command queue is introduced.

## Reward read and fulfillment authorization

Reward get/list access requires authenticated active membership in the Reward family and exact parentUid/childUid ownership. Parent list queries additionally constrain the authenticated parentUid and the requested pending or awaiting status; Child queries constrain authenticated childUid. Unscoped family lists are not authorized by Rules. All Reward and activity-event client writes remain denied, including all status, delivery and confirmation metadata.

The trusted markRewardDelivered callable derives family and participants from persisted Reward state, validates active PARENT membership and exact owning Parent UID, and checks the deterministic approved-Contract relationship before committing. Child, another Parent, other-family, inactive/disabled/non-member and unauthenticated requests fail. confirmRewardReceived derives the same authoritative family/Contract relationship, requires active CHILD membership, exact childUid and prior Parent delivery; Parent, sibling and cross-family confirmations fail. Same-key retries revalidate current membership/ownership before returning the original receipt. Backend-unavailable failures do not imply success or create a client-side write queue.

## Immutable Contract review history

Review history expands reads across cycles, not access to new actors. Rules still require authenticated active membership in the Contract family, named participant identity and matching stored Review family/Contract. Unrelated family members/accounts, inactive/disabled/non-members and unauthenticated users cannot read history or a known Review ID. Queries constrain familyId and contractId; unsafely unscoped lists remain denied. Review create/update/delete remain server-only. Current-feedback validation and all authoritative mutation policies are unchanged.

## Push receipt cleanup boundary

Phase 5 Slice 1 receipt work is server-only and inaccessible to clients under existing catch-all Rules. Admin transactions may set `users/{uid}/devices/{installationId}.pushEnabled` false only when the ticket's captured token fingerprint and registration generation still match. This never revokes Firebase refresh tokens, deletes/signs out users or changes family membership. Normal owner registration/update remains shape-restricted and may enable a refreshed registration. OPEN-014 remains unresolved and separate.

## Push registration lifecycle boundary

Phase 5 Slice 3 preserves the narrow owner-only device-write exception. The firebase-client adapter rechecks the current authenticated UID inside each registration/deletion transaction; the shared coordinator pauses and serializes reconciliation with sign-out cleanup. Sign-out waits for backend-confirmed deletion before Firebase Auth sign-out, so offline cleanup failure retains the current session for a safe retry. Permission revocation removes only the current installation's push registration and never changes Auth, pairing or membership. Account switching removes the previous UID registration before registering the same opaque installation under the next UID. OPEN-014 individual-device Auth revocation remains unresolved; no management dashboard or new authorization capability is introduced.

## Approved reminder policy — ADR-045 / Phase 5 Slice 4B

Optional reminders are account-scoped and default enabled when no preference is stored. `users/{uid}/preferences/reminders` contains exactly `deadlineRemindersEnabled: boolean` for a Child or `pendingRewardRemindersEnabled: boolean` for a Parent. Only that authenticated owner may read/write; Rules derive allowed fields from the server-owned profile accountType. No tokens, device data, role field or domain state is stored here.

Child deadline reminders retain the future 24-hour ACTIVE window. Parent pending-Reward reminders are eligible once earnedAt is at least 48 hours old and status is exactly PENDING_FULFILLMENT, with matching approved Contract and active owning Parent. Each has one deterministic logical identity, transactional preference/state validation and the existing Expo delivery/receipt model. No recurring reminders or transactional-notification toggles exist. OS permission remains separate; enabled preference alone does not claim deliverability. ADR-045 resolves Slice 4A's activation-policy boundary; its hourly schedule is now active under preferences. No deployment is part of implementation. OPEN-010/011/014 remain unresolved.

### Crash-reporting data minimization (ADR-049)

Crashlytics custom diagnostics must not contain names, emails, family/actor/entity IDs, Offer/task/Reward content, review notes, other free text, credentials, Auth/App Check/push tokens, pairing credentials/session IDs, request payloads, proof URLs or Firestore documents. No application user ID or hashing layer is set. Only bounded app/build/environment/platform, authenticated boolean, route category and allowlisted operation/error categories are attached. Non-fatal errors are sanitized at the shared boundary; expected domain/offline outcomes remain in UX. Development collection is disabled unless a dedicated validation build opts in; production collection is enabled centrally. SDK-generated crash data and installation/session identifiers require privacy/store disclosure review before release; no Analytics or consent UI is introduced here.

## Administrative account erasure — ADR-050

ADR-050 explicitly authorizes sole-Parent/single-family full-family administrative erasure and safe identity-only incomplete-onboarding deletion. Immutable revisions, completions, reviews, events and reminder/effect dedup records remain immutable during normal operation, but are removed with the family. This replaces any implication that reminder/dedup history survives family deletion permanently. Active obligations are removed without cancellation/approval/fulfillment transitions. OPEN-010/011/014 remain open.

Deletion requires Firebase password reauthentication and a server auth_time within five minutes, server-owned relationship verification, persistent authorization fences and an independent retry-safe worker. Parent Auth is deleted last. Terminal operation metadata is retained seven days, then purged. Shared/ambiguous/multi-family cases fail safely. Parent Privacy & Data explains scope; no standalone Child deletion/export/extra privacy toggles. Installation metadata is retained. Processor diagnostics, offline copies and queued pushes have separate limits and release disclosure gates. See the Phase 7 Slice 4A inventory and ADR-050 for the approved policy.
