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

Child offer detail header/footer refinement: the HomeScreenFrame header slot places the compact avatar/notification header and left Back to Offers link outside the scroll view, below the safe-area inset. Reduced top padding removes the previous header-to-content gap. The detail scroll content grows to the available viewport; the normal response action group uses automatic top margin plus 24pt minimum spacing so actions sit at the bottom when content fits and remain scrollable when it does not. Accept offer explicitly uses white text. Other Home headers and button text retain their existing presentation.

## Reward selection and Parent deadline picker (ADR-051)

Offer creation and Parent/Child counteroffers now use one shared reward selector containing all 24 artwork presets plus Custom. Presets populate the immutable revision's title, type and icon key together. Only Custom shows an editable title. Existing negotiated terms that do not match a preset remain Custom and are preserved until edited. Description editing remains available.

Parent draft and counteroffer deadlines use native date and time selection, formatted locally and converted to UTC by the existing command adapters. Cancelling date selection preserves the prior deadline. Parent adds `@react-native-community/datetimepicker` 9.1.0, requiring an iOS/Android development-client rebuild; Child has no new native dependency. Deploy the updated Functions/domain build before using the expanded icon keys against a deployed backend.

Child offer-detail counteroffer editing uses an unboxed section separated from the current offer. The reward selector has an 88px icon, a larger title without the selected-reward prefix, and a Change action; its modal highlights the current selection. Custom terms keep their existing title/icon preview and expose a Selected reward title field. Description and note inputs provide four visible lines with top-aligned text.

Child Rewards collection now matches the other collection pages: one Earned rewards heading with a right-aligned total, no enclosing SurfaceCard, and standalone Home-style mint reward cards with green detail actions. Status groups and their counts remain visible; existing detail routes, receipt confirmation and loading/error/cache/empty handling remain intact.

Child Rewards now replaces the Earned rewards heading and total count with three accessible status tabs: Waiting for Parent, Confirm receipt and Received. Waiting for Parent is selected initially; only the selected status's rewards render. Tabs remain available for empty statuses and show a status-specific empty state. Home preview and Parent rewards retain their existing presentation.

Child Reward details now follow the offer-detail layout: fixed compact HomeHeader with a left Back to Rewards link, no generic page heading or summary/journey card wrappers, 88px reward artwork, larger reward title and a status pill. Description, responsibility and the earned/delivered/received journey remain visible. Receipt confirmation retains server-authoritative behavior and sits below the details, at the bottom when space allows. Parent reward details retain their existing presentation.

Child Contract details now match Offer/Reward details: fixed compact header with Back to My chores, no generic Contract heading or summary/reward wrappers, one larger reward header with status pill, icon-led deadline, unboxed task progress with larger icons, and submission controls at the bottom when space permits. Promised reward description, aggregate/task progress, feedback, review history and server-authoritative completion/submission behavior remain intact. Parent presentation remains unchanged.

Waiting states use the existing waiting.png artwork with centered existing text: Child counteroffer submission outcomes fill the detail content area; agreement review and pending reward delivery show the same illustration while retaining their progress/history details. No lifecycle or command behavior changed.
