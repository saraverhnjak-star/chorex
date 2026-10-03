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
  type AuthClientError,
  type AuthUser,
} from '@chorex/firebase-client';

type ChildSessionState =
  | { status: 'loading'; user: null; error: null }
  | { status: 'ready'; user: AuthUser | null; error: null }
  | { status: 'error'; user: null; error: AuthClientError };

type ChildSessionContextValue = ChildSessionState & {
  pair: (token: string, idempotencyKey: string) => Promise<AuthUser>;
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

  const value = useMemo<ChildSessionContextValue>(
    () => ({
      ...state,
      pair: async (token, idempotencyKey) => {
        const redemption = await redeemPairingSession({
          token,
          idempotencyKey,
        });
        return signInWithChildCustomToken(redemption.customToken);
      },
    }),
    [state],
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
