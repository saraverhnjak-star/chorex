import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  readCurrentParentFamily,
  type ParentFamilyHome,
} from '@chorex/firebase-client';
import { useParentSession } from '../auth/session';
import { getFamilyErrorMessage } from '../family/messages';
type FamilyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; home: ParentFamilyHome }
  | { status: 'onboarding' };
const FamilyContext = createContext<
  | {
      state: FamilyState;
      setState: Dispatch<SetStateAction<FamilyState>>;
      reload: () => void;
    }
  | undefined
>(undefined);
export const useParentFamily = () => useContext(FamilyContext);
export function ParentFamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useParentSession();
  return (
    <FamilyReader key={user?.uid ?? 'signed-out'} uid={user?.uid}>
      {children}
    </FamilyReader>
  );
}
function FamilyReader({
  uid,
  children,
}: {
  uid?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<FamilyState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void readCurrentParentFamily()
      .then((home) => {
        if (active)
          setState(home ? { status: 'ready', home } : { status: 'onboarding' });
      })
      .catch((error: unknown) => {
        if (active)
          setState({ status: 'error', message: getFamilyErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [uid, attempt]);
  return (
    <FamilyContext.Provider value={{ state, setState, reload }}>
      {children}
    </FamilyContext.Provider>
  );
}
