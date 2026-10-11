import { LanguagePicker } from '../localization/LanguagePicker';
import {
  t,
  useAppLanguage,
  dateLocale,
  HomeScreenFrame,
  HomeSection,
  HomeHeader,
  DesignText,
  SectionHeading,
  ReminderPreferenceCard,
  SettingsRow,
  Button,
  SetupSection,
  homeTokens,
  NotificationPermissionCard,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { ParentSettingsSection } from './ParentSettingsSection';
import { ContractTabs } from '../contracts/ContractTabs';
import { HomeAttention } from './HomeAttention';
import { ParentFamilyProvider, useParentFamily } from './FamilyContext';
import { useRouter } from 'expo-router';
import { HomeFamilyOverview } from '../family/HomeFamilyOverview';
import { PendingRewards } from '../rewards/PendingRewards';
import { ActiveContracts } from '../contracts/ActiveContracts';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
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
import { OfferTabs } from '../offers/OfferTabs';

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
    | 'home'
    | 'offers'
    | 'contracts'
    | 'rewards'
    | 'more'
    | 'create'
    | 'family'
    | 'add-child';
}) {
  const family = useParentFamily();
  if (!family)
    return (
      <ParentFamilyProvider>
        <ParentSurface {...props} />
      </ParentFamilyProvider>
    );
  return <ParentSurfaceContent {...props} />;
}
function ParentSurfaceContent({
  area = 'home',
}: {
  area?:
    | 'home'
    | 'offers'
    | 'contracts'
    | 'rewards'
    | 'more'
    | 'create'
    | 'family'
    | 'add-child';
}) {
  useAppLanguage();

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
  const emptyHome =
    area === 'home' &&
    familyState.status === 'ready' &&
    familyState.home.children.length === 0;
  const fillPage =
    familyState.status === 'onboarding' || area === 'home' || area === 'create';
  const education = useNotificationEducation(
    familyState.status === 'ready' ? uid : undefined,
    notifications.state.permission,
  );
  const [signingOut, setSigningOut] = useState(false);
  const [homeLoading, setHomeLoading] = useState(true);
  const [selectedChildUid, setSelectedChildUid] = useState<string>();
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
      if (area === 'add-child') router.replace('/family');
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
      fill={fillPage}
      header={
        <HomeHeader
          leading={
            area === 'add-child' ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('Back to Family')}
                onPress={() => router.replace('/family')}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <DesignText style={{ color: homeTokens.secondary }}>
                  {t('← Family')}
                </DesignText>
              </Pressable>
            ) : undefined
          }
          name={
            familyState.status === 'ready'
              ? familyState.home.profile.displayName
              : t('Parent')
          }
        />
      }
      keyboard={area === 'add-child' || familyState.status === 'onboarding'}
    >
      <View style={fillPage ? { flexGrow: 1 } : undefined}>
        {familyState.status === 'loading' ? (
          <View className="items-center py-6">
            <ActivityIndicator
              accessibilityLabel={t('Loading your Parent profile')}
              color={homeTokens.coral}
              size="large"
            />
            <Text
              allowFontScaling={false}
              className="mt-4 text-home-muted"
              style={dynamicType.body}
            >
              {t('Loading your family…')}
            </Text>
          </View>
        ) : null}

        {familyState.status === 'error' ? (
          <View className="mt-8 gap-4">
            <FormMessage message={familyState.message} />
            <Button label={t('Try again')} onPress={loadProfile} />
          </View>
        ) : null}

        {familyState.status === 'onboarding' ? (
          <SetupSection
            showIcon={false}
            title={t('Create your family')}
            description={t(
              'This is the shared space for your agreements and rewards.',
            )}
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
                  label={t('Your name')}
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
                  label={t('Family name')}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  onSubmitEditing={handleSubmit(onCreateFamily)}
                  returnKeyType="done"
                  value={field.value}
                />
              )}
            />
            <Button
              variant="blue"
              lightText
              label={t('Create family')}
              loading={isSubmitting}
              onPress={handleSubmit(onCreateFamily)}
            />
          </SetupSection>
        ) : null}

        {familyState.status === 'ready' ? (
          <View
            className="gap-5"
            pointerEvents={
              area === 'home' && !emptyHome && homeLoading ? 'none' : 'auto'
            }
            accessibilityElementsHidden={
              area === 'home' && !emptyHome && homeLoading
            }
            importantForAccessibility={
              area === 'home' && !emptyHome && homeLoading
                ? 'no-hide-descendants'
                : 'auto'
            }
            style={{
              flexGrow: area === 'home' || area === 'create' ? 1 : undefined,
              opacity: area === 'home' && !emptyHome && homeLoading ? 0 : 1,
            }}
          >
            {emptyHome ? (
              <View
                style={{
                  flexGrow: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: homeTokens.spacing.card,
                }}
              >
                <Image
                  accessible={false}
                  source={require('../../../../packages/ui/assets/icons/add_child.png')}
                  resizeMode="contain"
                  style={{ width: 120, height: 120 }}
                />
                <DesignText
                  accessibilityRole="header"
                  style={{
                    fontSize: 24,
                    fontWeight: '700',
                    color: homeTokens.text,
                    textAlign: 'center',
                  }}
                >
                  {t('Add your first child')}
                </DesignText>
                <DesignText
                  style={{
                    fontSize: 16,
                    color: homeTokens.secondary,
                    textAlign: 'center',
                  }}
                >
                  {t(
                    'Create a child profile to start making agreements and sharing rewards together.',
                  )}
                </DesignText>
                <Button
                  label={t('Add child')}
                  variant="blue"
                  lightText
                  onPress={() => router.push('/family/add-child')}
                />
              </View>
            ) : null}
            {area !== 'home' &&
            area !== 'contracts' &&
            area !== 'rewards' &&
            area !== 'more' &&
            area !== 'family' &&
            area !== 'create' &&
            area !== 'offers' &&
            area !== 'add-child' ? (
              <SectionHeading>
                {t(
                  (
                    {
                      offers: 'Offers',
                      contracts: 'Contracts',
                      rewards: 'Rewards',
                      more: 'Settings',
                      create: 'Create Offer',
                      family: 'Family',
                    } as const
                  )[area],
                )}
              </SectionHeading>
            ) : null}
            {area === 'home' && familyState.home.children.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: homeTokens.spacing.small }}
              >
                {[
                  { uid: undefined, displayName: t('All children') },
                  ...familyState.home.children,
                ].map((child) => {
                  const selected = child.uid === selectedChildUid;
                  return (
                    <Pressable
                      key={child.uid ?? 'all'}
                      accessibilityRole="tab"
                      accessibilityLabel={child.displayName}
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedChildUid(child.uid)}
                      style={{
                        minHeight: 44,
                        paddingHorizontal: 24,
                        borderRadius: homeTokens.radius.pill,
                        borderWidth: 1,
                        borderColor: selected
                          ? homeTokens.text
                          : homeTokens.border,
                        backgroundColor: selected
                          ? homeTokens.text
                          : homeTokens.surface,
                        justifyContent: 'center',
                      }}
                    >
                      <DesignText
                        style={{
                          fontSize: 16,
                          fontWeight: '600',
                          color: selected
                            ? homeTokens.surface
                            : homeTokens.secondary,
                        }}
                      >
                        {child.displayName}
                      </DesignText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {area === 'home' && !emptyHome ? (
              <HomeAttention
                onLoadingChange={setHomeLoading}
                selectedChildUid={selectedChildUid}
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
                <OfferTabs
                  activeChildren={familyState.home.children}
                  childNames={Object.fromEntries(
                    familyState.home.children.map((child) => [
                      child.uid,
                      child.displayName,
                    ]),
                  )}
                  authUid={user.uid}
                  familyId={familyState.home.family.id}
                />
              </HomeSection>
            ) : null}
            {area === 'contracts' ? (
              <HomeSection>
                <ContractTabs
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
            {area === 'home' && !emptyHome ? (
              <ActiveContracts
                selectedChildUid={
                  area === 'home' ? selectedChildUid : undefined
                }
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
            ) : null}
            {area === 'create' ? (
              <HomeSection fill>
                <OfferDraftComposer
                  activeChildren={familyState.home.children}
                  familyId={familyState.home.family.id}
                />
                <Button
                  label={t('Back')}
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
              <DesignText
                accessibilityRole="header"
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  color: homeTokens.text,
                }}
              >
                {familyState.home.family.name}
              </DesignText>
            ) : null}
            {area === 'family' ? (
              <HomeFamilyOverview
                home={familyState.home}
                authUid={user.uid}
                renderChildActions={(child) => (
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Button
                      label={
                        pairingState.status === 'ready' &&
                        pairingState.childUid === child.uid
                          ? t('Create new code')
                          : t('Pair device')
                      }
                      loading={
                        pairingState.status === 'loading' &&
                        pairingState.childUid === child.uid
                      }
                      onPress={() => onCreatePairingSession(child.uid)}
                      variant="deepBlue"
                      lightText
                    />
                  </View>
                )}
                renderChildDetails={(child) => (
                  <View style={{ gap: homeTokens.spacing.medium }}>
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
                          {t(
                            "Use this temporary code in the Child app to connect {0}'s device. It can only be used once.",
                            { '0': child.displayName },
                          )}
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
                            {t(
                              'This code was already shown. Create a new code to connect a device.',
                            )}
                          </Text>
                        )}
                        <Text
                          allowFontScaling={false}
                          className="text-home-muted"
                          style={dynamicType.small}
                        >
                          {t('Expires:')}{' '}
                          {new Date(pairingState.expiresAt).toLocaleString(
                            dateLocale(),
                          )}
                        </Text>
                      </View>
                    ) : null}
                    {pairingState.status === 'error' &&
                    pairingState.childUid === child.uid ? (
                      <FormMessage message={pairingState.message} />
                    ) : null}
                  </View>
                )}
              />
            ) : null}
            {area === 'family' ? (
              <Button
                label={t('Add a child')}
                variant="blue"
                lightText
                onPress={() => router.push('/family/add-child')}
              />
            ) : null}
            {area === 'add-child' ? (
              <ParentSettingsSection title={t('Add a child')}>
                <View
                  style={{
                    padding: homeTokens.spacing.card,
                    gap: homeTokens.spacing.medium,
                  }}
                >
                  <DesignText
                    style={{ fontSize: 16, color: homeTokens.secondary }}
                  >
                    {t(
                      'Create their profile, then connect their Child app. No child email is needed.',
                    )}
                  </DesignText>
                  <FormMessage message={childErrors.root?.child?.message} />
                  <Controller
                    control={childControl}
                    name="displayName"
                    render={({ field }) => (
                      <TextField
                        autoCapitalize="words"
                        editable={!isCreatingChild}
                        error={childErrors.displayName?.message}
                        label={t("Child's name")}
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
                    label={t('Create child profile')}
                    variant="blue"
                    lightText
                    loading={isCreatingChild}
                    onPress={handleChildSubmit(onCreateChild)}
                  />
                </View>
              </ParentSettingsSection>
            ) : null}
            {area === 'more' ? (
              <HomeSection>
                {area === 'more' ? (
                  <>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: homeTokens.spacing.medium,
                        paddingVertical: homeTokens.spacing.medium,
                      }}
                    >
                      <View
                        accessible={false}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: homeTokens.radius.pill,
                          backgroundColor: homeTokens.blue,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <DesignText
                          style={{
                            fontSize: 26,
                            fontWeight: '700',
                            color: homeTokens.text,
                          }}
                        >
                          {familyState.home.profile.displayName
                            .trim()
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part.charAt(0))
                            .join('')
                            .toUpperCase()}
                        </DesignText>
                      </View>
                      <View style={{ flex: 1, gap: homeTokens.spacing.small }}>
                        <DesignText
                          style={{
                            fontSize: 26,
                            fontWeight: '700',
                            color: homeTokens.text,
                          }}
                        >
                          {familyState.home.profile.displayName}
                        </DesignText>
                        <DesignText
                          style={{ fontSize: 16, color: homeTokens.secondary }}
                        >
                          {t('Parent account')}
                        </DesignText>
                      </View>
                    </View>
                    <ParentSettingsSection title={t('Family')}>
                      <SettingsRow
                        last
                        title={t('Family')}
                        subtitle={t(
                          'View your family and existing child profiles.',
                        )}
                        icon="people-outline"
                        tone="mint"
                        onPress={() => router.navigate('/family')}
                      />
                    </ParentSettingsSection>
                    <LanguagePicker />
                    <ParentSettingsSection title={t('Notifications')}>
                      <NotificationPermissionCard
                        benefit={t(
                          'Stay updated when your child responds, submits an agreement or needs your attention.',
                        )}
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
                        label={t('Pending reward reminders')}
                        description={t(
                          'Get a reminder when an earned reward is still waiting for delivery.',
                        )}
                        enabled={reminder.state.enabled}
                        busy={reminder.state.busy}
                        fromCache={reminder.state.fromCache}
                        error={reminder.state.error}
                        onChange={(enabled) => {
                          void reminder.save(enabled);
                        }}
                      />
                    </ParentSettingsSection>
                  </>
                ) : null}
              </HomeSection>
            ) : null}
          </View>
        ) : null}

        {familyState.status !== 'loading' &&
        (area === 'more' || familyState.status !== 'ready') ? (
          <View
            className="mt-6 gap-4"
            style={
              familyState.status === 'onboarding'
                ? { marginTop: 'auto', paddingTop: homeTokens.spacing.section }
                : undefined
            }
          >
            <FormMessage message={signOutError} />
            {area === 'more' ? (
              <ParentSettingsSection title={t('Privacy & account')}>
                <SettingsRow
                  title={t('Privacy & Data')}
                  icon="shield-checkmark-outline"
                  onPress={() => router.push('/privacy')}
                />
                <SettingsRow
                  last
                  title={t('Sign out')}
                  showChevron={false}
                  subtitle={signingOut ? t('Signing out…') : undefined}
                  icon="log-out-outline"
                  tone="coralSurface"
                  destructive
                  disabled={signingOut}
                  onPress={handleSignOut}
                />
              </ParentSettingsSection>
            ) : (
              <View className="gap-3">
                <Button
                  label={t('Privacy & Data')}
                  variant="outlineBlue"
                  onPress={() => router.push('/privacy')}
                />
                <Button
                  label={t('Sign out')}
                  loading={signingOut}
                  onPress={handleSignOut}
                  variant="danger"
                />
              </View>
            )}
          </View>
        ) : null}
      </View>
    </HomeScreenFrame>
  );
}
