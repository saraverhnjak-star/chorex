import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@chorex/domain';
import { subscribeReminderPreference, saveReminderPreference } from './index';
export function useReminderPreference(
  uid: string | undefined,
  role: UserProfile['accountType'],
) {
  const [state, setState] = useState<{
    uid?: string;
    enabled?: boolean;
    fromCache?: boolean;
    error?: string;
    busy: boolean;
  }>({ busy: false });
  const current = useRef<
    { uid?: string; role: UserProfile['accountType'] } | undefined
  >(undefined);
  useEffect(() => {
    let active = true;
    const context = { uid, role };
    current.current = context;
    if (!uid)
      return () => {
        current.current = undefined;
      };
    const fail = () => {
      if (active)
        setState({
          uid,
          busy: false,
          error:
            'Reminder settings could not be loaded. Reopen this screen to try again.',
        });
    };
    try {
      const unsubscribe = subscribeReminderPreference(
        uid,
        role,
        (value) => {
          if (active)
            setState((previous) => ({
              ...previous,
              busy: previous.uid === uid ? previous.busy : false,
              uid,
              ...value,
              error: undefined,
            }));
        },
        fail,
      );
      return () => {
        active = false;
        current.current = undefined;
        unsubscribe();
      };
    } catch {
      fail();
    }
    return () => {
      active = false;
      current.current = undefined;
    };
  }, [uid, role]);
  const save = async (enabled: boolean) => {
    if (!uid || state.uid !== uid || state.busy || state.enabled === undefined)
      return;
    const context = current.current;
    setState((previous) => ({ ...previous, busy: true, error: undefined }));
    try {
      await saveReminderPreference(uid, role, enabled);
    } catch {
      if (current.current === context)
        setState((previous) => ({
          ...previous,
          error: 'Reminder setting could not be saved. Connect and try again.',
        }));
    } finally {
      if (current.current === context)
        setState((previous) => ({ ...previous, busy: false }));
    }
  };
  return {
    state: state.uid === uid ? state : { busy: false, enabled: undefined },
    save,
  };
}
