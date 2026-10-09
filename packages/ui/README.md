# Shared UI

`AppPlaceholder` is the shared non-product preview used by both apps. `Screen`, `TextField`, `Button`, and `FormMessage` are the small accessible primitive set used by the first Parent authentication forms. Both apps use the package's public entry point and compile its NativeWind classes. App smoke tests cover this runtime boundary.

## Amber Aurora theme

`theme.cjs` is the canonical source for the light-theme palette and semantic color tokens. TypeScript consumers import `amberAuroraPalette` or `amberAuroraColors` from `@chorex/ui`. Tailwind configurations consume the shared `@chorex/ui/tailwind` preset and use semantic utilities such as `bg-background`, `bg-surface-warm`, `text-text`, and `border-border`.

The theme derives one additional palette value: `amberPressed` (`#D98B3F`) provides pressed-state feedback while retaining strong contrast with Midnight Plum text. The `focus` token reuses Aurora Blue, so no separate focus shade is introduced. This foundation defines only a light theme.

## ChoreX product accessibility

The current product surfaces use the shared ChoreX navy/ivory/coral tokens in `theme.cjs`. `coral` is the action fill; `coralText` is the darker foreground for small coral labels. Use `secondary` for readable supporting text and `success` for text on mint surfaces. Phase 7 Slice 2 adjusts these centrally; see the [contrast and acceptance record](../../docs/PHASE_7_SLICE_2_ACCESSIBILITY_ACCEPTANCE.md).

`DesignText` scales native text by default. Explicit design sizes use the existing `useFontScale` calculation exactly once. Bottom navigation alone retains its 1.3 scaling cap; substantive content wraps and expands. Actionable rows expose one coherent name, while cards with independent controls keep those controls separate. Progress uses domain counts, switches expose checked state, and selected choices include visible text or a checkmark.

Use `FocusHeading` for newly opened confirmation titles and `announceAction` for significant successful command responses. Do not attach announcements to realtime listeners. `TextField` includes required/error hints; mark optional fields with `required={false}`. The reward picker respects Reduce Motion and restores iOS focus on dismissal.
