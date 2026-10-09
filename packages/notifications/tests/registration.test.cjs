const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerCurrentDeviceWithDependencies: register,
  createRegistrationSessionCoordinator,
  getOrCreateInstallationIdWithDependencies: installation,
} = require('./load-typescript.cjs')('../src/core.ts');
function fixture() {
  const f = {
    uid: 'user-a',
    id: 'installation-1',
    permission: { granted: true, status: 'granted', canAskAgain: true },
    token: 'ExpoPushToken[token-a]',
    prompts: 0,
    writes: 0,
    deletes: 0,
    devices: new Map(),
  };
  f.dependencies = {
    getAuthenticatedUid: () => f.uid,
    getInstallationId: async () => f.id,
    setInstallationId: async (id) => {
      f.id = id;
    },
    createInstallationId: () => 'random-opaque-installation',
    getPermission: async () => f.permission,
    requestPermission: async () => {
      f.prompts++;
      return (
        f.requested ?? (f.permission = { granted: true, status: 'granted' })
      );
    },
    prepareAndroidChannel: async () => {},
    getExpoPushToken: async () => f.token,
    getProjectId: () => 'project',
    getAppVersion: () => '1.2.3',
    getPlatform: () => 'ios',
    upsertDevice: async (uid, id, data) => {
      f.writes++;
      f.devices.set(`${uid}/${id}`, data);
    },
    deleteDevice: async (uid, id) => {
      f.deletes++;
      f.devices.delete(`${uid}/${id}`);
    },
  };
  return f;
}
for (const variant of ['PARENT', 'CHILD'])
  test(`${variant} grant registers canonical metadata for the current account without prompting`, async () => {
    const f = fixture();
    assert.deepEqual(await register(variant, f.dependencies), {
      status: 'registered',
    });
    assert.equal(f.prompts, 0);
    assert.deepEqual(f.devices.get('user-a/installation-1'), {
      platform: 'ios',
      appVariant: variant,
      appVersion: '1.2.3',
      expoPushToken: f.token,
      pushEnabled: true,
    });
  });
