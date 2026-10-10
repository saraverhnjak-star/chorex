# Child Home design update — 2026-10-10

The supplied `child-home-screen.png` guides this Home presentation update, replacing the Child Home composition described in the Phase 5.5 fidelity acceptance. The logo, greeting and supporting copy are omitted. Avatar and notification controls remain available.

Home shows an available offer first, followed by an agreement card with authoritative task counts and a mint reward card. The three summary metrics are removed. The offer preview returns no UI while loading, on failed reads or when empty; the dedicated Offers screen retains loading, error and retry handling. Realtime removal also removes the preview. Both existing collection navigation and dedicated screens remain available.

Offer titles use the first task title because the existing offer schema has no separate agreement title. Reward illustrations use existing domain icon keys. Task rows display actual titles and completion counts; no title-based illustration guesses or sample data are added. Task rows are read-only previews; completion stays on the existing agreement detail screen. Cached progress and reward data retain their qualifiers. Reward statuses continue to distinguish earned, delivered awaiting confirmation, and received.

“View offer” opens Offers. “Suggest a change” opens Offers with the selected offer's existing counteroffer form. Server commands, authorization, lifecycle rules, schemas and queries are unchanged. Existing English app copy and five navigation destinations remain.

Validation: workspace typecheck and lint, Child and Parent unit suites. Native screenshots and device visual acceptance have not been captured for this update.

Visual refinement: offer actions are stacked vertically at full card width, following the latest requested adjustment. The offer illustration grows to 108pt with three decorative coral rays. Agreement and reward illustrations have no additional surrounding circle or border. The Child reward action uses the shared success green with light text.

My chores collection refinement: remove the duplicate My chores screen title and outer collection card. Active agreements has its count at the right of the heading. All agreements use the Home agreement card, including task progress and the existing detail action; Home still previews only one.

Offers collection/detail refinement: Offers has one heading with a right-aligned count and standalone Home-style cards, without the outer wrapper or embedded negotiation forms. Each card opens `/offers/[offerId]`. Home's View offer and Suggest a change actions open the same detail route; the latter initializes the selected counteroffer form. The detail reads the existing authorized realtime inbox and selects only the route's offer ID. An offer that leaves the inbox exposes no further mutation controls and shows an unavailable outcome, or the local committed-action result. Back to Offers returns to the list. Existing server commands and read authorization are unchanged.

Offer detail presentation refinement: omit the Offer details title and outer item card. Use the shared ProposalTerms reward-first layout only on the Child offer detail: 88pt reward illustration, 26pt reward title, revision pill at the right, followed by response context and terms. Remove the Proposal and Current proposal headings and the duplicated lower Reward block. Standard shared presentation remains in use on other surfaces.

Further Child offer detail refinement: a coral left-aligned arrow link at the start replaces the bottom Back to Offers button. Tasks have 44pt icon circles with 26pt glyphs; only targetCount > 1 shows a blue repetition pill and the small caption “Dogovorjeno število ponovitev”. The Tasks heading is replaced by spacing after the terms explanation. The deadline displays beside a 48pt coral-surface circle with a 28pt calendar icon, without visible Deadline labels; its accessibility label retains the date's meaning. Standard terms layouts on other surfaces remain unchanged.
