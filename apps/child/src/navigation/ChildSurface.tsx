import { ChildFamilyProvider, useChildFamily } from './FamilyContext';
import { useFocusEffect, Redirect } from 'expo-router';
import { ChildHomeSummary } from '../ChildHomeSummary';
import {
  HomeScreenFrame,
  HomeSection,
  HomeHeader,
  HomeGreeting,
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
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { EarnedRewards } from '../rewards/EarnedRewards';
import { ActiveContracts } from '../contracts/ActiveContracts';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
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
}) {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const family = useChildFamily();
  if (!family)
    return (
      <ChildFamilyProvider>
        <ChildSurface {...props} />
      </ChildFamilyProvider>
    );
  return focused ? <ChildSurfaceContent {...props} /> : null;
}
function ChildSurfaceContent({
  area = 'home',
}: {
  area?: 'home' | 'offers' | 'contracts' | 'rewards' | 'more';
}) {
  const session = useChildSession();
  const dynamicType = useDynamicTypeStyles();
  const [token, setToken] = useState('');
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
      setSignOutError('This device could not be signed out. Try again.');
      setSigningOut(false);
    }
  };

  if (session.user) {
    return (
      <HomeScreenFrame child>
        <View>
          <HomeHeader
            child
            name={
              familyState.status === 'ready'
                ? familyState.home.profile.displayName
                : 'Child'
            }
          />
          {familyState.status === 'loading' ? (
            <View className="items-center py-12">
              <ActivityIndicator
                accessibilityLabel="Loading your Child profile"
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
              <Button label="Try again" onPress={() => void loadFamily()} />
            </View>
          ) : null}

          {familyState.status === 'ready' ? (
            <View className="gap-5">
              {area === 'home' ? (
                <HomeGreeting
                  child
                  name={familyState.home.profile.displayName}
                />
              ) : (
                <SectionHeading>
                  {
                    (
                      {
                        offers: 'Offers',
                        contracts: 'My chores',
                        rewards: 'Rewards',
                        more: 'Settings',
                      } as const
                    )[area]
                  }
                </SectionHeading>
              )}
              {area === 'home' ? (
                <ChildHomeSummary
                  familyId={familyState.home.family.id}
                  authUid={session.user.uid}
                />
              ) : null}

              {area === 'contracts' || area === 'home' ? (
                <HomeSection>
                  <ActiveContracts
                    preview={area === 'home'}
                    familyId={familyState.home.family.id}
                    authUid={session.user.uid}
                  />
                </HomeSection>
              ) : null}
              {area === 'offers' || area === 'home' ? (
                <HomeSection>
                  <OfferInbox
                    preview={area === 'home'}
                    authUid={session.user.uid}
                    familyId={familyState.home.family.id}
                  />
                </HomeSection>
              ) : null}
              {area === 'rewards' || area === 'home' ? (
                <HomeSection>
                  <EarnedRewards
                    preview={area === 'home'}
                    familyId={familyState.home.family.id}
                    authUid={session.user.uid}
                  />
                </HomeSection>
              ) : null}
              {area === 'more' ? (
                <HomeSection>
                  <SettingsSection title="Account">
                    <SettingsRow
                      last
                      title={familyState.home.profile.displayName}
                      subtitle="Child account"
                      icon="person-outline"
                      tone="coralSurface"
                    />
                  </SettingsSection>
                  <SettingsSection title="Notifications">
                    <NotificationPermissionCard
                      benefit="Get updates when you receive an offer or your parent reviews your agreement."
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
                      label="Deadline reminders"
                      description="Get a reminder when an active agreement is due soon."
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
              <SettingsSection title="Account actions">
                <SettingsRow
                  last
                  title="Sign out"
                  showChevron={false}
                  subtitle={signingOut ? 'Signing out…' : undefined}
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
      <View className="flex-1 py-6">
        <EntryHeading
          child
          title="Connect to your family"
          description="Ask your parent for the pairing code from their ChoreX app."
        />

        <View className="mt-6 gap-5">
          <FormMessage message={error} />
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            label="Pairing code"
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
            disabled={!token.trim()}
            label="Connect"
            loading={submitting}
            onPress={() => void pairDevice()}
          />
        </View>
      </View>
    </Screen>
  );
}
