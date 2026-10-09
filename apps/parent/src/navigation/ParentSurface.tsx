import { HomeAttention } from './HomeAttention';
import { ParentFamilyProvider, useParentFamily } from './FamilyContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { HomeFamilyOverview } from '../family/HomeFamilyOverview';
import {
  HomeScreenFrame,
  HomeSection,
  HomeHeader,
  HomeGreeting,
  QuickActions,
  SectionHeading,
  ReminderPreferenceCard,
  SettingsSection,
  SettingsRow,
  Button,
  SetupSection,
  homeTokens,
  NotificationPermissionCard,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { PendingRewards } from '../rewards/PendingRewards';
import {
  ActiveContracts,
  ReadyForReviewContracts,
} from '../contracts/ActiveContracts';
import { useCallback, useState } from 'react';
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
} from '@chorex/firebase-client';
import { useNotificationEducation } from '@chorex/notifications';
import { getAuthErrorMessage } from '../auth/messages';
import { useParentSession } from '../auth/session';
import { getFamilyErrorMessage } from '../family/messages';
import { getNotificationErrorMessage } from '../notifications/messages';
import { OfferDraftComposer } from '../offers/OfferDraftComposer';
import { ParentNegotiationInbox } from '../offers/ParentNegotiationInbox';

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