test('undetermined bootstrap does not request permission or create an enabled registration', async () => {
  const f = fixture();
  f.id = null;
  f.permission = { granted: false, status: 'undetermined', canAskAgain: true };
  assert.deepEqual(
    await register('PARENT', f.dependencies, { requestPermission: false }),
    { status: 'denied' },
  );
  assert.equal(f.prompts, 0);
  assert.equal(f.writes, 0);
  assert.equal(f.id, null);
  assert.deepEqual(await register('PARENT', f.dependencies), {
    status: 'registered',
  });
  assert.equal(f.prompts, 1);
});
test('explicit denial is optional, performs no token acquisition and never repeatedly prompts permanent denial', async () => {
  const f = fixture();
  f.permission = { granted: false, status: 'undetermined' };
  f.requested = { granted: false, status: 'denied', canAskAgain: false };
  f.dependencies.getExpoPushToken = () => {
    throw Error('must not acquire');
  };
  assert.deepEqual(await register('CHILD', f.dependencies), {
    status: 'denied',
  });
  f.permission = f.requested;
  assert.deepEqual(await register('CHILD', f.dependencies), {
    status: 'denied',
  });
  assert.equal(f.prompts, 1);
  assert.equal(f.writes, 0);
});
test('quiet iOS authorization is usable without upgrading/re-prompting', async () => {
  const f = fixture();
  f.permission = { granted: true, status: 'granted', quiet: true };
  await register('CHILD', f.dependencies);
  assert.equal(f.prompts, 0);
  assert.equal(f.writes, 1);
});
test('stable installation ID is reused across independently restored sessions', async () => {
  const f = fixture();
  f.id = null;
  const first = await installation(f.dependencies);
  assert.equal(first, await installation({ ...f.dependencies }));
  await register('PARENT', f.dependencies);
  await register('PARENT', f.dependencies);
  assert.equal(f.devices.size, 1);
});
test('new token and app version replace the same disabled installation without retaining old targeting', async () => {
  const f = fixture();
  await register('CHILD', f.dependencies);
  f.devices.get('user-a/installation-1').pushEnabled = false;
  f.token = 'ExponentPushToken[token-b]';
  f.dependencies.getAppVersion = () => '1.2.4';
  await register('CHILD', f.dependencies);
  assert.equal(f.devices.size, 1);
  const current = f.devices.get('user-a/installation-1');
  assert.equal(current.expoPushToken, f.token);
  assert.equal(current.appVersion, '1.2.4');
  assert.equal(current.pushEnabled, true);
});
test('external permission revoke removes targeting and restore reuses installation without touching Auth', async () => {
  const f = fixture();
  await register('PARENT', f.dependencies);
  f.permission = { granted: false, status: 'denied', canAskAgain: false };
  await register('PARENT', f.dependencies, { requestPermission: false });
  assert.equal(f.devices.size, 0);
  assert.equal(f.uid, 'user-a');
  f.permission = { granted: true, status: 'granted' };
  await register('PARENT', f.dependencies, { requestPermission: false });
  assert.equal(f.devices.size, 1);
  assert.equal(f.id, 'installation-1');
  assert.equal(f.uid, 'user-a');
});
test('account switching during token acquisition cannot write either user registration', async () => {
  const f = fixture();
  f.dependencies.getExpoPushToken = async () => {
    f.uid = 'user-b';
    return f.token;
  };
  await assert.rejects(register('PARENT', f.dependencies), {
    code: 'AUTH_REQUIRED',
  });
  assert.equal(f.writes, 0);
});
test('permission revoked during token acquisition is rechecked before the write', async () => {
  const f = fixture();
  f.dependencies.getExpoPushToken = async () => {
    f.permission = { granted: false, status: 'denied' };
    return f.token;
  };
  assert.deepEqual(await register('CHILD', f.dependencies), {
    status: 'denied',
  });
  assert.equal(f.writes, 0);
});
test('token and backend failures never report registered and explicit retry can recover', async () => {
  const f = fixture();
  const original = f.dependencies.getExpoPushToken;
  f.dependencies.getExpoPushToken = async () => {
    throw Error('network');
  };
  await assert.rejects(register('PARENT', f.dependencies), {
    code: 'NOTIFICATION_REGISTRATION_FAILED',
  });
  assert.equal(f.uid, 'user-a');
  f.dependencies.getExpoPushToken = original;
  const upsert = f.dependencies.upsertDevice;
  f.dependencies.upsertDevice = async () => {
    throw Error('network');
  };
  await assert.rejects(register('PARENT', f.dependencies), {
    code: 'NOTIFICATION_REGISTRATION_FAILED',
  });
  f.dependencies.upsertDevice = upsert;
  assert.deepEqual(await register('PARENT', f.dependencies), {
    status: 'registered',
  });
});
test('missing configuration and malformed token fail without forging active state', async () => {
  const f = fixture();
  f.dependencies.getProjectId = () => null;
  await assert.rejects(register('PARENT', f.dependencies), {
    code: 'NOTIFICATION_CONFIGURATION_MISSING',
  });
  f.dependencies.getProjectId = () => 'project';
  f.token = 'not-an-expo-token';
  await assert.rejects(register('PARENT', f.dependencies), {
    code: 'NOTIFICATION_REGISTRATION_FAILED',
  });
  assert.equal(f.writes, 0);
});
test('unauthenticated startup never reads permissions, acquires tokens or writes', async () => {
  const f = fixture();
  f.uid = null;
  f.dependencies.getPermission = async () => {
    throw Error('must not read');
  };
  await assert.rejects(register('CHILD', f.dependencies), {
    code: 'AUTH_REQUIRED',
  });
  assert.equal(f.writes, 0);
});
test('sign-out waits for in-flight registration then removes it; queued refresh cannot reactivate A; B owns its own registration', async () => {
  const f = fixture();
  const coordinator = createRegistrationSessionCoordinator(f.dependencies);
  let started, release;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  f.dependencies.getExpoPushToken = () =>
    new Promise((resolve) => {
      release = resolve;
      started();
    });
  const registering = coordinator.register('PARENT');
  await began;
  const removing = coordinator.remove();
  const queued = coordinator.register('PARENT');
  queued.catch(() => {});
  release(f.token);
  await registering;
  await removing;
  await assert.rejects(queued, { code: 'AUTH_REQUIRED' });
  assert.equal(f.devices.size, 0);
  assert.equal(f.uid, 'user-a');
  f.uid = 'user-b';
  f.dependencies.getExpoPushToken = async () => 'ExpoPushToken[user-b]';
  coordinator.resume(f.uid);
  await coordinator.register('PARENT');
  assert.equal(f.devices.has('user-a/installation-1'), false);
  assert.equal(f.devices.has('user-b/installation-1'), true);
});
test('failed cleanup leaves Auth valid and retry removes targeting without changing installation', async () => {
  const f = fixture();
  const coordinator = createRegistrationSessionCoordinator(f.dependencies);
  await coordinator.register('CHILD');
  const remove = f.dependencies.deleteDevice;
  f.dependencies.deleteDevice = async () => {
    throw Error('network');
  };
  await assert.rejects(coordinator.remove(), {
    code: 'NOTIFICATION_CLEANUP_FAILED',
  });
  assert.equal(f.uid, 'user-a');
  f.dependencies.deleteDevice = remove;
  await coordinator.remove();
  assert.equal(f.devices.size, 0);
  assert.equal(f.id, 'installation-1');
});
test('deletion teardown drains registration without attempting denied backend cleanup or clearing installation metadata', async () => {
  const f = fixture();
  const coordinator = createRegistrationSessionCoordinator(f.dependencies);
  f.dependencies.deleteDevice = async () => {
    throw Error('old auth is invalid');
  };
  await coordinator.abandonDeletedAccount();
  await assert.rejects(coordinator.register('CHILD'), {
    code: 'AUTH_REQUIRED',
  });
  assert.equal(f.id, 'installation-1');
});
