# Phase 5.5 Slice 7 — Authentication, family setup and Child pairing

Date: 2026-10-08.

## Result and boundary

Parent sign-in/registration, family creation, Child profile creation, Parent pairing display and unauthenticated Child entry now follow the existing ivory/navy/coral visual system. The implementation is visual: no auth provider, session persistence, backend command, schema, membership policy, Rules, notification timing or device-revocation behavior changed. No dependency, ADR, commit, push or deployment was added.

Automated checks pass. Native layout, inline validation/failure and restored-session checks are evidenced below. New successful native sign-in, family/Child creation and pairing remain unobserved because Auth/Functions emulator services were not serving during this run. This is not an end-to-end onboarding PASS. Phase 5.5 may proceed to the final visual-consistency acceptance audit with these explicit limits; the audit should carry forward remaining native success checks. Phase 5 remains PARTIAL.

## Audit and supported flows

Reviewed repository instructions and the overview, architecture, domain, schema, security, roadmap, decisions, ADR-016/028, OPEN-014, Phase 4/5 acceptance audit and Slice 1/6 design reports. No authority conflict was identified.

| Surface                    | Existing behavior preserved                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parent auth gate           | Auth observation distinguishes loading, ready and error. Protected Stack routes expose sign-in/register only when signed out; authenticated users enter the existing app Stack.                        |
| Sign-in                    | React Hook Form with canonical `signInCredentialsSchema`; existing email/password adapter and normalized errors.                                                                                       |
| Registration               | Email, password and confirmation only; canonical `registrationCredentialsSchema`; only email/password go to Auth.                                                                                      |
| Family discovery           | Existing authenticated profile/family/membership read determines loading/error/no-family/ready. No guessed onboarding state or forced recreation.                                                      |
| Family creation            | Existing `createFamily` bootstrap command, Parent name and family name only. Server derives actor/ownership and creates authoritative records.                                                         |
| Child creation             | Existing `createChild` command, family identifier, display name and retained idempotency key. No Child email or new avatar information.                                                                |
| Parent pairing             | Existing `createPairingSession` action per existing Child membership; temporary credential and localized expiry returned by server. Missing token on replay remains an explicit create-new-code state. |
| Child pairing              | Existing text input, memory-only input/key, normalized error mapping, redemption callable followed by Firebase custom-token sign-in.                                                                   |
| Successful/returning Child | Existing Auth listener selects authenticated Home; no extra success page or artificial delay. Restored sessions skip pairing.                                                                          |
| Sign-out                   | Unchanged Settings action awaits registration cleanup before Auth sign-out; this slice does not alter its failure/session behavior.                                                                    |

Unsupported flows remain absent: password reset, email verification, QR scanning/generation, federated providers, magic links, biometrics, local-PIN login, invitations, multiple-guardian administration and device/session management. ADR-028 still requires reset/verification before production release; this visual slice does not implement them. Parent supports multiple Child profiles on the existing Family route; it remains a reusable management surface, not a locked linear wizard.

Native Firebase Auth owns persistent sessions. No SecureStore/password/pairing storage was introduced or changed. Existing client adapters retain canonical Zod input/output parsing and stable error normalization. Existing backend policy retains server-derived UID/role/membership, 128-bit pairing credentials, ten-minute expiry, single-use/idempotent redemption, prior-code invalidation and rate limiting. No plaintext credential, custom token or internal UID/session identifier was added to logs or presentation.

## Visual structure and forms

Parent auth uses ChoreX wordmark → small pastel people icon → Welcome back/Create your account → supporting sentence → labeled fields → primary coral action → supported alternate-auth link. The giant enclosing floating card and development-account/password-policy prose were removed. Actual minimum password length still comes from the existing domain constant.

Child entry uses ChoreX wordmark → mint link icon → Connect to your family → ask-your-parent instruction → Pairing code → Connect. There are no Parent login controls. The code remains a normal accessible text input with native editing/paste capability; no OTP transformation or altered credential format.

`EntryHeading` is shared by both Parent auth screens and Child pairing. `SetupSection` is shared by family and Child creation: neutral bordered rounded surface, compact icon, clear heading/supporting copy and existing form children. These primitives contain no validation, state machine or navigation. Existing Button, TextField, FormMessage and PasswordField remain in use.

Family setup says Create your family and explains the shared agreement/reward space. Child creation explains creating a profile and then connecting its app without an email. Parent pairing highlights the exact credential on a soft coral surface, names the intended Child, explains temporary/single-use use and displays server-returned expiry in the user's locale. Create new code replaces technical token terminology. No QR, copy-to-clipboard action, expiry extension or live client-clock security decision was added.

Fields preserve RHF/Zod, existing keyboard/content/autocomplete props, password show/hide, inline validation, disabled/loading controls and mapped submission errors. Root failures remain separate from field errors; errors never show raw provider details. Pairing invalid/expired/used/newer-code/rate-limited/service errors retain their existing distinctions, with code terminology. Generic errors remain generic when the adapter cannot establish a more specific category. No success is shown before Auth/backend confirmation, no offline queue is added and input remains local while the screen is mounted.

Startup loading/error screens use the same warm design background and coral spinner; their auth gates and generic recovery instruction are unchanged. `Screen entry` opts entry pages into explicit safe-area padding and compact scrolling content without changing existing detail-screen insets. Existing keyboard avoidance is retained. `HomeScreenFrame keyboard` opts only Parent family/onboarding forms into keyboard avoidance; other collection pages leave it disabled. Scroll gestures dismiss the keyboard, and form taps remain usable. Text and controls expand/wrap without fixed text heights. Single-line name/code inputs scroll horizontally for long values.

## Navigation, notifications and security boundaries

