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
  registerWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOutCurrentUser,
  type AuthClientError,
  type AuthCredentials,
  type AuthUser,
} from '@chorex/firebase-client';
import {
  removeCurrentDeviceRegistration,
  useDeviceRegistrationLifecycle,
  type DeviceRegistrationLifecycle,
} from '@chorex/notifications';

type ParentSessionState =
  | { status: 'loading'; user: null; error: null }
  | { status: 'ready'; user: AuthUser | null; error: null }
  | { status: 'error'; user: null; error: AuthClientError };

type ParentSessionContextValue = ParentSessionState & {
  register: (credentials: AuthCredentials) => Promise<AuthUser>;
  signIn: (credentials: AuthCredentials) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  notifications: DeviceRegistrationLifecycle;
};

const ParentSessionContext = createContext<ParentSessionContextValue | null>(
  null,
);

export function ParentSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ParentSessionState>({
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
    'PARENT',
    state.status === 'ready' ? state.user?.uid : undefined,
  );

  const value = useMemo<ParentSessionContextValue>(
    () => ({
      ...state,
      notifications,
      register: registerWithEmailAndPassword,
      signIn: signInWithEmailAndPassword,
      signOut: async () => {
        await removeCurrentDeviceRegistration();
        await signOutCurrentUser();
      },
    }),
    [state, notifications],
  );

  return (
    <ParentSessionContext.Provider value={value}>
      {children}
    </ParentSessionContext.Provider>
  );
}

export function useParentSession(): ParentSessionContextValue {
  const session = useContext(ParentSessionContext);
  if (!session) {
    throw new Error(
      'Parent session must be used within ParentSessionProvider.',
    );
  }
  return session;
}
