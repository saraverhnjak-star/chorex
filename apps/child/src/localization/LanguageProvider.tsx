import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  appLanguages,
  getAppLanguage,
  setAppLanguage,
  useAppLanguage,
  type AppLanguage,
} from '@chorex/ui';
const storageKey = 'chorex.child.language';
const LanguageContext = createContext<
  ((language: AppLanguage) => Promise<void>) | null
>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(storageKey)
      .then((stored) => {
        if (active)
          setAppLanguage(
            appLanguages.some((option) => option.code === stored)
              ? (stored as AppLanguage)
              : 'en',
          );
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const changeLanguage = (next: AppLanguage) => {
    const previous = getAppLanguage();
    setAppLanguage(next);
    const save = queue.current
      .catch(() => undefined)
      .then(() => SecureStore.setItemAsync(storageKey, next));
    queue.current = save;
    return save.catch((error: unknown) => {
      if (getAppLanguage() === next) setAppLanguage(previous);
      throw error;
    });
  };
  if (!ready) return null;
  return (
    <LanguageContext.Provider value={changeLanguage}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useChildLanguage() {
  const language = useAppLanguage();
  const changeLanguage = useContext(LanguageContext);
  return { language, changeLanguage };
}
