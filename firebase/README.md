# Local Firebase infrastructure

`firebase.json` binds Auth (9099), Firestore (8080), Functions (5001), UI (4000), hub (4400), and logging (4500) to loopback. The `dev` alias selects `chorex-dev`. Java 21+ is required for Firestore with the pinned Firebase CLI.

Run `pnpm emulators:start` from the root. Run `pnpm emulators:verify` for the bounded, emulator-only deny-all rules check. It creates and removes one emulator Auth identity and one seeded Firestore document. Environment guards reject other project IDs or endpoints before any request. Authentication in the rules check uses the official authenticated test context for that identity. Rules are loaded from the CLI configuration, not replaced by the test.

Rules deny every client read and write; indexes are empty. No application access policy or domain behavior is implemented. No deployment command is provided.

For a physical device, deliberately change the emulator `host` bindings to your machine's private LAN IPv4 address and set that same address in the app environment. This exposes local emulator services to your LAN; use a trusted network. The automated check intentionally accepts only the checked-in loopback configuration.
