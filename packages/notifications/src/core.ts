export const notificationRegistrationErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  configurationMissing: 'NOTIFICATION_CONFIGURATION_MISSING',
  registrationFailed: 'NOTIFICATION_REGISTRATION_FAILED',
  cleanupFailed: 'NOTIFICATION_CLEANUP_FAILED',
  unsupportedPlatform: 'UNSUPPORTED_PLATFORM',
} as const;

export type NotificationRegistrationErrorCode =
  (typeof notificationRegistrationErrorCodes)[keyof typeof notificationRegistrationErrorCodes];

export class NotificationRegistrationError extends Error {
  constructor(readonly code: NotificationRegistrationErrorCode) {
    super(code);
    this.name = 'NotificationRegistrationError';
  }
}

export type AppVariant = 'PARENT' | 'CHILD';
export type DevicePlatform = 'ios' | 'android';

export interface DeviceRegistrationWrite {
  readonly platform: DevicePlatform;
  readonly appVariant: AppVariant;
  readonly appVersion: string;
  readonly expoPushToken: string;
  readonly pushEnabled: true;
  readonly createdAt: unknown;
  readonly lastSeenAt: unknown;
}

export interface NotificationRegistrationDependencies {
  readonly getAuthenticatedUid: () => string | null;
  readonly getInstallationId: () => Promise<string | null>;
  readonly setInstallationId: (installationId: string) => Promise<void>;
  readonly createInstallationId: () => string;
  readonly getPermission: () => Promise<{ readonly granted: boolean }>;
  readonly requestPermission: () => Promise<{ readonly granted: boolean }>;
  readonly prepareAndroidChannel: () => Promise<void>;
  readonly getExpoPushToken: (projectId: string) => Promise<string>;
  readonly getProjectId: () => string | null;
  readonly getAppVersion: () => string | null;
  readonly getPlatform: () => string;
  readonly createServerTimestamp: () => unknown;
  readonly upsertDevice: (
    uid: string,
    installationId: string,
    registration: DeviceRegistrationWrite,
  ) => Promise<void>;
  readonly deleteDevice: (uid: string, installationId: string) => Promise<void>;
}

export async function getOrCreateInstallationIdWithDependencies(
  dependencies: NotificationRegistrationDependencies,
): Promise<string> {
  const existing = await dependencies.getInstallationId();
  if (existing) return existing;
  const installationId = dependencies.createInstallationId();
  await dependencies.setInstallationId(installationId);
  return installationId;
}

export type NotificationRegistrationResult =
  { readonly status: 'registered' } | { readonly status: 'denied' };

export async function registerCurrentDeviceWithDependencies(
  appVariant: AppVariant,
  dependencies: NotificationRegistrationDependencies,
): Promise<NotificationRegistrationResult> {
  const uid = dependencies.getAuthenticatedUid();
  if (!uid) {
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.authRequired,
    );
  }
  const projectId = dependencies.getProjectId();
  const appVersion = dependencies.getAppVersion();
  if (!projectId || !appVersion) {
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.configurationMissing,
    );
  }
  const platform = dependencies.getPlatform();
  if (platform !== 'ios' && platform !== 'android') {
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.unsupportedPlatform,
    );
  }

  try {
    await dependencies.prepareAndroidChannel();
    const currentPermission = await dependencies.getPermission();
    const permission = currentPermission.granted
      ? currentPermission
      : await dependencies.requestPermission();
    if (!permission.granted) return { status: 'denied' };

    const expoPushToken = await dependencies.getExpoPushToken(projectId);
    const installationId =
      await getOrCreateInstallationIdWithDependencies(dependencies);
    const timestamp = dependencies.createServerTimestamp();
    await dependencies.upsertDevice(uid, installationId, {
      platform,
      appVariant,
      appVersion,
      expoPushToken,
      pushEnabled: true,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    });
    return { status: 'registered' };
  } catch (error) {
    if (error instanceof NotificationRegistrationError) throw error;
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.registrationFailed,
    );
  }
}

export async function removeCurrentDeviceRegistrationWithDependencies(
  dependencies: NotificationRegistrationDependencies,
): Promise<void> {
  const uid = dependencies.getAuthenticatedUid();
  if (!uid) {
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.authRequired,
    );
  }
  try {
    const installationId = await dependencies.getInstallationId();
    if (!installationId) return;
    await dependencies.deleteDevice(uid, installationId);
  } catch (error) {
    if (error instanceof NotificationRegistrationError) throw error;
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.cleanupFailed,
    );
  }
}

export function isNotificationRegistrationError(
  error: unknown,
): error is NotificationRegistrationError {
  return error instanceof NotificationRegistrationError;
}

export * from './responseRouting';
