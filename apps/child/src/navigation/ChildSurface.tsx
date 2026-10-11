import { LanguagePicker } from '../localization/LanguagePicker';
import {
  t,
  useAppLanguage,
  DesignText,
  OfferOutcome,
  HomeScreenFrame,
  HomeSection,
  HomeHeader,
  SectionHeading,
  ReminderPreferenceCard,
  SettingsSection,
  SettingsRow,
  Button,
  NotificationPermissionCard,
  FormMessage,
  Screen,
  EntryHeading,
  TextField,
  homeTokens,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { ChildFamilyProvider, useChildFamily } from './FamilyContext';
import { useRouter, Redirect } from 'expo-router';
import { EarnedRewards } from '../rewards/EarnedRewards';
import { ActiveContracts } from '../contracts/ActiveContracts';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useReminderPreference } from '@chorex/firebase-client';
import { useNotificationEducation } from '@chorex/notifications';
import { useChildSession } from '../auth/session';
import { getNotificationErrorMessage } from '../notifications/messages';
import { OfferInbox } from '../offers/OfferInbox';
import { getPairingErrorMessage } from '../pairing/messages';

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function ChildSurface(props: {
  area?: 'home' | 'offers' | 'contracts' | 'rewards' | 'more';
  initialCounterOfferId?: string;
  offerId?: string;
}) {
  const family = useChildFamily();
  if (!family)
    return (
      <ChildFamilyProvider>
        <ChildSurface {...props} />
      </ChildFamilyProvider>
    );
  return <ChildSurfaceContent {...props} />;
}
function ChildSurfaceContent({
  area = 'home',
  initialCounterOfferId,
  offerId,
}: {
  area?: 'home' | 'offers' | 'contracts' | 'rewards' | 'more';
  initialCounterOfferId?: string;
  offerId?: string;
}) {
  useAppLanguage();

  const session = useChildSession();
  const router = useRouter();
  const dynamicType = useDynamicTypeStyles();
  const [token, setToken] = useState('');
  const [contractsEmpty, setContractsEmpty] = useState(false);
  const [rewardsEmpty, setRewardsEmpty] = useState(false);
  const [hasOffers, setHasOffers] = useState(false);
  const [offersLoading, setOffersLoading] = useState(true);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const homeLoaded = !offersLoading && !contractsLoading && !rewardsLoading;
  const noActivities =
    area === 'home' &&
    homeLoaded &&
    contractsEmpty &&
    rewardsEmpty &&
    !hasOffers;
  const idempotencyKey = useRef<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const { state: familyState, reload: loadFamily } = useChildFamily()!;

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const uid = session.user?.uid;
  const notifications = session.notifications;
  const reminder = useReminderPreference(session.user?.uid, 'CHILD');

  const education = useNotificationEducation(
    familyState.status === 'ready' ? uid : undefined,
    notifications.state.permission,
  );

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

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await session.signOut();
    } catch {
      setSignOutError(t('This device could not be signed out. Try again.'));
      setSigningOut(false);
    }
  };

  if (session.user) {
    return (
      <HomeScreenFrame
        child
        fill
        keyboard={Boolean(offerId)}
        header={
          offerId ? (
            <HomeHeader
              child
              compact
              name={
                familyState.status === 'ready'
                  ? familyState.home.profile.displayName
                  : t('Child')
              }
              leading={
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t('Back to Offers')}
                  onPress={() => router.navigate('/offers')}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: 44,
                    justifyContent: 'center',
                  }}
                  className="active:opacity-60"
                >
                  <DesignText
                    style={{ fontSize: 14, color: homeTokens.coralText }}
                  >
                    {t('← Offers')}
                  </DesignText>
                </Pressable>
              }
            />
          ) : (
            <HomeHeader
              child
              compact
              name={
                familyState.status === 'ready'
                  ? familyState.home.profile.displayName
                  : t('Child')
              }
            />
          )
        }
      >
        <View style={{ flexGrow: 1 }}>
          {familyState.status === 'loading' ? (
            <View className="items-center py-6">
              <ActivityIndicator
                accessibilityLabel={t('Loading your Child profile')}
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
              <Button
                label={t('Try again')}
                onPress={() => void loadFamily()}
              />
            </View>
          ) : null}

          {familyState.status === 'ready' ? (
            <View
              className="gap-5"
              style={{
                flexGrow: 1,
                opacity: area === 'home' && !homeLoaded ? 0 : 1,
              }}
              pointerEvents={area === 'home' && !homeLoaded ? 'none' : 'auto'}
              accessibilityElementsHidden={area === 'home' && !homeLoaded}
              importantForAccessibility={
                area === 'home' && !homeLoaded ? 'no-hide-descendants' : 'auto'
              }
            >
              {area === 'home' ||
              area === 'contracts' ||
              area === 'offers' ||
              area === 'rewards' ? null : (
                <SectionHeading>
                  {t(
                    (
                      {
                        rewards: 'Rewards',
                        more: 'Settings',
                      } as const
                    )[area],
                  )}
                </SectionHeading>
              )}
              {area === 'offers' || area === 'home' ? (
                <OfferInbox
                  onLoadingChange={
                    area === 'home' ? setOffersLoading : undefined
                  }
                  onHasOffersChange={area === 'home' ? setHasOffers : undefined}
                  showBackLink={false}
                  offerId={offerId}
                  initialCounterOfferId={initialCounterOfferId}
                  preview={area === 'home'}
                  authUid={session.user.uid}
                  familyId={familyState.home.family.id}
                />
              ) : null}
              {area === 'contracts' || area === 'home' ? (
                <View
                  style={
                    area === 'home' && contractsEmpty
                      ? { display: 'none' }
                      : { flexGrow: area === 'home' ? 0 : 1 }
                  }
                >
                  <HomeSection fill={area !== 'home'}>
                    <ActiveContracts
                      onLoadingChange={
                        area === 'home' ? setContractsLoading : undefined
                      }
                      preview={area === 'home'}
                      onEmptyChange={
                        area === 'home' ? setContractsEmpty : undefined
                      }
                      familyId={familyState.home.family.id}
                      authUid={session.user.uid}
                    />
                  </HomeSection>
                </View>
              ) : null}
              {area === 'rewards' || area === 'home' ? (
                <View
                  style={
                    area === 'home' && rewardsEmpty
                      ? { display: 'none' }
                      : { flexGrow: area === 'home' ? 0 : 1 }
                  }
                >
                  <HomeSection fill={area !== 'home'}>
                    <EarnedRewards
                      onLoadingChange={
                        area === 'home' ? setRewardsLoading : undefined
                      }
                      preview={area === 'home'}
                      onEmptyChange={
                        area === 'home' ? setRewardsEmpty : undefined
                      }
                      familyId={familyState.home.family.id}
                      authUid={session.user.uid}
                    />
                  </HomeSection>
                </View>
              ) : null}
              {noActivities ? (
                <OfferOutcome
                  centered
                  illustration="no-activities"
                  title={t('No activities yet')}
                >
                  {t('Your agreements and earned rewards will appear here.')}
                </OfferOutcome>
              ) : null}
              {area === 'more' ? (
                <HomeSection>
                  <SettingsSection title={t('Account')}>
                    <SettingsRow
                      last
                      title={familyState.home.profile.displayName}
                      subtitle={t('Child account')}
                      icon="person-outline"
                      tone="coralSurface"
                    />
                  </SettingsSection>
                  <LanguagePicker />
                  <SettingsSection title={t('Notifications')}>
                    <NotificationPermissionCard
                      benefit={t(
                        'Get updates when you receive an offer or your parent reviews your agreement.',
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
                      label={t('Deadline reminders')}
                      description={t(
                        'Get a reminder when an active agreement is due soon.',
                      )}
                      enabled={reminder.state.enabled}
                      busy={reminder.state.busy}
                      fromCache={reminder.state.fromCache}
                      error={reminder.state.error}
                      onChange={(enabled) => {
                        void reminder.save(enabled);
                      }}
                    />
                  </SettingsSection>
                </HomeSection>
              ) : null}
            </View>
          ) : null}

          {area === 'more' ? (
            <View className="mt-6 gap-4">
              <FormMessage message={signOutError} />
              <SettingsSection title={t('Account actions')}>
                <SettingsRow
                  last
                  title={t('Sign out')}
                  showChevron={false}
                  subtitle={signingOut ? t('Signing out…') : undefined}
                  icon="log-out-outline"
                  tone="coralSurface"
                  destructive
                  disabled={signingOut}
                  onPress={() => void signOut()}
                />
              </SettingsSection>
            </View>
          ) : null}
        </View>
      </HomeScreenFrame>
    );
  }

  if (area !== 'home' && session.status === 'loading') return null;
  if (area !== 'home') return <Redirect href="/" />;
  const pairDevice = async () => {
    const currentKey = idempotencyKey.current ?? newIdempotencyKey();
    idempotencyKey.current = currentKey;
    setSubmitting(true);
    setError(undefined);
    try {
      await session.pair(token, currentKey);
    } catch (pairingError) {
      setError(getPairingErrorMessage(pairingError));
      setSubmitting(false);
    }
  };

  return (
    <Screen design entry>
      <View className="py-6">
        <EntryHeading
          child
          showIcon={false}
          title={t('Connect to your family')}
          description={t(
            'Ask your parent for the pairing code from their ChoreX app.',
          )}
        />

        <View className="mt-6 gap-5">
          <FormMessage message={error} />
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            label={t('Pairing code')}
            onChangeText={(value) => {
              setToken(value);
              idempotencyKey.current = undefined;
              setError(undefined);
            }}
            onSubmitEditing={() => void pairDevice()}
            returnKeyType="done"
            value={token}
          />
          <Button
            variant="blue"
            lightText
            disabled={!token.trim()}
            label={t('Connect')}
            loading={submitting}
            onPress={() => void pairDevice()}
          />
        </View>
      </View>
    </Screen>
  );
}