Slice 5 destinations and routes remain intact. Auth callbacks rely on the existing session listener/route guards, and setup relies on existing family read state. Back behavior and signed-out protection are unchanged. No new persistent onboarding flag or client authority was added.

Notification lifecycle, contextual education eligibility, permission actions, More/Settings and reminder preferences are unchanged. No permission request occurs on sign-in, registration or pairing launch. Existing bootstrap tests continue to verify no registration before explicit Enable. No incidental Phase 5 notification verification was completed in this run.

OPEN-014 remains unresolved. Pairing UI neither manages nor revokes individual Firebase sessions, and does not imply that registration removal signs another device out.

## Native observations and screenshots

Observed existing development builds on iOS 26.5: iPhone SE-sized 375 × 667 simulator and iPhone 17 Pro. Existing Pro Parent/Child sessions and records were preserved. No account, family, Child or pairing credential was generated for visual fixtures.

| Evidence            | Observation and screenshot                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent sign-in      | Real signed-out form, canonical invalid-email/required-password feedback; [validation on SE](design/phase-5-5-slice-7/parent-sign-in-validation-se.png). Software keyboard check kept password and Sign in reachable.                                                                                                                                                                                           |
| Registration        | Real supported registration route, confirmation field and CTA above software keyboard; password-manager strong-password suggestion appeared and was dismissed without saving; [keyboard on SE](design/phase-5-5-slice-7/parent-register-keyboard-se.png).                                                                                                                                                       |
| Larger Parent text  | Real sign-in required-field messages, Password and Show control expanded without overlap; [larger text](design/phase-5-5-slice-7/parent-sign-in-larger-text-se.png).                                                                                                                                                                                                                                            |
| Family form         | Shared production frame/SetupSection/TextField/Button with synthetic long Parent/family names and long local failure; [keyboard/error fixture](design/phase-5-5-slice-7/family-layout-keyboard-error-se.png). This verifies layout, not family creation.                                                                                                                                                        |
| Child form          | Same shared production components with synthetic long Child name; [keyboard](design/phase-5-5-slice-7/child-profile-layout-keyboard-se.png), [larger-text error/input/action](design/phase-5-5-slice-7/child-profile-layout-larger-text-se.png).                                                                                                                                                                |
| Parent code display | Explicitly fake credential, long Child name, expiry and new-code action wrap at larger size; [layout fixture](design/phase-5-5-slice-7/pairing-code-layout-larger-text-se.png). This is not an issued/valid pairing session.                                                                                                                                                                                    |
| Child entry/failure | Real signed-out form and software keyboard at larger size; [keyboard](design/phase-5-5-slice-7/child-pairing-keyboard-larger-text-se.png). Short fake input with unavailable backend produced the existing generic retryable failure, retained input and stayed signed out; [failure](design/phase-5-5-slice-7/child-pairing-failure-se.png). A server-confirmed PAIRING_INVALID/EXPIRED result is not claimed. |
| Existing Family     | Real cached multi-Child family, refreshed Add a child and existing per-Child pairing buttons; [Parent Family](design/phase-5-5-slice-7/parent-family-pro.png). The visible QA text was unsubmitted and cleared afterward. Software-keyboard focus/CTA were inspected here too.                                                                                                                                  |
| Restored sessions   | Terminated/relaunched each Pro binary; existing sessions returned to [Child Home](design/phase-5-5-slice-7/child-restored-home-pro.png) and [Parent Home](design/phase-5-5-slice-7/parent-restored-home-pro.png), with cached-data qualifiers and current navigation. No auth/pairing form was present in the observed restored state. This is not frame-by-frame proof of every startup frame.                 |

At larger text, content scrolls vertically and not all fields/actions fit at once. Refocusing brings inputs into view; dragging dismisses the keyboard and exposes lower actions. No horizontal page overflow or overlapping code/error text was observed. Screenshots may contain Expo developer controls and iOS return-to-app labels. Early sign-in/registration evidence preceded the final explicit entry-safe-area refinement; the later larger-text/pairing checks use the final entry layout.

The temporary synthetic route used local values/no-op actions only, imported production shared components and was removed before final validation/exports. Its forms did not call Auth, Functions or Firestore. Restored SE text size to its original `large` setting and returned it to signed-out Child entry. No real credential appears in screenshots. These checks are not a full VoiceOver/Phase 7 accessibility audit or Android/release-build acceptance.

## Tests and validation

Updated existing Child bootstrap assertions for entry labels and extended its existing pairing-success/restoration case with a failed attempt: no custom-token sign-in or authenticated user on failure, then existing successful entry. Parent existing bootstrap pairing/navigation tests remain in use.

Added three high-value cases within existing suites: normalized Parent sign-in call plus generic safe failure, registration excluding confirmation from the Auth call, and family creation → Child creation → pairing availability using existing commands. These UI paths previously had schema assertions but lacked form submission wiring coverage. No new decorative suite or color/spacing/icon assertions were added.

- Parent: 11 suites, 74 tests pass.
- Child: 10 suites, 79 tests pass.
- Workspace typecheck, lint, formatting and diff checks pass.
- Both iOS exports pass: `/tmp/chorex-slice7-parent-ios`, `/tmp/chorex-slice7-child-ios`.
- No backend/emulator regression suite was run because backend/security code is unchanged.

Remaining native checks require a working isolated Auth/Functions environment: successful fresh sign-in/register, no-family authenticated setup/creation, confirmed Child creation, issued code, invalid/expired server response and successful fresh pairing. Existing automated tests cover command/schema and session boundaries; synthetic layout screenshots do not close native success gaps. Unrelated Phase 5 first OS permission dialog, confirmed preference-save/sign-out and physical Expo/APNs delivery remain separate. The final Phase 5.5 visual audit can proceed while tracking these limits explicitly.
