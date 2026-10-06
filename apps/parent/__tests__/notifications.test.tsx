import {
  getOrCreateInstallationIdWithDependencies,
  negotiationNotificationRoute,
  registerCurrentDeviceWithDependencies,
  removeCurrentDeviceRegistrationWithDependencies,
  type NotificationRegistrationDependencies,
} from '@chorex/notifications/core';

function createDependencies(
  overrides: Partial<NotificationRegistrationDependencies> = {},
): NotificationRegistrationDependencies {
  return {
    getAuthenticatedUid: jest.fn(() => 'parent-uid'),
    getInstallationId: jest.fn(async () => 'installation-id'),
    setInstallationId: jest.fn(async () => undefined),
    createInstallationId: jest.fn(() => 'generated-installation-id'),
    getPermission: jest.fn(async () => ({ granted: true })),
    requestPermission: jest.fn(async () => ({ granted: true })),
    prepareAndroidChannel: jest.fn(async () => undefined),
    getExpoPushToken: jest.fn(async () => 'ExponentPushToken[test]'),
    getProjectId: jest.fn(() => 'configured-project-id'),
    getAppVersion: jest.fn(() => '1.2.3'),
    getPlatform: jest.fn(() => 'ios'),
    createServerTimestamp: jest.fn(() => 'server-timestamp'),
    upsertDevice: jest.fn(async () => undefined),
    deleteDevice: jest.fn(async () => undefined),
    ...overrides,
  };
}

it('persists one random installation ID and reuses it', async () => {
  const getInstallationId = jest
    .fn<Promise<string | null>, []>()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce('generated-installation-id');
  const dependencies = createDependencies({ getInstallationId });

  await expect(
    getOrCreateInstallationIdWithDependencies(dependencies),
  ).resolves.toBe('generated-installation-id');
  await expect(
    getOrCreateInstallationIdWithDependencies(dependencies),
  ).resolves.toBe('generated-installation-id');
  expect(dependencies.createInstallationId).toHaveBeenCalledTimes(1);
  expect(dependencies.setInstallationId).toHaveBeenCalledTimes(1);
  expect(dependencies.setInstallationId).toHaveBeenCalledWith(
    'generated-installation-id',
  );
});

it('writes the authenticated device registration with the expected shape', async () => {
  const dependencies = createDependencies();

  await expect(
    registerCurrentDeviceWithDependencies('PARENT', dependencies),
  ).resolves.toEqual({ status: 'registered' });
  expect(dependencies.requestPermission).not.toHaveBeenCalled();
  expect(dependencies.getExpoPushToken).toHaveBeenCalledWith(
    'configured-project-id',
  );
  expect(dependencies.upsertDevice).toHaveBeenCalledWith(
    'parent-uid',
    'installation-id',
    {
      platform: 'ios',
      appVariant: 'PARENT',
      appVersion: '1.2.3',
      expoPushToken: 'ExponentPushToken[test]',
      pushEnabled: true,
      createdAt: 'server-timestamp',
      lastSeenAt: 'server-timestamp',
    },
  );
});

it('keeps the app usable and writes nothing when permission is denied', async () => {
  const dependencies = createDependencies({
    getPermission: jest.fn(async () => ({ granted: false })),
    requestPermission: jest.fn(async () => ({ granted: false })),
  });

  await expect(
    registerCurrentDeviceWithDependencies('CHILD', dependencies),
  ).resolves.toEqual({ status: 'denied' });
  expect(dependencies.getExpoPushToken).not.toHaveBeenCalled();
  expect(dependencies.setInstallationId).not.toHaveBeenCalled();
  expect(dependencies.upsertDevice).not.toHaveBeenCalled();
});

it('removes only the signed-in account registration during sign-out cleanup', async () => {
  const dependencies = createDependencies();

  await removeCurrentDeviceRegistrationWithDependencies(dependencies);
  expect(dependencies.deleteDevice).toHaveBeenCalledWith(
    'parent-uid',
    'installation-id',
  );
});

it('routes only minimal negotiation metadata to existing Phase 2 home surfaces', () => {
  for (const type of ['OFFER_PUBLISHED', 'OFFER_COUNTERED', 'OFFER_ACCEPTED']) {
    expect(
      negotiationNotificationRoute({
        type,
        entityType: type === 'OFFER_ACCEPTED' ? 'CONTRACT' : 'OFFER',
        entityId: 'entity',
        familyId: 'family',
      }),
    ).toBe('/');
  }
  expect(
    negotiationNotificationRoute({
      type: 'OFFER_REJECTED',
      entityType: 'OFFER',
      entityId: 'entity',
      familyId: 'family',
    }),
  ).toBeUndefined();
  expect(
    negotiationNotificationRoute({
      type: 'OFFER_PUBLISHED',
      entityType: 'OFFER',
      entityId: 'entity',
      familyId: 'family',
      note: 'private',
    }),
  ).toBeUndefined();
});

it('approval notification opens the existing stable Contract detail route', () => {
  expect(
    negotiationNotificationRoute({
      type: 'CONTRACT_APPROVED',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      familyId: 'family-1',
    }),
  ).toBe('/contracts/contract-1');
});

it('changes-requested notification routes to Contract detail with no feedback payload', () => {
  expect(
    negotiationNotificationRoute({
      type: 'CONTRACT_CHANGES_REQUESTED',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      familyId: 'family-1',
    }),
  ).toBe('/contracts/contract-1');
  expect(
    negotiationNotificationRoute({
      type: 'CONTRACT_CHANGES_REQUESTED',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      familyId: 'family-1',
      note: 'Private feedback',
    }),
  ).toBeUndefined();
});

it('submission notification opens existing Contract detail', () => {
  expect(
    negotiationNotificationRoute({
      type: 'CONTRACT_SUBMITTED',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      familyId: 'family-1',
    }),
  ).toBe('/contracts/contract-1');
});

it('fulfillment notification opens Reward detail and rejects private payload extensions', () => {
  const data = {
    type: 'REWARD_FULFILLED',
    entityType: 'REWARD',
    entityId: 'reward-1',
    familyId: 'family-1',
  };
  expect(negotiationNotificationRoute(data)).toBe('/rewards/reward-1');
  expect(
    negotiationNotificationRoute({ ...data, note: 'Private' }),
  ).toBeUndefined();
  expect(
    negotiationNotificationRoute({ ...data, entityType: 'CONTRACT' }),
  ).toBeUndefined();
});
