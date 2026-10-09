# Phase 7 Slice 2 — Accessibility acceptance

Implementation and automated/local validation: **PASS**. Native accessibility acceptance: **PARTIAL**. Representative larger-text layouts were inspected; audible VoiceOver traversal and native focus interactions are not certified. The next hardening slice may proceed with the follow-up gates below tracked explicitly. This is not production release certification.

## Scope and audit findings

The audit covered shared buttons, icon controls, navigation, actionable rows, fields, status/progress, switches, confirmation surfaces and the reward picker; Parent Home, offers/composer, review, rewards, settings and auth/setup; Child Home, offers, tasks, rewards, settings and pairing. Existing visible role/responsibility text, notification permission education, pairing labels, task/review order and server command boundaries were retained.

| Area                | Finding and resolution                                                                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation          | Selected state existed, but selection depended visually on color. Tabs now expose tab roles and selected state, plus bold/underlined selected labels.                                                                                                                                           |
| Composite rows      | Contract progress was omitted from navigation names; reward labels omitted responsibility. Names now include counts or role-specific lifecycle context. Decorative nested bars/avatars/chevrons are hidden. Cards with multiple controls remain unflattened.                                    |
| Status/progress     | Raw Contract enum names and duplicate percentage bars were noisy. Status uses existing viewer-specific wording; task and bar semantics use completion counts. Child completion controls include task title, current/target counts and action.                                                   |
| Forms               | Required versus optional state and error association were incomplete. Shared fields include required/error hints, optional callsites opt out, errors remain adjacent, and changed errors announce on iOS. Disabled password toggles expose disabled state. Sign-in email Next focuses password. |
| Confirmations       | Newly mounted titles lacked a focus request. Inline offer, submission, approval and reward confirmations use a focused heading. Significant successful command responses announce once; realtime listeners do not announce.                                                                     |
| Picker              | Options already had readable names, selected state and large targets. Added modal scope, opening title focus, explicit close name, iOS trigger-focus restoration and Reduce Motion handling. Visible Selected text remains.                                                                     |
| Typography/contrast | Default DesignText suppressed native scaling; some small foreground colors failed 4.5:1. Default text now scales; semantic foreground tokens were corrected centrally.                                                                                                                          |

Shared changes include Button, TextField, FormMessage, Home/navigation/list rows, ContractPresentation, TaskProgress, SettingsRow, ReminderPreferenceCard, RewardPresentation/Summary/TransitionAction, OfferTerms choices, RewardIconPicker and the small accessibility helpers. No new framework, dependency, architecture decision, domain mutation, route or backend behavior was introduced.

## Touch targets, scaling and color

Existing header controls are at least 44 points, navigation at least 56, primary buttons at least 48 and picker options at least 116 high. Compact See all uses a 24-point visual height plus 10-point hitSlop above/below. These were retained rather than enlarging the approved layout. Effective touch targeting is a static audit; it is not a native motor-interaction certification.

Substantive text and cards wrap/expand. Explicit design font sizes retain the existing manual fontScale calculation with native scaling disabled only to avoid applying scaling twice. DesignText without an explicit size now uses native scaling. The existing bottom-tab label cap of 1.3 remains a narrow exception for five persistent routes; labels retain full accessible names. TextField trailing actions can wrap instead of compressing the input. No substantive agreement/review/reward truncation was added.

Selection now includes a visible checkmark for choice chips and bold/underline for active tabs. Picker Selected text, status words, responsibility sentences, timeline text, error/success copy, and switch checked state provide meaning beyond color. Disabled opacity remains accompanied by disabled semantics; disabled text is not claimed to meet enabled-text contrast.

Contrast was calculated using WCAG sRGB relative luminance for opaque token pairs, not screenshot sampling. Values below are rounded.

| Token      | Before → after    | Representative resulting contrast    |
| ---------- | ----------------- | ------------------------------------ |
| secondary  | #668096 → #536D82 | Ivory 5.19:1; lavender 4.60:1        |
| coral fill | #E95240 → #EA5543 | Navy button text 4.61:1              |
| coralText  | New #BC382B       | Surface 5.53:1; coral surface 4.85:1 |
| success    | #299D7E → #20775F | Mint 4.84:1                          |

Existing navy/ivory is 15.76:1, danger/white 4.90:1 and attention text/surface 4.57:1. Secondary also supplies field placeholder/supporting text. Brand/pastel surfaces remain; decorative borders and disabled opacity are not included in a blanket contrast-pass claim.

