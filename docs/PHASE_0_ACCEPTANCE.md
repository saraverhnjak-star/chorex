# Phase 0 acceptance review

Review date: 2026-10-02. Reviewed commit: `42ec64980efb6660ed83599521eaa18233d7b146` (`ci: add Phase 0 validation workflow`). The working tree was clean at review start.

Scope: the deliverables and acceptance gate in `07_IMPLEMENTATION_ROADMAP.md`, using current repository files. `AGENTS.md`, all numbered documents, `DECISIONS.md`, README, configuration, workflow, and recent Git history were reviewed. Documentation authority and explicit ADR supersession apply; ADR-035 supplies the six package boundaries. No OPEN decision was resolved.

## Acceptance checklist

PASS means supported by inspected files or the explicitly attributed verification evidence below. Runtime success is not inferred from configuration alone. Every row below is non-blocking; no blocking GAP was found.

| Phase 0 deliverable | Result | Evidence | Blocks completion? |
| --- | --- | --- | --- |
| pnpm workspace | PASS | Root `package.json` pins pnpm 12.8.1; `pnpm-workspace.yaml` includes `apps/*`, `packages/*`, and `functions`; lockfile is committed. | No |
| Parent Expo app | PASS | `apps/parent/package.json`, Router `app/_layout.tsx` and `app/index.tsx`; independent app identity and scripts. | No |
| Child Expo app | PASS | Equivalent independent files in `apps/child`; distinct name, scheme, and native identifiers. | No |
| Shared packages | PASS | `packages/{domain,ui,firebase-client,notifications,config,test-utils}` match ADR-035. Manifests expose public entry points; apps use `@chorex/*` imports. Empty skeletons are valid here; domain has no React Native/Firebase dependencies. | No |
| Strict TypeScript | PASS | `packages/config/tsconfig.base.json` enables strict mode; both apps, all six packages, and Functions extend it without disabling strictness. | No |
| Development builds configured | PASS | Both app manifests include `expo-dev-client`; app configs include its plugin and native Firebase/build-properties configuration; start scripts use `--dev-client`. | No |
| Firebase development project wired to both apps | PASS | Each app's `firebase/dev/GoogleService-Info.plist` has project `chorex-dev` and its matching bundle ID. Android JSON uses that project and contains the matching package ID. Shared initialization is called from both Router layouts. | No |
| Lint/typecheck/test scripts | PASS | Root scripts orchestrate workspace scripts; shared ESLint/Jest/TypeScript configuration and both app smoke tests are present. Root `format:check` also covers the workflow. | No |
| Firebase emulator setup | PASS | `firebase.json`, `.firebaserc`, root emulator scripts, `functions/package.json`, and `firebase/verify-emulators.mjs`; explicit local Auth/Firestore/Functions routing and Functions build before emulator startup. Java 21 emulator success is user-reported. | No |
| Root repository instructions | PASS | Root `AGENTS.md` exists and documents authority, boundaries, invariants, and workflow. | No |

| Documented acceptance condition | Result | Evidence | Blocks completion? |
| --- | --- | --- | --- |
| Both apps launch in development builds | PASS | User reports successful Parent and Child native iOS launches, including rebuilds and launches after Firebase integration. Not independently repeated in this review. | No |
| Shared domain package imports correctly | PASS | Both `src/domain-import.ts` files import `@chorex/domain` through its public entry point; TypeScript includes these files. Reported successful CI typecheck supports resolution. This is a compile-time import of the intentionally empty skeleton. | No |
| CI typecheck/lint/tests pass | PASS | User reports the pushed GitHub Actions workflow passed. Committed `.github/workflows/ci.yml` runs frozen installation, formatting, lint, typecheck, tests, and emulator verification with Node from `.nvmrc` and Java 21. Remote result provenance limitations are below. | No |
| No production Firebase credentials/config used locally | PASS | Inspected native files, shared project-ID guard, `.firebaserc`, emulator-only environment example, and verification script all target `chorex-dev`/local emulators. Tracked-file scan found no private-key/service-account credential patterns. | No |

## Additional foundation checks

| Check | Result | Evidence | Blocks completion? |
| --- | --- | --- | --- |
| Shared initialization; no silent live fallback | PASS | `packages/config/src/index.ts` requires emulator mode, private/loopback host, and valid ports. `packages/firebase-client/src/index.ts` validates the development project, connects all three services before returning, guards repeat initialization, and rethrows/caches failures. Both app adapters require native platforms and explicit environment values. | No |
| Functions build infrastructure | PASS | Functions uses Node 22 and a strict TypeScript build to `lib`; root emulator scripts build first. Empty exported entry point is appropriate for foundation, with no product commands required. Reported successful emulator verification covers its prerequisite build. | No |
| Initial deny-all Firestore rules | PASS | `firebase/firestore.rules` denies every client read/write. Verification script tests authenticated and anonymous denial against emulator-loaded rules, with explicit local endpoint/project guards. | No |
| CI orchestration | PASS | Workflow targets main pushes/PRs, uses read-only repository permissions, disables persisted checkout credentials, and has no deployment/login step or privileged credential requirement. | No |
| Generated outputs and privileged credentials excluded | PASS | Tracked inventory contains no native generated projects, dependencies, compiled Functions output, local environment files, or privileged credentials. `.gitignore` excludes these outputs. Firebase client registration files are development configuration, not Admin credentials. | No |

## Verification limitations

- No installation, tests, builds, or emulators were rerun. iOS launch, Java 21 emulator success, and remote CI success above are user-reported evidence.
- **UNVERIFIED:** remote workflow URL, run metadata, and tested commit comparison with HEAD. GitHub CLI was unavailable on PATH; no login, token request, push, or workflow trigger was attempted. The reported CI success is not represented as independently verified against this exact SHA.
- **UNVERIFIED:** Android native launch and physical-device/LAN emulator routing. The launch gate specifies both app variants, not both operating systems or physical devices; reported iOS launches satisfy it. Current emulator listeners bind loopback, so physical-device reachability is not established.
- **UNVERIFIED:** live Firebase Auth/Firestore/Functions connectivity. Native development-project registration and emulator routing are present; neither establishes live service connectivity. Cloud provisioning was excluded from the infrastructure task and is not an additional Phase 0 gate.
- README retains older Java/emulator and remote-CI verification notes. The newer user-reported evidence is recorded here without modifying README. A tracked root `.DS_Store` is incidental repository hygiene, not a generated build output or a Phase 0 blocker.

## Completion verdict

**PASS — Phase 0 is complete on the reviewed implementation and explicitly attributed user-reported verification evidence.** No blocking gaps were identified. Independent remote run/commit correlation remains unverified; this verdict does not claim that correlation or additional platform/cloud verification.

Recommended next scoped task: Phase 1 preparation consisting of a small Parent registration/sign-in UX specification, followed by a separately scoped authentication implementation task. Neither deliverable was created here.

Only this acceptance report was added. No implementation, configuration, dependency, workflow, or existing documentation changes were made; no commit or push was performed.
