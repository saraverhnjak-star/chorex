import { useEffect } from 'react';
import {
  configureForegroundNotifications,
  listenForNotificationResponses,
  updateNotificationRoutingReadiness,
} from '@chorex/notifications';
import '../global.css';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { resolveChildNotificationRoute } from '../src/notifications/routing';
import { Screen, amberAuroraColors, useDynamicTypeStyles } from '@chorex/ui';
import { configureFirebase } from '../src/firebase';
import { ChildSessionProvider, useChildSession } from '../src/auth/session';

function ChildNavigator() {
  const session = useChildSession();
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
        router.replace(resolveChildNotificationRoute(intent)),
      ),
    [router],
  );
  const dynamicType = useDynamicTypeStyles();

  if (session.status === 'loading') {
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
            className="mt-4 text-text-muted"
            style={dynamicType.body}
          >
            Loading your session…
          </Text>
        </View>
      </Screen>
    );
  }

  if (session.status === 'error') {
    return (
      <Screen>
        <View className="flex-1 justify-center py-12">
          <Text
            allowFontScaling={false}
            accessibilityRole="header"
            className="font-bold text-text"
            style={dynamicType.title}
          >
            ChoreX Child
          </Text>
          <Text
            allowFontScaling={false}
            accessibilityRole="alert"
            className="mt-4 text-text-muted"
            style={dynamicType.body}
          >
            We couldn&apos;t restore your session. Restart the app and try
            again.
          </Text>
        </View>
      </Screen>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  configureFirebase();
  return (
    <ChildSessionProvider>
      <ChildNavigator />
    </ChildSessionProvider>
  );
}