## Native observations

The existing App Check-capable development binaries ran current Metro source on iPhone 17 Pro, iOS 26.5, with simulator content size `accessibility-medium`. Evidence is in [phase-7-slice-2 screenshots](design/phase-7-slice-2/).

| Screen              | Actually observed                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent Home         | Enlarged greeting, Quick Actions, attention rows and navigation wrap/read clearly in the visible viewport.                                                                                                           |
| Parent Create Offer | Recipient/task section and expanding labeled fields inspected in the initial viewport. Lower picker was not traversed.                                                                                               |
| Parent Rewards      | Pending reward title, child, status/date and navigation wrap clearly. No delivery command executed.                                                                                                                  |
| Parent Settings     | Upper account/notification/reminder section inspected. Switch interaction below the viewport was not verified.                                                                                                       |
| Parent sign-in      | Actual SignIn component mounted temporarily in the authenticated development app; fields, Show and Sign in visible at larger text. No credentials/submission/logout. Temporary preview route removed before exports. |
| Child Home          | Enlarged metrics/content/navigation visible; screenshot includes a development refresh banner.                                                                                                                       |
| Child Settings      | Upper notification/reminder section inspected; lower switch not interacted with.                                                                                                                                     |

These are visible-viewport layout observations, not complete scroll/keyboard/focus tests. Earlier Phase 5.5 small-screen, long-content and picker layout observations remain historical supporting evidence for unchanged structure; this slice does not relabel them as fresh verification.

Simulator computer-use exposed the macOS window/menu, not the iOS app accessibility tree, and could not capture its content through that interface. Dedicated simulator screenshots provided the visual evidence. Accessibility Inspector could target the foreground Parent process and complete an audit. It reported **one warning: “Label not human-readable”, on a SwiftUI.AccessibilityNode**. The warning detail did not expose the label or identify a ChoreX control; it remains unresolved and is not dismissed as tooling noise. A Child audit was initiated but no final result was verified.

**No audible VoiceOver flow was verified.** No claim is made for actual tab traversal, modal focus trapping/return, asynchronous announcements, pairing entry, Parent review/delivery, Child offer/task/receipt controls or native reminder-switch interaction. React Native semantics and focus calls are covered by implementation/static review; they require native follow-up. Simulator content size was restored after inspection.

## Tests and validation

Five focused shared-primitive tests were added to the existing Parent React Native Testing Library harness: tab selection/grouped rows; count progress/switch state; required/error/disabled password semantics; picker names/selection/callback; changed iOS error announcements without repeat noise. Existing app assertions were adapted to tab roles, coherent row names and friendly status/count wording. The Child adapter harness now mocks the existing App Check native module so it can run in Jest.

| Check                                             | Result                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| Parent complete suite, including shared semantics | PASS — 12 suites, 82 tests                             |
| Child complete suite                              | PASS — 10 suites, 80 tests                             |
| Workspace typecheck                               | PASS                                                   |
| Workspace lint                                    | PASS                                                   |
| Formatting, including this record                 | PASS                                                   |
| Parent iOS bundle export                          | PASS — /private/tmp/chorex-accessibility-parent-export |
| Child iOS bundle export                           | PASS — /private/tmp/chorex-accessibility-child-export  |

No Functions/emulator suite was required because domain/backend code did not change. Existing ESLint and native Testing Library capabilities were used; web-only tooling or a new accessibility framework was not added. Exports verify bundling, not physical-device accessibility or production readiness.

## Follow-up gates

- Traverse representative Parent sign-in/Home/composer/review/delivery/settings and Child pairing/Home/offers/tasks/receipt/settings with real VoiceOver, including reading order and independent controls.
- Verify actual focus landing/return, picker grid traversal, error/success announcement behavior and Reduce Motion dismissal on device.
- Identify the Inspector SwiftUI label warning using element inspection on a working native target.
- Inspect materially changed detail/action/picker surfaces at larger text with scrolling and keyboard, including a small screen. Current viewport evidence alone does not close these items.

Phase 5 native/push gaps and Slice 1 physical attestation/enforcement gates remain separate. App Check enforcement remains OFF. No commit, push or deployment was performed.

API references: [React Native accessibility](https://reactnative.dev/docs/accessibility), [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo).
