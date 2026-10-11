# Parent application languages

The Parent app supports English, Deutsch, Slovenščina and Hrvatski. The Language section in Settings displays native language names and flags in a native selector. English is the default.

Language selection updates visible product copy immediately and is stored locally with the existing Expo SecureStore dependency under `chorex.parent.language`. It persists across app restarts and sign-out. The bootstrap waits for this local preference before displaying copy, preventing a flash of the wrong language. Unsupported preferences and unavailable storage fall back to English; a failed save restores the previous selection and displays an error.

## Translation boundaries

`packages/ui/src/localization.tsx` provides a small translation runtime with React subscriptions. Each mobile binary has its own runtime and loads its own language preference. The English source strings are translation keys. German, Slovenian and Croatian catalogs live in `packages/ui/src/locales`.

Translation calls apply explicitly to product copy: navigation, login and registration, family setup and pairing, settings and privacy, offers and negotiation, agreements and reviews, rewards and fulfillment, validation, loading and empty states, confirmations and accessibility labels. Shared components receive translated copy or translate their own fixed labels. Schema errors are localized at the UI boundary; domain schemas, roles, status identifiers, command input shapes and server policy do not change.

Names, custom reward titles, task titles/descriptions, agreement terms and review notes remain user content. They are not automatically translated. Reward preset labels are localized in the picker. New Parent offers and newly selected counteroffer rewards in either app populate preset titles in the selected language. Existing accepted snapshots remain unchanged.

Dates and times use the selected German, Slovenian or Croatian locale and the device time zone. English retains the existing device date format. The iOS native picker receives the selected locale; Android's native calendar and clock follow system language, while application labels and action buttons use the chosen app language. OS permission prompts and remotely delivered push notification content are outside this app-copy translation layer.

## Maintaining translations

Add each new product string to all three catalogs and call `t` at the point of presentation. A component computing translated text must subscribe with `useAppLanguage` so language changes refresh it. Translate complete sentences with numbered interpolation parameters; insert names and terms without translating them. Keep tab IDs and lifecycle values independent of their translated labels.

The Parent localization tests verify catalog coverage of translation calls, matching interpolation parameters, all native language choices and flags, persistence, startup restoration, storage failure, validation and preservation of user-authored content. Existing Parent and Child surface tests cover the unchanged lifecycle interactions.

## Child app and native language selector

The Child app now loads its own preference from `chorex.child.language` and supports the same four languages throughout pairing, settings, home, offers, agreements, reviews and rewards. Existing terms and user-authored content stay unchanged. Both apps have a Language section in Settings with native names and flags.

Both selectors use the shared `NativeLanguageSelect` and `@react-native-picker/picker` 2.11.4, the version listed by the installed Expo 57 SDK. Android opens a native dropdown. iOS opens a sheet with the native selection wheel and Cancel/Done actions; cancelling leaves the saved language unchanged.

This adds a native module to both binaries. Rebuild each development client after pulling this change: from each app directory run `pnpm exec expo run:ios` (or `pnpm exec expo run:android` for Android). A Metro restart alone does not add the native picker to an existing client. No Firebase schema, permission policy or lifecycle command changes are required.

Run `node scripts/verify-parent-translations.mjs` to verify translation calls in both apps and shared UI against all catalogs. Both apps have localization tests for startup, native choices, persistence, errors and preservation of user content.
