import { useEffect } from 'react';
import {
  configureForegroundNotifications,
  listenForNotificationResponses,
  updateNotificationRoutingReadiness,
} from '@chorex/notifications';
import '../global.css';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { resolveParentNotificationRoute } from '../src/notifications/routing';
import { Screen, amberAuroraColors, useDynamicTypeStyles } from '@chorex/ui';
import { configureFirebase } from '../src/firebase';
import { ParentSessionProvider, useParentSession } from '../src/auth/session';

function SessionLoadingScreen() {
  const dynamicType = useDynamicTypeStyles();

  return (
    <Screen>
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator
          accessibilityLabel="Loading your session"
          color={amberAuroraColors.primaryPressed}
          size="large"
        />
        <Text
          allowFontScaling={false}
          className="mt-4 font-medium text-text-muted"
          style={dynamicType.body}
        >
          Loading your session…
        </Text>
      </View>
    </Screen>
  );
}

function SessionErrorScreen() {
  const dynamicType = useDynamicTypeStyles();

  return (
    <Screen>
      <View className="flex-1 justify-center py-12">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-text"
          style={dynamicType.title}
        >
          ChoreX Parent
        </Text>
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="mt-4 text-text-muted"
          style={dynamicType.body}
        >
          We couldn&apos;t restore your session. Restart the app and try again.
        </Text>
      </View>
    </Screen>
  );
}

function ParentNavigator() {
  const session = useParentSession();
  const router = useRouter();
  const routerReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    configureForegroundNotifications();
  }, []);
  useEffect(() => {
    updateNotificationRoutingReadiness({
      authStatus: session.status,
      uid: session.user?.uid ?? null,
      routerReady,
    });
  }, [session.status, session.user?.uid, routerReady]);
  useEffect(
    () =>
      listenForNotificationResponses((intent) =>
        router.replace(resolveParentNotificationRoute(intent)),
      ),
    [router],
  );

  if (session.status === 'loading') return <SessionLoadingScreen />;
  if (session.status === 'error') return <SessionErrorScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session.user}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session.user)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  configureFirebase();
  return (
    <ParentSessionProvider>
      <ParentNavigator />
    </ParentSessionProvider>
  );
}
