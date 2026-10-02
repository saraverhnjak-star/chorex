# Server infrastructure

The TypeScript workspace builds to `lib/` with Node 22 module resolution. Firebase Functions `7.4.0` and its required Admin SDK peer `14.5.0` are pinned and the emulator discovers the compiled empty entry point. Zero functions discovered by the emulator is intentional. No handlers, triggers, domain commands, or deployment are implemented.

Run `pnpm functions:build` from the root. Generated output is ignored. Future authoritative commands must follow repository authorization, schema, idempotency, event, and testing requirements.
