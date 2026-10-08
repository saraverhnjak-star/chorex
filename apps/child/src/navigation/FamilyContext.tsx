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
  readCurrentChildFamily,
  type ChildFamilyHome,
} from '@chorex/firebase-client';
import { useChildSession } from '../auth/session';
import { getChildFamilyErrorMessage } from '../family/messages';
type FamilyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; home: ChildFamilyHome };
const FamilyContext = createContext<
  | {
      state: FamilyState;
      setState: Dispatch<SetStateAction<FamilyState>>;
      reload: () => void;
    }
  | undefined
>(undefined);
export const useChildFamily = () => useContext(FamilyContext);
export function ChildFamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useChildSession();
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
    void readCurrentChildFamily()
      .then((home) => {
        if (active) setState({ status: 'ready', home });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: 'error',
            message: getChildFamilyErrorMessage(error),
          });
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
