# Phase 5.5 Slice 6 — More / Settings, notifications and reminder preferences

Date: 2026-10-08.

## Result and acceptance boundary

Both `/more` routes now show one scrollable **Settings** page using the approved ivory/navy/coral design system, neutral grouped surfaces, pastel icon tiles and Ionicons. More remains the selected top-level destination. No new Settings hierarchy, placeholder feature, dependency, domain behavior, backend/Rules/schema change, commit, push or deployment was introduced.

Implementation and automated validation pass. Native Settings/off/recovery/preference-failure observations and small-width/larger-text layout checks were completed. **The Phase 5 native acceptance gap remains PARTIAL:** the first-time authenticated education → real OS prompt/denial flow, successful online preference saving and successful registration-cleanup/sign-out were not observed in this run. Physical Expo/APNs delivery remains separately unverified. Synthetic layout screenshots do not close these gaps.

## Audit before implementation

Read repository instructions, overview, architecture, security, notifications, roadmap, current decisions (including ADR-018/019/020/045 and OPEN-014), the Phase 4/5 audit, Phase 5 Slice 3/4B reports and Phase 5.5 Slice 1/5 reports. No authority conflict or new durable behavior decision was identified.

| Area                     | Existing implementation                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent More              | `apps/parent/app/(app)/more.tsx` → `ParentSurface area="more"`; shared authenticated Stack navigation                                                                                             |
| Child More               | `apps/child/app/more.tsx` → `ChildSurface area="more"`; authenticated navigation, existing pairing redirect when signed out                                                                       |
| Separate Settings route  | None; none added                                                                                                                                                                                  |
| Entry points             | More tab and header notification-settings button; Child avatar also navigates More                                                                                                                |
| Account information      | Existing family read provides display name/account type; header already uses the name. No profile editing/account-management surface exists                                                       |
| Parent existing controls | Family link, pending-Reward reminder Switch, notification permission/education, Sign out                                                                                                          |
| Child existing controls  | Deadline reminder Switch, notification permission/education, Sign out                                                                                                                             |
| Permission API           | `expo-notifications`, normalized through `readNotificationPermission` and the existing registration coordinator                                                                                   |
| Registration state       | Session-owned `useDeviceRegistrationLifecycle`: checking/loading/registered/off/error plus actual normalized permission and auxiliary error                                                       |
| Education                | `useNotificationEducation`, eligible only after authenticated readable family discovery and undetermined permission; existing installation-local education-seen flag and explicit revisit/Not now |
| Reconciliation           | Existing lifecycle listens to foreground return and token signals; screen adds no listener or registration state cache                                                                            |
| Preferences              | `useReminderPreference(uid, role)` → existing subscription and confirmed transaction adapter; account-scoped, role-specific default-enabled semantics                                             |
| Sign out                 | Existing session action awaits current-installation registration removal before Auth sign-out; failure retains the session                                                                        |
| Other destinations       | Parent `/family` remains the existing overview/create-child/pairing composition. Child has no equivalent account-management link                                                                  |
| Placeholder/dead rows    | No unsupported settings rows or dead destination found; none added                                                                                                                                |
| App information          | No version row was previously exposed. No new metadata lookup/version feature was added                                                                                                           |

## Structure and shared UI

Parent: Settings title → Account/name/Parent summary → Notifications status/education and **Pending reward reminders** → Family link → Account actions/Sign out.

Child: Settings title → Account/name/Child summary → Notifications status/education and **Deadline reminders** → Account actions/Sign out. No Parent reminder or family-management permissions appear.

`SettingsSection` and `SettingsRow` are the only new shared primitives. Each section owns one neutral surface; rows use borders rather than separate giant cards. Existing notification/preference components now compose these rows. App-specific labels, descriptions, supported links and callbacks remain in each app. No generic settings framework or preference category model was created.

The existing profile name is read-only. Sign out uses the existing danger color, an explicit label and a restrained row, without a navigation chevron or new confirmation. Family retains its existing `/family` target and a chevron. UI text scales with the established typography approach; text columns wrap without fixed text heights. At narrow widths or larger font scales, the Switch moves below the text. Switches keep meaningful labels, checked/disabled state, a permission-separation hint and expanded hit area. Loading preference state shows a loading message instead of a false OFF Switch.

## Notification status and enable/recovery flow

Presentation inputs are derived directly from the existing session lifecycle: busy from checking/loading, registered from registered, granted/quiet/permanent denial from actual permission, and mapped errors from error. They are not persisted booleans or another notification state machine.

