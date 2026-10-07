import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  permissionUndetermined,
  type AppVariant,
  type NotificationPermission,
} from './core';
import {
  registerCurrentDevice,
  resumeDeviceRegistration,
  readNotificationEducationSeen,
  markNotificationEducationSeen,
} from './index';

export interface DeviceRegistrationState {
  status: 'checking' | 'loading' | 'registered' | 'off' | 'error';
  permission: NotificationPermission | null;
  error?: unknown;
}
export interface DeviceRegistrationLifecycle {
  state: DeviceRegistrationState;
  enable: () => Promise<void>;
}
export function useDeviceRegistrationLifecycle(
  appVariant: AppVariant,
  uid?: string,
): DeviceRegistrationLifecycle {
  const [state, setState] = useState<DeviceRegistrationState>({
    status: 'checking',
    permission: null,
  });
  const action = useRef<(request: boolean) => Promise<void>>(
    async () => undefined,
  );
  useEffect(() => {
    if (!uid) {
      // Reset auxiliary state when the external Auth session disappears.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'off', permission: null });
      action.current = async () => undefined;
      return;
    }
    resumeDeviceRegistration(uid);
    let active = true;
    let permission: NotificationPermission | null = null;
    let job: Promise<void> | undefined;
    let tokenChanged = false;
    let lastNativeToken: Notifications.DevicePushToken | undefined;
    const refresh = (request: boolean) => {
      if (!active) return Promise.resolve();
      if (job) return job;
      setState({ status: 'loading', permission });
      job = registerCurrentDevice(appVariant, {
        requestPermission: request,
        onPermission: (value) => {
          permission = value;
          if (active) setState({ status: 'loading', permission });
        },
      })
        .then((result) => {
          if (active)
            setState({
              status: result.status === 'registered' ? 'registered' : 'off',
              permission,
            });
        })
        .catch((error) => {
          if (active) setState({ status: 'error', permission, error });
        })
        .finally(() => {
          job = undefined;
          if (active && tokenChanged) {
            tokenChanged = false;
            void refresh(false);
          }
        });
      return job;
    };
    action.current = refresh;
    void refresh(false); // Read/reconcile only; startup never asks permission.
    let previous = AppState.currentState;
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') void refresh(false);
      previous = next;
    });
    const token = Notifications.addPushTokenListener((nextToken) => {
      // iOS emits this event for token acquisition even when the token is unchanged.
      // Compare only in memory so reconciliation cannot trigger itself indefinitely.
      if (
        lastNativeToken?.type === nextToken.type &&
        lastNativeToken.data === nextToken.data
      )
        return;
      lastNativeToken = nextToken;
      // Native token is a signal only. Always obtain a valid current Expo token.
      if (job) tokenChanged = true;
      else if (AppState.currentState === 'active') void refresh(false);
    });
    return () => {
      active = false;
      action.current = async () => undefined;
      appState.remove();
      token.remove();
    };
  }, [appVariant, uid]);
  const enable = useCallback(() => action.current(true), []);
  return { state, enable };
}

let educationSeenInProcess = false;
export function useNotificationEducation(
  uid: string | undefined,
  permission: NotificationPermission | null,
) {
  const [showEducation, setShowEducation] = useState(false);
  const eligible = Boolean(
    uid && permission && permissionUndetermined(permission),
  );
  useEffect(() => {
    let active = true;
    // A new external Auth/permission context must not retain the old explanation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowEducation(false);
    if (eligible && !educationSeenInProcess) {
      void readNotificationEducationSeen()
        .then((seen) => {
          if (!active || seen || educationSeenInProcess) return;
          educationSeenInProcess = true;
          setShowEducation(true);
          void markNotificationEducationSeen().catch(() => undefined);
        })
        .catch(() => {
          /* Education storage is auxiliary; explicit Enable still works. */
        });
    }
    return () => {
      active = false;
    };
  }, [uid, eligible]);
  const skip = useCallback(() => {
    educationSeenInProcess = true;
    setShowEducation(false);
    void markNotificationEducationSeen().catch(() => undefined);
  }, []);
  const revisit = useCallback(() => setShowEducation(true), []);
  return { showEducation, skip, revisit };
}
