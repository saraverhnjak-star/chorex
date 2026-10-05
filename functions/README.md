# Server commands and notification effects

The Node 22 TypeScript workspace contains server-authoritative onboarding, pairing and Offer commands. Run `pnpm functions:build` from the root; compiled output is ignored. `pnpm --filter @chorex/functions test` builds and runs deterministic notification tests with a fake Expo transport.

`notifyOfferNegotiation` listens for committed `/activityEvents/{eventId}` documents. It resolves recipients from Offer participants and active Family membership, and sends the documented publish/counter/accept matrix via Expo Push Service. Rejection has no push effect. Commands remain independent of delivery.

The event owns one server-only `notificationEffects/expo` record, with a transactional lease and at most three attempts. Completed or permanently skipped work is not repeated. Delivery errors use Cloud Functions event retry/backoff; an exhausted send records `FAILED`. Expo tickets are recorded and immediately unregistered tokens are disabled with a token-rotation check. A successful ticket means Expo accepted the message, not that a physical device displayed it. Receipt polling/cleanup is deferred beyond this Phase 2 slice.

The Functions emulator uses deterministic fake tickets and never calls Expo. Run `pnpm emulators:verify:phase2` to verify the bilateral lifecycle, event effects and failure isolation. Do not deploy as part of local verification.