| Actual lifecycle / permission                   | Display                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Checking/loading                                | **Checking notifications…**; does not flash OFF or claim ON                                            |
| Registered                                      | **Notifications on**; ChoreX can send to this device                                                   |
| Registered with provisional quiet authorization | ON with quiet supporting copy                                                                          |
| Granted but registration failed                 | **Notifications unavailable**; permission is allowed but setup is incomplete, existing error and Retry |
| Error before permission could be read           | Unavailable/status could not be checked, rather than claiming OS denial                                |
| Undetermined or otherwise unusable permission   | OFF; existing explicit Enable path where re-prompting is supported                                     |
| Denied and cannot ask again                     | OFF; disabled in system settings, explanation and explicit **Open notification settings**              |

Opening More never requests permission or opens system Settings. For undetermined permission, explicit Enable revisits the existing explanation when needed; the explanation's explicit Enable invokes the existing lifecycle permission request. Not now retains its existing installation education semantics. Permanent denial takes precedence over education and offers the existing `Linking.openSettings()` action instead of repeatedly requesting permission. Returning from iOS Settings uses the existing session foreground reconciliation, with no restart requirement or second listener architecture.

Granted permission alone does not produce ON: successful device registration must already have been confirmed by the existing lifecycle. ON is channel readiness, not a guarantee of provider/physical delivery. Tokens, installation IDs, device documents and receipt state are never shown.

## Reminder semantics, persistence and sign out

ADR-045 is unchanged. Missing explicit preference means enabled for that account. Parent controls only pending-Reward reminders; Child only deadline reminders. Concise descriptions explain waiting delivery or a due-soon agreement, without worker timing, schedules or deduplication IDs.

The Switch calls only the existing `reminder.save(enabled)` abstraction. It does not prompt for OS permission, open Settings, change registration, affect transactional notifications or mutate agreement/reward state. Permission OFF does not overwrite preference ON. Supporting copy makes permission and optional account preference independent; turning reminders off retains agreement updates subject to the device's OS channel.

Existing listener-owned values, busy disabling, cache qualifiers and load/save errors remain. A failed transaction does not show a successful saved value or create an offline queue. Reopening/remounting retains the existing preference-read retry behavior. The rest of Settings remains usable; existing notification errors are auxiliary to the account and agreement flows.

Sign-out functions and session/coordinator implementation are untouched. Buttons/rows invoke those same functions; failed cleanup reports the existing error and permits retry while keeping Auth. OPEN-014 remains unresolved: push cleanup/status is not individual Child-device Auth revocation, and no remove-device dashboard or revocation capability was added.

## Native observations and limitations

Used the existing iOS 26.5 development builds on iPhone 17 Pro, preserving Parent and Child authenticated sessions, plus the existing iPhone SE (3rd generation), 375 × 667 points. No environment files, credentials, EAS IDs, native configuration or domain fixtures were changed.

| Requested observation         | Actually observed / remaining boundary                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Already enabled permission    | Real Parent system Allow Notifications was ON; both production screens reported granted permission with registration unavailable. A successful registered/ON channel was not observed in this run                                                                                                                                   |
| First undetermined permission | SE was signed out at the existing pairing surface. No authenticated clean first-permission fixture was established; real first OS prompt/Don't Allow remains unverified                                                                                                                                                             |
| Explicit Enable               | Existing two-stage integration is exercised in bootstrap tests. Production explicit Retry was observed transitioning through checking and returning to an auxiliary failure, with granted permission and no OS prompt. First Enable-to-OS-dialog success is not claimed; synthetic education buttons were inspected only for layout |
| Denied/off                    | Changed Parent Allow Notifications OFF in actual iOS Settings; production Settings showed OFF with recovery action                                                                                                                                                                                                                  |
| Return from system Settings   | Returned without restarting; actual permission/status changed. Pressed production Open notification settings, observed the actual OS screen, restored ON and observed granted/setup-incomplete copy on return                                                                                                                       |
| Preference ON/OFF             | Both local Switch states inspected on SE. Production Parent OFF attempt failed to save, retained the confirmed ON value and showed the existing retry error. Successful online OFF/ON persistence remains unverified                                                                                                                |
| OS OFF + preference ON        | Observed in production Parent Settings; Home remained usable and stored preference stayed ON                                                                                                                                                                                                                                        |
| Sign out                      | Production Parent action failed safely when registration cleanup could not be confirmed; session and normal navigation remained. Successful native sign-out is not claimed                                                                                                                                                          |
| Supported link/navigation     | Parent Settings → Family → More, correct More selection, and normal Child More entry verified                                                                                                                                                                                                                                       |

Computer-use successfully bound both Simulator windows in this run, so the prior `cgWindowNotFound` blocker did not recur. An initial malformed development-preview URL showed a development error; it was dismissed and the existing correct Metro server reopened. It does not describe a production Settings defect.

