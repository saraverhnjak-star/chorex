# Phase 3 — Native restart persistence verification

Verification date: 2026-10-05. Scope is Contract execution reads and ADR-020; no Phase 4 behavior is added.

## Native environment and baseline

The installed iOS development binaries were used on the booted iPhone 17 Pro simulator, iOS 26.5, with React Native Firebase Firestore 26.4.0 and the existing native SDK configuration. Bundle identifiers are `dev.chorex.bootstrap.child` and `dev.chorex.bootstrap.parent`. This is an actual native process-restart check, not a web Firebase cache simulation, Fast Refresh or background/foreground cycle. No custom persisted domain cache, queue, SDK persistence override or application-code change was needed.

Both apps use `chorex-dev` and their existing `.env.local` routing to `127.0.0.1`: Auth 9099, Firestore 8080 and Functions 5001. Child Metro stays on 8082 and Parent Metro on 8081 throughout. Keeping Metro available is necessary for a development binary's JavaScript bundle and does not make the paused Firebase services available.

The existing normally paired Child and signed-in Parent sessions were retained. Initially the running Auth emulator was empty while Firestore and native sessions still contained the family identities. This was a local emulator-state mismatch, not a persistence defect. Before establishing the online baseline, the task-owned Auth/Functions service was restarted with the existing saved Auth export at `/private/tmp/chorex-emulator-preserve`, leaving Firestore running. Both identity records were verified present without logging credentials. Existing native sessions then regained online access; no account recreation or application workaround was introduced.

A disposable Contract named “Native persistence verification” was created through the existing draft/publish/accept callables under those participants. Its tasks were “Persistence single task” (`targetCount: 1`) and “Persistence repeated task” (`targetCount: 2`). No existing user Contract was changed. The fixture Contract ID was `contract_12090e9f52199e3f5198f9fe39ca99d40af1ce6fd7a120da123ad0d219853530`.

## Reproducible ACTIVE restart procedure

1. Start both existing native development apps with their respective Metro servers, using a valid Parent sign-in and normally paired Child identity in the same retained emulator dataset.
2. Load the ACTIVE Contract from each app's home list. Open detail and wait for server snapshots: no “Showing saved data. Updates may be pending.” marker. Observe both tasks at `0 / 1` and `0 / 2`, frozen promised reward and deadline.
3. Fully terminate each native process:

   ```sh
   xcrun simctl terminate booted dev.chorex.bootstrap.child
   xcrun simctl terminate booted dev.chorex.bootstrap.parent
   ```

4. Identify the exact local Firestore Java process and task-owned Firebase CLI serving Auth/Functions using `lsof -nP -iTCP:8080 -iTCP:9099 -iTCP:5001 -sTCP:LISTEN`. Temporarily pause only those known processes with `kill -STOP <firestore-pid> <auth-functions-pid>`. Confirm their stopped process state. Do not stop Metro, clear app data, uninstall either app, clear Firestore persistence or sign out.
5. Relaunch the Child native app from its installed icon. Its restored identity and cached family/home data appear after the native default read fallback. Open the previously loaded Contract. Observe ACTIVE, both cached task counts, frozen reward/deadline and the saved-data marker.
6. Relaunch Parent likewise and open the same Contract. Observe its restored identity, cached ACTIVE Contract/task data and saved-data marker; Parent detail remains read-only.
7. Resume exactly the same emulator processes with `kill -CONT <firestore-pid> <auth-functions-pid>`. Wait for listener reconnect. Verify the cache marker disappears and the displayed data converges to current server snapshots without manual refresh.

Observed process IDs changed from Child 34635 / Parent 35865 to Child 59403 / Parent 60707. Both old processes were absent after termination. Offline startup initially displayed loading while default family reads attempted the unavailable server, then returned persisted native data. This fallback delay was visible, not an immediate custom cache hydration. Contract detail itself used the persisted document/task listener snapshots.

## Authoritative commands and reconnect

While the backend was paused, a Child “Mark one done” attempt kept the repeated task at `0 / 2`, disabled the pending button and never displayed success. It eventually showed “We could not confirm this completion. Try again to confirm the same action.” The Contract stayed ACTIVE.

