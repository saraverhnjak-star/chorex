import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  observeAuthState,
  redeemPairingSession,
  signInWithChildCustomToken,
  signOutCurrentUser,
  type AuthClientError,
  type AuthUser,
} from '@chorex/firebase-client';
import {
  removeCurrentDeviceRegistration,
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

  useEffect(
    () =>
      observeAuthState(
        (user) => setState({ status: 'ready', user, error: null }),
        (error) => setState({ status: 'error', user: null, error }),
      ),
    [],
  );

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
        await signOutCurrentUser();
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
