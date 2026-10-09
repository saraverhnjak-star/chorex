# Phase 7 Slice 4B — Account deletion and privacy acceptance

Date: 2026-10-09. Status: **IMPLEMENTED; automated validation PASS; native cache/device validation remains qualified.** No commit, push or deployment performed. Public-release privacy/store gates remain open.

## Authority and documentation

ADR-050 is Accepted from the user's explicit Slice 4B approval. Documents 00–07 now describe the administrative erasure exception: operational history remains immutable during family existence, and family deletion removes revisions, completions, reviews, activity and reminder deduplication. The permanent-retention wording in schema/notification/roadmap documents no longer survives family erasure. Slice 4A remains the historical proposal/audit with an approval annotation. OPEN-010, OPEN-011 and OPEN-014 remain OPEN.

## Server authorization and scope

`deleteParentAccount` accepts only a strict shared confirmation/idempotency schema. It derives UID from verified callable authentication, requires an enabled email/password Parent identity and server-time `auth_time` no older than five minutes, and validates authoritative membership, profiles, creator relationships, domain references and partial Child-creation reservations. Client UID, role and family ownership are never accepted. A no-family identity can be deleted only after orphan/reservation checks. Other Parent memberships, malformed/shared scope and identities belonging to another family fail before any destructive write.

Membership records currently omit queryable UID fields. Authorization therefore inspects actual collection-group membership paths, with a fail-closed ceiling of 1,000 membership documents across the project and 100 affected Children. Requests exceeding these bounds require review; an indexed membership-discovery strategy is a scale/release follow-up. This is an explicit implementation limit, not a claim that arbitrary project sizes are supported.

## Durable deletion and fences

Acceptance atomically writes a minimal `accountDeletionOperations/{parentUid}` reservation plus account and family deletion fences. Retried keys return progress; conflicting keys fail. The scheduled trusted worker runs independently of clients, leases work for ten minutes, checkpoints progress and retries failures. It drains pre-fence external effects, disables/revokes Child access, pages indirect push receipts before removing their event parents, recursively sweeps family roots and internal receipts, removes Child users/Auth, removes Parent/family data, and deletes Parent Auth last. A failure immediately after Auth deletion resumes safely from the persisted operation. Terminal recovery metadata and deny markers are purged after seven days; unresolved work remains retryable. Repeated cleanup failures emit categorical diagnostics without identity or content.

Every operational transaction and bootstrap command reads an account fence. Pairing replay/minting and partial Child Auth creation use bounded external-effect leases. Reminder generation checks family fences; dispatch checks before acquiring an effect and again before sending. Receipt invalidation/processing checks account fences. Rules deny fenced profile/domain/device/preference access and prevent registration recreation; owners can read only their deletion signal. Admin operations authorize explicitly rather than relying on Rules or App Check.

Cascade roots include Offers/revisions, Contracts/tasks/completions/reviews, Rewards, activity/notification effects, all pairing statuses, matching idempotency reservations/results, indirect push receipts, all affected devices/preferences/profiles, memberships/family and Child Auth identities. Shared rate-limit records remain untouched. The global reminder cursor is repaired only when its referenced Reward belonged to the removed family. Active obligations are removed administratively without CANCELLED, approval, fulfillment or settlement events. Previously issued tokens/push messages cannot be recalled; fences stop product access and new effects, and already acquired external work drains before cleanup.

## Parent privacy and local behavior

Parent Settings and signed-in incomplete onboarding expose `Privacy & Data`. It explains collected family data, Crashlytics processor diagnostics, notification providers, irreversible family/Child/history loss, unfinished obligations and background processing. Deletion requires an explicit confirmation and Firebase password reauthentication; the ephemeral password is cleared before the request and on cancel, and is never sent to the callable. There is no export, analytics control, Crashlytics toggle, transfer or independent Child deletion UI. Policy and external deletion URLs are visibly pending release review rather than broken placeholder links.

Both app session providers observe server-confirmed deletion fences. They close authenticated UI, drain registration reconciliation without attempting denied backend registration deletion, clear pending notification responses/displayed notifications/badges where supported, sign out through the SDK, stop tracked Firestore listeners, terminate the instance, clear persistence and reconnect a fresh emulator instance when applicable. Child returns to pairing; Parent returns to signed-out entry. Normal sign-out still requires successful current-device registration removal first. Installation UUID and notification-education metadata are preserved. Transient permission/network failures alone are not treated as deletion proof.

Logical cache clearing is not forensic erasure, and an offline device cannot discover remote deletion immediately. Uploaded Crashlytics reports, provider logs/backups and already sent notifications are outside the Firestore/Auth cascade.

## Validation

- Functions: 195 tests PASS, including authorization/scope rejection, recursive isolation, idempotency, crashed external leases, failure recovery, Auth-last and terminal purge.
- Notifications: 54 tests PASS, including deletion-specific abandonment without backend removal or installation-metadata loss.
- Parent: 95 tests PASS, including Parent/Child provider teardown, ordinary offline sign-out behavior and privacy confirmation/password/key handling. Child: 81 tests PASS, including SDK sign-out/terminate/clear ordering.
- Shared configuration: five tests PASS. Workspace typecheck and lint PASS.
- Actual isolated Auth/Firestore/Functions emulator callable plus Rules validation PASS: unauthenticated and Child/stale-auth denial, unsupported relationship scope before fences, stale-token access/write denial, recursive cleanup, unrelated-family/global isolation, injected DATA/Child/final-Auth failures and seven-day purge. Existing security-baseline Rules verifier PASS.
- Both iOS exports PASS. Formatting and diff checks PASS.

Native practical check: both installed iOS development binaries were launched using isolated Metro URLs and disposable emulator fixtures. Simulator/debugger startup did not yield a stable SDK session; therefore end-to-end native deletion/cache clearing is **UNVERIFIED**, not PASS. RN Firebase 26.4 native instance teardown/reinitialization code was inspected and SDK call ordering is covered by tests, but those do not establish actual disk-cache clearing. Both iOS and Android native cache/relogin/offline-reconnect behavior require observed device verification before release. No offline persistence setting was changed.

## Remaining release gates

Approved public privacy policy and functioning external deletion-request URL/timeframe; legal/store review of Parent-mediated Child deletion and whether independent Child removal is required; an actionable support route for unsupported relationships and scale limits; processor/log/backup retention and access review; iOS/Android native cache and physical-device reconnect validation. Offline persistence remains enabled. No immediate-every-byte-erasure, production compliance, scheduler deployment or provider purge claim is made. Earlier App Check enforcement, Android push, accessibility traversal and Crashlytics fatal/symbolication verification debt remains independent.
