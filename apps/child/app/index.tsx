import { EarnedRewards } from '../src/rewards/EarnedRewards';
import { ActiveContracts } from '../src/contracts/ActiveContracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  readCurrentChildFamily,
  type ChildFamilyHome,
} from '@chorex/firebase-client';
import { registerCurrentDevice } from '@chorex/notifications';
import {
  Button,
  FormMessage,
  Screen,
  TextField,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useChildSession } from '../src/auth/session';
import { getChildFamilyErrorMessage } from '../src/family/messages';
import { getNotificationErrorMessage } from '../src/notifications/messages';
import { OfferInbox } from '../src/offers/OfferInbox';
import { getPairingErrorMessage } from '../src/pairing/messages';

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

type ChildFamilyState =
  | { status: 'loading' }
  | { status: 'ready'; home: ChildFamilyHome }
  | { status: 'error'; message: string };

type NotificationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'registered' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export default function HomeScreen() {
  const session = useChildSession();
  const dynamicType = useDynamicTypeStyles();
  const [token, setToken] = useState('');
  const idempotencyKey = useRef<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [familyState, setFamilyState] = useState<ChildFamilyState>({
    status: 'loading',
  });
  const [notificationState, setNotificationState] = useState<NotificationState>(
    { status: 'idle' },
  );
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const uid = session.user?.uid;

  const loadFamily = useCallback(async () => {
    setFamilyState({ status: 'loading' });
    try {
      const home = await readCurrentChildFamily();
      setFamilyState({ status: 'ready', home });
    } catch (familyError) {
      setFamilyState({
        status: 'error',
        message: getChildFamilyErrorMessage(familyError),
      });
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void readCurrentChildFamily()
      .then((home) => {
        if (active) setFamilyState({ status: 'ready', home });
      })
      .catch((familyError: unknown) => {
        if (active) {
          setFamilyState({
            status: 'error',
            message: getChildFamilyErrorMessage(familyError),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [uid]);

  const enableNotifications = async () => {
    if (notificationState.status === 'loading') return;
    setNotificationState({ status: 'loading' });
    try {
      const result = await registerCurrentDevice('CHILD');
      setNotificationState({ status: result.status });
    } catch (notificationError) {
      setNotificationState({
        status: 'error',
        message: getNotificationErrorMessage(notificationError),
      });
    }
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
      <Screen>
        <View className="flex-1 justify-center py-12">
          <Text
            allowFontScaling={false}
            className="font-semibold uppercase tracking-widest text-text-muted"
            style={dynamicType.small}
          >
            Child app
          </Text>
          <Text
            allowFontScaling={false}
            accessibilityRole="header"
            className="mt-2 font-bold text-text"
            style={dynamicType.title}
          >
            ChoreX Child
          </Text>

          {familyState.status === 'loading' ? (
            <View className="items-center py-12">
              <ActivityIndicator
                accessibilityLabel="Loading your Child profile"
                color={amberAuroraColors.primaryPressed}
                size="large"
              />
              <Text
                allowFontScaling={false}
                className="mt-4 text-text-muted"
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
            <View className="mt-8 gap-5">
              <View className="rounded-3xl border border-border bg-surface-warm p-5">
                <Text
                  allowFontScaling={false}
                  className="font-bold text-text"
                  style={dynamicType.title}
                >
                  {familyState.home.family.name}
                </Text>
                <Text
                  allowFontScaling={false}
                  className="mt-3 text-text-muted"
                  style={dynamicType.body}
                >
                  Welcome, {familyState.home.profile.displayName}. Your family
                  is ready.
                </Text>
              </View>

              <EarnedRewards
                familyId={familyState.home.family.id}
                authUid={session.user.uid}
              />
              <ActiveContracts
                familyId={familyState.home.family.id}
                authUid={session.user.uid}
              />

              <OfferInbox
                authUid={session.user.uid}
                familyId={familyState.home.family.id}
              />

              <View className="gap-3 rounded-3xl border border-border bg-surface-warm p-5">
                <Text
                  allowFontScaling={false}
                  className="font-bold text-text"
                  style={dynamicType.title}
                >
                  Notifications
                </Text>
                <Text
                  allowFontScaling={false}
                  className="text-text-muted"
                  style={dynamicType.body}
                >
                  Get updates when a family agreement is ready for you.
                </Text>
                {notificationState.status === 'registered' ? (
                  <Text
                    allowFontScaling={false}
                    accessibilityLiveRegion="polite"
                    className="font-semibold text-text"
                    style={dynamicType.body}
                  >
                    Notifications are enabled on this device.
                  </Text>
                ) : null}
                {notificationState.status === 'denied' ? (
                  <Text
                    allowFontScaling={false}
                    accessibilityLiveRegion="polite"
                    className="text-text-muted"
                    style={dynamicType.body}
                  >
                    Notifications are off. You can keep using ChoreX normally.
                  </Text>
                ) : null}
                {notificationState.status === 'error' ? (
                  <FormMessage message={notificationState.message} />
                ) : null}
                {notificationState.status !== 'registered' ? (
                  <Button
                    label="Enable notifications"
                    loading={notificationState.status === 'loading'}
                    onPress={() => void enableNotifications()}
                    variant="secondary"
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          <View className="mt-6 gap-4">
            <FormMessage message={signOutError} />
            <Button
              label="Sign out"
              loading={signingOut}
              onPress={() => void signOut()}
              variant="secondary"
            />
          </View>
        </View>
      </Screen>
    );
  }

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
    <Screen>
      <View className="flex-1 justify-center py-12">
        <Text
          allowFontScaling={false}
          className="font-semibold uppercase tracking-widest text-text-muted"
          style={dynamicType.small}
        >
          Child app
        </Text>
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="mt-2 font-bold text-text"
          style={dynamicType.title}
        >
          Pair this device
        </Text>
        <Text
          allowFontScaling={false}
          className="mt-3 text-text-muted"
          style={dynamicType.body}
        >
          Enter the one-time token shown in the Parent app.
        </Text>

        <View className="mt-8 gap-5 rounded-3xl border border-border bg-surface-warm p-5">
          <FormMessage message={error} />
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            label="Pairing token"
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
            label="Pair device"
            loading={submitting}
            onPress={() => void pairDevice()}
          />
        </View>
      </View>
    </Screen>
  );
}
