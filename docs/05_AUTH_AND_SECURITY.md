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
  current-round get/bounded list: active Contract participants, matching family/Contract/cycle
  unbounded/history reads: denied in this slice
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
