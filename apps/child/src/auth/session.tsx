import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import {
  observeAuthState,
  observeAccountDeletion,
  clearAccountSession,
  redeemPairingSession,
  signInWithChildCustomToken,
  type AuthClientError,
  type AuthUser,
} from '@chorex/firebase-client';
import {
  removeCurrentDeviceRegistration,
  abandonDeletedAccountNotifications,
  useDeviceRegistrationLifecycle,
  type DeviceRegistrationLifecycle,
} from '@chorex/notifications';

type ChildSessionState =
  | { status: 'loading'; user: null; error: null }
  | { status: 'ready'; user: AuthUser | null; error: null }
  | { status: 'error'; user: null; error: AuthClientError };

type ChildSessionContextValue = ChildSessionState & {
  pair: (token: string, idempotencyKey: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  notifications: DeviceRegistrationLifecycle;
};

const ChildSessionContext = createContext<ChildSessionContextValue | null>(
  null,
);

export function ChildSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChildSessionState>({
    status: 'loading',
    user: null,
    error: null,
  });

  const teardown = useRef(false);

  useEffect(
    () =>
      observeAuthState(
        (user) => {
          if (!teardown.current)
            setState({ status: 'ready', user, error: null });
        },
        (error) => setState({ status: 'error', user: null, error }),
      ),
    [],
  );

  const uid = state.status === 'ready' ? state.user?.uid : undefined;
  useEffect(() => {
    if (!uid) return;
    return observeAccountDeletion(uid, () => {
      if (teardown.current) return;
      teardown.current = true;
      setState({ status: 'loading', user: null, error: null });
      void abandonDeletedAccountNotifications()
        .then(clearAccountSession)
        .then(() => {
          teardown.current = false;
          setState({ status: 'ready', user: null, error: null });
        })
        .catch(() => {
          // Keep protected UI closed if native cache teardown fails.
          setState({
            status: 'error',
            user: null,
            error: { code: 'UNKNOWN_AUTH_FAILURE' } as AuthClientError,
          });
        });
    });
  }, [uid]);

  const notifications = useDeviceRegistrationLifecycle(
    'CHILD',
    state.status === 'ready' ? state.user?.uid : undefined,
  );

  const value = useMemo<ChildSessionContextValue>(
    () => ({
      ...state,
      notifications,
      pair: async (token, idempotencyKey) => {
        const redemption = await redeemPairingSession({
          token,
          idempotencyKey,
        });
        return signInWithChildCustomToken(redemption.customToken);
      },
      signOut: async () => {
        await removeCurrentDeviceRegistration();
        teardown.current = true;
        setState({ status: 'loading', user: null, error: null });
        try {
          await abandonDeletedAccountNotifications();
          await clearAccountSession();
          teardown.current = false;
          setState({ status: 'ready', user: null, error: null });
        } catch (error) {
          setState({
            status: 'error',
            user: null,
            error: { code: 'UNKNOWN_AUTH_FAILURE' } as AuthClientError,
          });
          throw error;
        }
      },
    }),
    [state, notifications],
  );

  return (
    <ChildSessionContext.Provider value={value}>
      {children}
    </ChildSessionContext.Provider>
  );
}

export function useChildSession(): ChildSessionContextValue {
  const session = useContext(ChildSessionContext);
  if (!session) {
    throw new Error('Child session must be used within ChildSessionProvider.');
  }
  return session;
}
