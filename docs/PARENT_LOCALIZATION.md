# Parent application languages

The Parent app supports English, Deutsch, Slovenščina and Hrvatski. The Language section in Settings displays native language names and flags in an accessible dropdown. English is the default.

Language selection updates visible product copy immediately and is stored locally with the existing Expo SecureStore dependency under `chorex.parent.language`. It persists across app restarts and sign-out. The bootstrap waits for this local preference before displaying copy, preventing a flash of the wrong language. Unsupported preferences and unavailable storage fall back to English; a failed save restores the previous selection and displays an error.

## Translation boundaries

`packages/ui/src/localization.tsx` provides a small translation runtime with React subscriptions. Each mobile binary has its own runtime; only Parent loads a language preference, so Child continues to use English. The English source strings are translation keys. German, Slovenian and Croatian catalogs live in `packages/ui/src/locales`.

Translation calls apply explicitly to product copy: navigation, login and registration, family setup and pairing, settings and privacy, offers and negotiation, agreements and reviews, rewards and fulfillment, validation, loading and empty states, confirmations and accessibility labels. Shared components receive translated copy or translate their own fixed labels. Schema errors are localized at the UI boundary; domain schemas, roles, status identifiers, command input shapes and server policy do not change.

Names, custom reward titles, task titles/descriptions, agreement terms and review notes remain user content. They are not automatically translated. Reward preset labels are localized in the picker. New Parent offers and newly selected counteroffer rewards populate preset titles in the selected language. Existing accepted snapshots remain unchanged.

Dates and times use the selected German, Slovenian or Croatian locale and the device time zone. English retains the existing device date format. The iOS native picker receives the selected locale; Android's native calendar and clock follow system language, while application labels and action buttons use the chosen app language. OS permission prompts and remotely delivered push notification content are outside this app-copy translation layer.

## Maintaining translations

Add each new product string to all three catalogs and call `t` at the point of presentation. A component computing translated text must subscribe with `useAppLanguage` so language changes refresh it. Translate complete sentences with numbered interpolation parameters; insert names and terms without translating them. Keep tab IDs and lifecycle values independent of their translated labels.

The Parent localization tests verify catalog coverage of translation calls, matching interpolation parameters, all native language choices and flags, persistence, startup restoration, storage failure, validation and preservation of user-authored content. Existing Parent and Child surface tests cover the unchanged lifecycle interactions.