export function ParentSurface(props: {
  area?:
    'home' | 'offers' | 'contracts' | 'rewards' | 'more' | 'create' | 'family';
}) {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const family = useParentFamily();
  if (!family)
    return (
      <ParentFamilyProvider>
        <ParentSurface {...props} />
      </ParentFamilyProvider>
    );
  return focused ? <ParentSurfaceContent {...props} /> : null;
}
function ParentSurfaceContent({
  area = 'home',
}: {
  area?:
    'home' | 'offers' | 'contracts' | 'rewards' | 'more' | 'create' | 'family';
}) {
  const router = useRouter();
  const { user, signOut, notifications } = useParentSession();
  const reminder = useReminderPreference(user?.uid, 'PARENT');
  const uid = user?.uid;
  const dynamicType = useDynamicTypeStyles();
  const {
    state: familyState,
    setState: setFamilyState,
    reload: loadProfile,
  } = useParentFamily()!;
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
    <HomeScreenFrame
      keyboard={area === 'family' || familyState.status === 'onboarding'}
    >
      <View>
        <HomeHeader
          name={
            familyState.status === 'ready'
              ? familyState.home.profile.displayName
              : 'Parent'
          }
        />

        {familyState.status === 'loading' ? (
          <View className="items-center py-6">
            <ActivityIndicator
              accessibilityLabel="Loading your Parent profile"
              color={homeTokens.coral}
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
          <SetupSection
            title="Create your family"
            description="This is the shared space for your agreements and rewards."
          >
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
          </SetupSection>
        ) : null}

        {familyState.status === 'ready' ? (
          <View className="gap-5">
            {area === 'home' ? (
              <>
                <HomeGreeting name={familyState.home.profile.displayName} />
                <QuickActions />
              </>
            ) : (
              <SectionHeading>
                {
                  (
                    {
                      offers: 'Offers',
                      contracts: 'Contracts',
                      rewards: 'Rewards',
                      more: 'Settings',
                      create: 'Create Offer',
                      family: 'Family',
                    } as const
                  )[area]
                }
              </SectionHeading>
            )}
            {area === 'home' ? (
              <HomeAttention
                familyId={familyState.home.family.id}
                authUid={user.uid}
                childNames={Object.fromEntries(
                  familyState.home.children.map((child) => [
                    child.uid,
                    child.displayName,
                  ]),
                )}
              />
            ) : null}
            {area === 'offers' ? (
              <HomeSection>
                <Button
                  label="Create Offer"
                  onPress={() => router.push('/offers/create')}
                />
                <ParentNegotiationInbox
                  activeChildren={familyState.home.children}
                  authUid={user.uid}
                  familyId={familyState.home.family.id}
                />
              </HomeSection>
            ) : null}
            {area === 'contracts' ? (
              <HomeSection>
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
            ) : null}
            {area === 'rewards' ? (
              <HomeSection>
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
            ) : null}
            {area === 'home' || area === 'family' ? (
              <HomeSection>
                <HomeFamilyOverview
                  preview={area === 'home'}
                  home={familyState.home}
                  authUid={user.uid}
                />
              </HomeSection>
            ) : null}
            {area === 'home' || area === 'contracts' ? (
              <HomeSection>
                <ActiveContracts
                  preview={area === 'home'}
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
            ) : null}
            {area === 'create' ? (
              <HomeSection>
                <OfferDraftComposer
                  activeChildren={familyState.home.children}
                  familyId={familyState.home.family.id}
                />
                <Button
                  label="Back"
                  variant="outline"
                  onPress={() =>
                    router.canGoBack()
                      ? router.back()
                      : router.replace('/offers')
                  }
                />
              </HomeSection>
            ) : null}
            {area === 'family' ? (
              <SetupSection
                title="Add a child"
                description="Create their profile, then connect their Child app. No child email is needed."
              >
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
              </SetupSection>
            ) : null}
            {area === 'more' || area === 'family' ? (
              <HomeSection>
                {area === 'family' ? (
                  <View>
                    <View className="rounded-3xl border border-home-border bg-home-surface p-5">
                      <SectionHeading>Children</SectionHeading>
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
                                    ? 'Create new code'
                                    : 'Pair device'
                                }
                                loading={
                                  pairingState.status === 'loading' &&
                                  pairingState.childUid === child.uid
                                }
                                onPress={() =>
                                  onCreatePairingSession(child.uid)
                                }
                                variant="secondary"
                              />
                              {pairingState.status === 'ready' &&
                              pairingState.childUid === child.uid ? (
                                <View
                                  className="gap-3 rounded-2xl p-4"
                                  style={{
                                    backgroundColor: homeTokens.coralSurface,
                                  }}
                                >
                                  <Text
                                    allowFontScaling={false}
                                    className="text-home-text"
                                    style={dynamicType.body}
                                  >
                                    Use this temporary code in the Child app to
                                    connect {child.displayName}&apos;s device.
                                    It can only be used once.
                                  </Text>
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
                                      This code was already shown. Create a new
                                      code to connect a device.
                                    </Text>
                                  )}
                                  <Text
                                    allowFontScaling={false}
                                    className="text-home-muted"
                                    style={dynamicType.small}
                                  >
                                    Expires:{' '}
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
                ) : null}
                {area === 'more' ? (
                  <>
                    <SettingsSection title="Account">
                      <SettingsRow
                        last
                        title={familyState.home.profile.displayName}
                        subtitle="Parent account"
                        icon="person-outline"
                        tone="blue"
                      />
                    </SettingsSection>
                    <SettingsSection title="Notifications">
                      <NotificationPermissionCard
                        benefit="Stay updated when your child responds, submits an agreement or needs your attention."
                        education={education.showEducation}
                        busy={
                          notifications.state.status === 'loading' ||
                          notifications.state.status === 'checking'
                        }
                        registered={notifications.state.status === 'registered'}
                        permissionGranted={
                          notifications.state.permission?.granted
                        }
                        quiet={notifications.state.permission?.quiet}
                        error={
                          notifications.state.status === 'error'
                            ? getNotificationErrorMessage(
                                notifications.state.error,
                              )
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
                      <ReminderPreferenceCard
                        label="Pending reward reminders"
                        description="Get a reminder when an earned reward is still waiting for delivery."
                        enabled={reminder.state.enabled}
                        busy={reminder.state.busy}
                        fromCache={reminder.state.fromCache}
                        error={reminder.state.error}
                        onChange={(enabled) => {
                          void reminder.save(enabled);
                        }}
                      />
                    </SettingsSection>
                    <SettingsSection title="Family">
                      <SettingsRow
                        last
                        title="Family"
                        subtitle="View your family and existing child profiles."
                        icon="people-outline"
                        tone="mint"
                        onPress={() => router.navigate('/family')}
                      />
                    </SettingsSection>
                  </>
                ) : null}
              </HomeSection>
            ) : null}
          </View>
        ) : null}

        {familyState.status !== 'loading' &&
        (area === 'more' || familyState.status !== 'ready') ? (
          <View className="mt-6 gap-4">
            <FormMessage message={signOutError} />
            {area === 'more' ? (
              <SettingsSection title="Account actions">
                <SettingsRow
                  title="Privacy & Data"
                  icon="shield-checkmark-outline"
                  onPress={() => router.push('/privacy')}
                />
                <SettingsRow
                  last
                  title="Sign out"
                  showChevron={false}
                  subtitle={signingOut ? 'Signing out…' : undefined}
                  icon="log-out-outline"
                  tone="coralSurface"
                  destructive
                  disabled={signingOut}
                  onPress={handleSignOut}
                />
              </SettingsSection>
            ) : (
              <View className="gap-3">
                <Button
                  label="Privacy & Data"
                  variant="secondary"
                  onPress={() => router.push('/privacy')}
                />
                <Button
                  label="Sign out"
                  loading={signingOut}
                  onPress={handleSignOut}
                  variant="secondary"
                />
              </View>
            )}
          </View>
        ) : null}
      </View>
    </HomeScreenFrame>
  );
}