The available dev session could show cached family/preferences, but could not confirm registration, preference writes or cleanup. Auth/Functions emulator ports were not serving during the final check; an existing Firestore process alone is not a working authenticated native fixture environment. We did not reset existing real sessions or invent successful persistence to complete the checklist. Automated lifecycle/preference tests cover the corresponding confirmed-write, failure, resume and cleanup semantics.

Small-screen layout used one temporary local route with the production shared Settings/header/frame/footer components and explicit synthetic role/status/preference values. It supplied a long display name, long education copy, both Switch states, OFF and enabled presentation. All actions were local no-ops/state updates: no permission request, Auth operation, registration or Firestore mutation. Thus an enabled screenshot is **layout evidence**, not a registered-device claim. At `accessibility-medium`, names, subtitles and education actions wrapped; controls remained reachable and footers fit without horizontal scrolling. Restored original `large` text size and removed the temporary route before final checks and exports. SE returned to its original signed-out pairing surface. Parent OS permission was restored ON; both real sessions and confirmed preference values remained intact.

## Screenshots

Developer gear/iOS return-to-app labels are development UI, not ChoreX features.

| Evidence                                                  | Screenshot                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Real Parent permission granted / registration unavailable | [Parent Settings](design/phase-5-5-slice-6/parent-settings-registration-unavailable.png)                                             |
| Real Child role-specific Settings                         | [Child Settings](design/phase-5-5-slice-6/child-settings-pro.png)                                                                    |
| Real OS OFF while preference ON                           | [Parent OFF](design/phase-5-5-slice-6/parent-os-off-reminders-on.png)                                                                |
| Real failed preference save and safe failed sign-out      | [Parent errors](design/phase-5-5-slice-6/parent-preference-save-failed.png)                                                          |
| Synthetic Child OFF preference on small width             | [SE OFF](design/phase-5-5-slice-6/child-settings-se-preference-off.png)                                                              |
| Synthetic enabled presentation, normal width              | [Child SE](design/phase-5-5-slice-6/child-enabled-layout-se.png), [Parent SE](design/phase-5-5-slice-6/parent-enabled-layout-se.png) |
| Synthetic long name and larger text                       | [Parent large](design/phase-5-5-slice-6/parent-settings-long-name-larger-text-se.png)                                                |
| Synthetic long education and reachable actions            | [Education large](design/phase-5-5-slice-6/parent-education-larger-text-se.png)                                                      |
| Synthetic Child larger-text Switch                        | [Child large](design/phase-5-5-slice-6/child-reminder-larger-text-se.png)                                                            |

## Tests and validation

Updated both existing bootstrap tests for Settings/copy, role-specific Switch wiring, explicit education/Enable, actual More navigation and existing sign-out calls. Existing preference-hook tests retain confirmed persistence/failure/account-switch assertions. Added **one** behavior case to the existing Parent notification-lifecycle suite: checking/registered/quiet/error/denied presentation, explicit recovery, preference ON under OS OFF, toggle not enabling permission and unloaded preference not flashing OFF. No new suite, decorative tests or duplicate lifecycle framework was added.

| Check                                                    | Result                                |
| -------------------------------------------------------- | ------------------------------------- |
| Parent full app tests                                    | PASS: 11 suites, 71 tests             |
| Child full app tests                                     | PASS: 10 suites, 79 tests             |
| Shared notification lifecycle/routing tests              | PASS: 53 tests, unchanged             |
| Workspace typecheck                                      | PASS                                  |
| Workspace lint                                           | PASS, no warnings                     |
| Workspace formatting, changed Markdown, git diff --check | PASS                                  |
| Parent iOS export                                        | PASS: `/tmp/chorex-slice6-parent-ios` |
| Child iOS export                                         | PASS: `/tmp/chorex-slice6-child-ios`  |

Total: **203 passing tests**. Targeted settings/permission/preference checks were run during implementation, followed by the complete affected app and shared notification suites. No Functions/emulator backend regression was required or run; production backend/security code is unchanged. No remote Expo/APNs send or physical delivery observation is claimed.

## Phase 5 status and next design slice

The original [Phase 4/5 audit](PHASE_4_5_ACCEPTANCE_AUDIT.md) remains historical and its overall Phase 5 native verdict remains **PARTIAL**. This slice closes the direct Settings off/recovery/foreground and failure-presentation observations, but not every outstanding first-prompt/confirmed-persistence/sign-out observation. The gap cannot yet be marked closed, independently of unverified physical push delivery. No superseding PASS note was added to the audit.

Recommended next design slice: explicitly scope Parent authentication/family onboarding and Child pairing refresh using the same primitives, preserving existing authorization and commands. Establish a working isolated authenticated native fixture at that time to complete first-permission/Not now/restart and successful online preference/sign-out observations. Keep physical delivery and Phase 7 release/accessibility/account lifecycle hardening separately evidenced; OPEN-014 is not resolved by this recommendation.
