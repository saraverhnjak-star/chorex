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
  negotiationNotificationRoute,
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

// Call only after authentication. Opening loads existing authoritative home/inbox listeners.
export function listenForNegotiationNotificationResponses(
  navigate: (
    route: '/' | `/contracts/${string}` | `/rewards/${string}`,
  ) => void,
): () => void {
  let active = true;
  const handled = new Set<string>();
  const open = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response) return;
    const request = response.notification.request;
    const route = negotiationNotificationRoute(request.content.data);
    if (!route || handled.has(request.identifier)) return;
    handled.add(request.identifier);
    navigate(route);
    void Notifications.clearLastNotificationResponseAsync().catch(
      () => undefined,
    );
  };
  const subscription =
    Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync()
    .then(open)
    .catch(() => undefined);
  return () => {
    active = false;
    subscription.remove();
  };
}
