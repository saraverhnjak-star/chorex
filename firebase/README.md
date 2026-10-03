# Local Firebase infrastructure

`firebase.json` binds Auth (9099), Firestore (8080), Functions (5001), UI (4000), hub (4400), and logging (4500) to loopback. The `dev` alias selects `chorex-dev`. Java 21+ is required for Firestore with the pinned Firebase CLI.

Run `pnpm emulators:start` from the root. The bounded `pnpm emulators:verify:create-family` and `pnpm emulators:verify:create-child` commands exercise the implemented Phase 1 callables and their rules against disposable emulator data. Environment guards reject other project IDs or endpoints before any request. Authentication in rules checks uses official authenticated test contexts. Rules are loaded from the CLI configuration, not replaced by tests.

Rules allow a signed-in user to read their own profile and active Family members to read the Family and its membership subcollection. All client writes and other reads remain denied. No deployment command is provided.

For a physical device, deliberately change the emulator `host` bindings to your machine's private LAN IPv4 address and set that same address in the app environment. This exposes local emulator services to your LAN; use a trusted network. The automated check intentionally accepts only the checked-in loopback configuration.
