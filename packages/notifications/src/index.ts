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
  deleteDoc,
  doc,
  getFirestore,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import { Platform } from 'react-native';
import {
  getOrCreateInstallationIdWithDependencies,
  registerCurrentDeviceWithDependencies,
  removeCurrentDeviceRegistrationWithDependencies,
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

const defaultDependencies: NotificationRegistrationDependencies = {
  getAuthenticatedUid: () => getAuth(getApp()).currentUser?.uid ?? null,
  getInstallationId: () => SecureStore.getItemAsync(installationIdKey),
  setInstallationId: (installationId) =>
    SecureStore.setItemAsync(installationIdKey, installationId, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  createInstallationId: () => Crypto.randomUUID(),
  getPermission: () => Notifications.getPermissionsAsync(),
  requestPermission: () =>
    Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    }),
  prepareAndroidChannel: async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  },
  getExpoPushToken: async (projectId) =>
    (await Notifications.getExpoPushTokenAsync({ projectId })).data,
  getProjectId: configuredProjectId,
  getAppVersion: () => Constants.expoConfig?.version ?? null,
  getPlatform: () => Platform.OS,
  createServerTimestamp: () => serverTimestamp(),
  upsertDevice: async (uid, installationId, registration) => {
    const firestore = getFirestore(getApp());
    const reference = doc(firestore, 'users', uid, 'devices', installationId);
    await runTransaction(firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      const createdAt = existing.exists()
        ? existing.data().createdAt
        : registration.createdAt;
      transaction.set(reference, { ...registration, createdAt });
    });
  },
  deleteDevice: async (uid, installationId) => {
    await deleteDoc(
      doc(getFirestore(getApp()), 'users', uid, 'devices', installationId),
    );
  },
};

export function getOrCreateInstallationId(): Promise<string> {
  return getOrCreateInstallationIdWithDependencies(defaultDependencies);
}

export function registerCurrentDevice(
  appVariant: AppVariant,
): Promise<NotificationRegistrationResult> {
  return registerCurrentDeviceWithDependencies(appVariant, defaultDependencies);
}

export function removeCurrentDeviceRegistration(): Promise<void> {
  return removeCurrentDeviceRegistrationWithDependencies(defaultDependencies);
}

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
