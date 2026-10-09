import {
  pushDeviceMetadataSchema,
  type PushDeviceMetadata,
} from '@chorex/domain';
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

export type AppVariant = PushDeviceMetadata['appVariant'];
export type DevicePlatform = PushDeviceMetadata['platform'];

export type DeviceRegistrationWrite = PushDeviceMetadata;
export interface NotificationPermission {
  readonly granted: boolean;
  readonly status?: 'undetermined' | 'granted' | 'denied';
  readonly canAskAgain?: boolean;
  readonly quiet?: boolean;
}
export function permissionUsable(permission: NotificationPermission): boolean {
  return permission.granted;
}
export function permissionUndetermined(
  permission: NotificationPermission,
): boolean {
  return (
    !permission.granted &&
    permission.status !== 'denied' &&
    permission.canAskAgain !== false
  );
}

export interface NotificationRegistrationDependencies {
  reportUnexpectedError?: (error: unknown) => void;
  readonly getAuthenticatedUid: () => string | null;
  readonly getInstallationId: () => Promise<string | null>;
  readonly setInstallationId: (installationId: string) => Promise<void>;
  readonly createInstallationId: () => string;
  readonly getPermission: () => Promise<NotificationPermission>;
  readonly requestPermission: () => Promise<NotificationPermission>;
  readonly prepareAndroidChannel: () => Promise<void>;
  readonly getExpoPushToken: (projectId: string) => Promise<string>;
  readonly getProjectId: () => string | null;
  readonly getAppVersion: () => string | null;
  readonly getPlatform: () => string;
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
  options: {
    requestPermission?: boolean;
    onPermission?: (permission: NotificationPermission) => void;
  } = {},
): Promise<NotificationRegistrationResult> {
  const uid = dependencies.getAuthenticatedUid();
  if (!uid)
    throw new NotificationRegistrationError(
      notificationRegistrationErrorCodes.authRequired,
    );
  const assertSameUser = () => {
    if (dependencies.getAuthenticatedUid() !== uid)
      throw new NotificationRegistrationError(
        notificationRegistrationErrorCodes.authRequired,
      );
  };
  try {
    let permission = await dependencies.getPermission();
    assertSameUser();
    options.onPermission?.(permission);
    if (
      !permissionUsable(permission) &&
      (permissionUndetermined(permission) || permission.canAskAgain === true) &&
      options.requestPermission !== false
    ) {
      await dependencies.prepareAndroidChannel();
      assertSameUser();
      permission = await dependencies.requestPermission();
      assertSameUser();
      options.onPermission?.(permission);
    }
    if (!permissionUsable(permission)) {
      // Deletion is the existing owner-only canonical off state. No off document is forged.
      await removeCurrentDeviceRegistrationWithDependencies(dependencies);
      assertSameUser();
      return { status: 'denied' };
    }
    const projectId = dependencies.getProjectId();
    const appVersion = dependencies.getAppVersion();
    if (!projectId || !appVersion)
      throw new NotificationRegistrationError(
        notificationRegistrationErrorCodes.configurationMissing,
      );
    const platform = dependencies.getPlatform();
    if (platform !== 'ios' && platform !== 'android')
      throw new NotificationRegistrationError(
        notificationRegistrationErrorCodes.unsupportedPlatform,
      );
    await dependencies.prepareAndroidChannel();
    const expoPushToken = await dependencies.getExpoPushToken(projectId);
    assertSameUser();
    const installationId =
      await getOrCreateInstallationIdWithDependencies(dependencies);
    assertSameUser();
    // Permission can change while token acquisition is in flight.
    permission = await dependencies.getPermission();
    assertSameUser();
    options.onPermission?.(permission);
    if (!permissionUsable(permission)) {
      await removeCurrentDeviceRegistrationWithDependencies(dependencies);
      return { status: 'denied' };
    }
    const registration = pushDeviceMetadataSchema.parse({
      platform,
      appVariant,
      appVersion,
      expoPushToken,
      pushEnabled: true,
    });
    await dependencies.upsertDevice(uid, installationId, registration);
    assertSameUser();
    return { status: 'registered' };
  } catch (error) {
    if (error instanceof NotificationRegistrationError) throw error;
    dependencies.reportUnexpectedError?.(error);
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
    if (dependencies.getAuthenticatedUid() !== uid)
      throw new NotificationRegistrationError(
        notificationRegistrationErrorCodes.authRequired,
      );
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

// Serializes registration and sign-out cleanup for this app process.
export function createRegistrationSessionCoordinator(
  dependencies: NotificationRegistrationDependencies,
) {
  let inFlight: Promise<unknown> = Promise.resolve();
  let pausedUid: string | undefined;
  return {
    resume(uid: string) {
      if (dependencies.getAuthenticatedUid() === uid) pausedUid = undefined;
    },
    register(
      appVariant: AppVariant,
      options: Parameters<typeof registerCurrentDeviceWithDependencies>[2] = {},
    ) {
      const uid = dependencies.getAuthenticatedUid();
      const result = inFlight
        .catch(() => undefined)
        .then(() => {
          if (
            !uid ||
            dependencies.getAuthenticatedUid() !== uid ||
            pausedUid === uid
          )
            throw new NotificationRegistrationError(
              notificationRegistrationErrorCodes.authRequired,
            );
          return registerCurrentDeviceWithDependencies(
            appVariant,
            dependencies,
            options,
          );
        });
      inFlight = result;
      return result;
    },
    async abandonDeletedAccount() {
      pausedUid = dependencies.getAuthenticatedUid() ?? undefined;
      await inFlight.catch(() => undefined);
    },
    async remove() {
      const uid = dependencies.getAuthenticatedUid();
      if (!uid)
        throw new NotificationRegistrationError(
          notificationRegistrationErrorCodes.authRequired,
        );
      pausedUid = uid;
      await inFlight.catch(() => undefined);
      try {
        if (dependencies.getAuthenticatedUid() !== uid)
          throw new NotificationRegistrationError(
            notificationRegistrationErrorCodes.authRequired,
          );
        await removeCurrentDeviceRegistrationWithDependencies(dependencies);
      } catch (error) {
        pausedUid = undefined;
        throw error;
      }
    },
  };
}
