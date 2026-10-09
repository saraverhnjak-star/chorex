import { recordOperationalError } from '@chorex/firebase-client/observability';
import {
  createNotificationResponseCoordinator,
  listenForNotificationResponsesWithDependencies,
  type NotificationRoutingIntent,
  type NotificationRoutingReadiness,
} from './responseRouting';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import {
  upsertCurrentPushDevice,
  deleteCurrentPushDevice,
} from '@chorex/firebase-client';
import { Platform } from 'react-native';
import {
  createRegistrationSessionCoordinator,
  getOrCreateInstallationIdWithDependencies,
  registerCurrentDeviceWithDependencies,
  type AppVariant,
  type NotificationRegistrationDependencies,
  type NotificationRegistrationResult,
} from './core';

export {
  isNotificationRegistrationError,
  notificationRegistrationErrorCodes,
  NotificationRegistrationError,
  type AppVariant,
  type DevicePlatform,
  type DeviceRegistrationWrite,
  type NotificationRegistrationErrorCode,
  type NotificationRegistrationResult,
} from './core';

const installationIdKey = 'chorex.installation-id.v1';

function configuredProjectId(): string | null {
  const easProjectId = Constants.easConfig?.projectId;
  if (typeof easProjectId === 'string' && easProjectId.trim()) {
    return easProjectId.trim();
  }
  const configured = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : null;
}

function normalizePermission(
  permission: Notifications.NotificationPermissionsStatus,
) {
  const ios = permission.ios?.status;
  const quiet = ios === Notifications.IosAuthorizationStatus.PROVISIONAL;
  return {
    status: permission.status,
    canAskAgain: permission.canAskAgain,
    granted:
      permission.granted ||
      quiet ||
      ios === Notifications.IosAuthorizationStatus.EPHEMERAL,
    quiet,
  };
}

const defaultDependencies: NotificationRegistrationDependencies = {
  reportUnexpectedError: (error) =>
    recordOperationalError(
      error,
      'pushRegistration',
      'PUSH_REGISTRATION_FAILED',
    ),
  getAuthenticatedUid: () => getAuth(getApp()).currentUser?.uid ?? null,
  getInstallationId: () => SecureStore.getItemAsync(installationIdKey),
  setInstallationId: (installationId) =>
    SecureStore.setItemAsync(installationIdKey, installationId, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  createInstallationId: () => Crypto.randomUUID(),
  getPermission: async () =>
    normalizePermission(await Notifications.getPermissionsAsync()),
  requestPermission: async () =>
    normalizePermission(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    ),
  prepareAndroidChannel: async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  },
  getExpoPushToken: async (projectId) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Notifications.getExpoPushTokenAsync({ projectId }).then(
          (result) => result.data,
        ),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                Object.assign(new Error('TOKEN_TIMEOUT'), {
                  code: 'NETWORK_UNAVAILABLE',
                }),
              ),
            15_000,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  },
  getProjectId: configuredProjectId,
  getAppVersion: () => Constants.expoConfig?.version ?? null,
  getPlatform: () => Platform.OS,
  upsertDevice: upsertCurrentPushDevice,
  deleteDevice: deleteCurrentPushDevice,
};

export function getOrCreateInstallationId(): Promise<string> {
  return getOrCreateInstallationIdWithDependencies(defaultDependencies);
}

const registrationCoordinator =
  createRegistrationSessionCoordinator(defaultDependencies);
export const resumeDeviceRegistration = (uid: string) =>
  registrationCoordinator.resume(uid);
export function registerCurrentDevice(
  appVariant: AppVariant,
  options: Parameters<typeof registerCurrentDeviceWithDependencies>[2] = {},
): Promise<NotificationRegistrationResult> {
  return registrationCoordinator.register(appVariant, options);
}
export const removeCurrentDeviceRegistration = () =>
  registrationCoordinator.remove();
export function readNotificationPermission() {
  return defaultDependencies.getPermission();
}
const educationKey = 'chorex.notification-education.v1';
export const readNotificationEducationSeen = async () =>
  (await SecureStore.getItemAsync(educationKey)) === 'seen';
export const markNotificationEducationSeen = () =>
  SecureStore.setItemAsync(educationKey, 'seen');

export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export {
  parseNotificationRoutingIntent,
  type NotificationRoutingIntent,
  type NotificationRoutingReadiness,
} from './responseRouting';

const responseCoordinator = createNotificationResponseCoordinator(
  Notifications.DEFAULT_ACTION_IDENTIFIER,
  (error) =>
    recordOperationalError(
      error,
      'notificationRouting',
      'NOTIFICATION_ROUTING_FAILED',
    ),
);
export function updateNotificationRoutingReadiness(
  readiness: NotificationRoutingReadiness,
): void {
  responseCoordinator.update(readiness);
}
// Register during startup, including Auth restoration; only explicit responses navigate.
export function listenForNotificationResponses(
  navigate: (intent: NotificationRoutingIntent) => void,
): () => void {
  return listenForNotificationResponsesWithDependencies(
    responseCoordinator,
    {
      addResponseListener: (listener) =>
        Notifications.addNotificationResponseReceivedListener(listener),
      getLastResponse: () => Notifications.getLastNotificationResponse(),
      clearLastResponse: () => Notifications.clearLastNotificationResponse(),
    },
    navigate,
  );
}

export {
  useDeviceRegistrationLifecycle,
  useNotificationEducation,
  type DeviceRegistrationLifecycle,
} from './lifecycle';

export async function abandonDeletedAccountNotifications(): Promise<void> {
  await registrationCoordinator.abandonDeletedAccount();
  responseCoordinator.update({
    authStatus: 'ready',
    uid: null,
    routerReady: false,
  });
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    /* Native tray cleanup must not block SDK sign-out. */
  }
  await Promise.allSettled([
    Notifications.dismissAllNotificationsAsync(),
    Notifications.setBadgeCountAsync(0),
  ]);
}
