# Child Home design update — 2026-10-10

The supplied `child-home-screen.png` guides this Home presentation update, replacing the Child Home composition described in the Phase 5.5 fidelity acceptance. The logo, greeting and supporting copy are omitted. Avatar and notification controls remain available.

Home shows an available offer first, followed by an agreement card with authoritative task counts and a mint reward card. The three summary metrics are removed. The offer preview returns no UI while loading, on failed reads or when empty; the dedicated Offers screen retains loading, error and retry handling. Realtime removal also removes the preview. Both existing collection navigation and dedicated screens remain available.

Offer titles use the first task title because the existing offer schema has no separate agreement title. Reward illustrations use existing domain icon keys. Task rows display actual titles and completion counts; no title-based illustration guesses or sample data are added. Task rows are read-only previews; completion stays on the existing agreement detail screen. Cached progress and reward data retain their qualifiers. Reward statuses continue to distinguish earned, delivered awaiting confirmation, and received.

“View offer” opens Offers. “Suggest a change” opens Offers with the selected offer's existing counteroffer form. Server commands, authorization, lifecycle rules, schemas and queries are unchanged. Existing English app copy and five navigation destinations remain.

Validation: workspace typecheck and lint, Child and Parent unit suites. Native screenshots and device visual acceptance have not been captured for this update.

Visual refinement: offer actions are stacked vertically at full card width, following the latest requested adjustment. The offer illustration grows to 108pt with three decorative coral rays. Agreement and reward illustrations have no additional surrounding circle or border. The Child reward action uses the shared success green with light text.
