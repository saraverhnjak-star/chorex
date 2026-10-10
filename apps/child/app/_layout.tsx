import {
  ClientErrorFallback,
  Screen,
  homeTokens,
  useDynamicTypeStyles,
} from '@chorex/ui';
import {
  reportBoundaryError,
  recordOperationalError,
  setObservabilityContext,
  routeCategory,
} from '@chorex/firebase-client/observability';
import type { ErrorBoundaryProps } from 'expo-router';
import { AppNavigation } from '../src/navigation/AppNavigation';
import { useEffect, useState } from 'react';
import {
  configureForegroundNotifications,
  listenForNotificationResponses,
  updateNotificationRoutingReadiness,
} from '@chorex/notifications';
import '../global.css';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  Stack,
  useRouter,
  useRootNavigationState,
  usePathname,
} from 'expo-router';
import { resolveChildNotificationRoute } from '../src/notifications/routing';
import { configureFirebase } from '../src/firebase';
import { ChildSessionProvider, useChildSession } from '../src/auth/session';

function ChildNavigator() {
  const session = useChildSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(
    () =>
      setObservabilityContext({
        routeCategory:
          !session.user && pathname === '/'
            ? 'PAIRING'
            : routeCategory(pathname),
      }),
    [pathname, session.user],
  );
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
      <Screen design entry>
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator
            accessibilityLabel="Loading your session"
            color={homeTokens.coral}
            size="large"
          />
          <Text
            allowFontScaling={false}
            className="mt-4 text-home-muted"
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
      <Screen design entry>
        <View className="flex-1 justify-center py-12">
          <Text
            allowFontScaling={false}
            accessibilityRole="header"
            className="font-bold text-home-text"
            style={dynamicType.title}
          >
            ChoreX Child
          </Text>
          <Text
            allowFontScaling={false}
            accessibilityRole="alert"
            className="mt-4 text-home-muted"
            style={dynamicType.body}
          >
            We couldn&apos;t restore your session. Restart the app and try
            again.
          </Text>
        </View>
      </Screen>
    );
  }

  return session.user ? (
    <AppNavigation>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          freezeOnBlur: true,
        }}
      />
    </AppNavigation>
  ) : (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        freezeOnBlur: true,
      }}
    />
  );
}

export default function RootLayout() {
  const dynamicType = useDynamicTypeStyles();
  const [bootstrap, setBootstrap] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(configureFirebase)
      .then(
        () => {
          if (active) setBootstrap('ready');
        },
        (error) => {
          recordOperationalError(
            error,
            'bootstrap',
            'FIREBASE_BOOTSTRAP_FAILED',
          );
          if (active) setBootstrap('error');
        },
      );
    return () => {
      active = false;
    };
  }, []);
  if (bootstrap !== 'ready')
    return (
      <Screen design entry>
        <View className="flex-1 justify-center py-12">
          {bootstrap === 'loading' ? (
            <ActivityIndicator
              accessibilityLabel="Loading your session"
              color={homeTokens.coral}
              size="large"
            />
          ) : null}
          <Text
            allowFontScaling={false}
            accessibilityRole={bootstrap === 'error' ? 'alert' : undefined}
            className="mt-4 text-home-muted"
            style={dynamicType.body}
          >
            {bootstrap === 'error'
              ? 'We couldn’t restore your session. Restart the app and try again.'
              : 'Loading your session…'}
          </Text>
        </View>
      </Screen>
    );
  return (
    <ChildSessionProvider>
      <ChildNavigator />
    </ChildSessionProvider>
  );
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ClientErrorFallback {...props} report={reportBoundaryError} />;
}
