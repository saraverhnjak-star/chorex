# Shared UI

`AppPlaceholder` is the shared non-product preview used by both apps. `Screen`, `TextField`, `Button`, and `FormMessage` are the small accessible primitive set used by the first Parent authentication forms. Both apps use the package's public entry point and compile its NativeWind classes. App smoke tests cover this runtime boundary.

## Amber Aurora theme

`theme.cjs` is the canonical source for the light-theme palette and semantic color tokens. TypeScript consumers import `amberAuroraPalette` or `amberAuroraColors` from `@chorex/ui`. Tailwind configurations consume the shared `@chorex/ui/tailwind` preset and use semantic utilities such as `bg-background`, `bg-surface-warm`, `text-text`, and `border-border`.

The theme derives one additional palette value: `amberPressed` (`#D98B3F`) provides pressed-state feedback while retaining strong contrast with Midnight Plum text. The `focus` token reuses Aurora Blue, so no separate focus shade is introduced. This foundation defines only a light theme.