A process pause preserves listening sockets, so an in-flight request can remain in the operating system's backlog. After services resumed, that delayed request committed one authoritative completion. Both native task listeners converged to `1 / 2` and removed their saved-data marker. The Child's explicit retry retained the same key and returned the committed receipt; the count stayed `1 / 2`, with exactly one completion. This is an ambiguous network response resolved by idempotency, not an application offline mutation queue or an offline success claim.

Remaining fixture progress was completed through the existing command, producing `1 / 1` and `2 / 2`. For submission, the task-owned Auth/Functions CLI was fully stopped and Firestore paused, so the callable endpoint was unavailable rather than merely delayed. Child confirmation returned “We could not confirm submission. Try again to confirm the same action.” It left ACTIVE and the persisted counts unchanged, with no “Sent for review” confirmation.

After Firestore resumed and Auth/Functions restarted with the saved identities, an explicit confirmation retry succeeded. Child detail received READY_FOR_REVIEW from realtime and then showed “Sent for review” and Parent-review guidance. Parent's already-open detail received READY_FOR_REVIEW and completed counts without refresh. The audit found three TaskCompletions, exactly one submission event, zero reviews and zero Rewards.

## Submitted-state restart

Both apps loaded the committed READY_FOR_REVIEW snapshot before a second full termination/offline relaunch. Submitted Contracts are intentionally absent from the ACTIVE home list, so use the existing stable-ID detail route rather than adding a review queue. In the development client, first load its normal Metro bundle, then open the route through native Safari:

```text
chorex-child://contracts/{contractId}
chorex-parent://contracts/{contractId}
```

Accept Safari's ordinary Open-app prompt. A cold custom-scheme launch can initially show Expo's development-server launcher; loading the normal bundle and opening the link again reaches the existing router. This is development-client navigation, not a new product capability.

Observed in both native apps with the backend still stopped: READY_FOR_REVIEW, persisted `1 / 1` and `2 / 2` tasks, unchanged reward/deadline and “Showing saved data. Updates may be pending.” Child showed Parent-review guidance and no completion/submission controls; Parent remained read-only. After resuming services, both details retained the correct submitted state/counts and removed the saved-data marker without manual refresh. The transient “Sent for review” confirmation was not re-created after restart; restored lifecycle state came from Firestore rather than persisted UI success state.

## Gate result

**PASS — the complete documented Phase 3 acceptance gate is satisfied for the repository's existing native iOS development-build workflow.** The previously missing native process-restart item is now evidenced for Child and Parent ACTIVE reads, submitted-state reads, authentication restoration, offline callable behavior and reconnect convergence. Combine this report with Slice 1–3 automated evidence; no Phase 4 implementation is included.

## Automated regressions and scope

Workspace tests (146: backend 61, Child 47, Parent 38), strict typecheck, lint, formatting/whitespace checks, and both existing iOS bundle exports pass. Isolated emulator regressions pass for Child/Parent Offer accept/reject/counteroffer, Phase 2 notifications, Contract read/cache/reconnect isolation and direct-write denials, recordTaskCompletion idempotency/concurrency, and submitContractForReview completion validation/idempotency/concurrency/realtime behavior.

Only this report, the Slice 1–3 acceptance notes and the roadmap are changed by this verification. Existing uncommitted implementation work is preserved.

The same development Firebase routing was used for native verification. Automated emulator regressions used isolated localhost ports to avoid altering that dataset. All paused services were resumed; the task-owned Auth/Functions service remains available with the saved local accounts. No commit, push or deployment was performed.

OPEN-009/010/011/012 remain unresolved. No Parent review queue/actions, Review, review-cycle change, Reward, notification expansion, expiry/cancellation, custom Contract persistence or offline mutation queue was added. Physical-device push delivery, Android-native verification and reinstall/cache eviction are outside this iOS restart check.

Subsequent decision: ADR-043 resolves OPEN-012 with zero-based review rounds. This historical Phase 3 evidence remains unchanged; first submission still preserves the cycle. OPEN-009/010/011 remain unresolved.

Subsequent decision/slice: ADR-044 resolves OPEN-009 with contract-level remediation; [Child resubmission acceptance](PHASE_4_RESUBMISSION_ACCEPTANCE.md) extends the existing submitContractForReview command. Historical verification above remains unchanged. Initial submission still preserves the cycle; corrections preserve task history and successful resubmission alone opens the next round. OPEN-010 and OPEN-011 remain unresolved.
