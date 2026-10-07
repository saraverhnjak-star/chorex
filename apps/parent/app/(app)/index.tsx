import { HomeFamilyOverview } from '../../src/family/HomeFamilyOverview';
import {
  HomeScreenFrame,
  HomeSection,
  HomeHeader,
  HomeGreeting,
  QuickActions,
  SectionHeading,
  ReminderPreferenceCard,
  Button,
  NotificationPermissionCard,
  FormMessage,
  TextField,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { PendingRewards } from '../../src/rewards/PendingRewards';
import {
  ActiveContracts,
  ReadyForReviewContracts,
} from '../../src/contracts/ActiveContracts';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import {
  createChildInputSchema,
  createFamilyInputSchema,
  type CreateChildInput,
  type CreateFamilyInput,
  type CreateFamilyInputValue,
} from '@chorex/domain';
import {
  useReminderPreference,
  createChild,
  createFamily,
  createPairingSession,
  readCurrentParentFamily,
  type ParentFamilyHome,
} from '@chorex/firebase-client';
import { useNotificationEducation } from '@chorex/notifications';
import { getAuthErrorMessage } from '../../src/auth/messages';
import { useParentSession } from '../../src/auth/session';
import { getFamilyErrorMessage } from '../../src/family/messages';
import { getNotificationErrorMessage } from '../../src/notifications/messages';
import { OfferDraftComposer } from '../../src/offers/OfferDraftComposer';
import { ParentNegotiationInbox } from '../../src/offers/ParentNegotiationInbox';

type FamilyState =
  | { status: 'loading' }
  | { status: 'onboarding' }
  | { status: 'ready'; home: ParentFamilyHome }
  | { status: 'error'; message: string };

type PairingState =
  | { status: 'idle' }
  | { status: 'loading'; childUid: string }
  | {
      status: 'ready';
      childUid: string;
      token?: string;
      expiresAt: string;
    }
  | { status: 'error'; childUid: string; message: string };

type CreateChildFormInput = Pick<CreateChildInput, 'displayName'>;
const createChildFormSchema = createChildInputSchema.pick({
  displayName: true,
});

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function AuthenticatedHomeScreen() {
  const { user, signOut, notifications } = useParentSession();
  const reminder = useReminderPreference(user?.uid, 'PARENT');
  const uid = user?.uid;
  const dynamicType = useDynamicTypeStyles();
  const [familyState, setFamilyState] = useState<FamilyState>({
    status: 'loading',
  });
  const education = useNotificationEducation(
    familyState.status === 'ready' ? uid : undefined,
    notifications.state.permission,
  );
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [childIdempotencyKey, setChildIdempotencyKey] = useState<string>();
  const [pairingState, setPairingState] = useState<PairingState>({
    status: 'idle',
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateFamilyInputValue, unknown, CreateFamilyInput>({
    resolver: zodResolver(createFamilyInputSchema),
    defaultValues: { displayName: '', familyName: '' },
  });
  const {
    control: childControl,
    handleSubmit: handleChildSubmit,
    reset: resetChildForm,
    setError: setChildError,
    formState: { errors: childErrors, isSubmitting: isCreatingChild },
  } = useForm<CreateChildFormInput>({
    resolver: zodResolver(createChildFormSchema),
    defaultValues: { displayName: '' },
  });

  const loadProfile = useCallback(async () => {
    setFamilyState({ status: 'loading' });
    try {
      const home = await readCurrentParentFamily();
      setFamilyState(
        home ? { status: 'ready', home } : { status: 'onboarding' },
      );
    } catch (error) {
      setFamilyState({
        status: 'error',
        message: getFamilyErrorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void readCurrentParentFamily()
      .then((home) => {
        if (active) {
          setFamilyState(
            home ? { status: 'ready', home } : { status: 'onboarding' },
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setFamilyState({
            status: 'error',
            message: getFamilyErrorMessage(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [uid]);

  const onCreateFamily = async (input: CreateFamilyInput) => {
    try {
      const output = await createFamily(input);
      setFamilyState({ status: 'ready', home: { ...output, children: [] } });
    } catch (error) {
      setError('root.family', { message: getFamilyErrorMessage(error) });
    }
  };

  const onCreateChild = async (input: CreateChildFormInput) => {
    if (familyState.status !== 'ready') return;
    const idempotencyKey = childIdempotencyKey ?? newIdempotencyKey();
    setChildIdempotencyKey(idempotencyKey);
    try {
      const output = await createChild({
        familyId: familyState.home.family.id,
        displayName: input.displayName,
        idempotencyKey,
      });
      setFamilyState((current) => {
        if (current.status !== 'ready') return current;
        const children = current.home.children.some(
          (child) => child.uid === output.membership.uid,
        )
          ? current.home.children
          : [...current.home.children, output.membership].sort((left, right) =>
              left.displayName.localeCompare(right.displayName),
            );
        return {
          status: 'ready',
          home: { ...current.home, children },
        };
      });
      setChildIdempotencyKey(undefined);
      resetChildForm();
    } catch (error) {
      setChildError('root.child', { message: getFamilyErrorMessage(error) });
    }
  };

  const onCreatePairingSession = async (childUid: string) => {
    if (familyState.status !== 'ready') return;
    setPairingState({ status: 'loading', childUid });
    try {
      const output = await createPairingSession({
        familyId: familyState.home.family.id,
        childUid,
        idempotencyKey: newIdempotencyKey(),
      });
      setPairingState({
        status: 'ready',
        childUid,
        token: output.token,
        expiresAt: output.expiresAt,
      });
    } catch (error) {
      setPairingState({
        status: 'error',
        childUid,
        message: getFamilyErrorMessage(error),
      });
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(getAuthErrorMessage(error));
      setSigningOut(false);
    }
  };

  const enableNotifications = () => {
    if (
      !education.showEducation &&
      notifications.state.permission?.status === 'undetermined'
    ) {
      education.revisit();
      return;
    }
    education.skip();
    void notifications.enable();
  };

  if (!user) return null;

  return (
    <HomeScreenFrame>
      <View>
        <HomeHeader
          name={
            familyState.status === 'ready'
              ? familyState.home.profile.displayName
              : 'Parent'
          }
        />

        {familyState.status === 'loading' ? (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator
              accessibilityLabel="Loading your Parent profile"
              color={amberAuroraColors.primaryPressed}
              size="large"
            />
            <Text
              allowFontScaling={false}
              className="mt-4 text-home-muted"
              style={dynamicType.body}
            >
              Loading your family…
            </Text>
          </View>
        ) : null}

        {familyState.status === 'error' ? (
          <View className="mt-8 gap-4">
            <FormMessage message={familyState.message} />
            <Button label="Try again" onPress={loadProfile} />
          </View>
        ) : null}

        {familyState.status === 'onboarding' ? (
          <View className="mt-8 gap-5 rounded-3xl border border-border bg-surface-warm p-5">
            <Text
              allowFontScaling={false}
              className="font-bold text-text"
              style={dynamicType.title}
            >
              Create your family
            </Text>
            <Text
              allowFontScaling={false}
              className="text-text-muted"
              style={dynamicType.body}
            >
              Tell us what to call you and your family to finish Parent setup.
            </Text>
            <FormMessage message={errors.root?.family?.message} />
            <Controller
              control={control}
              name="displayName"
              render={({ field }) => (
                <TextField
                  autoCapitalize="words"
                  autoComplete="name"
                  editable={!isSubmitting}
                  error={errors.displayName?.message}
                  label="Your name"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  returnKeyType="next"
                  textContentType="name"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="familyName"
              render={({ field }) => (
                <TextField
                  autoCapitalize="words"
                  editable={!isSubmitting}
                  error={errors.familyName?.message}
                  label="Family name"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  onSubmitEditing={handleSubmit(onCreateFamily)}
                  returnKeyType="done"
                  value={field.value}
                />
              )}
            />
            <Button
              label="Create family"
              loading={isSubmitting}
              onPress={handleSubmit(onCreateFamily)}
            />
          </View>
        ) : null}

        {familyState.status === 'ready' ? (
          <View className="gap-5">
            <HomeGreeting name={familyState.home.profile.displayName} />
            <QuickActions />
            <HomeSection id="offers">
              <SectionHeading>Needs your attention</SectionHeading>
              <ParentNegotiationInbox
                activeChildren={familyState.home.children}
                authUid={user.uid}
                familyId={familyState.home.family.id}
              />
            </HomeSection>
            <HomeSection id="review">
              <ReadyForReviewContracts
                familyId={familyState.home.family.id}
                authUid={user.uid}
                childNames={Object.fromEntries(
                  familyState.home.children.map((child) => [
                    child.uid,
                    child.displayName,
                  ]),
                )}
              />
            </HomeSection>
            <HomeSection id="rewards">
              <PendingRewards
                familyId={familyState.home.family.id}
                authUid={user.uid}
                childNames={Object.fromEntries(
                  familyState.home.children.map((child) => [
                    child.uid,
                    child.displayName,
                  ]),
                )}
              />
            </HomeSection>
            <HomeSection id="family">
              <HomeFamilyOverview home={familyState.home} authUid={user.uid} />
            </HomeSection>
            <HomeSection id="contracts">
              <ActiveContracts
                familyId={familyState.home.family.id}
                authUid={user.uid}
                childNames={Object.fromEntries(
                  familyState.home.children.map((child) => [
                    child.uid,
                    child.displayName,
                  ]),
                )}
              />
            </HomeSection>
            <HomeSection id="create">
              <OfferDraftComposer
                activeChildren={familyState.home.children}
                familyId={familyState.home.family.id}
              />
            </HomeSection>
            <View className="gap-4 rounded-3xl border border-home-border bg-home-surface p-5">
              <Text
                allowFontScaling={false}
                className="font-bold text-home-text"
                style={dynamicType.title}
              >
                Add a child
              </Text>
              <FormMessage message={childErrors.root?.child?.message} />
              <Controller
                control={childControl}
                name="displayName"
                render={({ field }) => (
                  <TextField
                    autoCapitalize="words"
                    editable={!isCreatingChild}
                    error={childErrors.displayName?.message}
                    label="Child's name"
                    onBlur={field.onBlur}
                    onChangeText={(value) => {
                      setChildIdempotencyKey(undefined);
                      field.onChange(value);
                    }}
                    onSubmitEditing={handleChildSubmit(onCreateChild)}
                    returnKeyType="done"
                    value={field.value}
                  />
                )}
              />
              <Button
                label="Create child profile"
                loading={isCreatingChild}
                onPress={handleChildSubmit(onCreateChild)}
              />
            </View>
            <HomeSection id="more">
              <View>
                <View className="rounded-3xl border border-home-border bg-home-surface p-5">
                  <Text
                    allowFontScaling={false}
                    className="font-bold text-home-text"
                    style={dynamicType.title}
                  >
                    Children
                  </Text>
                  {familyState.home.children.length === 0 ? (
                    <Text
                      allowFontScaling={false}
                      className="mt-3 text-home-muted"
                      style={dynamicType.body}
                    >
                      No child profiles yet.
                    </Text>
                  ) : (
                    <View className="mt-3 gap-2">
                      {familyState.home.children.map((child) => (
                        <View
                          className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4"
                          key={child.uid}
                        >
                          <Text
                            allowFontScaling={false}
                            className="font-semibold text-home-text"
                            style={dynamicType.body}
                          >
                            {child.displayName}
                          </Text>
                          <Button
                            label={
                              pairingState.status === 'ready' &&
                              pairingState.childUid === child.uid
                                ? 'Create new token'
                                : 'Pair device'
                            }
                            loading={
                              pairingState.status === 'loading' &&
                              pairingState.childUid === child.uid
                            }
                            onPress={() => onCreatePairingSession(child.uid)}
                            variant="secondary"
                          />
                          {pairingState.status === 'ready' &&
                          pairingState.childUid === child.uid ? (
                            <View className="gap-2 rounded-2xl bg-home-surface p-4">
                              {pairingState.token ? (
                                <Text
                                  allowFontScaling={false}
                                  className="font-bold text-home-text"
                                  selectable
                                  style={dynamicType.body}
                                >
                                  {pairingState.token}
                                </Text>
                              ) : (
                                <Text
                                  allowFontScaling={false}
                                  className="text-home-muted"
                                  style={dynamicType.body}
                                >
                                  This token was already shown. Create a new
                                  token to pair a device.
                                </Text>
                              )}
                              <Text
                                allowFontScaling={false}
                                className="text-home-muted"
                                style={dynamicType.small}
                              >
                                Expires
                                {new Date(
                                  pairingState.expiresAt,
                                ).toLocaleString()}
                              </Text>
                            </View>
                          ) : null}
                          {pairingState.status === 'error' &&
                          pairingState.childUid === child.uid ? (
                            <FormMessage message={pairingState.message} />
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <ReminderPreferenceCard
                label="Pending reward reminders"
                enabled={reminder.state.enabled}
                busy={reminder.state.busy}
                fromCache={reminder.state.fromCache}
                error={reminder.state.error}
                onChange={(enabled) => {
                  void reminder.save(enabled);
                }}
              />
              <NotificationPermissionCard
                benefit="Get updates when your child responds to an offer or submits work for review."
                education={education.showEducation}
                busy={
                  notifications.state.status === 'loading' ||
                  notifications.state.status === 'checking'
                }
                registered={notifications.state.status === 'registered'}
                quiet={notifications.state.permission?.quiet}
                error={
                  notifications.state.status === 'error'
                    ? getNotificationErrorMessage(notifications.state.error)
                    : undefined
                }
                settingsRequired={
                  notifications.state.permission?.status === 'denied' &&
                  notifications.state.permission.canAskAgain === false
                }
                onEnable={enableNotifications}
                onSkip={education.skip}
                onSettings={() => {
                  void Linking.openSettings().catch(() => undefined);
                }}
              />
            </HomeSection>
          </View>
        ) : null}

        {familyState.status !== 'loading' ? (
          <View className="mt-6 gap-4">
            <FormMessage message={signOutError} />
            <Button
              label="Sign out"
              loading={signingOut}
              onPress={handleSignOut}
              variant="secondary"
            />
          </View>
        ) : null}
      </View>
    </HomeScreenFrame>
  );
}
